-- 0325 : le lien du profil TikTok à 1 000 abonnés.
--
-- POURQUOI. À 1 000 abonnés, TikTok ouvre le champ « Liens » du profil
-- (Modifier le profil → Liens) : un lien cliquable, contrairement à la bio.
-- Chaque compte qui passe le cap doit y mettre le lien de l'application qu'il
-- promeut. Personne ne le surveillait.
--
-- CE QUI CHANGE.
--   * `compte_profils` : le dernier profil connu de chaque compte (abonnés,
--     lien cliquable). Rempli par le relevé de vues de la nuit
--     (`rattrapage-elo`) et par `metriques`, sur le scrape déjà payé : aucun
--     appel Apify de plus.
--   * `compte_liens_1000` : le suivi par compte (message envoyé, relance, fait).
--   * `lien_1000_controle()` : chaque lundi (cron `lien-1000-abonnes`). Pour
--     chaque compte actif à 1 000 abonnés ou plus :
--       - le bon lien est en place → marqué fait, aucun message ;
--       - sinon, premier passage → un pop-up à la prochaine connexion
--         (`compte_nudges`, un par compte, avec le handle) ;
--       - toujours rien 7 jours après → une seule relance, puis plus rien.
--     Le lien dépend de l'application qui a la plus grosse part dans
--     `comptes.parts_applications` (Sophia par défaut).
--   * L'envoi est ÉTEINT au départ (`reglages.lien_1000.envoi_actif = false`) :
--     61 comptes ont déjà passé le cap et recevraient tous le message le même
--     jour. `select * from lien_1000_controle(false)` donne la liste sans rien
--     écrire ; on l'allume une fois la liste validée (page Surveillance).
--
-- Retour arrière : `cron.unschedule('lien-1000-abonnes')`, drop des deux
-- tables et des trois fonctions, `alter table compte_nudges drop column lien`,
-- `delete from reglages where cle = 'lien_1000'`.

set lock_timeout = '10s';

-- Pas de clé étrangère vers `comptes` : la poser verrouille une table très
-- écrite (voir 0317). Un compte supprimé laisse une ligne orpheline, sans effet.
create table if not exists public.compte_profils (
  compte_id  uuid primary key,
  abonnes    integer,
  -- Le lien cliquable du profil (champ « Liens »), pas un lien écrit en bio.
  bio_lien   text,
  releve_at  timestamptz not null default now()
);

comment on table public.compte_profils is
  'Dernier profil TikTok connu de chaque compte (abonnés, lien cliquable), écrit au relevé de vues. Voir 0325.';

create table if not exists public.compte_liens_1000 (
  compte_id        uuid primary key,
  application      text not null,
  lien             text not null,
  -- Abonnés au moment du premier message (ou du constat « déjà en place »).
  abonnes          integer,
  message_at       timestamptz,
  message_nudge_id uuid,
  relance_at       timestamptz,
  relance_nudge_id uuid,
  -- Le bon lien est en place : plus rien ne part pour ce compte.
  fait_at          timestamptz,
  maj_at           timestamptz not null default now()
);

comment on table public.compte_liens_1000 is
  'Suivi du lien à 1 000 abonnés par compte : message (une fois), relance (une fois, 7 jours après), fait (bon lien en place). Voir 0325.';

-- Le lien à copier, affiché avec un bouton dans le pop-up du créateur.
alter table public.compte_nudges add column if not exists lien text;

insert into public.reglages (cle, valeur) values (
  'lien_1000',
  jsonb_build_object(
    'envoi_actif', false,
    'seuil', 1000,
    'relance_jours', 7,
    -- Un profil relevé il y a plus longtemps n'est pas jugé (compte qui ne
    -- poste plus, scrape raté) : on attend un relevé frais.
    'fraicheur_jours', 8,
    'liens', jsonb_build_object(
      'sophia', 'taap.it/sophia',
      'unswipe', 'taap.it/unswipe',
      'micabo', 'taap.it/micabo'
    ),
    -- D'autres liens tenus pour bons, par application (aucun message s'ils sont
    -- en place). `taap.it/sophia.culture` : déjà sur 32 comptes Sophia au relevé
    -- du 20/10, validé comme bon lien.
    'liens_acceptes', jsonb_build_object(
      'sophia', '["taap.it/sophia.culture"]'::jsonb, 'unswipe', '[]'::jsonb, 'micabo', '[]'::jsonb),
    'titre', '1,000 followers 🎉',
    'message', 'Congrats, @{handle} just passed 1,000 followers! Please add the following link to the link section in your TikTok settings (Edit profile → Links). Please don''t put it in your bio, as it isn''t clickable there: {lien}',
    'titre_relance', 'Reminder: your TikTok link',
    'message_relance', 'Reminder: @{handle} passed 1,000 followers, but the link isn''t on the profile yet. Please add the following link to the link section in your TikTok settings (Edit profile → Links). Please don''t put it in your bio, as it isn''t clickable there: {lien}'
  )
) on conflict (cle) do nothing;

