-- 0356 : Check, Kill or Double, le suivi par cohorte (demande d'Adrien, 24/10).
--
-- POURQUOI. La page ne voyait les nouveaux posteurs qu'une fois qu'ils
-- postaient, et seulement le jeudi et le samedi. Rien ne disait, pendant la
-- semaine de recrutement, qui avait créé son compte TikTok, qui faisait son
-- warm-up, ni qui allait rater le lundi faute d'avoir cliqué « Start warmup ».
--
-- LA COHORTE. Celle du lundi de ses premiers posts, comme la page Posters
-- (0333) : premier post prévu, sinon fin du warm-up (lundi 00:00, 0301),
-- sinon (warm-up pas lancé) le lundi qui vient. Seulement les NOUVEAUX
-- posteurs : le premier compte de chacun, ni les comptes recréés ni les
-- 2ᵉ comptes, ni la cohorte Ruul, ni les comptes CM ou vidéo. Un compte qui
-- n'a toujours pas lancé son warm-up 21 jours après sa création sort de la
-- vue. Un compte qui démarre plus tard que prévu (le lundi qui suit sa
-- création) est dit « glissé » de la cohorte prévue.
--
-- CE QUI CHANGE.
--   * `ckd_warmup_releves` : chaque relevé du profil TikTok PUBLIC des comptes
--     en warm-up (le compte existe-t-il, sa date de création, ses abonnements,
--     ses likes donnés). Les reposts ne sont pas visibles de l'extérieur.
--     Écrit par la fonction Edge `ckd` (actions `releve_warmup` et
--     `releve_warmup_planifie`), à 8 h et 20 h (heure de Paris), et au bouton
--     « Relever maintenant » de la page. Aucun appel Apify.
--   * `ckd_cohorte_comptes(lundi)` : les comptes d'une cohorte.
--   * `ckd_cohorte(lundi)` : ce que la page affiche, compte par compte : les
--     posts du lundi au vendredi (avec les seuils du compte) et les relevés
--     de la semaine de warm-up.
--   * `ckd_warmup_a_relever()` : les comptes de la cohorte en warm-up.
--
-- Retour arrière : `cron.unschedule('ckd-warmup-releve')`, drop des trois
-- fonctions et de la table `ckd_warmup_releves`.

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Relevés des profils TikTok
-- ---------------------------------------------------------------------------
-- Pas de clé étrangère vers `comptes` (table très écrite, voir 0317).
create table if not exists public.ckd_warmup_releves (
  id             bigint generated always as identity primary key,
  compte_id      uuid not null,
  handle         text not null,
  releve_at      timestamptz not null default now(),
  -- null : la page n'a pas pu être lue (TikTok a bloqué, réseau) ; on n'en tire rien.
  existe         boolean,
  cree_tiktok_at timestamptz,
  abonnements    integer,
  likes          integer,
  abonnes        integer,
  videos         integer,
  erreur         text
);

create index if not exists ckd_warmup_releves_compte
  on public.ckd_warmup_releves (compte_id, releve_at desc);

comment on table public.ckd_warmup_releves is
  'Check, Kill or Double : relevés du profil TikTok public des comptes en warm-up (existe, création, abonnements, likes). Voir 0356.';

alter table public.ckd_warmup_releves enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ckd_warmup_releves'
                  and policyname = 'ckd_warmup_releves lecture admin') then
    create policy "ckd_warmup_releves lecture admin" on public.ckd_warmup_releves
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.ckd_warmup_releves from public, anon, authenticated;
grant select on public.ckd_warmup_releves to authenticated;
grant all on public.ckd_warmup_releves to service_role;

