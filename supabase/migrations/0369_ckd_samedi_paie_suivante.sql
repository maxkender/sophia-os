-- 0369 : le samedi ne propose plus que Kill ou Double (point B, 27/10), et la
-- paie dit quoi faire de la milestone de la semaine qui vient.
--
-- 1. `ckd_decisions_permises` : le samedi, Kill (règles absent et
--    premiere_semaine, et anciens pour un posteur déjà recréé, 0368) ou Double.
--    Plus de « Recréer » sur premiere_semaine, plus de « Nudge » sur absent.
-- 2. Double : le 2ᵉ compte démarre avec la cohorte du lundi J+9.
--    - `comptes.premiers_posts_le` (nouvelle colonne, vide) : posée par
--      `ckd_compte_cree` à la création du 2ᵉ compte (samedi + 9). À ne pas
--      confondre avec `comptes.demarre_le` (0100, date de création), inchangée ;
--    - trigger `comptes_warmup_z_premiers_posts` : quand le posteur clique
--      « Start warmup », la fin du warm-up (lundi qui suit, 0301) est repoussée
--      à ce lundi-là. Il passe après `comptes_warmup_jusqu_au_lundi` (ordre
--      alphabétique) et ne touche pas au « skip warmup » de l'admin.
-- 3. Paie, colonne « Semaine suivante » (`paie_semaine_suivante`), pour la
--    milestone de la semaine qui suit la semaine payée, posteur par posteur :
--      financer (Week NN), financer × 2 (Week NN (2 acc)) à partir de la semaine
--      où le 2ᵉ compte poste, financer normalement (recréé), ne pas financer
--      (Kill, désactivé), déjà financée (arrêté après le clic « Semaine
--      suivante faite »), à voir (0 post et pas de décision).
--    Un arrêt compte s'il tombe au plus tard le lundi 10 h de la semaine
--    suivante (comme `ckd_prochain_arret` : avant 10 h, rien n'est financé).
-- 4. `paie_semaines` : la case « Semaine suivante faite » (deux colonnes
--    vides) et `paie_marquer_semaine_suivante` (admin ou HM du posteur).
--
-- Additive : trois colonnes ajoutées (vides), un trigger et trois fonctions
-- nouveaux, deux fonctions réécrites à signature identique
-- (`ckd_decisions_permises`, `ckd_compte_cree` de 0368). Aucune ligne
-- modifiée ni supprimée par la migration.
-- Retour arrière : réappliquer ckd_decisions_permises et ckd_compte_cree
-- (0368) ; drop trigger comptes_warmup_z_premiers_posts on public.comptes ;
-- drop function public.warmup_pas_avant_premiers_posts(),
-- public.paie_semaine_suivante(date), public.paie_marquer_semaine_suivante(uuid, boolean).

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Les décisions du samedi
-- ---------------------------------------------------------------------------
create or replace function public.ckd_decisions_permises(p_regle text)
returns text[]
language sql
immutable
as $$
  select case p_regle
    when 'jeudi'            then array['nudge', 'recreer', 'rien']
    when 'absent'           then array['ne_pas_renouveler', 'garder']
    when 'premiere_semaine' then array['ne_pas_renouveler', 'garder']
    when 'anciens'          then array['recreer', 'ne_pas_renouveler', 'garder']
    when 'doubler'          then array['doubler', 'pas_maintenant']
    else array[]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Double : le 2ᵉ compte démarre le lundi J+9
-- ---------------------------------------------------------------------------
alter table public.comptes add column if not exists premiers_posts_le date;

comment on column public.comptes.premiers_posts_le is
  'Lundi de démarrage imposé (0369) : un 2ᵉ compte (Double) ne finit pas son warm-up avant ce lundi, 00:00 Paris. Null : la règle habituelle (lundi qui suit le Start warmup, 0301).';

create or replace function public.warmup_pas_avant_premiers_posts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut timestamptz;
begin
  if new.premiers_posts_le is null
     or new.warmup_ends_at is null
     or new.warmup_ends_at <= now()   -- « skip warmup » de l'admin : intouché
     or new.warmup_ends_at is not distinct from old.warmup_ends_at then
    return new;
  end if;
  v_debut := new.premiers_posts_le::timestamp at time zone 'Europe/Paris';
  if new.warmup_ends_at < v_debut then
    new.warmup_ends_at := v_debut;
  end if;
  return new;
end;
$$;

drop trigger if exists comptes_warmup_z_premiers_posts on public.comptes;
create trigger comptes_warmup_z_premiers_posts
  before update of warmup_ends_at on public.comptes
  for each row execute function public.warmup_pas_avant_premiers_posts();

create or replace function public.ckd_compte_cree(p_id uuid, p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_compte_cree : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id for update;
  if not found or p.decision not in ('recreer', 'doubler') then
    raise exception 'ckd_compte_cree : proposition introuvable ou pas en Recréer / Doubler';
  end if;
  update public.ckd_propositions set nouveau_compte_id = p_compte, erreur = null where id = p_id;
  if p.decision = 'recreer' then
    insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
    values (p.poster_id, p.compte_id, p_compte, p.regle, p_id, p.decision_par);
    -- L'ancien compte part en Archive maintenant (0366), plus le dimanche soir.
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'recreer', now(), p.decision_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    perform public.ckd_arreter_comptes();
    -- Ses posts à venir ne comptent plus comme manqués (0368).
    perform public.ckd_retirer_posts_a_venir(p.compte_id);
  elsif p.decision = 'doubler' then
    -- Double (0369) : le 2ᵉ compte démarre avec la cohorte du lundi J+9 (samedi
    -- du contrôle + 9) : warm-up la semaine d'avant, premiers posts ce lundi-là.
    update public.comptes set premiers_posts_le = p.jour + 9 where id = p_compte;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Paie : la milestone de la semaine suivante
-- ---------------------------------------------------------------------------
alter table public.paie_semaines add column if not exists semaine_suivante_faite_at timestamptz;
alter table public.paie_semaines add column if not exists semaine_suivante_faite_par uuid references auth.users (id);

-- Pour la semaine payée `p_lundi` : que faire de la milestone de la semaine
-- d'après, posteur par posteur (ses lignes de paie de `p_lundi`).
--   action  : financer | financer_double | financer_normal | ne_pas_financer
--             | deja_financee | a_voir
--   comptes : comptes qui postent la semaine suivante (le nom de la milestone)
--   montant : tarif × comptes (null si tarif inconnu)
--   raison  : kill | desactive | aucun_compte | zero_post (pour le texte)
create or replace function public.paie_semaine_suivante(p_lundi date)
returns table (poster_id uuid, action text, comptes integer, montant numeric, raison text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_suiv     date := p_lundi + 7;
  v_debut    timestamptz := (p_lundi::timestamp at time zone 'Europe/Paris');
  -- Lundi 10 h de la semaine suivante : un arrêt jusque-là, la milestone n'est pas financée.
  v_coupure  timestamptz := ((p_lundi + 7)::timestamp + interval '10 hours') at time zone 'Europe/Paris';
  v_hm       uuid;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'paie_semaine_suivante : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;

  return query
  with lignes as (
    select ps.poster_id, ps.prevus, ps.faits, ps.tarif, ps.semaine_suivante_faite_at, pr.is_active
      from public.paie_semaines ps
      join public.profiles pr on pr.id = ps.poster_id
     where ps.semaine = p_lundi
       and (v_hm is null or pr.manager_id = v_hm)
  ),
  cpt as (
    select c.id, c.poster_id,
           -- Le lundi où le compte poste pour la 1re fois : son 1er post prévu,
           -- sinon la fin de son warm-up (jamais avant `premiers_posts_le`, trigger) ;
           -- warm-up pas lancé : il ne poste pas, il ne compte pas.
           coalesce((select pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
                       from public.comptes_premier_jour pj where pj.compte_id = c.id),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) as debut,
           c.is_active
             and not exists (select 1 from public.ckd_arrets a
                              where a.compte_id = c.id and a.annule_at is null
                                and coalesce(a.fait_at, a.prevu_at) <= v_coupure) as actif
      from public.comptes c
      join lignes l on l.poster_id = c.poster_id
     where c.type_compte = 'perso'
  ),
  etat as (
    select l.*,
           (select count(*) from cpt where cpt.poster_id = l.poster_id and cpt.actif
                                       and cpt.debut is not null and cpt.debut <= v_suiv)::int as n_suiv,
           exists (select 1 from public.ckd_arrets a
                     join public.comptes c on c.id = a.compte_id
                    where c.poster_id = l.poster_id and a.raison = 'ne_pas_renouveler'
                      and a.annule_at is null
                      and coalesce(a.fait_at, a.prevu_at) >= v_debut
                      and coalesce(a.fait_at, a.prevu_at) <= v_coupure) as kill,
           exists (select 1 from public.ckd_recreations r
                    where r.poster_id = l.poster_id
                      and r.created_at >= v_debut and r.created_at <= v_coupure) as recree
      from lignes l
  ),
  decision as (
    select e.*,
           case
             when not e.is_active then 'ne_pas_financer'
             when e.n_suiv = 0 and e.kill then 'ne_pas_financer'
             when e.recree then 'financer_normal'
             when e.n_suiv >= 2 then 'financer_double'
             when e.n_suiv = 1 and (e.faits > 0 or e.prevus = 0) then 'financer'
             else 'a_voir'
           end as a,
           case
             when not e.is_active then 'desactive'
             when e.n_suiv = 0 and e.kill then 'kill'
             when e.recree or e.n_suiv >= 1 and (e.faits > 0 or e.prevus = 0) then null
             when e.n_suiv = 0 then 'aucun_compte'
             else 'zero_post'
           end as r
      from etat e
  )
  select d.poster_id,
         case when d.a = 'ne_pas_financer' and d.semaine_suivante_faite_at is not null
              then 'deja_financee' else d.a end,
         case when d.a = 'financer_normal' then 1 else d.n_suiv end,
         case when d.a in ('financer', 'financer_double', 'financer_normal')
              then d.tarif * (case when d.a = 'financer_normal' then 1 else d.n_suiv end) end,
         d.r
    from decision d;
end;
$$;

-- « Semaine suivante faite » (ou retour en arrière d'un clic de trop).
create or replace function public.paie_marquer_semaine_suivante(p_id uuid, p_fait boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
begin
  select poster_id into v_poster from public.paie_semaines where id = p_id;
  if v_poster is null then
    raise exception 'paie : ligne introuvable';
  end if;
  if not public.paie_droit_posteur(v_poster) then
    raise exception 'paie : réservé à l''admin et à la HM du posteur';
  end if;
  update public.paie_semaines
     set semaine_suivante_faite_at = case when p_fait then now() end,
         semaine_suivante_faite_par = case when p_fait then auth.uid() end
   where id = p_id;
end;
$$;

revoke execute on function public.warmup_pas_avant_premiers_posts() from public, anon, authenticated;
revoke execute on function public.paie_semaine_suivante(date) from public, anon;
grant execute on function public.paie_semaine_suivante(date) to authenticated, service_role;
revoke execute on function public.paie_marquer_semaine_suivante(uuid, boolean) from public, anon;
grant execute on function public.paie_marquer_semaine_suivante(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
