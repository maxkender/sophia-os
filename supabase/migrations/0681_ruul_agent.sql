-- 0681 : « Agent Ruul » (Max, 12/11). Ruul n'a pas d'API : un agent externe (navigateur)
-- ou Max lit Ruul et colle les infos dans la page Ruul.
--   a) À inviter dans Ruul : signés pas encore dans Ruul (hors pays fermés et personnes
--      en attente de décision), nom + email Ruul, à copier.
--   b) Marquer invités : des emails collés passent « Ajouté sur Ruul ».
--   c) Importer statuts Ruul : « email ; Active » ou « email ; Invited ». Un nouveau Invited
--      reçoit l'email A une seule fois (puis les relances), un nouveau Active l'email B une
--      seule fois. Jamais deux fois le même email à la même personne (dates d'envoi gardées).
--   Journal des imports, date du dernier import, ligne dans « Aujourd'hui » après 48 h.
-- Les emails A et B partent seulement quand l'interrupteur ruul_emails_ab est sur on (Max).
-- Additif : colonnes, une table, un réglage (off), des fonctions ; 4 posteurs marqués
-- « en attente de décision » à la demande de Max.

alter table public.profiles add column if not exists ruul_compte text;
alter table public.profiles add column if not exists ruul_compte_at timestamptz;
alter table public.profiles add column if not exists ruul_compte_vu_at timestamptz;
alter table public.profiles add column if not exists ruul_email_a_at timestamptz;
alter table public.profiles add column if not exists ruul_email_b_at timestamptz;
alter table public.profiles add column if not exists ruul_ne_pas_inviter text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_ruul_compte_check') then
    alter table public.profiles add constraint profiles_ruul_compte_check check (ruul_compte in ('invited', 'active'));
  end if;
end
$c$;

create table if not exists public.ruul_imports (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('statuts', 'invites')),
  at               timestamptz not null default now(),
  par              uuid,
  lignes           integer not null default 0,
  appliques        integer not null default 0,
  nouveaux_invited integer not null default 0,
  nouveaux_active  integer not null default 0,
  introuvables     jsonb not null default '[]'::jsonb,
  detail           jsonb
);
alter table public.ruul_imports enable row level security;
revoke all on public.ruul_imports from anon;
grant select on public.ruul_imports to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_imports' and policyname = 'ruul_imports_admin') then
    create policy ruul_imports_admin on public.ruul_imports for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Les textes des emails A et B (Max, 12/11) et leur interrupteur (off).
insert into public.reglages (cle, valeur) values ('ruul_emails_ab', 'false'::jsonb) on conflict (cle) do nothing;
insert into public.reglages (cle, valeur) values ('ruul_textes_ab', jsonb_build_object(
  'a_objet', 'Action needed: set up Ruul so we can pay you every Monday',
  'a_texte', $a$Hi {prenom},

We just invited you to Ruul at {email}. Ruul is the platform we use to pay you every Monday. It's free for you and takes about 10 minutes.

1. Find the email from Ruul in your inbox (check spam and promotions too). It says Vik Studios invited you.
2. Click the link in that email and create your account with this same email address: {email}. If you use another email, we can't find you to pay you.
3. Use your real name, exactly as it is on your ID.
4. Verify your identity: a photo of your ID + a selfie.
5. Add where you want to receive your money (bank account or another withdrawal method).
6. Come back to this email and click the button below.

Important:
- You don't need Ruul to start posting. Keep following your dashboard as usual.
- You're paid every Monday for the week you posted (Monday to Sunday). Your first payment arrives the Monday after your first week of posting.
- Without a finished Ruul account, we can't send your payment.

Have a question? Ask Help on your dashboard first: you'll get an answer right away, and you can escalate to our team if needed.$a$,
  'b_objet', 'You''re connected on Ruul: one last check to get paid',
  'b_texte', $b$Hi {prenom},

Good news: your Ruul account ({email}) is now connected to Vik Studios. This is how we'll pay you every Monday.

Before your first payment, check these 2 things in Ruul (2 minutes):
1. Your identity is verified (ID + selfie). If Ruul still asks for it, do it now.
2. You've added where you want to receive your money (bank account or another withdrawal method).

When both are done, click the button below.

Important:
- You're paid every Monday for the week you posted (Monday to Sunday). Your first payment arrives the Monday after your first week of posting.
- Keep following your dashboard as usual to start posting.

Have a question? Ask Help on your dashboard first: you'll get an answer right away, and you can escalate to our team if needed.$b$,
  'bouton', 'It''s done'))
on conflict (cle) do nothing;

-- Les 4 personnes en attente de décision (Max, 12/11) : jamais dans « À inviter ».
update public.profiles set ruul_ne_pas_inviter = 'en attente de décision'
 where canal_paie = 'ruul' and ruul_ne_pas_inviter is null
   and lower(ruul_email) in ('ferzanakgul@gmail.com', 'hendimaret1983@gmail.com', 'lidasamadi3@gmail.com', 'sekarwhienastuti@gmail.com');

