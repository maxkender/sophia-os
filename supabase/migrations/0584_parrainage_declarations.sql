-- 0584 : parrainage, personne ne reste sans invitation (demande de Max, 10/11).
--
-- 1. Une déclaration « Refer a friend » avec un email (même venue d'un ancien
--    formulaire resté ouvert dans un navigateur) reçoit son invitation tout de
--    suite (déclencheur) et au plus tard dans les 10 min (tâche), si : pas déjà
--    invitée, pas désinscrite, pas déjà candidate, ne travaille pas déjà avec
--    nous, pas déjà acceptée, pays ouvert. Pays fermé (Portugal) : rien tant qu'il est fermé, puis
--    l'invitation part à la réouverture. Pays inconnu (une langue « en »,
--    « es-419 », « ar »… à la place d'un pays) : l'email part en anglais, au
--    tarif de la zone C (pays « ?? »).
-- 2. L'email de l'ami est obligatoire pour un posteur (même par un ancien
--    formulaire).
-- 3. Sans email : un message au parrain (Slack, sinon Upwork) demande l'email
--    (parrainage_demandes_email, envoi par la fonction parrainage, au clic) ;
--    l'email trouvé dans sa réponse est enregistré et l'invitation part.
-- Additif : tables, fonctions, déclencheurs, une tâche ; parrainage_a_envoyer
-- remplacée (même résultat, plus le pays « ?? »). Aucune ligne supprimée.

/* Le pays d'une déclaration : sa langue quand elle désigne un seul pays, sinon « ?? ». */
create or replace function public.parrainage_pays_de_langue(p_langue text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select m.p from (values
      ('es','ES'),('it','IT'),('de','DE'),('fr','FR'),('pl','PL'),('ro','RO'),('hu','HU'),('cs','CZ'),('sk','SK'),
      ('bg','BG'),('el','GR'),('hr','HR'),('sl','SI'),('sr','RS'),('sv','SE'),('no','NO'),('da','DK'),('fi','FI'),
      ('et','EE'),('lv','LV'),('lt','LT'),('tr','TR'),('he','IL'),('ja','JP'),('nl','NL'),('pt-br','BR'),('pt','PT')
    ) m(l, p) where m.l = lower(btrim(coalesce(p_langue, '')))),
    (select pp.pays from public.parrainage_pays pp where pp.pays = upper(btrim(coalesce(p_langue, ''))) and btrim(p_langue) = upper(btrim(p_langue))),
    '??');
$$;

create or replace function public.parrainage_declarations_inviter(p_referral uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
  v_email text;
  v_pays text;
  v_ouvert boolean;
begin
  for r in
    select cr.* from public.creator_referrals cr
     where (p_referral is null or cr.id = p_referral)
       and cr.referrer_id is not null
       and cr.recrue_id is null
       and coalesce(cr.statut, '') not in ('refuse', 'accepte')
       and coalesce(cr.note_admin, '') not like 'parrainage par email%'
       and lower(btrim(coalesce(cr.contact_email, ''))) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
  loop
    v_email := lower(btrim(r.contact_email));
    continue when exists (select 1 from public.parrainage_invitations i where i.email = v_email);
    continue when exists (select 1 from public.parrainage_desinscrits d where d.email = v_email);
    continue when exists (select 1 from public.profiles p where lower(p.email_perso) = v_email or lower(p.email) = v_email);
    continue when exists (select 1 from public.ruul_candidatures c where lower(c.email) = v_email);
    v_pays := public.parrainage_pays_de_langue(r.pays);
    if v_pays <> '??' then
      select pp.envoi_auto and pp.recrutement_ouvert into v_ouvert from public.parrainage_pays pp where pp.pays = v_pays;
      continue when not coalesce(v_ouvert, false);
    end if;
    insert into public.parrainage_invitations (referral_id, parrain_id, email, prenom, pays, langue, code, statut, prochain_at)
    values (r.id, r.referrer_id, v_email, left(coalesce(nullif(btrim(r.prenom), ''), 'there'), 60), v_pays,
            case when v_pays = '??' then 'en' else public.parrainage_langue_pays(v_pays) end,
            public.parrainage_code(r.referrer_id), 'a_envoyer', now());
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.parrainage_declarations_inviter(uuid) from public, anon, authenticated;
grant execute on function public.parrainage_declarations_inviter(uuid) to service_role;

create or replace function public.parrainage_declaration_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.parrainage_declarations_inviter(new.id);
  exception when others then
    raise warning 'parrainage_declaration_tg : %', sqlerrm;
  end;
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'parrainage_declaration_inviter' and tgrelid = 'public.creator_referrals'::regclass) then
    create trigger parrainage_declaration_inviter after insert or update of contact_email on public.creator_referrals
      for each row execute function public.parrainage_declaration_tg();
  end if;