-- L'application qu'un compte promeut le plus : la plus grosse part de
-- `parts_applications`. À égalité, Sophia, puis UnSwipe, puis micabo. Sans
-- parts (NULL = 100 % Sophia) : Sophia.
create or replace function public.application_principale(p_parts jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce((
    select e.key
      from jsonb_each_text(coalesce(p_parts, '{}'::jsonb)) e
     where e.value ~ '^[0-9]+(\.[0-9]+)?$' and e.value::numeric > 0
     order by e.value::numeric desc,
              case e.key when 'sophia' then 0 when 'unswipe' then 1 when 'micabo' then 2 else 3 end,
              e.key
     limit 1
  ), 'sophia');
$$;

-- `https://www.taap.it/Sophia/` et `taap.it/sophia` sont le même lien.
create or replace function public.normaliser_lien(p_lien text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_lien, ''))), '^(https?://)?(www\.)?', ''),
      '/+$', ''),
    '');
$$;

-- Le contrôle. `p_envoyer` : NULL = selon `reglages.lien_1000.envoi_actif`
-- (le cron), false = liste seule sans rien écrire, true = envoie.
-- Renvoie une ligne par compte concerné, avec l'action décidée :
--   message      : premier message (envoyé si envoi)
--   relance      : relance unique, 7 jours après le message
--   lien_en_place: le bon lien est là → marqué fait (si envoi)
--   fait         : déjà marqué fait
--   attente      : message envoyé il y a moins de 7 jours
--   sans_suite   : message et relance envoyés, toujours pas de lien
--   pas_de_releve: profil pas relevé récemment, rien n'est décidé
create or replace function public.lien_1000_controle(p_envoyer boolean default null)
returns table (
  compte_id   uuid,
  handle      text,
  poster      text,
  langue      text,
  abonnes     integer,
  bio_lien    text,
  application text,
  lien        text,
  action      text,
  message_at  timestamptz,
  relance_at  timestamptz,
  fait_at     timestamptz,
  releve_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      jsonb;
  v_envoyer  boolean;
  v_seuil    integer;
  v_relance  interval;
  v_fraicheur interval;
  r          record;
  v_nudge    uuid;
begin
  -- Depuis l'API : admin ou Head of Ops seulement. Le cron et les fonctions
  -- serveur n'ont pas de rôle d'utilisateur.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'lien_1000_controle : réservé à l''admin';
  end if;

  select valeur into v_cfg from public.reglages where cle = 'lien_1000';
  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_envoyer := coalesce(p_envoyer, (v_cfg->>'envoi_actif')::boolean, false);
  v_seuil := coalesce((v_cfg->>'seuil')::integer, 1000);
  -- Le cron passe chaque semaine à la même heure : 12 h de marge pour que la
  -- relance parte bien au passage suivant, pas une semaine plus tard.
  v_relance := make_interval(days => coalesce((v_cfg->>'relance_jours')::integer, 7)) - interval '12 hours';
  v_fraicheur := make_interval(days => coalesce((v_cfg->>'fraicheur_jours')::integer, 8));

  for r in
    select c.id, c.handle_tiktok, c.langue,
           trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')) as poster,
           pr.abonnes, pr.bio_lien, pr.releve_at,
           public.application_principale(c.parts_applications) as application,
           s.message_at as s_message_at, s.relance_at as s_relance_at, s.fait_at as s_fait_at
      from public.comptes c
      join public.profiles p on p.id = c.poster_id
      left join public.compte_profils pr on pr.compte_id = c.id
      left join public.compte_liens_1000 s on s.compte_id = c.id
     where c.is_active
       and c.handle_tiktok is not null
       and (pr.abonnes >= v_seuil or s.compte_id is not null)
     order by pr.abonnes desc nulls last
  loop
    compte_id := r.id;
    handle := r.handle_tiktok;
    poster := r.poster;
    langue := r.langue;
    abonnes := r.abonnes;
    bio_lien := r.bio_lien;
    application := r.application;
    lien := coalesce(v_cfg->'liens'->>r.application, v_cfg->'liens'->>'sophia', 'taap.it/sophia');
    message_at := r.s_message_at;
    relance_at := r.s_relance_at;
    fait_at := r.s_fait_at;
    releve_at := r.releve_at;

    if r.s_fait_at is not null then
      action := 'fait';
    elsif r.releve_at is null or r.releve_at < now() - v_fraicheur then
      action := 'pas_de_releve';
    elsif public.normaliser_lien(r.bio_lien) = public.normaliser_lien(lien)
       or public.normaliser_lien(r.bio_lien) in (
            select public.normaliser_lien(x)
              from jsonb_array_elements_text(coalesce(v_cfg->'liens_acceptes'->r.application, '[]'::jsonb)) x) then
      action := 'lien_en_place';
    elsif r.s_message_at is null then
      action := 'message';
    elsif r.s_relance_at is null and r.s_message_at <= now() - v_relance then
      action := 'relance';
    elsif r.s_relance_at is null then
      action := 'attente';
    else
      action := 'sans_suite';
    end if;

    if v_envoyer and action in ('message', 'relance', 'lien_en_place') then
      if action = 'lien_en_place' then
        insert into public.compte_liens_1000 as t (compte_id, application, lien, abonnes, fait_at)
        values (r.id, application, lien, r.abonnes, now())
        on conflict on constraint compte_liens_1000_pkey
          do update set fait_at = now(), maj_at = now();
        fait_at := now();
      else
        insert into public.compte_nudges (compte_id, modele_id, titre, corps, lien)
        values (
          r.id,
          case action when 'message' then 'lien_1000' else 'lien_1000_relance' end,
          coalesce(v_cfg->>(case action when 'message' then 'titre' else 'titre_relance' end), '1,000 followers'),
          replace(replace(
            coalesce(v_cfg->>(case action when 'message' then 'message' else 'message_relance' end), '{lien}'),
            '{handle}', r.handle_tiktok), '{lien}', lien),
          lien
        )
        returning id into v_nudge;

        if action = 'message' then
          insert into public.compte_liens_1000 as t (compte_id, application, lien, abonnes, message_at, message_nudge_id)
          values (r.id, application, lien, r.abonnes, now(), v_nudge)
          on conflict on constraint compte_liens_1000_pkey
            do update set message_at = now(), message_nudge_id = v_nudge,
                          application = excluded.application, lien = excluded.lien, maj_at = now();
          message_at := now();
        else
          update public.compte_liens_1000 t
             set relance_at = now(), relance_nudge_id = v_nudge, maj_at = now()
           where t.compte_id = r.id;
          relance_at := now();
        end if;
      end if;
    end if;

    return next;
  end loop;
end;
$$;

-- RLS : lecture admin et Head of Ops ; écriture par la fonction et le serveur.
alter table public.compte_profils enable row level security;
alter table public.compte_liens_1000 enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'compte_profils' and policyname = 'compte_profils lecture admin') then
    create policy "compte_profils lecture admin" on public.compte_profils
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'compte_liens_1000' and policyname = 'compte_liens_1000 lecture admin') then
    create policy "compte_liens_1000 lecture admin" on public.compte_liens_1000
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

revoke all on public.compte_profils, public.compte_liens_1000 from anon, authenticated;
grant select on public.compte_profils, public.compte_liens_1000 to authenticated;
grant all on public.compte_profils, public.compte_liens_1000 to service_role;

revoke all on function public.lien_1000_controle(boolean) from public, anon;
grant execute on function public.lien_1000_controle(boolean) to authenticated, service_role;

-- Chaque lundi à 8 h 17 UTC (10 h 17 à Paris l'été) : après le relevé de nuit,
-- avant que les posters se connectent. SQL pur, aucun secret.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lien-1000-abonnes') then
    perform cron.unschedule('lien-1000-abonnes');
  end if;
  perform cron.schedule(
    'lien-1000-abonnes',
    '17 8 * * 1',
    'select count(*) from public.lien_1000_controle()'
  );
end $$;

notify pgrst, 'reload schema';
