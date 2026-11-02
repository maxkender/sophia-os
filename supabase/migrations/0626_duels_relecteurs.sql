-- 0626 : les duels à l'aveugle envoyés aux relecteurs natifs (30/10, demande
-- d'Adrien).
--
-- Le duel de Tests (0620) oppose, sur un slideshow déjà publié, le deck parti
-- (`actuel`) au deck d'un nouveau circuit (`candidat`), gauche ou droite tirés
-- au sort. Jusqu'ici seul l'admin votait, et son vote révélait les côtés.
-- Désormais l'admin peut ENVOYER un duel aux relecteurs natifs de la langue :
-- ils le voient dans leur espace « Native review » (OS posteur), votent à
-- l'aveugle (version 1, version 2 ou égal), notent chaque version de 1 à 5 et
-- laissent une remarque typée. Les côtés ne leur sont jamais révélés, même
-- après le vote.
--
--   ab_traduction_duels.relecteurs_le / relecteurs_par
--                              quand et par qui le duel a été envoyé aux
--                              relecteurs ; null = pas envoyé.
--   ab_traduction_votes        un vote par relecteur et par duel : le choix
--                              (`actuel` / `candidat` / `egal`, traduit depuis
--                              le côté voté), la note de chaque version (1-5),
--                              la remarque, la version qu'elle vise et un type
--                              d'erreur (la liste de `bleo_relectures`).
--   mes_duels_relecteur()      ce que le relecteur connecté voit : ses duels
--                              envoyés, dans les langues où il est invité ou
--                              actif, si l'espace est ouvert ; les decks dans
--                              l'ordre affiché, sans dire lequel est lequel ;
--                              son vote s'il a voté.
--   voter_duel_relecteur()     son vote, côté gauche/droite traduit en version
--                              côté serveur (le client ne connaît pas `gauche`).
--   ab_traduction_votes_rapport()
--                              le décompte par langue × candidat × version :
--                              votes, relecteurs, gagnant, notes moyennes,
--                              types d'erreur. La règle D8 (une fiche ou un
--                              circuit n'est retenu que s'il gagne au moins
--                              55 % des duels tranchés) se lit dessus.
--
-- Comment les votes servent à améliorer : le circuit candidat relit les
-- dernières remarques des relecteurs de la langue (celles qui visent sa
-- version ou les deux) et les passe au modèle en consignes
-- (`_shared/ab_circuits.ts`, `chargerRemarquesRelecteurs`), et le rapport
-- dit si la version candidate est retenue (≥ 55 %).
--
-- AJOUT SEULEMENT : deux colonnes, une table, trois fonctions. Rien ne part en
-- production.
-- Retour arrière :
--   drop function public.ab_traduction_votes_rapport(text), public.voter_duel_relecteur(uuid, text, integer, integer, text, text, text), public.mes_duels_relecteur();
--   drop table public.ab_traduction_votes;
--   alter table public.ab_traduction_duels drop column relecteurs_le, drop column relecteurs_par;

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Le duel : envoyé aux relecteurs, ou pas
-- ---------------------------------------------------------------------------
alter table public.ab_traduction_duels
  add column if not exists relecteurs_le  timestamptz,
  add column if not exists relecteurs_par uuid references public.profiles (id) on delete set null;

comment on column public.ab_traduction_duels.relecteurs_le is
  'Duels relecteurs (0626) : quand l''admin a envoyé ce duel aux relecteurs natifs de la langue. Null : pas envoyé, seul l''admin le voit.';

create index if not exists ab_traduction_duels_relecteurs
  on public.ab_traduction_duels (langue, relecteurs_le desc)
  where relecteurs_le is not null;