-- ---------------------------------------------------------------------------
-- Les comptes d'une cohorte
-- ---------------------------------------------------------------------------
create or replace function public.ckd_cohorte_comptes(p_lundi date)
returns table (compte_id uuid, poster_id uuid, lundi date, attendu date)
language sql
stable
security definer
set search_path = public
as $$
  with auj as (select (now() at time zone 'Europe/Paris')::date as j),
  base as (
    select c.id, c.poster_id, c.created_at,
           case
             -- Premier post prévu : le lundi de sa semaine.
             when pj.premier_jour is not null
               then pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1)
             -- Warm-up lancé : il finit un lundi 00:00 (0301) ; un « skip »
             -- de l'admin finit n'importe quand, on prend le lundi de ce jour-là.
             when c.warmup_ends_at is not null
               then f.jour - (extract(isodow from f.jour)::int - 1)
             -- Pas lancé : le lundi qui vient, tant que le compte a moins de 21 jours.
             when c.is_active and c.created_at >= now() - interval '21 days'
               then a.j + (8 - extract(isodow from a.j)::int)
           end as lundi,
           -- Le lundi prévu à la création : celui qui suit le jour de création.
           cr.jour + (8 - extract(isodow from cr.jour)::int) as attendu
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
      cross join auj a
      cross join lateral (select (c.warmup_ends_at at time zone 'Europe/Paris')::date as jour) f
      cross join lateral (select (c.created_at at time zone 'Europe/Paris')::date as jour) cr
     where c.type_compte = 'perso'
       and not coalesce(c.ugc_ai_video, false)
       and not coalesce(c.videos_uniquement, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  -- Le premier compte de chaque posteur : un recréé ou un 2ᵉ compte n'en est pas un.
  premiers as (
    select distinct on (b.poster_id) b.id, b.poster_id, b.lundi, b.attendu
      from base b
     where b.lundi is not null
     order by b.poster_id, b.lundi, b.created_at
  )
  select p.id, p.poster_id, p.lundi, p.attendu
    from premiers p
   where p.lundi = p_lundi;
$$;

-- ---------------------------------------------------------------------------
-- Ce que la page affiche
-- ---------------------------------------------------------------------------
create or replace function public.ckd_cohorte(p_lundi date)
returns table (
  compte_id       uuid,
  poster_id       uuid,
  hm_id           uuid,
  handle          text,
  pays            text,
  langue          text,
  application     text,
  is_active       boolean,
  cree_le         timestamptz,
  warmup_lance_le timestamptz,
  warmup_fin      timestamptz,
  premier_jour    date,
  glisse_de       date,
  seuil_mort      numeric,
  seuil_bon       numeric,
  posts           jsonb,
  releves         jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_cohorte : réservé à l''admin';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'ckd_cohorte : % n''est pas un lundi', p_lundi;
  end if;

  return query
  select m.compte_id, c.poster_id, pr.manager_id, c.handle_tiktok, c.pays, c.langue,
         public.application_principale(c.parts_applications),
         c.is_active, c.created_at, c.warmup_started_at, c.warmup_ends_at, pj.premier_jour,
         case when m.lundi > m.attendu then m.attendu end,
         s.seuil_mort, s.seuil_bon,
         -- Les posts du lundi au vendredi, mesurés comme Check, Kill or Double (0326).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'jour', x.date_publication_prevue,
                    'vues', x.vues,
                    'url', x.publie_url,
                    'mesure', (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
                               and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                                   >= s.age_min::double precision * interval '1 hour'))
                  order by x.date_publication_prevue, x.created_at)
             from public.passages x
            where x.compte_id = m.compte_id
              and not coalesce(x.est_rappel, false)
              and x.statut <> 'brouillon'
              and x.date_publication_prevue between p_lundi and p_lundi + 4), '[]'::jsonb),
         -- Les relevés de la semaine de warm-up (et du lundi matin).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'at', r.releve_at,
                    'existe', r.existe,
                    'cree_tiktok_at', r.cree_tiktok_at,
                    'abonnements', r.abonnements,
                    'likes', r.likes,
                    'abonnes', r.abonnes,
                    'videos', r.videos)
                  order by r.releve_at)
             from public.ckd_warmup_releves r
            where r.compte_id = m.compte_id
              and r.releve_at >= ((p_lundi - 7)::timestamp at time zone 'Europe/Paris')
              and r.releve_at < ((p_lundi + 1)::timestamp at time zone 'Europe/Paris')), '[]'::jsonb)
    from public.ckd_cohorte_comptes(p_lundi) m
    join public.comptes c on c.id = m.compte_id
    join public.profiles pr on pr.id = c.poster_id
    left join public.comptes_premier_jour pj on pj.compte_id = m.compte_id
    -- Les seuils du compte, par pays et label comme `ckd_calculer` (0326) ; le
    -- bon post retombe sur celui des comment masters du pays.
    cross join lateral (
      select (select cl.label_id from public.compte_labels cl
                where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
    ) l
    cross join lateral (
      select coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('age_min_heures', c.pays, l.label_id) r), 10) as age_min,
             coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
             coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('seuil_bon_post', c.pays, l.label_id) r),
                      (select cm.seuil_vues from public.comment_master_pays cm
                        where cm.pays = c.pays order by (cm.langue = c.langue) desc limit 1),
                      5000) as seuil_bon
    ) s;
end;
$$;

-- Les comptes de la cohorte en warm-up (celle du lundi qui vient), pour le relevé.
create or replace function public.ckd_warmup_a_relever()
returns table (compte_id uuid, handle text)
language sql
stable
security definer
set search_path = public
as $$
  select m.compte_id, c.handle_tiktok
    from public.ckd_cohorte_comptes(
           (now() at time zone 'Europe/Paris')::date
           + (8 - extract(isodow from (now() at time zone 'Europe/Paris')::date)::int)) m
    join public.comptes c on c.id = m.compte_id
   where c.is_active
     and nullif(btrim(c.handle_tiktok), '') is not null;
$$;

revoke all on function public.ckd_cohorte_comptes(date) from public, anon, authenticated;
revoke all on function public.ckd_cohorte(date) from public, anon;
revoke all on function public.ckd_warmup_a_relever() from public, anon, authenticated;
grant execute on function public.ckd_cohorte_comptes(date) to service_role;
grant execute on function public.ckd_cohorte(date) to authenticated, service_role;
grant execute on function public.ckd_warmup_a_relever() to service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : 8 h et 20 h à Paris (la fonction vérifie l'heure)
-- ---------------------------------------------------------------------------
do $ckd$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'ckd-warmup-releve') then
    perform cron.unschedule('ckd-warmup-releve');
  end if;

  -- On recopie l'URL et l'en-tête x-cron-secret d'un cron existant de `ckd`,
  -- sans jamais écrire le secret ici (comme 0328).
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'ckd-envoi-dimanche' then 0
                 when c.jobname = 'comment-masters' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'ckd : aucun cron modèle avec secret, relevé du warm-up à planifier à la main';
    return;
  end if;

  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/ckd', 'i');
  cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                        'body := ''{"action":"releve_warmup_planifie"}''::jsonb', 'i');
  if position('functions/v1/ckd' in cmd) = 0 or position('releve_warmup_planifie' in cmd) = 0 then
    raise notice 'ckd : réécriture de la commande du relevé échouée';
    return;
  end if;
  -- 6 h et 18 h UTC l'été, 7 h et 19 h l'hiver : la fonction ne garde que 8 h et 20 h à Paris.
  perform cron.schedule('ckd-warmup-releve', '0 6,7,18,19 * * *', cmd);
end
$ckd$;

notify pgrst, 'reload schema';
