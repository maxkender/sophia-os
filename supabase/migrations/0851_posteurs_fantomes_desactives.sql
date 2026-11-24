-- 0851 · Posteurs fantômes du 23-24/11 : désactivés (jamais supprimés).
--
-- ✅ Appliquée le 24/11/2026 (MCP).
--
-- Ce qui s'est passé : du 23/11 vers 11 h au 24/11 vers 10 h (Paris), l'étape « identité » de manage-users plantait
-- (lecture tronquée à 1 000 lignes, corrigée par #1867 et #1874) APRÈS avoir créé le login et le compte. manage-users
-- répondait 500, hub-posteurs gardait sa réservation et, passé 5 minutes, la reprenait : il recréait un posteur
-- complet à chaque essai. 32 recrues du site ont ainsi chacune de 2 à 23 profils ; seul le dernier, celui que le Hub
-- a relié (hub_posteurs.profile_id), est complet (identité, mot de passe envoyé). Les autres sont des coquilles vides :
-- 417 profils et 417 comptes, jamais connectés, sans contrat, sans Slack, sans manager, sans post, sans passage. Ils
-- faussaient la répartition des applications (comptés comme comptes actifs de leur marché) et les effectifs des labels.
--
-- On garde UN posteur par personne : celui du Hub. Les 417 coquilles sont désactivées (profil et compte), après une
-- copie dans posteurs_fantomes_1124. Le critère est strict (toutes les conditions ci-dessous) et la migration
-- s'arrête si elle ne trouve pas exactement 417 lignes. Les recrues Upwork et celles venues d'ailleurs ne sont pas
-- touchées : il faut, pour être visé, un homonyme exact relié au Hub ET créé après soi.
--
-- Retour arrière :
--   update public.comptes  set is_active = true where id in (select compte_id  from public.posteurs_fantomes_1124);
--   update public.profiles set is_active = true where id in (select profile_id from public.posteurs_fantomes_1124);

create table if not exists public.posteurs_fantomes_1124 (
  profile_id uuid primary key,
  compte_id uuid not null unique,
  vrai_profile_id uuid not null,
  email text,
  cree_at timestamptz not null,
  desactive_at timestamptz not null default now()
);
alter table public.posteurs_fantomes_1124 enable row level security;
revoke all on public.posteurs_fantomes_1124 from anon, authenticated;
comment on table public.posteurs_fantomes_1124 is
  '0851 : les 417 profils/comptes en double créés par la boucle hub-posteurs du 23-24/11, désactivés. vrai_profile_id = le posteur gardé (relié au Hub).';

with nomn as (
  select p.*, lower(trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, ''))) as nom_n
  from public.profiles p
),
vrais as (
  -- Le posteur gardé : relié au Hub, actif, avec un compte actif qui a son identité.
  select n.nom_n, n.id as vrai_id, h.cree_at as hub_cree_at
  from public.hub_posteurs h
  join nomn n on n.id = h.profile_id
  where h.statut = 'cree' and n.is_active
    and exists (select 1 from public.comptes c where c.poster_id = n.id and c.is_active and coalesce(c.persona_nom, '') <> '')
)
insert into public.posteurs_fantomes_1124 (profile_id, compte_id, vrai_profile_id, email, cree_at)
select n.id, c.id, v.vrai_id, n.email, n.created_at
from nomn n
join public.comptes c on c.poster_id = n.id
join vrais v on v.nom_n = n.nom_n and v.vrai_id <> n.id
left join auth.users u on u.id = n.id
where n.created_at between '2026-11-23 10:00:00+00' and '2026-11-24 09:00:00+00'
  and n.created_at < v.hub_cree_at                     -- créé avant le vrai, pendant la boucle
  and n.is_active and c.is_active
  -- jamais relié à rien
  and not exists (select 1 from public.hub_posteurs h where h.profile_id = n.id or h.compte_id = c.id)
  and n.upwork_contract_id is null and n.upwork_contrat_url is null
  and n.manager_id is null and n.slack_user_id is null and n.email_perso is null
  and n.premiere_connexion_at is null and n.offre_acceptee_le is null
  and n.ruul_statut is null and n.ruul_email is null and n.site_application_id is null
  and u.last_sign_in_at is null
  and not exists (select 1 from public.slack_membres m where m.email is not null and lower(m.email) = lower(n.email))
  -- un seul compte, vide
  and (select count(*) from public.comptes c2 where c2.poster_id = n.id) = 1
  and coalesce(c.persona_nom, '') = '' and coalesce(c.handle_tiktok, '') = '' and c.avatar_url is null
  and c.warmup_started_at is null
  -- aucune activité
  and not exists (select 1 from public.posts x where x.compte_id = c.id)
  and not exists (select 1 from public.passages x where x.compte_id = c.id)
  and not exists (select 1 from public.accueils x where x.poster_id = n.id)
  and not exists (select 1 from public.posteur_messages x where x.poster_id = n.id)
  and not exists (select 1 from public.recrue_evenements x where x.poster_id = n.id or x.compte_id = c.id)
  and not exists (select 1 from public.arrets x where x.poster_id = n.id)
  and not exists (select 1 from public.slack_retraits x where x.poster_id = n.id)
on conflict (profile_id) do nothing;

do $$
declare
  v_n int;
  v_vrais int;
begin
  select count(*), count(distinct vrai_profile_id) into v_n, v_vrais from public.posteurs_fantomes_1124;
  if v_n <> 417 or v_vrais <> 32 then
    raise exception '0851 : % fantômes pour % personnes trouvés, 417 pour 32 attendus : rien n''est désactivé', v_n, v_vrais;
  end if;

  update public.comptes c set is_active = false
   where c.id in (select compte_id from public.posteurs_fantomes_1124) and c.is_active;
  get diagnostics v_n = row_count;
  if v_n <> 417 then raise exception '0851 : % comptes désactivés au lieu de 417', v_n; end if;

  update public.profiles p set is_active = false
   where p.id in (select profile_id from public.posteurs_fantomes_1124) and p.is_active;
  get diagnostics v_n = row_count;
  if v_n <> 417 then raise exception '0851 : % profils désactivés au lieu de 417', v_n; end if;

  -- Aucun retrait Slack ne doit partir (ils ne sont pas sur Slack).
  if exists (select 1 from public.slack_retraits s where s.poster_id in (select profile_id from public.posteurs_fantomes_1124)) then
    raise exception '0851 : un retrait Slack aurait été programmé pour un fantôme';
  end if;

  -- Les 32 posteurs gardés restent actifs.
  if exists (select 1 from public.profiles p where p.id in (select vrai_profile_id from public.posteurs_fantomes_1124) and not p.is_active) then
    raise exception '0851 : un posteur gardé serait inactif';
  end if;
end $$;
