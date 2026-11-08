-- 0561 : parrainage par email (8/11).
--
-- Le posteur ajoute un ami (email, prénom, pays, accord de l'ami) depuis son
-- dashboard ; Sophia lui écrit depuis sophia-culture.com, dans la langue de son
-- pays : J0, J+2, J+5 (3 emails au plus), arrêt dès qu'il postule, se
-- désinscrit ou si l'email rebondit. Pays « off » : liste d'attente (envoyé
-- s'il repasse « on » dans les 30 jours). L'ami qui signe est relié à son
-- parrain (email ou code ?ref=) : le bonus de 10 $ suit le circuit de 0553.
--
-- Rien ne part tant que le réglage parrainage_email_actif est off (et le bloc
-- n'apparaît pas chez les posteurs).
-- Additif : tables, fonctions, réglage, réponse officielle, règle des bots.

insert into public.reglages (cle, valeur) values ('parrainage_email_actif', 'false'::jsonb)
on conflict (cle) do nothing;

-- Les pays : envoi automatique + recrutement ouvert (on par défaut là où on recrute).
create table if not exists public.parrainage_pays (
  pays               text primary key,
  envoi_auto         boolean not null default false,
  recrutement_ouvert boolean not null default false,
  maj_at             timestamptz not null default now(),
  maj_par            uuid
);
alter table public.parrainage_pays enable row level security;
revoke all on public.parrainage_pays from anon, authenticated;
insert into public.parrainage_pays (pays, envoi_auto, recrutement_ouvert)
select z.pays, o.on_, o.on_
  from (select distinct upper(pays) pays from public.zones_paie_pays where retire_at is null union select 'PT') z
  cross join lateral (select exists (select 1 from public.pays_objectifs po where upper(po.pays) = z.pays) and z.pays <> 'PT' as on_) o
on conflict (pays) do nothing;

-- Le code de parrainage du posteur (?ref=).
create table if not exists public.parrainage_codes (
  poster_id uuid primary key,
  code      text not null unique,
  cree_at   timestamptz not null default now()
);
alter table public.parrainage_codes enable row level security;
revoke all on public.parrainage_codes from anon, authenticated;

create or replace function public.parrainage_code(p_poster uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_base text;
begin
  select code into v_code from public.parrainage_codes where poster_id = p_poster;
  if v_code is not null then return v_code; end if;
  select upper(left(regexp_replace(coalesce(extensions.unaccent(prenom), 'SOPHIA'), '[^A-Za-z]', '', 'g'), 6)) into v_base
    from public.profiles where id = p_poster;
  v_base := coalesce(nullif(v_base, ''), 'SOPHIA');
  loop
    v_code := v_base || (100 + floor(random() * 900))::int;
    begin
      insert into public.parrainage_codes (poster_id, code) values (p_poster, v_code);
      return v_code;
    exception when unique_violation then
      if exists (select 1 from public.parrainage_codes where poster_id = p_poster) then
        return (select code from public.parrainage_codes where poster_id = p_poster);
      end if;
    end;
  end loop;
end;
$$;
revoke execute on function public.parrainage_code(uuid) from public, anon, authenticated;

-- Les invitations (une par ami ; reliée à la déclaration creator_referrals pour le bonus).
create table if not exists public.parrainage_invitations (
  id             uuid primary key default gen_random_uuid(),
  referral_id    uuid,
  parrain_id     uuid not null,
  email          text not null,
  prenom         text not null,
  pays           text not null,
  langue         text,
  code           text not null,
  statut         text not null check (statut in ('attente', 'a_envoyer', 'en_cours', 'termine', 'postule', 'desinscrit', 'rebond', 'expire', 'erreur')),
  envois         integer not null default 0 check (envois between 0 and 3),
  prochain_at    timestamptz,
  dernier_envoi_at timestamptz,
  token          uuid not null default gen_random_uuid() unique,
  ouvert_at      timestamptz,
  clique_at      timestamptz,
  postule_at     timestamptz,
  recrue_id      uuid,
  erreur         text,
  cree_at        timestamptz not null default now()
);
create index if not exists parrainage_invitations_email on public.parrainage_invitations (email);
create index if not exists parrainage_invitations_parrain on public.parrainage_invitations (parrain_id, cree_at);
create index if not exists parrainage_invitations_a_envoyer on public.parrainage_invitations (prochain_at) where statut in ('a_envoyer', 'en_cours');
alter table public.parrainage_invitations enable row level security;
revoke all on public.parrainage_invitations from anon, authenticated;

create table if not exists public.parrainage_desinscrits (
  email text primary key,
  at    timestamptz not null default now()
);
alter table public.parrainage_desinscrits enable row level security;
revoke all on public.parrainage_desinscrits from anon, authenticated;

create table if not exists public.parrainage_envois (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  etape         integer not null,
  at            timestamptz not null default now(),
  ok            boolean not null,
  message_id    text,
  erreur        text
);
create index if not exists parrainage_envois_invitation on public.parrainage_envois (invitation_id);
alter table public.parrainage_envois enable row level security;
revoke all on public.parrainage_envois from anon, authenticated;

-- Le statut d'un ami, vu par le parrain.
create or replace function public.parrainage_statut_filleul(i public.parrainage_invitations)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.bonus b where b.referral_id = i.referral_id and b.statut = 'paye') then 'bonus_paye'
    when i.recrue_id is not null and exists (select 1 from public.profiles p where p.id = i.recrue_id and p.is_active)
         and exists (select 1 from public.passages ps join public.comptes c on c.id = ps.compte_id
                      where c.poster_id = i.recrue_id and ps.publie_url is not null) then 'actif'
    when i.statut = 'postule' or i.recrue_id is not null then 'postule'
    when i.statut = 'attente' then 'attente'
    when i.statut in ('desinscrit', 'rebond', 'expire', 'erreur') then 'arrete'
    else 'envoye' end;
$$;
revoke execute on function public.parrainage_statut_filleul(public.parrainage_invitations) from public, anon, authenticated;

-- Le dashboard du posteur : son code, ses amis, les pays, le compteur du mois.
create or replace function public.mon_parrainage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi uuid := auth.uid();
begin
  if v_moi is null then raise exception 'mon_parrainage : connexion requise' using errcode = '42501'; end if;
  return jsonb_build_object(
    'actif', coalesce((select (valeur #>> '{}')::boolean from public.reglages where cle = 'parrainage_email_actif'), false),
    'ce_mois', (select count(*) from public.parrainage_invitations i
                 where i.parrain_id = v_moi and i.cree_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'),
    'pays', coalesce((select jsonb_agg(jsonb_build_object('code', pp.pays, 'ouvert', pp.envoi_auto and pp.recrutement_ouvert) order by pp.pays)
                        from public.parrainage_pays pp), '[]'::jsonb),
    'filleuls', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'prenom', i.prenom, 'pays', i.pays,
                                                              'statut', public.parrainage_statut_filleul(i), 'cree_at', i.cree_at)
                                           order by i.cree_at desc)
                            from public.parrainage_invitations i where i.parrain_id = v_moi), '[]'::jsonb));
end;
$$;
revoke execute on function public.mon_parrainage() from public, anon;
grant execute on function public.mon_parrainage() to authenticated;

-- Ajouter un ami : accord obligatoire, 10 par mois, jamais un email désinscrit ou déjà invité.
create or replace function public.parrainage_inviter(p_email text, p_prenom text, p_pays text, p_accord boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moi uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_prenom text := btrim(coalesce(p_prenom, ''));
  v_pays text := upper(btrim(coalesce(p_pays, '')));
  v_ouvert boolean;
  v_ref uuid;
  v_id uuid;
begin
  if v_moi is null or not exists (select 1 from public.user_roles ur where ur.user_id = v_moi and ur.role = 'poster') then
    raise exception 'Only posters can refer a friend.' using errcode = '42501';
  end if;
  if not coalesce((select (valeur #>> '{}')::boolean from public.reglages where cle = 'parrainage_email_actif'), false) then
    raise exception 'Referrals are not open yet.';
  end if;
  if not coalesce(p_accord, false) then raise exception 'Please confirm your friend agreed to receive an email from Sophia.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Please enter a valid email address.'; end if;
  if length(v_prenom) < 1 or length(v_prenom) > 60 then raise exception 'Please enter your friend''s first name.'; end if;
  select pp.envoi_auto and pp.recrutement_ouvert into v_ouvert from public.parrainage_pays pp where pp.pays = v_pays;
  if v_ouvert is null then raise exception 'Please choose your friend''s country.'; end if;
  if (select count(*) from public.parrainage_invitations i
       where i.parrain_id = v_moi and i.cree_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') >= 10 then
    raise exception 'You''ve reached 10 friends this month. You can add more next month.';
  end if;
  if exists (select 1 from public.parrainage_desinscrits d where d.email = v_email) then
    raise exception 'This person asked not to receive emails from Sophia.';
  end if;
  if exists (select 1 from public.parrainage_invitations i where i.email = v_email) then
    raise exception 'This friend has already been invited.';
  end if;
  if exists (select 1 from public.profiles p where lower(p.email_perso) = v_email or lower(p.email) = v_email) then
    raise exception 'This person already works with Sophia.';
  end if;

  insert into public.creator_referrals (referrer_id, prenom, pays, contact_email, confirme_present, confirme_fiable, confirme_majeur, statut, note_admin)
  values (v_moi, v_prenom, v_pays, v_email, true, false, false, 'en_attente', 'parrainage par email (0561)')
  returning id into v_ref;

  insert into public.parrainage_invitations (referral_id, parrain_id, email, prenom, pays, code, statut, prochain_at)
  values (v_ref, v_moi, v_email, v_prenom, v_pays, public.parrainage_code(v_moi),
          case when v_ouvert then 'a_envoyer' else 'attente' end, case when v_ouvert then now() end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'attente', not v_ouvert);
end;
$$;
revoke execute on function public.parrainage_inviter(text, text, text, boolean) from public, anon;
grant execute on function public.parrainage_inviter(text, text, text, boolean) to authenticated;

-- Settings : le tableau des pays (admin).
create or replace function public.parrainage_pays_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'parrainage_pays_liste : réservé à l''admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'pays', pp.pays, 'envoi_auto', pp.envoi_auto, 'recrutement_ouvert', pp.recrutement_ouvert,
             'zone', z.zone, 'tarif', zp.tarif,
             'attente', (select count(*) from public.parrainage_invitations i where i.pays = pp.pays and i.statut = 'attente'))
           order by (pp.envoi_auto and pp.recrutement_ouvert) desc, pp.pays)
      from public.parrainage_pays pp
      left join public.zones_paie_pays z on upper(z.pays) = pp.pays and z.retire_at is null
      left join public.zones_paie zp on zp.zone = z.zone), '[]'::jsonb);
end;
$$;
revoke execute on function public.parrainage_pays_liste() from public, anon;
grant execute on function public.parrainage_pays_liste() to authenticated;

create or replace function public.parrainage_pays_changer(p_pays text, p_champ text, p_valeur boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'parrainage_pays_changer : réservé à l''admin' using errcode = '42501'; end if;
  if p_champ not in ('envoi_auto', 'recrutement_ouvert') then raise exception 'champ inconnu'; end if;
  if p_champ = 'envoi_auto' then
    update public.parrainage_pays set envoi_auto = p_valeur, maj_at = now(), maj_par = auth.uid() where pays = upper(p_pays);
  else
    update public.parrainage_pays set recrutement_ouvert = p_valeur, maj_at = now(), maj_par = auth.uid() where pays = upper(p_pays);
  end if;
  -- Le pays repasse « on » : sa liste d'attente (30 jours) part.
  update public.parrainage_invitations i set statut = 'a_envoyer', prochain_at = now()
   where i.pays = upper(p_pays) and i.statut = 'attente' and i.cree_at > now() - interval '30 days'
     and exists (select 1 from public.parrainage_pays pp where pp.pays = i.pays and pp.envoi_auto and pp.recrutement_ouvert);
end;
$$;
revoke execute on function public.parrainage_pays_changer(text, text, boolean) from public, anon;
grant execute on function public.parrainage_pays_changer(text, text, boolean) to authenticated;

-- La fonction parrainage : les emails dus (J0, J+2, J+5), avec ce qu'il faut pour les écrire.
create or replace function public.parrainage_a_envoyer(p_limite integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_a_envoyer : réservé à la fonction parrainage'; end if;
  -- Liste d'attente de plus de 30 jours : expirée.
  update public.parrainage_invitations set statut = 'expire' where statut = 'attente' and cree_at <= now() - interval '30 days';
  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', i.id, 'email', i.email, 'prenom', i.prenom, 'pays', i.pays, 'code', i.code, 'token', i.token,
               'envois', i.envois,
               'referrer', coalesce(nullif(btrim(pr.prenom), ''), 'A friend'),
               'tarif', zp.tarif) as x
        from public.parrainage_invitations i
        join public.parrainage_pays pp on pp.pays = i.pays and pp.envoi_auto and pp.recrutement_ouvert
        left join public.profiles pr on pr.id = i.parrain_id
        left join public.zones_paie_pays z on upper(z.pays) = i.pays and z.retire_at is null
        left join public.zones_paie zp on zp.zone = z.zone
       where i.statut in ('a_envoyer', 'en_cours') and i.prochain_at <= now() and i.envois < 3
         and i.recrue_id is null
         and not exists (select 1 from public.parrainage_desinscrits d where d.email = i.email)
       order by i.prochain_at
       limit greatest(1, least(p_limite, 200))) t), '[]'::jsonb);
end;
$$;
revoke execute on function public.parrainage_a_envoyer(integer) from public, anon, authenticated;

create or replace function public.parrainage_envoi_noter(p_id uuid, p_etape integer, p_ok boolean, p_message_id text, p_erreur text, p_rebond boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.parrainage_invitations;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_envoi_noter : réservé à la fonction parrainage'; end if;
  select * into i from public.parrainage_invitations where id = p_id for update;
  if not found then return; end if;
  insert into public.parrainage_envois (invitation_id, etape, ok, message_id, erreur) values (p_id, p_etape, p_ok, p_message_id, left(p_erreur, 500));
  if p_rebond then
    update public.parrainage_invitations set statut = 'rebond', erreur = left(p_erreur, 500), prochain_at = null where id = p_id;
  elsif p_ok then
    update public.parrainage_invitations
       set envois = i.envois + 1, dernier_envoi_at = now(), erreur = null,
           statut = case when i.envois + 1 >= 3 then 'termine' else 'en_cours' end,
           prochain_at = case i.envois + 1 when 1 then now() + interval '2 days' when 2 then i.cree_at + interval '5 days' end
     where id = p_id;
  else
    -- Un échec d'envoi : un seul nouvel essai une heure après, puis « erreur ».
    update public.parrainage_invitations
       set erreur = left(p_erreur, 500),
           statut = case when (select count(*) from public.parrainage_envois e where e.invitation_id = p_id and not e.ok and e.etape = p_etape) >= 2 then 'erreur' else i.statut end,
           prochain_at = now() + interval '1 hour'
     where id = p_id;
  end if;
end;
$$;
revoke execute on function public.parrainage_envoi_noter(uuid, integer, boolean, text, text, boolean) from public, anon, authenticated;

-- Désinscription (lien de l'email) : plus jamais rien à cet email.
create or replace function public.parrainage_desinscrire(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_desinscrire : réservé à la fonction parrainage'; end if;
  select email into v_email from public.parrainage_invitations where token = p_token;
  if v_email is null then return false; end if;
  insert into public.parrainage_desinscrits (email) values (v_email) on conflict (email) do nothing;
  update public.parrainage_invitations set statut = 'desinscrit', prochain_at = null
   where email = v_email and statut in ('attente', 'a_envoyer', 'en_cours', 'termine');
  return true;
end;
$$;
revoke execute on function public.parrainage_desinscrire(uuid) from public, anon, authenticated;

-- Ouvert / cliqué / rebond (retours du service d'envoi, par l'id du message).
create or replace function public.parrainage_evenement(p_message_id text, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_evenement : réservé à la fonction parrainage'; end if;
  select invitation_id into v_id from public.parrainage_envois where message_id = p_message_id order by at desc limit 1;
  if v_id is null then return; end if;
  if p_type = 'ouvert' then update public.parrainage_invitations set ouvert_at = coalesce(ouvert_at, now()) where id = v_id;
  elsif p_type = 'clique' then update public.parrainage_invitations set clique_at = coalesce(clique_at, now()), ouvert_at = coalesce(ouvert_at, now()) where id = v_id;
  elsif p_type = 'rebond' then update public.parrainage_invitations set statut = 'rebond', prochain_at = null where id = v_id and statut not in ('postule');
  end if;
end;
$$;
revoke execute on function public.parrainage_evenement(text, text) from public, anon, authenticated;

-- Le filleul postule (site) ou signe (hub-posteurs) : par l'email, sinon par le code ?ref=.
-- Les relances s'arrêtent ; à la signature, il est relié à son parrain (bonus de 0553).
create or replace function public.parrainage_rapprocher(p_email text, p_ref text, p_recrue uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.parrainage_invitations;
  v_parrain uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_rapprocher : réservé aux fonctions'; end if;
  select * into i from public.parrainage_invitations
   where email = lower(btrim(coalesce(p_email, ''))) order by cree_at desc limit 1;
  if not found and nullif(btrim(coalesce(p_ref, '')), '') is not null then
    select c.poster_id into v_parrain from public.parrainage_codes c where c.code = upper(btrim(p_ref));
  end if;
  if i.id is null and v_parrain is null then return jsonb_build_object('relie', false); end if;

  if i.id is null then
    -- Le code seul (l'ami a postulé avec un autre email) : une invitation est notée pour le suivi.
    insert into public.parrainage_invitations (parrain_id, email, prenom, pays, code, statut, postule_at)
    select v_parrain, lower(btrim(coalesce(p_email, 'inconnu'))), coalesce((select prenom from public.profiles where id = p_recrue), '?'),
           coalesce((select upper(pays) from public.comptes where poster_id = p_recrue order by created_at limit 1), '?'),
           upper(btrim(p_ref)), 'postule', now()
    returning * into i;
  else
    update public.parrainage_invitations
       set statut = case when statut in ('desinscrit', 'rebond') then statut else 'postule' end,
           postule_at = coalesce(postule_at, now()), prochain_at = null
     where id = i.id returning * into i;
  end if;

  if p_recrue is not null and i.recrue_id is null then
    update public.parrainage_invitations set recrue_id = p_recrue where id = i.id;
    perform public.parrainage_relier(i.referral_id, i.parrain_id, p_recrue, 'parrainage par email (' || i.code || ')');
  end if;
  return jsonb_build_object('relie', true, 'parrain_id', i.parrain_id, 'invitation_id', i.id);
end;
$$;
revoke execute on function public.parrainage_rapprocher(text, text, uuid) from public, anon, authenticated;

-- Le suivi (page Parrainage) : par pays et par semaine, et le top des parrains.
create or replace function public.parrainage_suivi(p_depuis date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis date := coalesce(p_depuis, (now() at time zone 'Europe/Paris')::date - 56);
begin
  if not public.is_admin() then raise exception 'parrainage_suivi : réservé à l''admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pays', t.pays, 'semaine', t.semaine, 'invites', t.invites, 'emails', t.emails, 'ouverts', t.ouverts, 'cliques', t.cliques,
               'candidatures', t.candidatures, 'actifs', t.actifs, 'bonus_payes', t.bonus, 'cout', t.cout,
               'cout_par_recrue', case when t.actifs > 0 then round(t.cout / t.actifs, 2) end)
             order by t.semaine desc, t.invites desc)
        from (
          select i.pays, date_trunc('week', i.cree_at at time zone 'Europe/Paris')::date semaine,
                 count(*) invites,
                 coalesce(sum(i.envois), 0) emails,
                 count(i.ouvert_at) ouverts, count(i.clique_at) cliques,
                 count(*) filter (where i.postule_at is not null or i.recrue_id is not null) candidatures,
                 count(*) filter (where public.parrainage_statut_filleul(i) in ('actif', 'bonus_paye')) actifs,
                 count(*) filter (where public.parrainage_statut_filleul(i) = 'bonus_paye') bonus,
                 coalesce(sum(coalesce(bp.montant, 0)), 0) cout
            from public.parrainage_invitations i
            left join lateral (select sum(b.montant) montant from public.bonus b where b.referral_id = i.referral_id and b.statut = 'paye') bp on true
           where i.cree_at >= v_depuis
           group by 1, 2) t), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(x order by (x->>'actifs')::int desc, (x->>'invites')::int desc)
        from (select jsonb_build_object('parrain', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), '?'),
                                        'invites', count(*),
                                        'actifs', count(*) filter (where public.parrainage_statut_filleul(i) in ('actif', 'bonus_paye'))) x
                from public.parrainage_invitations i left join public.profiles pr on pr.id = i.parrain_id
               where i.cree_at >= v_depuis
               group by pr.prenom, pr.nom, i.parrain_id
               order by count(*) desc limit 20) z), '[]'::jsonb));
end;
$$;
revoke execute on function public.parrainage_suivi(date) from public, anon;
grant execute on function public.parrainage_suivi(date) to authenticated;

-- La détection par nom de 0553 ignore ces amis (prénom seul) : ils sont reliés par l'email ou le code.
do $p$
declare
  d text := pg_get_functiondef('public.parrainages_detecter()'::regprocedure);
  avant text := 'where fr.statut = ''en_attente'' and fr.recrue_id is null';
begin
  if position('0561' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0561 : parrainages_detecter, filtre introuvable'; end if;
  d := replace(d, avant, avant || ' and coalesce(fr.note_admin, '''') not like ''parrainage par email%'' /* 0561 */');
  execute d;
end
$p$;

-- 7. La réponse officielle et la règle des bots.
insert into public.reponses_officielles (question, reponse, ordre, actif, valide_at)
select 'How does referral work?',
       'Open your dashboard and use "Refer a friend": enter your friend''s email, first name and country. Tell your friend first: they''ll receive an email from Sophia (ask them to check the spam folder too). You get a $10 bonus when your friend has been active for 2 weeks with at least 12 posts with a link each week. Up to 10 friends per month.',
       25, true, now()
 where not exists (select 1 from public.reponses_officielles where question = 'How does referral work?');

insert into public.regles_bots (bot, regle, exemple, active)
select 'tous',
       'Parrainage : renvoie toujours à la réponse officielle « How does referral work? » (bloc Refer a friend du dashboard, l''ami est prévenu qu''il recevra un email de Sophia, 10 $ quand l''ami a fait 2 semaines actives à 12 posts avec lien, 10 amis par mois). Ne promets rien d''autre (pas d''autre montant, pas de délai, pas d''exception).',
       'How can I refer my friend? → réponse officielle « How does referral work? »', true
 where not exists (select 1 from public.regles_bots where regle like 'Parrainage : renvoie toujours à la réponse officielle%');

-- Les envois : toutes les 10 minutes (la fonction ne fait rien tant que parrainage_email_actif est off).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'parrainage-emails') then
    perform cron.schedule('parrainage-emails', '*/10 * * * *', $q$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/parrainage',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := jsonb_build_object('action', 'envoyer'),
        timeout_milliseconds := 120000);
    $q$);
  end if;
end
$c$;