end $$;

/* L'email de l'ami est obligatoire pour un posteur (l'admin et les tâches gardent la main). */
create or replace function public.creator_referrals_email_obligatoire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin()
     and lower(btrim(coalesce(new.contact_email, ''))) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please add your friend''s email address.' using errcode = '22023';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'creator_referrals_email_obligatoire' and tgrelid = 'public.creator_referrals'::regclass) then
    create trigger creator_referrals_email_obligatoire before insert on public.creator_referrals
      for each row execute function public.creator_referrals_email_obligatoire();
  end if;
end $$;

/* Les emails à envoyer : comme 0561, plus le pays inconnu « ?? » (anglais, tarif de la zone C). */
create or replace function public.parrainage_a_envoyer(p_limite integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'parrainage_a_envoyer : réservé à la fonction parrainage'; end if;
  update public.parrainage_invitations set statut = 'expire' where statut = 'attente' and cree_at <= now() - interval '30 days';
  return coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', i.id, 'email', i.email, 'prenom', i.prenom, 'pays', i.pays, 'code', i.code, 'token', i.token,
               'envois', i.envois,
               'referrer', coalesce(nullif(btrim(pr.prenom), ''), 'A friend'),
               'tarif', coalesce(zp.tarif, (select c.tarif from public.zones_paie c where c.zone = 'C'))) as x
        from public.parrainage_invitations i
        left join public.parrainage_pays pp on pp.pays = i.pays
        left join public.profiles pr on pr.id = i.parrain_id
        left join public.zones_paie_pays z on upper(z.pays) = i.pays and z.retire_at is null
        left join public.zones_paie zp on zp.zone = z.zone
       where (i.pays = '??' or (pp.envoi_auto and pp.recrutement_ouvert))
         and i.statut in ('a_envoyer', 'en_cours') and i.prochain_at <= now() and i.envois < 3
         and i.recrue_id is null
         and not exists (select 1 from public.parrainage_desinscrits d where d.email = i.email)
       order by i.prochain_at
       limit greatest(1, least(p_limite, 200))) t), '[]'::jsonb);
end;
$$;

-- 3. Les demandes d'email aux parrains.
create table if not exists public.parrainage_demandes_email (
  referral_id uuid primary key references public.creator_referrals(id),
  parrain_id  uuid not null references public.profiles(id),
  statut      text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoye', 'recu', 'erreur')),
  canal       text,
  envoye_at   timestamptz,
  erreur      text,
  email_recu  text,
  recu_at     timestamptz,
  cree_at     timestamptz not null default now()
);
alter table public.parrainage_demandes_email enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'parrainage_demandes_email' and policyname = 'parrainage_demandes_email_admin') then
    create policy parrainage_demandes_email_admin on public.parrainage_demandes_email for select to authenticated using (public.is_admin());
  end if;
end $$;

/* « A », « A and B », « A, B and C ». */
create or replace function public.parrainage_liste_noms(p_noms text[])
returns text
language sql
immutable
as $$
  select case
    when coalesce(array_length(p_noms, 1), 0) = 0 then ''
    when array_length(p_noms, 1) = 1 then p_noms[1]
    else array_to_string(p_noms[1:array_length(p_noms, 1) - 1], ', ') || ' and ' || p_noms[array_length(p_noms, 1)]
  end;
$$;

/**
 * Les parrains à qui demander l'email de leurs amis déclarés sans email (un
 * message par parrain). p_noter : crée les demandes (statut a_envoyer) ; sans,
 * c'est l'aperçu. Exclus : refusés, déjà recrutés, déjà invités par ce parrain
 * sous le même prénom, déjà demandés, parrain inactif ou injoignable.
 */