-- ---------------------------------------------------------------------------
-- Les votes des relecteurs
-- ---------------------------------------------------------------------------
create table if not exists public.ab_traduction_votes (
  id             uuid primary key default gen_random_uuid(),
  duel_id        uuid not null references public.ab_traduction_duels (id) on delete cascade,
  relecteur_id   uuid not null references public.relecteurs_natifs (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  langue         text not null,
  choix          text not null check (choix in ('actuel', 'candidat', 'egal')),
  note_actuel    smallint check (note_actuel between 1 and 5),
  note_candidat  smallint check (note_candidat between 1 and 5),
  remarque       text,
  remarque_sur   text check (remarque_sur in ('actuel', 'candidat', 'les_deux')),
  type_erreur    text check (type_erreur in ('tournure_anglaise', 'registre', 'vocabulaire', 'cta_trop_pub', 'cta_mal_place', 'longueur', 'autre')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (duel_id, profile_id)
);

create index if not exists ab_traduction_votes_langue on public.ab_traduction_votes (langue, created_at desc);

comment on table public.ab_traduction_votes is
  'Duels relecteurs (0626) : le vote d''un relecteur natif sur un duel à l''aveugle (0620). `choix` est la version gagnante, traduite depuis le côté voté par voter_duel_relecteur() ; les notes vont de 1 à 5 par version ; la remarque dit quelle version elle vise. Un vote par relecteur et par duel, modifiable.';

alter table public.ab_traduction_votes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ab_traduction_votes' and policyname = 'ab_traduction_votes_admin') then
    create policy ab_traduction_votes_admin on public.ab_traduction_votes for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ab_traduction_votes' and policyname = 'ab_traduction_votes_lecture_soi') then
    create policy ab_traduction_votes_lecture_soi on public.ab_traduction_votes for select to authenticated
      using (profile_id = auth.uid());
  end if;
end $$;

-- Le relecteur n'écrit jamais dans la table : il passe par voter_duel_relecteur().
grant select on public.ab_traduction_votes to authenticated;
grant insert, update, delete on public.ab_traduction_votes to authenticated; -- portés par la policy admin seulement
grant all on public.ab_traduction_votes to service_role;

-- ---------------------------------------------------------------------------
-- Le relecteur : est-il relecteur de cette langue, l'espace est-il ouvert ?
-- ---------------------------------------------------------------------------
create or replace function public.relecteur_natif_de(p_langue text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from public.relecteurs_natifs r
   where r.profile_id = auth.uid()
     and lower(r.langue) = lower(p_langue)
     and r.statut in ('invite', 'actif')
     and coalesce((select (g.valeur ->> 'espace_ouvert')::boolean from public.reglages g where g.cle = 'relecture_native'), false)
   limit 1;
$$;

revoke all on function public.relecteur_natif_de(text) from public, anon;
grant execute on function public.relecteur_natif_de(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ce que le relecteur voit
-- ---------------------------------------------------------------------------
create or replace function public.mes_duels_relecteur()
returns table (
  duel_id          uuid,
  langue           text,
  envoye_le        timestamptz,
  slides_source    jsonb,
  deck_gauche      jsonb,
  deck_droite      jsonb,
  mon_cote         text,
  ma_note_gauche   smallint,
  ma_note_droite   smallint,
  ma_remarque      text,
  ma_remarque_sur  text,
  mon_type_erreur  text,
  vote_le          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id,
         d.langue,
         d.relecteurs_le,
         d.slides_source,
         case when d.gauche = 'actuel' then d.slides_actuel else d.slides_candidat end,
         case when d.gauche = 'actuel' then d.slides_candidat else d.slides_actuel end,
         case when v.choix is null then null
              when v.choix = 'egal' then 'egal'
              when v.choix = d.gauche then 'gauche'
              else 'droite' end,
         case when d.gauche = 'actuel' then v.note_actuel else v.note_candidat end,
         case when d.gauche = 'actuel' then v.note_candidat else v.note_actuel end,
         v.remarque,
         case when v.remarque_sur is null then null
              when v.remarque_sur = 'les_deux' then 'les_deux'
              when v.remarque_sur = d.gauche then 'gauche'
              else 'droite' end,
         v.type_erreur,
         v.updated_at
    from public.ab_traduction_duels d
    join public.relecteurs_natifs r
      on r.profile_id = auth.uid()
     and lower(r.langue) = lower(d.langue)
     and r.statut in ('invite', 'actif')
    left join public.ab_traduction_votes v
      on v.duel_id = d.id and v.profile_id = auth.uid()
   where d.statut = 'pret'
     and d.relecteurs_le is not null
     and coalesce((select (g.valeur ->> 'espace_ouvert')::boolean from public.reglages g where g.cle = 'relecture_native'), false)
   order by (v.id is not null), d.relecteurs_le desc
   limit 100;
$$;

revoke all on function public.mes_duels_relecteur() from public, anon;
grant execute on function public.mes_duels_relecteur() to authenticated;

comment on function public.mes_duels_relecteur() is
  'Duels relecteurs (0626) : les duels envoyés aux relecteurs dans les langues du relecteur connecté, decks dans l''ordre affiché, sans révéler les côtés ; son vote s''il existe. Vide si l''espace est fermé.';

-- ---------------------------------------------------------------------------
-- Le vote du relecteur
-- ---------------------------------------------------------------------------
create or replace function public.voter_duel_relecteur(
  p_duel         uuid,
  p_cote         text,
  p_note_gauche  integer default null,
  p_note_droite  integer default null,
  p_remarque     text default null,
  p_remarque_sur text default null,
  p_type_erreur  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel        public.ab_traduction_duels%rowtype;
  v_relecteur   uuid;
  v_choix       text;
  v_droite      text;
  v_remarque    text;
  v_sur         text;
  v_id          uuid;
begin
  if p_cote not in ('gauche', 'droite', 'egal') then
    raise exception 'voter_duel_relecteur : côté inconnu (%)', p_cote using errcode = '22023';
  end if;
  if p_note_gauche is not null and p_note_gauche not between 1 and 5
     or p_note_droite is not null and p_note_droite not between 1 and 5 then
    raise exception 'voter_duel_relecteur : les notes vont de 1 à 5' using errcode = '22023';
  end if;
  if p_remarque_sur is not null and p_remarque_sur not in ('gauche', 'droite', 'les_deux') then
    raise exception 'voter_duel_relecteur : remarque_sur inconnu (%)', p_remarque_sur using errcode = '22023';
  end if;
  if p_type_erreur is not null and p_type_erreur not in ('tournure_anglaise', 'registre', 'vocabulaire', 'cta_trop_pub', 'cta_mal_place', 'longueur', 'autre') then
    raise exception 'voter_duel_relecteur : type d''erreur inconnu (%)', p_type_erreur using errcode = '22023';
  end if;

  select * into v_duel from public.ab_traduction_duels where id = p_duel;
  if not found or v_duel.statut <> 'pret' or v_duel.relecteurs_le is null then
    raise exception 'voter_duel_relecteur : duel introuvable ou pas envoyé aux relecteurs' using errcode = '42501';
  end if;
  v_relecteur := public.relecteur_natif_de(v_duel.langue);
  if v_relecteur is null then
    raise exception 'voter_duel_relecteur : vous n''êtes pas relecteur de cette langue, ou l''espace est fermé' using errcode = '42501';
  end if;

  v_droite := case when v_duel.gauche = 'actuel' then 'candidat' else 'actuel' end;
  v_choix := case p_cote when 'egal' then 'egal' when 'gauche' then v_duel.gauche else v_droite end;
  v_remarque := nullif(trim(coalesce(p_remarque, '')), '');
  v_sur := case when v_remarque is null then null
                when p_remarque_sur = 'gauche' then v_duel.gauche
                when p_remarque_sur = 'droite' then v_droite
                else 'les_deux' end;

  insert into public.ab_traduction_votes
    (duel_id, relecteur_id, profile_id, langue, choix, note_actuel, note_candidat, remarque, remarque_sur, type_erreur)
  values
    (p_duel, v_relecteur, auth.uid(), v_duel.langue, v_choix,
     case when v_duel.gauche = 'actuel' then p_note_gauche else p_note_droite end,
     case when v_duel.gauche = 'actuel' then p_note_droite else p_note_gauche end,
     v_remarque, v_sur, case when v_remarque is null then null else p_type_erreur end)
  on conflict (duel_id, profile_id) do update
    set choix = excluded.choix,
        note_actuel = excluded.note_actuel,
        note_candidat = excluded.note_candidat,
        remarque = excluded.remarque,
        remarque_sur = excluded.remarque_sur,
        type_erreur = excluded.type_erreur,
        relecteur_id = excluded.relecteur_id,
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.voter_duel_relecteur(uuid, text, integer, integer, text, text, text) from public, anon;
grant execute on function public.voter_duel_relecteur(uuid, text, integer, integer, text, text, text) to authenticated;

comment on function public.voter_duel_relecteur(uuid, text, integer, integer, text, text, text) is
  'Duels relecteurs (0626) : le vote du relecteur connecté sur un duel envoyé, côté gauche/droite traduit en version côté serveur. Un vote par relecteur et par duel, modifiable.';

-- ---------------------------------------------------------------------------
-- Le rapport, pour l'admin
-- ---------------------------------------------------------------------------
create or replace function public.ab_traduction_votes_rapport(p_langue text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'langue', g.langue, 'candidat', g.candidat, 'version', g.version,
           'duels_envoyes', g.duels_envoyes, 'duels_votes', g.duels_votes,
           'votes', g.votes, 'relecteurs', g.relecteurs,
           'candidat_gagne', g.candidat_gagne, 'actuel_gagne', g.actuel_gagne, 'egal', g.egal,
           'part_candidat', case when g.candidat_gagne + g.actuel_gagne > 0
                                 then round(g.candidat_gagne::numeric / (g.candidat_gagne + g.actuel_gagne), 3) end,
           'note_actuel', round(g.note_actuel, 2), 'note_candidat', round(g.note_candidat, 2),
           'types_erreur', coalesce((select jsonb_object_agg(t.type_erreur, t.n)
                                       from (select v2.type_erreur, count(*) as n
                                               from public.ab_traduction_votes v2
                                               join public.ab_traduction_duels d2 on d2.id = v2.duel_id
                                              where d2.langue = g.langue and d2.candidat = g.candidat and d2.version = g.version
                                                and v2.type_erreur is not null
                                              group by v2.type_erreur) t), '{}'::jsonb),
           'remarques', coalesce((select jsonb_agg(jsonb_build_object('remarque', v3.remarque, 'sur', v3.remarque_sur, 'type', v3.type_erreur, 'le', v3.updated_at) order by v3.updated_at desc)
                                    from (select v4.remarque, v4.remarque_sur, v4.type_erreur, v4.updated_at
                                            from public.ab_traduction_votes v4
                                            join public.ab_traduction_duels d4 on d4.id = v4.duel_id
                                           where d4.langue = g.langue and d4.candidat = g.candidat and d4.version = g.version
                                             and v4.remarque is not null
                                           order by v4.updated_at desc
                                           limit 20) v3), '[]'::jsonb)
         ) order by g.langue, g.candidat, g.version), '[]'::jsonb)
    from (select d.langue, d.candidat, d.version,
                 count(distinct d.id) as duels_envoyes,
                 count(distinct v.duel_id) as duels_votes,
                 count(v.id) as votes,
                 count(distinct v.profile_id) as relecteurs,
                 count(v.id) filter (where v.choix = 'candidat') as candidat_gagne,
                 count(v.id) filter (where v.choix = 'actuel') as actuel_gagne,
                 count(v.id) filter (where v.choix = 'egal') as egal,
                 avg(v.note_actuel) as note_actuel,
                 avg(v.note_candidat) as note_candidat
            from public.ab_traduction_duels d
            left join public.ab_traduction_votes v on v.duel_id = d.id
           where d.relecteurs_le is not null
             and (p_langue is null or d.langue = p_langue)
           group by d.langue, d.candidat, d.version) g;
$$;

revoke all on function public.ab_traduction_votes_rapport(text) from public, anon;
grant execute on function public.ab_traduction_votes_rapport(text) to authenticated, service_role;

comment on function public.ab_traduction_votes_rapport(text) is
  'Duels relecteurs (0626) : par langue × candidat × version, les duels envoyés, les votes des relecteurs, le gagnant, la part du candidat sur les duels tranchés (règle D8 : retenu à partir de 55 %), les notes moyennes, les types d''erreur et les dernières remarques.';
