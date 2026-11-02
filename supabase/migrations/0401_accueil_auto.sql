-- 0401 — Système du 2 nov., partie A : l'accueil automatique.
--
-- Toutes les heures (cron « accueil-auto », minute 25), la fonction `upwork`
-- (action « accueil ») relit les contrats actifs et prend ceux qui ont démarré
-- depuis `accueil_contrats_depuis` :
--   - annonce connue (annonces_pays) → le posteur est créé comme sur
--     /embauche (pays, langue, HM et tarif de l'annonce, 2 posts par jour,
--     identité générée, cohorte depuis le début du contrat), puis le message
--     de bienvenue part dans la conversation du contrat ;
--   - annonce inconnue ou générique → « Contrats à relier » : la HM (ou
--     l'admin) choisit le pays, puis même création au passage suivant ;
--   - doublon (contrat déjà relié, ou même nom et même pays actif) → rien,
--     signalé.
-- Jamais deux messages de bienvenue pour un même contrat (accueils.message_at,
-- posé une seule fois ; une ligne « envoi » en cours n'est jamais renvoyée).
--
-- Interrupteur `accueil_auto` : off | test | on. Défaut : test (le plan est
-- noté, « simulé », rien n'est créé ni envoyé).
--
-- Additive : réglages, deux tables, des fonctions, un cron cloné (sans
-- écrire de secret). Aucune donnée existante modifiée.
-- Retour arrière : cron.unschedule('accueil-auto') ; drop des fonctions, des
-- tables accueils et annonces_pays, et des réglages accueil_*.

insert into public.reglages (cle, valeur) values
  ('accueil_auto', to_jsonb('test'::text)),
  -- Seuls les contrats démarrés après ce moment sont accueillis : les
  -- contrats en cours, déjà créés à la main, ne sont jamais repris.
  ('accueil_contrats_depuis', to_jsonb(now())),
  ('accueil_message_texte', to_jsonb(
    E'Hi {prenom}, welcome to Vik Studios! Here is everything you need:\n'
    || E'• Your dashboard: {url}\n'
    || E'• Login: {email} · Password: {mot_de_passe}\n'
    || E'• Join our Slack with your full name (first and last name): {slack}\n'
    || E'• Our guide: {guide}\n'
    || E'Create your TikTok account and finish the warm-up before Sunday midnight: your first posts are on Monday {date}. '
    || 'For any question about the work, ask on Slack.'))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Les annonces Upwork et leur pays
-- ---------------------------------------------------------------------------
create table if not exists public.annonces_pays (
  job_id     text primary key,
  titre      text,
  -- Pays ISO (comme comptes.pays : PT, BR, GB…) et langue du posteur (pt,
  -- pt-BR, en…) ; null tant que personne ne l'a dit (annonce vue la 1re fois).
  pays       text,
  langue     text,
  hm_id      uuid references public.profiles (id) on delete set null,
  -- Tarif hebdo du posteur ; null = celui de la zone de paie.
  tarif      numeric check (tarif is null or tarif > 0),
  -- Générique (tous pays) : chaque contrat passe par « Contrats à relier ».
  generique  boolean not null default false,
  vue_at     timestamptz not null default now(),
  maj_at     timestamptz,
  maj_par    uuid references auth.users (id) on delete set null
);

comment on table public.annonces_pays is
  'Annonces Upwork → pays, langue, HM et tarif du posteur (système du 2 nov., partie A). Voir 0401.';

alter table public.annonces_pays enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'annonces_pays'
                  and policyname = 'annonces_pays lecture') then
    create policy "annonces_pays lecture" on public.annonces_pays
      for select to authenticated using ((select public.is_admin()) or (select public.is_hiring_manager()));
  end if;
end $$;
revoke all on public.annonces_pays from public, anon, authenticated;
grant select on public.annonces_pays to authenticated;
grant all on public.annonces_pays to service_role;

-- ---------------------------------------------------------------------------
-- Les accueils : un par contrat
-- ---------------------------------------------------------------------------
create table if not exists public.accueils (
  contrat_id       text primary key,
  organisation_id  text,
  offre_id         text,
  job_id           text,
  job_titre        text,
  prenom           text,
  nom              text,
  debut_at         timestamptz,
  hm_upwork_id     text,
  -- simule (test) | a_relier | a_creer (pays choisi à la main) | doublon |
  -- cree (posteur créé, message pas encore parti) | envoi (en cours) |
  -- envoye | erreur
  statut           text not null check (statut in ('simule', 'a_relier', 'a_creer', 'doublon', 'cree', 'envoi', 'envoye', 'erreur')),
  raison           text,
  pays             text,
  langue           text,
  hm_id            uuid references public.profiles (id) on delete set null,
  tarif            numeric,
  poster_id        uuid references public.profiles (id) on delete set null,
  email            text,
  cohorte_lundi    date,
  message_texte    text,
  message_at       timestamptz,
  relie_par        uuid references auth.users (id) on delete set null,
  relie_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists accueils_statut on public.accueils (statut);

comment on table public.accueils is
  'Accueil automatique des recrues (système du 2 nov., partie A) : un par contrat ; jamais deux messages de bienvenue. Voir 0401.';

alter table public.accueils enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accueils'
                  and policyname = 'accueils lecture') then
    create policy "accueils lecture" on public.accueils
      for select to authenticated using ((select public.is_admin()) or (select public.is_hiring_manager()));
  end if;
end $$;
revoke all on public.accueils from public, anon, authenticated;
grant select on public.accueils to authenticated;
grant all on public.accueils to service_role;

-- « Contrats à relier » : la HM (ou l'admin) donne le pays, la langue et la
-- HM ; le contrat passe « a_creer » et sera créé au passage suivant.
-- p_retenir : l'annonce n'est pas générique, s'en souvenir pour les suivants.
create or replace function public.accueil_relier(
  p_contrat text,
  p_pays text,
  p_langue text,
  p_hm uuid default null,
  p_retenir boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hm uuid := coalesce(p_hm, case when public.is_hiring_manager() then auth.uid() end);
  v_job text;
  v_titre text;
begin
  if not (public.is_admin() or public.is_hiring_manager()) then
    raise exception 'accueil_relier : réservé à l''admin, au Head of Ops et aux HMs';
  end if;
  if nullif(btrim(coalesce(p_pays, '')), '') is null or nullif(btrim(coalesce(p_langue, '')), '') is null then
    raise exception 'accueil_relier : pays et langue obligatoires';
  end if;
  update public.accueils
     set statut = 'a_creer', pays = upper(btrim(p_pays)), langue = btrim(p_langue), hm_id = v_hm,
         relie_par = auth.uid(), relie_at = now(), raison = null, updated_at = now()
   where contrat_id = p_contrat and statut in ('a_relier', 'simule')
  returning job_id, job_titre into v_job, v_titre;
  if not found then
    raise exception 'accueil_relier : contrat introuvable ou déjà traité';
  end if;
  if p_retenir and v_job is not null then
    insert into public.annonces_pays (job_id, titre, pays, langue, hm_id, generique, maj_at, maj_par)
    values (v_job, v_titre, upper(btrim(p_pays)), btrim(p_langue), v_hm, false, now(), auth.uid())
    on conflict (job_id) do update
      set pays = excluded.pays, langue = excluded.langue, hm_id = excluded.hm_id, generique = false,
          maj_at = now(), maj_par = auth.uid();
  end if;
end;
$$;

-- Une annonce : pays, langue, HM, tarif, générique (admin, Head of Ops, HM).
create or replace function public.annonce_enregistrer(
  p_job text,
  p_pays text,
  p_langue text,
  p_hm uuid,
  p_tarif numeric,
  p_generique boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_hiring_manager()) then
    raise exception 'annonce_enregistrer : réservé à l''admin, au Head of Ops et aux HMs';
  end if;
  update public.annonces_pays
     set pays = case when p_generique then null else upper(nullif(btrim(coalesce(p_pays, '')), '')) end,
         langue = case when p_generique then null else nullif(btrim(coalesce(p_langue, '')), '') end,
         hm_id = p_hm,
         tarif = p_tarif,
         generique = coalesce(p_generique, false),
         maj_at = now(), maj_par = auth.uid()
   where job_id = p_job;
  if not found then
    raise exception 'annonce_enregistrer : annonce inconnue';
  end if;
end;
$$;

revoke execute on function public.accueil_relier(text, text, text, uuid, boolean) from public, anon;
grant execute on function public.accueil_relier(text, text, text, uuid, boolean) to authenticated;
revoke execute on function public.annonce_enregistrer(text, text, text, uuid, numeric, boolean) from public, anon;
grant execute on function public.annonce_enregistrer(text, text, text, uuid, numeric, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Le cron : toutes les heures à la minute 25, cloné de « upwork-verifier »
-- (même adresse, même secret, déjà en base) : seule l'action change.
-- ---------------------------------------------------------------------------
do $cron$
declare
  v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'upwork-verifier';
  if v_cmd is null then
    raise notice 'accueil-auto : cron upwork-verifier introuvable, cron non créé';
    return;
  end if;
  v_cmd := regexp_replace(v_cmd, '"action"\s*:\s*"verifier"', '"action":"accueil"');
  if exists (select 1 from cron.job where jobname = 'accueil-auto') then
    perform cron.unschedule('accueil-auto');
  end if;
  perform cron.schedule('accueil-auto', '25 * * * *', v_cmd);
end
$cron$;

notify pgrst, 'reload schema';