create or replace function public.parrainage_demandes_preparer(p_noter boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  create temp table if not exists t_dem (referral_id uuid, parrain_id uuid, filleul text) on commit drop;
  truncate t_dem;
  insert into t_dem
  select cr.id, cr.referrer_id, btrim(cr.prenom || coalesce(' ' || nullif(btrim(cr.nom), ''), ''))
    from public.creator_referrals cr
    join public.profiles p on p.id = cr.referrer_id and p.is_active
   where nullif(btrim(coalesce(cr.contact_email, '')), '') is null
     and coalesce(cr.statut, '') <> 'refuse'
     and cr.recrue_id is null
     and (p.slack_user_id is not null or p.upwork_contract_id is not null)
     and not exists (select 1 from public.parrainage_demandes_email d where d.referral_id = cr.id)
     and not exists (select 1 from public.parrainage_invitations i
                      where i.parrain_id = cr.referrer_id
                        and lower(unaccent(split_part(btrim(i.prenom), ' ', 1))) = lower(unaccent(split_part(btrim(cr.prenom), ' ', 1))));
  if p_noter then
    insert into public.parrainage_demandes_email (referral_id, parrain_id) select referral_id, parrain_id from t_dem
    on conflict (referral_id) do nothing;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'parrain_id', g.parrain_id, 'parrain', g.parrain, 'canal', g.canal, 'filleuls', g.noms,
           'texte', case when array_length(g.noms, 1) = 1
             then 'Hi ' || g.prenom || ', to invite ' || g.noms[1] || ' we need their email address. Can you reply with it? We''ll send them the link to apply.'
             else 'Hi ' || g.prenom || ', to invite ' || public.parrainage_liste_noms(g.noms) || ' we need their email addresses. Can you reply with them (name: email)? We''ll send them the link to apply.'
           end) order by g.parrain), '[]'::jsonb)
    into v
    from (select t.parrain_id, btrim(p.prenom || ' ' || coalesce(p.nom, '')) parrain, coalesce(nullif(btrim(p.prenom), ''), 'there') prenom,
                 case when p.slack_user_id is not null then 'slack' else 'upwork' end canal,
                 array_agg(t.filleul order by t.filleul) noms
            from t_dem t join public.profiles p on p.id = t.parrain_id
           group by t.parrain_id, p.prenom, p.nom, p.slack_user_id) g;
  return v;
end;
$$;

revoke execute on function public.parrainage_demandes_preparer(boolean) from public, anon;
grant execute on function public.parrainage_demandes_preparer(boolean) to authenticated, service_role;

create or replace function public.parrainage_demandes_noter(p_parrain uuid, p_canal text, p_ok boolean, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.parrainage_demandes_email
     set statut = case when p_ok then 'envoye' else 'erreur' end, canal = p_canal,
         envoye_at = case when p_ok then now() end, erreur = p_erreur
   where parrain_id = p_parrain and statut in ('a_envoyer', 'erreur');
$$;

revoke execute on function public.parrainage_demandes_noter(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.parrainage_demandes_noter(uuid, text, boolean, text) to service_role;

/**
 * La réponse du parrain (Upwork, DM Slack) : chaque email trouvé va à l'ami
 * dont le prénom est sur la même ligne ; sinon, une seule demande ouverte et
 * un seul email : c'est le sien. L'email est enregistré sur la déclaration (le
 * déclencheur envoie l'invitation). Ne bloque jamais l'arrivée du message.
 */
create or replace function public.parrainage_email_recu_tg()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ligne text;
  e text;
  d record;
  v_ref uuid;
  v_restants text[] := '{}';
begin
  begin
    if new.poster_id is null or coalesce(new.texte, '') !~ '@' then return null; end if;
    if not exists (select 1 from public.parrainage_demandes_email x where x.parrain_id = new.poster_id and x.statut = 'envoye') then return null; end if;
    for ligne in select regexp_split_to_table(new.texte, '\n') loop
      for e in select lower(m[1]) from regexp_matches(ligne, '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m loop
        v_ref := null;
        select x.referral_id into v_ref
          from public.parrainage_demandes_email x join public.creator_referrals cr on cr.id = x.referral_id
         where x.parrain_id = new.poster_id and x.statut = 'envoye'
           and position(lower(unaccent(split_part(btrim(cr.prenom), ' ', 1))) in lower(unaccent(ligne))) > 0
         order by x.cree_at limit 1;
        if v_ref is null then
          v_restants := v_restants || e;
        else
          update public.parrainage_demandes_email set statut = 'recu', email_recu = e, recu_at = now() where referral_id = v_ref;
          update public.creator_referrals set contact_email = e, updated_at = now() where id = v_ref;
        end if;
      end loop;
    end loop;
    if array_length(v_restants, 1) = 1
       and (select count(*) from public.parrainage_demandes_email x where x.parrain_id = new.poster_id and x.statut = 'envoye') = 1 then
      select x.referral_id into v_ref from public.parrainage_demandes_email x where x.parrain_id = new.poster_id and x.statut = 'envoye';
      update public.parrainage_demandes_email set statut = 'recu', email_recu = v_restants[1], recu_at = now() where referral_id = v_ref;
      update public.creator_referrals set contact_email = v_restants[1], updated_at = now() where id = v_ref;
    end if;
  exception when others then
    raise warning 'parrainage_email_recu_tg : %', sqlerrm;
  end;
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'parrainage_email_recu' and tgrelid = 'public.posteur_reponses'::regclass) then
    create trigger parrainage_email_recu after insert on public.posteur_reponses
      for each row execute function public.parrainage_email_recu_tg();
  end if;
end $$;

-- La tâche : toutes les 10 min (en plus du déclencheur).
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'parrainage-declarations') then
    perform cron.schedule('parrainage-declarations', '*/10 * * * *', 'select public.parrainage_declarations_inviter()');
  end if;
end
$c$;
