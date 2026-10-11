-- Migration micabo → Sophia, étape 3b/3 : IMPORT (Sophia, après 3a tranchée).
--
-- Où : base Sophia (mbikecieskoobeizixig). Une seule transaction : tout ou rien.
-- Rejouable : un créateur ou un compte déjà importé est sauté.
--
-- 1. Créateurs `creer` : login recopié de micabo (même id, même mot de passe
--    chiffré), e-mail `x@sophia.com`. Le trigger `on_auth_user_created` crée le
--    profil et le rôle poster ; on complète ensuite le profil : actif, AUCUN
--    changement de mot de passe imposé, aucun HM, onboarding déjà vu repris.
--    Créateurs `existant` : rien ne change sur leur login Sophia.
-- 2. Comptes TikTok : recopiés avec le même id, rattachés au login Sophia du
--    créateur, EN SOMMEIL (`is_active = false`) et SANS label. Un compte
--    inactif n'est ni vu (poster, admin) ni servi (assignation, drain) : rien
--    ne part tant qu'on ne les réveille pas, le jour de la bascule. Les comptes
--    vidéo AI UGC (`ugc_ai_video`) restent dans micabo-os.
--    `migration_micabo.comptes` garde, pour le réveil, l'état micabo de chacun
--    (actif ou non, labels micabo).
-- 3. Les mots de passe chiffrés et jetons quittent le dépôt : il ne reste que
--    ce qui sert à la suite.
--
-- Le texte de ce script ne contient aucun secret : les mots de passe chiffrés
-- passent du dépôt à auth.users à l'intérieur de la base.

begin;

do $import$
declare
  n int;
begin
  if not exists (select 1 from migration_micabo.depot where donnees ? 'createurs') then
    raise exception 'Dépôt absent ou déjà purgé : relancer les étapes 1 et 2.';
  end if;
  select count(*) into n from migration_micabo.correspondance where decision = 'a_confirmer';
  if n > 0 then
    raise exception '% créateur(s) encore « a_confirmer » : trancher avant d''importer.', n;
  end if;
  -- Un login à créer ne doit percuter ni un e-mail ni un id existants.
  select count(*) into n
  from migration_micabo.correspondance m
  join auth.users u on lower(u.email) = lower(m.email_sophia) or u.id = m.sophia_id
  where m.decision = 'creer' and m.importe_le is null;
  if n > 0 then
    raise exception '% login(s) à créer percutent un utilisateur Sophia existant.', n;
  end if;
  select count(*) into n
  from migration_micabo.correspondance m
  left join auth.users u on u.id = m.sophia_id
  where m.decision = 'existant' and u.id is null;
  if n > 0 then
    raise exception '% créateur(s) « existant » sans login Sophia.', n;
  end if;
end
$import$;

