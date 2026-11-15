-- 0566 : Comment Masters — seuls les commentaires retrouvés publiés comptent,
-- et le délai réel alerte Slack → commentaire posté.
--
-- 1. Un commentaire non retrouvé n'est pas compté : plus de « à vérifier »
--    sur les lignes de bonus (a_verifier vide, détail sans mention).
-- 2. Le délai : l'id d'un commentaire TikTok porte son heure de publication
--    (les 32 bits de poids fort = l'heure Unix). Pour les alertes envoyées à
--    partir du 9/11 (Paris), poste_at et delai_minutes sont enregistrés dès que
--    le commentaire est retrouvé.
-- 3. cm_delais(debut, fin) : par Comment Master, commentaires retrouvés, tarif
--    de sa zone, montant, délai médian et part en moins de 2 h.
--
-- Additif : 2 colonnes, un trigger, des fonctions. La ligne 0 $ du 9/11
-- (aucun commentaire retrouvé) passe « retirée » ; rien n'est supprimé.

alter table public.comment_master_demandes
  add column if not exists poste_at timestamptz,
  add column if not exists delai_minutes integer;

/** L'heure de publication d'un commentaire TikTok, tirée de son id. */
create or replace function public.cm_poste_at(p_cid text)
returns timestamptz
language sql
immutable
as $$
  select case when p_cid ~ '^\d{15,20}$' then to_timestamp(floor(p_cid::numeric / 4294967296)) end;
$$;

create or replace function public.cm_delai_enregistrer()
returns trigger
language plpgsql
as $$
begin
  if new.commentaire_cid is not null and new.envoye_at is not null
     and new.envoye_at >= (timestamp '2026-11-09 00:00' at time zone 'Europe/Paris') then
    new.poste_at := public.cm_poste_at(new.commentaire_cid);
    if new.poste_at is not null then
      new.delai_minutes := greatest(0, round(extract(epoch from new.poste_at - new.envoye_at) / 60))::int;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger cm_delai_enregistrer
  before insert or update of commentaire_cid, envoye_at on public.comment_master_demandes
  for each row execute function public.cm_delai_enregistrer();

-- Les demandes déjà retrouvées depuis le 9/11 (rattrapage).
update public.comment_master_demandes
   set commentaire_cid = commentaire_cid
 where commentaire_cid is not null
   and envoye_at >= (timestamp '2026-11-09 00:00' at time zone 'Europe/Paris')
   and delai_minutes is null;

-- Le calcul d'un lundi bonus : seuls les commentaires retrouvés comptent.
create or replace function public.bonus_cm_calculer(p_lundi date)
returns table (
  poster_id uuid, periode_debut date, periode_fin date, detail text, quantite integer,
  a_verifier integer, tarif numeric, zone text, montant numeric, delai_median_min integer, part_moins_2h numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_premier date := (public.bonus_reglages()->>'premier_lundi')::date;
  v_debut date := case when p_lundi <= v_premier then date '2026-01-01' else p_lundi - 28 end;
  v_fin date := p_lundi - 1;
begin
  return query
  select d.cm_profile_id, v_debut, v_fin,
         format('%s commentaires retrouvés publiés jusqu''au %s', count(*), public.bonus_date_courte(v_fin)),
         count(*)::int,
         null::int,
         t.tarif, t.zone,
         round(count(*) * coalesce(t.tarif, 0), 2),
         (percentile_cont(0.5) within group (order by m.delai_minutes))::int,
         round(avg(case when m.delai_minutes is null then null when m.delai_minutes <= 120 then 1 else 0 end), 3)
    from public.cm_demandes_toutes(v_debut, v_fin) d
    join public.comment_master_demandes m on m.id = d.id
    cross join lateral public.bonus_cm_tarif(d.cm_profile_id) t
   where d.compte and d.verifie and d.cm_profile_id is not null
   group by d.cm_profile_id, t.tarif, t.zone;
end;
$$;

revoke execute on function public.bonus_cm_calculer(date) from public, anon, authenticated;

-- La génération ne crée plus de ligne sans commentaire retrouvé.
do $$
declare
  d text := pg_get_functiondef('public.bonus_generer(date)'::regprocedure);
  avant text := 'where quantite > 0 or a_verifier > 0';
begin
  if position(avant in d) > 0 then
    execute replace(d, avant, 'where quantite > 0');
  elsif position('where quantite > 0)' in d) = 0 then
    raise exception '0566 : bonus_generer a changé';
  end if;
end $$;

/** Par Comment Master sur une période : retrouvés, tarif, montant, délai médian et part en moins de 2 h. */
create or replace function public.cm_delais(p_debut date, p_fin date)
returns table (
  cm_profile_id uuid, nom text, retrouves integer, zone text, tarif numeric, montant numeric,
  mesures integer, delai_median_min integer, part_moins_2h numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return query
  select d.cm_profile_id, max(d.cm_nom), count(*)::int, t.zone, t.tarif,
         round(count(*) * coalesce(t.tarif, 0), 2),
         count(m.delai_minutes)::int,
         (percentile_cont(0.5) within group (order by m.delai_minutes))::int,
         round(avg(case when m.delai_minutes is null then null when m.delai_minutes <= 120 then 1 else 0 end), 3)
    from public.cm_demandes_toutes(p_debut, p_fin) d
    join public.comment_master_demandes m on m.id = d.id
    cross join lateral public.bonus_cm_tarif(d.cm_profile_id) t
   where d.compte and d.verifie and d.cm_profile_id is not null
   group by d.cm_profile_id, t.zone, t.tarif
   order by 6 desc;
end;
$$;

revoke execute on function public.cm_delais(date, date) from public, anon;
grant execute on function public.cm_delais(date, date) to authenticated;

-- Le 9/11 recalculé (lignes encore à valider) ; la ligne sans commentaire retrouvé est retirée.
select public.bonus_generer('2026-11-09');
update public.bonus
   set statut = 'retire', retire_at = now(), detail = 'aucun commentaire retrouvé publié'
 where type = 'comment_master' and lundi_bonus = '2026-11-09' and statut = 'a_valider'
   and envoi_at is null and coalesce(quantite, 0) = 0;
update public.bonus set a_verifier = null where type = 'comment_master' and statut in ('a_valider', 'retire') and envoi_at is null;