/* Le pays d'un posteur Ruul : celui de sa candidature sur le site, sinon celui de son compte. */
create or replace function public.ruul_pays_posteur(p_poster uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select upper(c.pays) from public.ruul_candidatures c where c.os_profile_id = p_poster and c.pays is not null limit 1),
                  public.paie_pays_posteur(p_poster));
$$;
revoke execute on function public.ruul_pays_posteur(uuid) from public, anon;

/* a) À inviter dans Ruul : signés, actifs, avec un email Ruul, pas encore ajoutés ; hors pays fermés et attente de décision. */
create or replace function public.ruul_agent_a_inviter()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('poster_id', x.id, 'nom', x.nom, 'email_ruul', x.ruul_email, 'pays', x.pays) order by x.nom), '[]'::jsonb)
    from (
      select p.id, btrim(concat_ws(' ', p.prenom, p.nom)) nom, lower(btrim(p.ruul_email)) ruul_email, public.ruul_pays_posteur(p.id) pays
        from public.profiles p
       where p.canal_paie = 'ruul' and p.is_active and p.ruul_ajoute_at is null
         and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
         and p.ruul_ne_pas_inviter is null
    ) x
   where public.is_admin()
     and not exists (select 1 from public.parrainage_pays pp where pp.pays = x.pays and not pp.recrutement_ouvert);
$$;
revoke execute on function public.ruul_agent_a_inviter() from public, anon;
grant execute on function public.ruul_agent_a_inviter() to authenticated;