-- 1a. Logins.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  invited_at, confirmation_token, confirmation_sent_at, recovery_token,
  recovery_sent_at, email_change_token_new, email_change, email_change_sent_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
  created_at, updated_at, phone, phone_confirmed_at, phone_change,
  phone_change_token, phone_change_sent_at, email_change_token_current,
  email_change_confirm_status, banned_until, reauthentication_token,
  reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
)
select
  r.instance_id, m.sophia_id, r.aud, r.role, m.email_sophia, r.encrypted_password,
  coalesce(r.email_confirmed_at, now()),
  r.invited_at, '', null, '',
  null, '', '', null,
  null,
  coalesce(r.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  case when r.raw_user_meta_data ? 'email'
       then r.raw_user_meta_data || jsonb_build_object('email', m.email_sophia)
       else coalesce(r.raw_user_meta_data, '{}'::jsonb) end,
  r.is_super_admin,
  r.created_at, now(), null, null, '',
  '', null, '',
  0, r.banned_until, '',
  null, false, null, false
from migration_micabo.correspondance m
join migration_micabo.depot d on true
cross join lateral jsonb_array_elements(d.donnees -> 'createurs') c
cross join lateral jsonb_populate_record(null::auth.users, c -> 'utilisateur') r
where m.decision = 'creer'
  and m.importe_le is null
  and (c ->> 'micabo_id')::uuid = m.micabo_id
on conflict (id) do nothing;

-- 1b. Identité « email » (connexion par mot de passe).
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  m.sophia_id::text,
  m.sophia_id,
  jsonb_build_object(
    'sub', m.sophia_id::text,
    'email', m.email_sophia,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  null,
  now(),
  now()
from migration_micabo.correspondance m
where m.decision = 'creer'
  and m.importe_le is null
  and exists (select 1 from auth.users u where u.id = m.sophia_id)
  and not exists (
    select 1 from auth.identities i where i.user_id = m.sophia_id and i.provider = 'email'
  );

-- 1c. Profil (créé par le trigger) : complété depuis micabo.
update public.profiles p
set prenom = coalesce(nullif(trim(c -> 'profil' ->> 'prenom'), ''), p.prenom),
    nom = coalesce(nullif(trim(c -> 'profil' ->> 'nom'), ''), p.nom),
    langues = coalesce(
      (select array_agg(x) from jsonb_array_elements_text(c -> 'profil' -> 'langues') x),
      p.langues),
    nationalite = coalesce(c -> 'profil' ->> 'nationalite', p.nationalite),
    onboarding_vu_at = coalesce((c -> 'profil' ->> 'onboarding_vu_at')::timestamptz, p.onboarding_vu_at),
    is_active = true,
    must_change_password = false,
    manager_id = null
from migration_micabo.correspondance m
join migration_micabo.depot d on true
cross join lateral jsonb_array_elements(d.donnees -> 'createurs') c
where m.decision = 'creer'
  and m.importe_le is null
  and (c ->> 'micabo_id')::uuid = m.micabo_id
  and p.id = m.sophia_id;

-- 2. Comptes TikTok, en sommeil et sans label.
create table if not exists migration_micabo.comptes (
  compte_id uuid primary key,
  micabo_poster_id uuid not null,
  sophia_poster_id uuid not null,
  handle_tiktok text,
  langue text,
  actif_micabo boolean not null,
  labels_micabo jsonb not null default '[]'::jsonb,
  importe_le timestamptz not null default now(),
  reveille_le timestamptz
);
revoke all on table migration_micabo.comptes from public, anon, authenticated;

insert into public.comptes (
  id, poster_id, compte_reference_id, langue, persona_nom, persona_bio,
  avatar_url, avatar_source, handle_tiktok, style_profile, demarre_le,
  is_active, created_at, posts_par_jour, warmup_started_at, warmup_ends_at,
  type_compte
)
select
  (k ->> 'id')::uuid,
  m.sophia_id,
  null,
  coalesce(k ->> 'langue', 'fr'),
  k ->> 'persona_nom',
  k ->> 'persona_bio',
  k ->> 'avatar_url',
  k ->> 'avatar_source',
  k ->> 'handle_tiktok',
  k ->> 'style_profile',
  coalesce((k ->> 'demarre_le')::date, current_date),
  false,
  coalesce((k ->> 'created_at')::timestamptz, now()),
  greatest(1, least(3, coalesce((k ->> 'posts_par_jour')::int, 1))),
  (k ->> 'warmup_started_at')::timestamptz,
  (k ->> 'warmup_ends_at')::timestamptz,
  'perso'
from migration_micabo.depot d
cross join lateral jsonb_array_elements(d.donnees -> 'comptes') k
join migration_micabo.correspondance m on m.micabo_id = (k ->> 'poster_id')::uuid
where coalesce((k ->> 'ugc_ai_video')::boolean, false) = false
  and m.decision in ('creer', 'existant')
  and exists (select 1 from auth.users u where u.id = m.sophia_id)
on conflict (id) do nothing;

insert into migration_micabo.comptes (
  compte_id, micabo_poster_id, sophia_poster_id, handle_tiktok, langue, actif_micabo, labels_micabo
)
select
  (k ->> 'id')::uuid,
  m.micabo_id,
  m.sophia_id,
  k ->> 'handle_tiktok',
  k ->> 'langue',
  coalesce((k ->> 'is_active')::boolean, true),
  coalesce(k -> 'labels_micabo', '[]'::jsonb)
from migration_micabo.depot d
cross join lateral jsonb_array_elements(d.donnees -> 'comptes') k
join migration_micabo.correspondance m on m.micabo_id = (k ->> 'poster_id')::uuid
where exists (select 1 from public.comptes c where c.id = (k ->> 'id')::uuid)
on conflict (compte_id) do nothing;

update migration_micabo.correspondance m
set importe_le = now()
where m.importe_le is null
  and exists (select 1 from auth.users u where u.id = m.sophia_id);

-- 3. Les secrets quittent le dépôt.
update migration_micabo.depot
set donnees = jsonb_set(
  donnees, '{createurs}',
  coalesce((
    select jsonb_agg(c - 'utilisateur' - 'identites')
    from jsonb_array_elements(donnees -> 'createurs') c
  ), '[]'::jsonb)
);

commit;

-- Bilan.
select
  (select count(*) from migration_micabo.correspondance where importe_le is not null and decision = 'creer') as logins_crees,
  (select count(*) from migration_micabo.correspondance where importe_le is not null and decision = 'existant') as logins_existants,
  (select count(*) from migration_micabo.comptes) as comptes_importes,
  (select count(*) from public.comptes c join migration_micabo.comptes x on x.compte_id = c.id where c.is_active) as comptes_actifs_par_erreur,
  (select count(*) from public.compte_labels cl join migration_micabo.comptes x on x.compte_id = cl.compte_id) as labels_poses,
  (select count(*) from migration_micabo.depot d, jsonb_array_elements(d.donnees -> 'createurs') c where c ? 'utilisateur') as secrets_restants;
