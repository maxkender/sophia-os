-- Résolution des publications : retrouver le post TikTok derrière un créneau.
--
-- Le relevé de vues repose entièrement sur `publie_url`, le lien que le créateur
-- colle à la main. Trois comptes ont publié 158 fois en collant l'URL de leur
-- PROFIL : aucune vue relevée en un mois, et un classement calculé à l'aveugle.
--
-- On file donc chaque créneau coché « publié », et un drain va chercher le post
-- lui-même quelques minutes plus tard (voir `supabase/functions/
-- resolution-publication`). Le lien du créateur reste le premier recours quand
-- il est exploitable — c'est gratuit ; le scrape de profil n'est que le second.

-- ---------------------------------------------------------------------------
-- 1) L'état de résolution, porté par le passage
-- ---------------------------------------------------------------------------
alter table public.passages
  add column if not exists resolution_statut text
    check (resolution_statut in ('a_resoudre', 'resolu', 'introuvable')),
  add column if not exists resolution_tentatives integer not null default 0,
  add column if not exists resolution_prochaine_at timestamptz,
  add column if not exists resolution_at timestamptz,
  add column if not exists resolution_detail text;

comment on column public.passages.resolution_statut is
  'a_resoudre : en file · resolu : post TikTok retrouvé · introuvable : rien après toutes les tentatives (créneau coché sans publication ?)';
comment on column public.passages.resolution_detail is
  'Comment le post a été retrouvé — lien du créateur, ou profil avec les signaux qui ont corroboré.';

-- La file se lit toujours de la même façon : échéances dépassées, au plus tôt.
create index if not exists passages_file_resolution_idx
  on public.passages (resolution_prochaine_at)
  where resolution_statut = 'a_resoudre';

-- ---------------------------------------------------------------------------
-- 2) Entrée en file dès que le créateur coche « publié »
-- ---------------------------------------------------------------------------
-- Un trigger plutôt qu'un appel côté applicatif : le passage en `publie_at` se
-- fait depuis la page poster, depuis l'admin et depuis des fonctions Edge. Un
-- seul point d'entrée, aucun chemin oublié.
create or replace function public.passages_file_resolution()
returns trigger
language plpgsql
as $$
begin
  if new.publie_at is not null
     and (tg_op = 'INSERT' or old.publie_at is null)
  then
    new.resolution_statut := 'a_resoudre';
    new.resolution_tentatives := 0;
    -- 5 minutes : TikTok n'expose pas un post neuf sur le profil dans la seconde.
    new.resolution_prochaine_at := now() + interval '5 minutes';
    new.resolution_at := null;
    new.resolution_detail := null;
  end if;
  return new;
end;
$$;

comment on function public.passages_file_resolution() is
  'Met un créneau en file de résolution au moment où il est déclaré publié.';

drop trigger if exists passages_file_resolution on public.passages;
create trigger passages_file_resolution
  before insert or update of publie_at on public.passages
  for each row
  execute function public.passages_file_resolution();

-- ---------------------------------------------------------------------------
-- 3) Amorçage : les publications récentes dont le lien ne vaut rien
-- ---------------------------------------------------------------------------
-- Borné à 48 h : au-delà, le post est trop loin dans le profil pour que le
-- scrape le retrouve à coup sûr, et le rattrapage de l'historique est une autre
-- affaire. Les créneaux dont le lien porte déjà un ID de post sont laissés
-- tranquilles — ils marchent.
update public.passages
set resolution_statut = 'a_resoudre',
    resolution_tentatives = 0,
    resolution_prochaine_at = now() + interval '1 minute'
where publie_at is not null
  and publie_at >= now() - interval '48 hours'
  and resolution_statut is null
  and (
    publie_url is null
    -- Ni un lien de post, ni un lien court du bouton « Partager » (celui-là se
    -- résout par simple redirection et marche déjà) : donc inexploitable.
    or (
      publie_url !~ '/(photo|video)/[0-9]+'
      and publie_url !~* '(vm|vt)\.tiktok\.com/|tiktok\.com/t/'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Le drain, à la minute
-- ---------------------------------------------------------------------------
-- Le secret de cron n'a pas à vivre dans le dépôt : on recopie la commande d'un
-- job existant en changeant la fonction appelée.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'upscale-assignes-drain';
  if cmd is null then
    raise exception 'job modèle upscale-assignes-drain introuvable — cron non posé';
  end if;
  cmd := replace(
    cmd,
    '/functions/v1/upscale-assignes',
    '/functions/v1/resolution-publication'
  );
  if exists (select 1 from cron.job where jobname = 'resolution-publication-drain') then
    perform cron.unschedule('resolution-publication-drain');
  end if;
  perform cron.schedule('resolution-publication-drain', '* * * * *', cmd);
end;
$$;
