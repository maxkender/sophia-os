-- 0432 — Messages automatiques : garde-fous avant de rallumer quoi que ce soit.
--
-- 1. Étape 2 (compte TikTok) : si Start warmup est cliqué et que le @ est
--    introuvable, on ne dit jamais « create your account » : on demande
--    « Is your account exactly @{handle}? » (etape_texte_tiktok_verifier), sans Kill.
-- 2. Étape 1 (connexion) : « your login is in our first message » seulement si
--    l'OS a lui-même envoyé la bienvenue ; sinon les identifiants dans le
--    message (etape_texte_connexion_identifiants : {email}, {mot_de_passe}).
-- 3. Jeudi : seulement sous 6 posts avec lien, compté par compte, jusqu'à
--    aujourd'hui inclus (`semaine_posts_comptes`) ; la liste est validée par
--    l'admin avant tout envoi (relances_prevues « a_valider »).
-- 4. Un seul message par personne : deux profils sur le même contrat ou le même
--    Slack ne reçoivent qu'un message (`nudges_servis`) ; `messages_doublons()`
--    les liste.
-- 5. Pas de rattrapage : quand un interrupteur passe sur « on », ce qui était
--    dû avant reste « en attente » (relances_prevues, raison en_attente) ;
--    « Send » (valide_at) les envoie peu à peu (envoi_attente_par_passage).
--
-- Additive : 2 colonnes, 5 fonctions, 3 réglages. Aucune donnée existante modifiée.

alter table public.relances_prevues add column if not exists valide_at timestamptz;
alter table public.relances_prevues add column if not exists valide_par uuid;

comment on column public.relances_prevues.valide_at is
  'Prompt 21 (0432) : l''admin a validé l''envoi (message en attente ou liste du jeudi) ; il part peu à peu.';

insert into public.reglages (cle, valeur) values
  ('etape_texte_tiktok_verifier', to_jsonb(
    'Hi {prenom}, we can''t find your TikTok account @{handle}. Is your account exactly @{handle}? If not, reply here with your exact @ so we can fix it.'::text)),
  ('etape_texte_connexion_identifiants', to_jsonb(
    'Hi {prenom}, you haven''t logged in yet. Dashboard: {url}. Your login: {email}, password: {mot_de_passe} (you can change it after logging in). Please log in today. If we don''t hear from you within 48 hours, we''ll close the contract.'::text)),
  ('envoi_attente_par_passage', to_jsonb(20))
on conflict (cle) do nothing;

-- Les posts avec lien de la semaine, compte par compte (comptes perso actifs,
-- posteurs qui postent cette semaine), du lundi jusqu'à p_jusqu inclus.
create or replace function public.semaine_posts_comptes(p_lundi date, p_jusqu date)
returns table (poster_id uuid, compte_id uuid, handle text, posts_lien integer, prevus integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select c.poster_id, c.id, c.handle_tiktok,
         (count(p.id) filter (where p.publie_url is not null and p.date_publication_prevue between p_lundi and p_jusqu))::int,
         count(p.id)::int
    from public.comptes c
    join public.profiles pr on pr.id = c.poster_id and pr.is_active
    join public.passages p on p.compte_id = c.id
   where c.type_compte = 'perso' and c.is_active
     and p.date_publication_prevue between p_lundi and p_lundi + 6
     and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)
     and exists (select 1 from public.user_roles r where r.user_id = c.poster_id and r.role = 'poster')
     and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
   group by c.poster_id, c.id, c.handle_tiktok;
end;
$$;
revoke all on function public.semaine_posts_comptes(date, date) from public, anon;
grant execute on function public.semaine_posts_comptes(date, date) to authenticated, service_role;

-- Ce qui est déjà parti, par Slack et par contrat : un 2e profil sur le même
-- contrat ou le même Slack ne reçoit pas le même message (même type, même période).
create or replace function public.nudges_servis(p_depuis timestamptz)
returns table (type text, periode date, slack_user_id text, contrat_id text)
language sql
stable
security definer
set search_path = public
as $$
  select n.type, n.periode, pr.slack_user_id, pr.upwork_contract_id
    from public.nudges n
    join public.profiles pr on pr.id = n.poster_id
   where n.envoye_at >= p_depuis and n.periode is not null
     and (n.slack_erreur is null or coalesce(array_length(n.canaux, 1), 0) > 0);
$$;
revoke all on function public.nudges_servis(timestamptz) from public, anon, authenticated;
grant execute on function public.nudges_servis(timestamptz) to service_role;

-- Les profils actifs qui partagent un contrat Upwork ou un compte Slack.
create or replace function public.messages_doublons()
returns table (par text, cle text, profils jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with po as (
    select p.id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') as nom, p.email, p.upwork_contract_id as c,
           p.slack_user_id as s, p.cohorte_lundi
      from public.profiles p
     where p.is_active
       and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = p.id)
  )
  select 'contrat'::text, po.c,
         jsonb_agg(jsonb_build_object('id', po.id, 'nom', po.nom, 'email', po.email, 'cohorte', po.cohorte_lundi) order by po.cohorte_lundi)
    from po where po.c is not null group by po.c having count(*) > 1
  union all
  select 'slack'::text, po.s,
         jsonb_agg(jsonb_build_object('id', po.id, 'nom', po.nom, 'email', po.email, 'cohorte', po.cohorte_lundi) order by po.cohorte_lundi)
    from po where po.s is not null group by po.s having count(*) > 1;
end;
$$;
revoke all on function public.messages_doublons() from public, anon;
grant execute on function public.messages_doublons() to authenticated;

-- Depuis quand l'interrupteur est sur « on » (dernier passage noté dans le
-- journal). null : pas sur « on », ou allumé avant le journal.
create or replace function public.interrupteur_on_depuis(p_cle text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case when (select r.valeur #>> '{}' from public.reglages r where r.cle = p_cle) = 'on'
              then (select max(j.at) from public.reglages_journal j
                     where j.cle = p_cle and j.nouvelle = to_jsonb('on'::text))
         end;
$$;
revoke all on function public.interrupteur_on_depuis(text) from public, anon;
grant execute on function public.interrupteur_on_depuis(text) to authenticated, service_role;

-- « Send » : les messages en attente (ou la liste du jeudi) partent, peu à peu.
create or replace function public.messages_attente_valider(p_types text[], p_poster uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin_strict() then
    raise exception 'messages_attente_valider : réservé à l''admin';
  end if;
  update public.relances_prevues
     set valide_at = now(), valide_par = auth.uid(), maj_at = now()
   where statut = 'prevu' and raison in ('en_attente', 'a_valider') and valide_at is null
     and type = any(p_types)
     and (p_poster is null or poster_id = p_poster);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.messages_attente_valider(text[], uuid) from public, anon;
grant execute on function public.messages_attente_valider(text[], uuid) to authenticated;

notify pgrst, 'reload schema';
