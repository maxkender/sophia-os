-- 0373 : Comment Masters · suivi (27/10).
--
-- Compte les commentaires « Done » de chaque Comment Master, par période de 4
-- semaines (celle des bonus, alignée sur `reglages.bonus.premier_lundi`).
--
-- A) Le Done vu sur Slack. La synchro de 7 h (fonction `comment-masters`,
--    action `synchro_slack`) lit le fil et les réactions de chaque demande
--    encore ouverte : une réponse « done » ou ✅ dans le fil, ou une réaction ✅,
--    vaut Done. Elle remplit alors `fait_at` / `fait_par` (jamais sur une
--    demande déjà faite), avec `fait_source = 'slack_sync'` et le mode
--    (fil / reaction). Le bouton Done note désormais `fait_source = 'bouton'`
--    et l'ID Slack de qui a cliqué.
-- B) L'attribution. Une demande va au Comment Master dont le mandat couvre sa
--    langue à l'envoi. Son compte Slack est retrouvé par son email
--    (`comment_master_slack`). Un Done fait par quelqu'un d'autre est signalé
--    et ne compte qu'une fois validé par l'admin (`autre_valide_at`).
-- C) Le journal des synchros, et les réglages des bonus (créés s'ils
--    n'existent pas : montants à 0, à remplir dans l'OS).
--
-- Additive : colonnes ajoutées (vides), deux tables, une ligne de réglages
-- créée seulement si elle n'existe pas, des fonctions, une tâche planifiée.
-- Aucune donnée existante modifiée. Retour arrière :
--   select cron.unschedule('comment-masters-synchro');
--   drop function public.cm_demandes(date, date), public.cm_valider_autre(uuid, boolean);
--   drop table public.comment_master_syncs, public.comment_master_slack;
--   alter table public.comment_master_demandes drop column fait_source,
--     drop column fait_slack_id, drop column fait_mode,
--     drop column autre_valide_at, drop column autre_valide_par;
--   delete from public.reglages where cle = 'bonus';

alter table public.comment_master_demandes
  add column if not exists fait_source text,
  add column if not exists fait_slack_id text,
  add column if not exists fait_mode text,
  add column if not exists autre_valide_at timestamptz,
  add column if not exists autre_valide_par uuid;

comment on column public.comment_master_demandes.fait_source is
  'D''où vient le Done : bouton (clic dans Slack) ou slack_sync (fil ou réaction vus par la synchro, 0373). Vide : bouton, avant 0373.';
comment on column public.comment_master_demandes.fait_mode is
  'bouton, fil (réponse « done » ou ✅) ou reaction (✅ sur le message).';

-- Le compte Slack de chaque Comment Master, retrouvé par son email.
create table if not exists public.comment_master_slack (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  slack_user_id text,
  slack_name    text,
  maj_at        timestamptz not null default now()
);

create table if not exists public.comment_master_syncs (
  id           uuid primary key default gen_random_uuid(),
  debut        timestamptz not null default now(),
  fin          timestamptz,
  auto         boolean not null default false,
  lance_par    uuid,
  canaux       integer not null default 0,
  lues         integer not null default 0,
  mises_a_jour integer not null default 0,
  erreurs      jsonb not null default '[]'::jsonb
);

alter table public.comment_master_slack enable row level security;
alter table public.comment_master_syncs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comment_master_syncs'
                  and policyname = 'comment_master_syncs lecture admin') then
    create policy "comment_master_syncs lecture admin" on public.comment_master_syncs
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comment_master_slack'
                  and policyname = 'comment_master_slack lecture admin') then
    create policy "comment_master_slack lecture admin" on public.comment_master_slack
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.comment_master_slack, public.comment_master_syncs from public, anon, authenticated;
grant select on public.comment_master_slack, public.comment_master_syncs to authenticated;
grant all on public.comment_master_slack, public.comment_master_syncs to service_role;

-- Les réglages des bonus (prompt 11), modifiables par l'admin dans l'OS.
insert into public.reglages (cle, valeur)
values ('bonus', jsonb_build_object(
  'parrainage_montant', 0,
  'parrainage_semaines_min', 2,
  'parrainage_posts_min_semaine', 12,
  'comment_master_par_commentaire', 0,
  'premier_lundi', '2026-11-30'))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Les demandes d'une période, attribuées