/* Les emails d'un texte collé (un par ligne, ou séparés par des virgules, espaces, points-virgules). */
create or replace function public.ruul_emails_du_texte(p_texte text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
    from regexp_matches(coalesce(p_texte, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m;
$$;

/* b) Marquer invités : les emails collés passent « Ajouté sur Ruul ». */
create or replace function public.ruul_agent_marquer_invites(p_texte text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emails text[] := public.ruul_emails_du_texte(p_texte);
  v_marques integer;
  v_deja integer;
  v_introuvables jsonb;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  if coalesce(array_length(v_emails, 1), 0) = 0 then raise exception 'aucun email trouvé dans le texte collé'; end if;
  select count(*) into v_deja from public.profiles
   where canal_paie = 'ruul' and lower(btrim(ruul_email)) = any(v_emails) and ruul_ajoute_at is not null;
  update public.profiles
     set ruul_ajoute_at = now(),
         ruul_statut = case when ruul_statut in ('pret', 'paye_1x') then ruul_statut else 'invite' end
   where canal_paie = 'ruul' and lower(btrim(ruul_email)) = any(v_emails) and ruul_ajoute_at is null;
  get diagnostics v_marques = row_count;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_introuvables from unnest(v_emails) e
   where not exists (select 1 from public.profiles p where p.canal_paie = 'ruul' and lower(btrim(p.ruul_email)) = e);
  insert into public.ruul_imports (type, par, lignes, appliques, introuvables)
  values ('invites', auth.uid(), array_length(v_emails, 1), v_marques, v_introuvables);
  return jsonb_build_object('emails', array_length(v_emails, 1), 'marques', v_marques, 'deja', v_deja, 'introuvables', v_introuvables);
end;
$$;
revoke execute on function public.ruul_agent_marquer_invites(text) from public, anon;
grant execute on function public.ruul_agent_marquer_invites(text) to authenticated;

/*
 * c) Importer statuts Ruul : « email ; Active » / « email ; Invited », une ligne par personne.
 * p_simuler : on montre ce qui changerait, sans rien écrire. Être dans Ruul vaut « Ajouté sur Ruul ».
 * Les emails eux-mêmes partent par la fonction ruul (interrupteur ruul_emails_ab).
 */
create or replace function public.ruul_agent_importer_statuts(p_texte text, p_simuler boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lignes jsonb := '[]'::jsonb;
  v_ligne text;
  v_email text;
  v_statut text;
  v_illisibles jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  foreach v_ligne in array regexp_split_to_array(coalesce(p_texte, ''), '\r?\n') loop
    continue when btrim(v_ligne) = '';
    v_email := lower((regexp_match(v_ligne, '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})'))[1]);
    v_statut := case when v_ligne ~* '\mactive\M' then 'active' when v_ligne ~* '\minvited\M' then 'invited' end;
    if v_email is null or v_statut is null then
      v_illisibles := v_illisibles || to_jsonb(btrim(v_ligne));
    else
      v_lignes := v_lignes || jsonb_build_object('email', v_email, 'statut', v_statut);
    end if;
  end loop;
  if jsonb_array_length(v_lignes) = 0 then raise exception 'aucune ligne « email ; Active » ou « email ; Invited » lisible'; end if;

  with l as (
    select distinct on (x->>'email') x->>'email' email, x->>'statut' statut
      from jsonb_array_elements(v_lignes) x
  ), m as (
    select l.email, l.statut, p.id, p.ruul_compte, p.ruul_statut, p.ruul_email_a_at, p.ruul_email_b_at
      from l left join public.profiles p on p.canal_paie = 'ruul' and lower(btrim(p.ruul_email)) = l.email
  )
  select jsonb_build_object(
    'lignes', (select count(*) from m),
    'trouves', (select count(*) from m where id is not null),
    'changes', (select count(*) from m where id is not null and ruul_compte is distinct from statut),
    'a_envoyer_a', (select count(*) from m where id is not null and statut = 'invited' and ruul_compte is distinct from 'active'
                      and ruul_email_a_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'a_envoyer_b', (select count(*) from m where id is not null and statut = 'active'
                      and ruul_email_b_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'nouveaux_invited', (select count(*) from m where id is not null and statut = 'invited' and ruul_compte is distinct from 'invited'),
    'nouveaux_active', (select count(*) from m where id is not null and statut = 'active' and ruul_compte is distinct from 'active'),
    'introuvables', (select coalesce(jsonb_agg(email), '[]'::jsonb) from m where id is null),
    'illisibles', v_illisibles)
    into v_res;

  if coalesce(p_simuler, false) then return v_res || jsonb_build_object('simulation', true); end if;

  with l as (
    select distinct on (x->>'email') x->>'email' email, x->>'statut' statut from jsonb_array_elements(v_lignes) x
  )
  update public.profiles p
     set ruul_compte_at = case when p.ruul_compte is distinct from l.statut then now() else p.ruul_compte_at end,
         ruul_compte = l.statut,
         ruul_compte_vu_at = now(),
         ruul_ajoute_at = coalesce(p.ruul_ajoute_at, now()),
         ruul_statut = case when p.ruul_statut in ('pret', 'paye_1x', 'invite') then p.ruul_statut else 'invite' end
    from l
   where p.canal_paie = 'ruul' and lower(btrim(p.ruul_email)) = l.email;

  insert into public.ruul_imports (type, par, lignes, appliques, nouveaux_invited, nouveaux_active, introuvables, detail)
  values ('statuts', auth.uid(), (v_res->>'lignes')::int, (v_res->>'trouves')::int, (v_res->>'nouveaux_invited')::int,
          (v_res->>'nouveaux_active')::int, v_res->'introuvables', v_res);
  return v_res;
end;
$$;
revoke execute on function public.ruul_agent_importer_statuts(text, boolean) from public, anon;
grant execute on function public.ruul_agent_importer_statuts(text, boolean) to authenticated;

/* L'état du bloc Agent Ruul : dernier import, emails A/B en attente, interrupteur, journal. */
create or replace function public.ruul_agent_etat()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'dernier_import_at', (select max(at) from public.ruul_imports where type = 'statuts'),
    'emails_ab', coalesce((select valeur = 'true'::jsonb or valeur = '"on"'::jsonb from public.reglages where cle = 'ruul_emails_ab'), false),
    'a_envoyer_a', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_compte = 'invited'
                      and ruul_email_a_at is null and relances_stop_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'a_envoyer_b', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_compte = 'active'
                      and ruul_email_b_at is null and relances_stop_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'envoyes_a', (select count(*) from public.profiles where canal_paie = 'ruul' and ruul_email_a_at is not null),
    'envoyes_b', (select count(*) from public.profiles where canal_paie = 'ruul' and ruul_email_b_at is not null),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.type, 'at', i.at,
                                   'par', coalesce((select btrim(concat_ws(' ', pr.prenom, pr.nom)) from public.profiles pr where pr.id = i.par), 'Claude'),
                                   'lignes', i.lignes, 'appliques', i.appliques, 'nouveaux_invited', i.nouveaux_invited,
                                   'nouveaux_active', i.nouveaux_active, 'introuvables', i.introuvables) order by i.at desc)
                           from (select * from public.ruul_imports order by at desc limit 30) i), '[]'::jsonb))
  where public.is_admin();
$$;
revoke execute on function public.ruul_agent_etat() from public, anon;
grant execute on function public.ruul_agent_etat() to authenticated;

/* Aujourd'hui : + les heures depuis le dernier import des statuts Ruul (null : jamais). */
create or replace function public.os_aujourdhui()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pour_max', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')),
    'pour_adrien', (select count(*) from public.support_demandes where coalesce(niveau, 'adrien') = 'adrien'
                      and escalade_at is not null and statut in ('ouvert', 'attente_posteur')),
    'ruul_a_inviter', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_statut = 'a_ajouter'),
    'contrats_a_relier', (select count(*) from public.accueils a
                           left join public.upwork_contrats u on u.contrat_id::text = a.contrat_id
                          where a.statut = 'a_relier' and a.classement is null
                            and coalesce(btrim(u.organisation_nom), 'VIk Studios') ilike 'vik studios'),
    'ruul_import_heures', (select floor(extract(epoch from now() - max(at)) / 3600)::int from public.ruul_imports where type = 'statuts'))
  where public.is_admin();
$$;
revoke execute on function public.os_aujourdhui() from public, anon;
grant execute on function public.os_aujourdhui() to authenticated;
