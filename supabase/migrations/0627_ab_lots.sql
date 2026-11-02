-- 0627 : le lot commun de duels pour les relecteurs natifs (30/10, demande
-- d'Adrien).
--
-- Jusqu'ici un duel (0620) prenait un slideshow publié AU HASARD dans la
-- langue, et l'admin l'envoyait aux relecteurs à la main (0626). Désormais un
-- LOT fixe de slideshows (15 par défaut), le même pour toutes les langues,
-- est composé pour couvrir le plus large : un contenu par label d'abord, puis
-- les labels les plus fournis, chaque contenu choisi parmi ceux qui ont le
-- plus de langues déjà traduites et le meilleur r médian, sans deux accroches
-- identiques. Le serveur prépare ensuite les duels du lot langue par langue,
-- pour chaque langue qui a un relecteur invité ou actif, et les envoie aux
-- relecteurs à la création : dès qu'un relecteur est indiqué dans l'OS, sa
-- langue entre dans le lot au tour suivant (toutes les deux minutes).
--
--   ab_lots                 le lot : numéro, candidat (circuit), statut.
--   ab_lot_contenus         ses contenus, en ordre, avec la raison du choix.
--   ab_traduction_duels.lot_id
--                           le duel appartient au lot ; un seul duel par
--                           lot × langue × contenu × candidat × version.
--   ab_lot_composer()       compose ou recompose un lot (admin), tant qu'aucun
--                           duel n'y est attaché.
--   ab_lot_etat()           le lot, ses contenus et l'avancement par langue.
--   ab_lot_a_faire()        garde du cron : reste-t-il une paire langue ×
--                           contenu sans duel ?
--   mes_duels_relecteur()   les duels du lot dans l'ordre du lot.
--   cron `ab-lots`          toutes les deux minutes, `ab-traduction` action
--                           `lot_servir`, seulement s'il reste du travail.
--
-- AJOUT SEULEMENT. Retour arrière :
--   select cron.unschedule('ab-lots');
--   drop function public.ab_lot_a_faire(), public.ab_lot_etat(integer), public.ab_lot_composer(integer, integer, text);
--   alter table public.ab_traduction_duels drop column lot_id;
--   drop table public.ab_lot_contenus, public.ab_lots;
--   (mes_duels_relecteur() : rejouer la version de 0626.)

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Les lots
-- ---------------------------------------------------------------------------
create table if not exists public.ab_lots (
  id          uuid primary key default gen_random_uuid(),
  numero      integer not null unique,
  nom         text not null,
  candidat    text not null default 'ancree',
  taille      integer not null default 15 check (taille between 1 and 60),
  statut      text not null default 'actif' check (statut in ('actif', 'clos')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ab_lots is
  'Duels relecteurs (0627) : un lot fixe de slideshows, le même pour toutes les langues, préparé en duels pour chaque langue qui a un relecteur. `candidat` est l''id du circuit candidat (CIRCUITS, _shared/ab_circuits.ts).';

create table if not exists public.ab_lot_contenus (
  lot_id      uuid not null references public.ab_lots (id) on delete cascade,
  contenu_id  uuid not null references public.contenus (id) on delete cascade,
  position    integer not null,
  label       text,
  nb_langues  integer,
  r_med       numeric,
  publies     integer,
  primary key (lot_id, contenu_id),
  unique (lot_id, position)
);

alter table public.ab_lots enable row level security;
alter table public.ab_lot_contenus enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ab_lots' and policyname = 'ab_lots_admin') then
    create policy ab_lots_admin on public.ab_lots for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ab_lot_contenus' and policyname = 'ab_lot_contenus_admin') then
    create policy ab_lot_contenus_admin on public.ab_lot_contenus for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

grant select, insert, update, delete on public.ab_lots, public.ab_lot_contenus to authenticated;
grant all on public.ab_lots, public.ab_lot_contenus to service_role;

-- ---------------------------------------------------------------------------
-- Le duel appartient à un lot
-- ---------------------------------------------------------------------------
alter table public.ab_traduction_duels
  add column if not exists lot_id uuid references public.ab_lots (id) on delete set null;

create unique index if not exists ab_traduction_duels_lot_unique
  on public.ab_traduction_duels (lot_id, langue, contenu_id, candidat, version)
  where lot_id is not null;

comment on column public.ab_traduction_duels.lot_id is
  'Duels relecteurs (0627) : le lot auquel ce duel appartient. Null : duel tiré au hasard depuis Tests.';

-- ---------------------------------------------------------------------------
-- Composer un lot : couverture des labels d'abord
-- ---------------------------------------------------------------------------
create or replace function public.ab_lot_composer(p_numero integer default 1, p_taille integer default 15, p_candidat text default 'ancree')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lot uuid;
  v_n integer;
begin
  if not (public.is_admin_strict() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'ab_lot_composer : réservé à l''admin' using errcode = '42501';
  end if;
  if p_taille is null or p_taille < 1 or p_taille > 60 then
    raise exception 'ab_lot_composer : taille entre 1 et 60' using errcode = '22023';
  end if;

  select id into v_lot from ab_lots where numero = p_numero;
  if v_lot is null then
    insert into ab_lots (numero, nom, candidat, taille, created_by)
    values (p_numero, 'Lot ' || p_numero, coalesce(nullif(trim(p_candidat), ''), 'ancree'), p_taille, auth.uid())
    returning id into v_lot;
  else
    if exists (select 1 from ab_traduction_duels where lot_id = v_lot) then
      raise exception 'ab_lot_composer : des duels existent déjà pour ce lot, il ne se recompose plus' using errcode = '22023';
    end if;
    update ab_lots set taille = p_taille, candidat = coalesce(nullif(trim(p_candidat), ''), candidat), updated_at = now() where id = v_lot;
    delete from ab_lot_contenus where lot_id = v_lot;
  end if;

  -- Les candidats : contenus validés, pas livrés par un podz (images finies),
  -- avec un deck source non vide, un label de ton, au moins un post publié,
  -- pas déjà dans un autre lot.
  with cand as (
    select c.id, coalesce(c.accroche_norm, c.id::text) as accroche,
           (select l.nom from contenu_labels cl join labels l on l.id = cl.label_id
             where cl.contenu_id = c.id and l.nom not in ('Hook', 'UGC AI VIDEO')
             order by l.nom limit 1) as label
      from contenus c
     where c.statut = 'valide'
       and coalesce(c.livre, false) = false
       and exists (select 1 from contenu_langues s
                    where s.contenu_id = c.id and s.langue = c.langue_source
                      and exists (select 1 from jsonb_array_elements(coalesce(nullif(s.slides_base, '[]'::jsonb), s.slides, '[]'::jsonb)) x
                                   where length(trim(coalesce(x ->> 'texte_overlay', ''))) > 0))
       and not exists (select 1 from ab_lot_contenus lc where lc.contenu_id = c.id and lc.lot_id <> v_lot)
  ),
  mesure as (
    select cd.id, cd.accroche, cd.label,
           (select count(*) from contenu_langues s where s.contenu_id = cd.id and jsonb_array_length(coalesce(s.slides, '[]'::jsonb)) > 0) as nb_langues,
           (select percentile_cont(0.5) within group (order by p.r) from passages p
             where p.contenu_id = cd.id and p.statut = 'publie' and p.r is not null and not coalesce(p.est_rappel, false)) as r_med,
           (select count(*) from passages p where p.contenu_id = cd.id and p.statut = 'publie' and not coalesce(p.est_rappel, false)) as publies
      from cand cd
     where cd.label is not null
  ),
  une_par_accroche as (
    select distinct on (accroche) * from mesure
     where publies > 0
     order by accroche, nb_langues desc, r_med desc nulls last
  ),
  classe as (
    select u.*, row_number() over (partition by label order by nb_langues desc, r_med desc nulls last, publies desc) as rang
      from une_par_accroche u
  ),
  choisis as (
    select id, label, nb_langues, r_med, publies,
           row_number() over (order by rang, nb_langues desc, r_med desc nulls last, publies desc) as position
      from classe
     order by rang, nb_langues desc, r_med desc nulls last, publies desc
     limit p_taille
  )
  insert into ab_lot_contenus (lot_id, contenu_id, position, label, nb_langues, r_med, publies)
  select v_lot, id, position, label, nb_langues, round(r_med::numeric, 2), publies from choisis;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'ab_lot_composer : aucun contenu éligible' using errcode = '22023';
  end if;
  return public.ab_lot_etat(p_numero);
end;
$$;

revoke all on function public.ab_lot_composer(integer, integer, text) from public, anon;
grant execute on function public.ab_lot_composer(integer, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L'état d'un lot
-- ---------------------------------------------------------------------------
create or replace function public.ab_lot_etat(p_numero integer default 1)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case when l.id is null then null else jsonb_build_object(
    'lot', jsonb_build_object('id', l.id, 'numero', l.numero, 'nom', l.nom, 'candidat', l.candidat, 'taille', l.taille,
                              'statut', l.statut, 'created_at', l.created_at),
    'contenus', coalesce((select jsonb_agg(jsonb_build_object(
                   'position', lc.position, 'contenu_id', lc.contenu_id, 'titre', c.titre, 'label', lc.label,
                   'nb_langues', lc.nb_langues, 'r_med', lc.r_med, 'publies', lc.publies,
                   'accroche', (select left(x ->> 'texte_overlay', 120) from contenu_langues s
                                 cross join lateral jsonb_array_elements(coalesce(nullif(s.slides_base, '[]'::jsonb), s.slides, '[]'::jsonb)) x
                                 where s.contenu_id = c.id and s.langue = c.langue_source
                                 order by (x ->> 'position')::int limit 1)
                 ) order by lc.position)
                 from ab_lot_contenus lc join contenus c on c.id = lc.contenu_id where lc.lot_id = l.id), '[]'::jsonb),
    'langues', coalesce((select jsonb_agg(jsonb_build_object(
                   'langue', g.langue, 'relecteurs', g.relecteurs,
                   'prets', (select count(*) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue and d.statut = 'pret'),
                   'echecs', (select count(*) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue and d.statut = 'echec'),
                   'votes', (select count(*) from ab_traduction_votes v join ab_traduction_duels d on d.id = v.duel_id where d.lot_id = l.id and lower(d.langue) = g.langue),
                   'dernier', (select max(d.created_at) from ab_traduction_duels d where d.lot_id = l.id and lower(d.langue) = g.langue)
                 ) order by g.langue)
                 from (select lower(r.langue) as langue, count(*) as relecteurs
                         from relecteurs_natifs r where r.statut in ('invite', 'actif') group by lower(r.langue)) g), '[]'::jsonb),
    'duels', (select count(*) from ab_traduction_duels d where d.lot_id = l.id)
  ) end
  from (select * from ab_lots where numero = p_numero) l
  right join (select 1) un on true;
$$;

revoke all on function public.ab_lot_etat(integer) from public, anon;
grant execute on function public.ab_lot_etat(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reste-t-il du travail ? (garde du cron)
-- ---------------------------------------------------------------------------
create or replace function public.ab_lot_a_faire()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from ab_lots l
      join ab_lot_contenus lc on lc.lot_id = l.id
      join (select distinct lower(langue) as langue from relecteurs_natifs where statut in ('invite', 'actif')) g on true
     where l.statut = 'actif'
       and not exists (select 1 from ab_traduction_duels d
                        where d.lot_id = l.id and lower(d.langue) = g.langue and d.contenu_id = lc.contenu_id and d.candidat = l.candidat)
  );
$$;

revoke all on function public.ab_lot_a_faire() from public, anon;
grant execute on function public.ab_lot_a_faire() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Les duels du lot dans l'ordre du lot, pour le relecteur
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
    left join public.ab_lot_contenus lc
      on lc.lot_id = d.lot_id and lc.contenu_id = d.contenu_id
   where d.statut = 'pret'
     and d.relecteurs_le is not null
     and coalesce((select (g.valeur ->> 'espace_ouvert')::boolean from public.reglages g where g.cle = 'relecture_native'), false)
   order by (v.id is not null), lc.position nulls last, d.relecteurs_le desc
   limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : toutes les deux minutes, seulement s'il reste du travail
-- ---------------------------------------------------------------------------
do $cron$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'ab-lots') then
    perform cron.unschedule('ab-lots');
  end if;
  -- L'URL et l'en-tête x-cron-secret d'un cron existant, sans jamais écrire le
  -- secret ici (comme 0618).
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'exemples-natifs' then 0 when c.jobname = 'recrues-check' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'ab-lots : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/ab-traduction', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb', 'body := ''{"action":"lot_servir"}''::jsonb', 'i');
  cmd := regexp_replace(cmd, '\s+where\s+public\.[a-z_]+\(\)\s*;?\s*$', '', 'i');
  cmd := regexp_replace(cmd, ';\s*$', '') || ' where public.ab_lot_a_faire();';
  if position('"lot_servir"' in cmd) = 0 or position('functions/v1/ab-traduction' in cmd) = 0 then
    raise notice 'ab-lots : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('ab-lots', '*/2 * * * *', cmd);
end
$cron$;

notify pgrst, 'reload schema';