-- ---------------------------------------------------------------------------
create or replace function public.cm_demandes(p_debut date, p_fin date)
returns table (
  id              uuid,
  langue          text,
  region          text,
  canal           text,
  slack_channel_id text,
  slack_ts        text,
  publie_url      text,
  envoye_at       timestamptz,
  fait_at         timestamptz,
  fait_par        text,
  fait_source     text,
  fait_mode       text,
  verifie         boolean,
  cm_profile_id   uuid,
  cm_nom          text,
  cm_slack_connu  boolean,
  -- Done par quelqu'un d'autre que le Comment Master du mandat.
  autre_personne  boolean,
  autre_valide_at timestamptz,
  -- Ce qui compte : fait, et par le Comment Master (ou validé par l'admin).
  compte          boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'cm_demandes : réservé à l''admin';
  end if;
  return query
  select d.id, d.langue, r.region, r.slack_canal_nom, d.slack_channel_id, d.slack_ts, d.publie_url,
         d.envoye_at, d.fait_at, d.fait_par, d.fait_source, d.fait_mode,
         d.commentaire_poste is not null,
         m.profile_id, m.nom, s.slack_user_id is not null,
         x.autre, d.autre_valide_at,
         d.fait_at is not null and (not x.autre or d.autre_valide_at is not null)
    from public.comment_master_demandes d
    left join public.comment_master_regions r on r.langue = d.langue
    left join lateral (
      select mm.profile_id, mm.nom from public.comment_master_mandats mm
       where mm.langue = d.langue
         and d.envoye_at >= mm.debut
         and (mm.fin is null or d.envoye_at < mm.fin)
       order by mm.debut desc
       limit 1
    ) m on true
    left join public.comment_master_slack s on s.profile_id = m.profile_id
    cross join lateral (
      select d.fait_at is not null
             and s.slack_user_id is not null
             and coalesce(d.fait_slack_id, '') <> s.slack_user_id
             and lower(coalesce(d.fait_par, '')) not in (lower(s.slack_user_id), lower(coalesce(s.slack_name, '')))
             as autre
    ) x
   where d.slack_ts is not null
     and d.envoye_at is not null
     and (d.envoye_at at time zone 'Europe/Paris')::date between p_debut and p_fin;
end;
$$;

revoke execute on function public.cm_demandes(date, date) from public, anon;
grant execute on function public.cm_demandes(date, date) to authenticated, service_role;

-- L'admin valide (ou retire) un Done fait par quelqu'un d'autre.
create or replace function public.cm_valider_autre(p_demande uuid, p_valide boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'cm_valider_autre : réservé à l''admin';
  end if;
  update public.comment_master_demandes
     set autre_valide_at = case when p_valide then now() end,
         autre_valide_par = case when p_valide then auth.uid() end
   where id = p_demande and fait_at is not null;
end;
$$;

revoke execute on function public.cm_valider_autre(uuid, boolean) from public, anon;
grant execute on function public.cm_valider_autre(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : 7 h à Paris (la fonction vérifie l'heure)
-- ---------------------------------------------------------------------------
do $cm$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'comment-masters-synchro') then
    perform cron.unschedule('comment-masters-synchro');
  end if;
  -- L'URL et l'en-tête x-cron-secret d'un cron existant, sans jamais écrire le
  -- secret ici (comme 0356).
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'comment-masters' then 0 when c.jobname = 'ckd-warmup-releve' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'comment-masters : aucun cron modèle avec secret, synchro à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/comment-masters', 'i');
  if position('body' in cmd) > 0 then
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                          'body := ''{"action":"synchro_slack_planifiee"}''::jsonb', 'i');
  end if;
  if position('synchro_slack_planifiee' in cmd) = 0 then
    raise notice 'comment-masters : réécriture de la commande de synchro échouée';
    return;
  end if;
  -- 5 h et 6 h UTC : 7 h à Paris l'hiver comme l'été ; la fonction ne garde que 7 h.
  perform cron.schedule('comment-masters-synchro', '0 5,6 * * *', cmd);
end
$cm$;

notify pgrst, 'reload schema';
