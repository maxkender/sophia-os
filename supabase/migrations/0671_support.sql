-- 0671 : Espace support (Max, 11/11). « Help » côté posteur, « Support » côté admin.
-- 1. Question = besoin d'une info : le bot répond (Official answers + fiche du posteur).
--    Problème = quelque chose est cassé ou bloqué pour CE posteur.
-- 2. support_demandes (une ligne par demande ; même personne, même sujet → une seule
--    ligne) et support_messages (le fil). Le posteur lit les siennes par
--    support_mes_demandes ; l'admin par support_liste / support_detail.
-- 3. reponses_officielles : portée (tous / ruul / upwork) et catégorie.
-- 4. Captures : seau privé « support » (le posteur dépose dans son dossier).
-- 5. Interrupteur support_slack_salons (éteint) : le bot écoute #posting-help,
--    #ruul-posters et #upwork-posters seulement quand il est sur on.
-- 6. Tâche support-alertes (toutes les heures) : compte Ruul / Upwork bloqué depuis 24 h → alerte à Max.
-- Additif : deux tables, deux colonnes, un seau, des fonctions, deux réglages, une tâche.

alter table public.reponses_officielles add column if not exists portee text not null default 'tous';
alter table public.reponses_officielles add column if not exists categorie text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'reponses_officielles_portee_check') then
    alter table public.reponses_officielles add constraint reponses_officielles_portee_check check (portee in ('tous', 'ruul', 'upwork'));
  end if;
end
$c$;

create table if not exists public.support_demandes (
  id              uuid primary key default gen_random_uuid(),
  poster_id       uuid references public.profiles(id),
  type            text not null check (type in ('question', 'probleme')),
  categorie       text,
  plateforme      text not null default 'upwork' check (plateforme in ('ruul', 'upwork')),
  source          text not null default 'help' check (source in ('help', 'slack_salon', 'slack_aide')),
  texte           text not null check (length(btrim(texte)) between 2 and 4000),
  capture         text,
  -- bot : le bot a répondu, le posteur n'a pas encore dit « This solved it » / « I still need help ».
  statut          text not null default 'ouvert' check (statut in ('bot', 'ouvert', 'attente_posteur', 'resolu')),
  bot_reponse     text,
  bot_decision    text,
  brouillon       text,
  auto_action     text,
  auto_resultat   text,
  escalade_at     timestamptz,
  alerte_at       timestamptz,
  slack_canal     text,
  slack_ts        text,
  slack_user      text,
  equipe_at       timestamptz,
  posteur_at      timestamptz,
  resolu_at       timestamptz,
  resolu_par      uuid,
  resolu_par_bot  boolean not null default false,
  cree_at         timestamptz not null default now(),
  maj_at          timestamptz not null default now()
);
create index if not exists support_demandes_poster on public.support_demandes (poster_id, cree_at desc);
create index if not exists support_demandes_ouvertes on public.support_demandes (statut, escalade_at) where statut in ('ouvert', 'attente_posteur');
create unique index if not exists support_demandes_slack on public.support_demandes (slack_canal, slack_ts) where slack_ts is not null;

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  demande_id  uuid not null references public.support_demandes(id),
  auteur      text not null check (auteur in ('posteur', 'equipe', 'bot')),
  auteur_id   uuid,
  texte       text not null check (length(btrim(texte)) between 1 and 4000),
  envois      jsonb,
  cree_at     timestamptz not null default now()
);
create index if not exists support_messages_demande on public.support_messages (demande_id, cree_at);

alter table public.support_demandes enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_demandes from anon;
revoke all on public.support_messages from anon;
grant select on public.support_demandes to authenticated;
grant select on public.support_messages to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'support_demandes' and policyname = 'support_demandes_admin') then
    create policy support_demandes_admin on public.support_demandes for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'support_messages' and policyname = 'support_messages_admin') then
    create policy support_messages_admin on public.support_messages for select to authenticated using (public.is_admin());
  end if;
end
$p$;

-- Les captures : seau privé ; le posteur dépose dans son dossier ({son id}/…), l'admin lit tout.
insert into storage.buckets (id, name, public) values ('support', 'support', false) on conflict (id) do nothing;
do $s$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'support_depot_posteur') then
    create policy support_depot_posteur on storage.objects for insert to authenticated
      with check (bucket_id = 'support' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'support_lecture') then
    create policy support_lecture on storage.objects for select to authenticated
      using (bucket_id = 'support' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
  end if;
end
$s$;

insert into public.reglages (cle, valeur) values
  ('support_slack_salons', 'false'::jsonb),
  ('support_salons', '["C0CGA81NTDH", "C0CA5SH59N0", "C0CG13NM2HM"]'::jsonb)
on conflict (cle) do nothing;

/* La catégorie : urgence (rouge = paiement, orange = compte, gris = le reste) et délai de retard. */
create or replace function public.support_urgence(p_categorie text)
returns text
language sql
immutable
as $$
  select case when p_categorie = 'paiement' then 'rouge'
              when p_categorie in ('compte', 'connexion') then 'orange'
              else 'gris' end;
$$;

create or replace function public.support_en_retard(d public.support_demandes)
returns boolean
language sql
stable
as $$
  select d.statut = 'ouvert' and d.escalade_at is not null
     and now() - greatest(d.escalade_at, coalesce(d.posteur_at, d.escalade_at))
         > case when d.categorie = 'paiement' then interval '12 hours' else interval '24 hours' end;
$$;

/* Ce que le bot sait du posteur : début, étapes manquantes, Ruul, parrainages, dernière paie. */
create or replace function public.support_fiche(p_poster uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pr public.profiles%rowtype;
  c record;
  v_ruul boolean;
  v_manque text[] := array[]::text[];
  v_paie jsonb;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin() or auth.uid() = p_poster) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pr from public.profiles where id = p_poster;
  if not found then return null; end if;
  v_ruul := pr.canal_paie = 'ruul';
  select co.handle_tiktok, co.warmup_started_at, co.warmup_ends_at into c
    from public.comptes co where co.poster_id = p_poster order by co.is_active desc, co.created_at limit 1;
  if pr.premiere_connexion_at is null then v_manque := array_append(v_manque, 'log in to the dashboard'); end if;
  if v_ruul and nullif(btrim(coalesce(pr.ruul_email, '')), '') is null then v_manque := array_append(v_manque, 'give the email of your Ruul account'); end if;
  if v_ruul and coalesce(pr.ruul_statut, '') not in ('pret', 'paye_1x') then v_manque := array_append(v_manque, 'finish your Ruul account'); end if;
  if c.handle_tiktok is null then v_manque := array_append(v_manque, 'create the TikTok account'); end if;
  if c.warmup_started_at is null then v_manque := array_append(v_manque, 'click Start warmup and follow 5 accounts'); end if;
  if pr.slack_user_id is null then v_manque := array_append(v_manque, 'join Slack (recommended)'); end if;
  if v_ruul then
    select jsonb_build_object('semaine', rp.semaine, 'statut', rp.statut, 'montant', rp.montant, 'paye_at', rp.paye_at) into v_paie
      from public.ruul_paiements rp where rp.poster_id = p_poster order by rp.semaine desc limit 1;
  else
    select jsonb_build_object('semaine', pa.semaine, 'statut', pa.statut,
                              'montant', coalesce(pa.montant_finance, pa.montant_approuve, pa.montant_reserve), 'maj_at', pa.updated_at) into v_paie
      from public.paie_paiements_api pa where pa.poster_id = p_poster order by pa.semaine desc limit 1;
  end if;
  return jsonb_build_object(
    'poster_id', pr.id,
    'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
    'plateforme', case when v_ruul then 'ruul' else 'upwork' end,
    'actif', pr.is_active,
    'debut', pr.cohorte_lundi,
    'premiere_connexion', pr.premiere_connexion_at,
    'slack_relie', pr.slack_user_id is not null,
    'tiktok', c.handle_tiktok,
    'warmup_debut', c.warmup_started_at,
    'warmup_fin', c.warmup_ends_at,
    'ruul', case when v_ruul then jsonb_build_object('statut', pr.ruul_statut, 'email_ruul', pr.ruul_email is not null,
                                                     'ajoute_at', pr.ruul_ajoute_at, 'pret_at', pr.ruul_pret_at,
                                                     'premier_paiement_at', pr.ruul_premier_paiement_at) end,
    'contrat_upwork', case when not v_ruul then pr.upwork_contract_id end,
    'parrainages', jsonb_build_object(
      'declares', (select count(*) from public.creator_referrals r where r.referrer_id = p_poster),
      'invites', (select count(*) from public.parrainage_invitations i where i.parrain_id = p_poster),
      'recrues', (select count(*) from public.parrainage_invitations i where i.parrain_id = p_poster and i.recrue_id is not null)),
    'derniere_paie', v_paie,
    'manque', to_jsonb(v_manque)
  );
end;
$$;

/* Une demande, ou un message ajouté à la demande ouverte du même posteur sur le même sujet (7 jours). */
create or replace function public.support_ajouter(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid := nullif(p->>'poster_id', '')::uuid;
  v_type text := coalesce(p->>'type', 'question');
  v_cat text := nullif(p->>'categorie', '');
  v_texte text := btrim(coalesce(p->>'texte', ''));
  v_id uuid;
  v_plateforme text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_texte) < 2 then raise exception 'texte vide'; end if;
  select case when canal_paie = 'ruul' then 'ruul' else 'upwork' end into v_plateforme from public.profiles where id = v_poster;
  -- Même personne, même sujet, encore ouvert (dashboard ou Slack) : une seule ligne.
  if v_poster is not null and coalesce((p->>'escalader')::boolean, false) then
    select d.id into v_id from public.support_demandes d
     where d.poster_id = v_poster and d.type = v_type and d.statut in ('ouvert', 'attente_posteur')
       and d.escalade_at is not null and coalesce(d.categorie, '') = coalesce(v_cat, '')
       and d.cree_at > now() - interval '7 days'
     order by d.cree_at desc limit 1;
    if v_id is not null then
      insert into public.support_messages (demande_id, auteur, auteur_id, texte)
        values (v_id, 'posteur', v_poster, v_texte || coalesce(E'\n\nScreenshot: ' || nullif(p->>'capture', ''), ''));
      update public.support_demandes set statut = 'ouvert', posteur_at = now(), maj_at = now() where id = v_id;
      return jsonb_build_object('id', v_id, 'fusion', true);
    end if;
  end if;
  insert into public.support_demandes (poster_id, type, categorie, plateforme, source, texte, capture, statut, bot_reponse, bot_decision,
                                       brouillon, auto_action, auto_resultat, escalade_at, slack_canal, slack_ts, slack_user, posteur_at)
  values (v_poster, v_type, v_cat, coalesce(v_plateforme, nullif(p->>'plateforme', ''), 'upwork'), coalesce(nullif(p->>'source', ''), 'help'),
          left(v_texte, 4000), nullif(p->>'capture', ''),
          case when coalesce((p->>'escalader')::boolean, false) then 'ouvert' else 'bot' end,
          nullif(p->>'bot_reponse', ''), nullif(p->>'bot_decision', ''), nullif(p->>'brouillon', ''),
          nullif(p->>'auto_action', ''), nullif(p->>'auto_resultat', ''),
          case when coalesce((p->>'escalader')::boolean, false) then now() end,
          nullif(p->>'slack_canal', ''), nullif(p->>'slack_ts', ''), nullif(p->>'slack_user', ''), now())
  on conflict (slack_canal, slack_ts) where slack_ts is not null do nothing
  returning id into v_id;
  if v_id is not null and nullif(p->>'bot_reponse', '') is not null then
    insert into public.support_messages (demande_id, auteur, texte) values (v_id, 'bot', p->>'bot_reponse');
  end if;
  return jsonb_build_object('id', v_id, 'fusion', false);
end;
$$;

/* Le posteur : ses demandes, leur statut et le fil (sans le brouillon de l'équipe). */
create or replace function public.support_mes_demandes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'type', d.type, 'categorie', d.categorie, 'texte', d.texte, 'statut', d.statut,
           'equipe_a_repondu', d.equipe_at is not null, 'cree_at', d.cree_at, 'resolu_at', d.resolu_at,
           'messages', coalesce((select jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_at', m.cree_at) order by m.cree_at)
                                   from public.support_messages m where m.demande_id = d.id), '[]'::jsonb))
           order by d.cree_at desc), '[]'::jsonb)
    from (select * from public.support_demandes where poster_id = auth.uid() order by cree_at desc limit 100) d;
$$;

/* Le posteur : « This solved it », « I still need help », ou une réponse dans le fil. */
create or replace function public.support_posteur_action(p_id uuid, p_action text, p_texte text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.support_demandes%rowtype;
begin
  select * into d from public.support_demandes where id = p_id and poster_id = auth.uid();
  if not found then raise exception 'demande introuvable'; end if;
  if p_action = 'resolu' then
    update public.support_demandes set statut = 'resolu', resolu_at = now(), resolu_par = auth.uid(),
           resolu_par_bot = d.escalade_at is null, maj_at = now() where id = p_id;
  elsif p_action = 'aide' then
    update public.support_demandes set statut = 'ouvert', escalade_at = coalesce(escalade_at, now()), posteur_at = now(),
           brouillon = coalesce(brouillon, bot_reponse), maj_at = now() where id = p_id;
    if nullif(btrim(coalesce(p_texte, '')), '') is not null then
      insert into public.support_messages (demande_id, auteur, auteur_id, texte) values (p_id, 'posteur', auth.uid(), btrim(p_texte));
    end if;
  elsif p_action = 'repondre' then
    if length(btrim(coalesce(p_texte, ''))) < 1 then raise exception 'message vide'; end if;
    insert into public.support_messages (demande_id, auteur, auteur_id, texte) values (p_id, 'posteur', auth.uid(), left(btrim(p_texte), 4000));
    update public.support_demandes set statut = 'ouvert', escalade_at = coalesce(escalade_at, now()), posteur_at = now(),
           resolu_at = null, maj_at = now() where id = p_id;
  else
    raise exception 'action inconnue';
  end if;
  return jsonb_build_object('ok', true, 'categorie', d.categorie, 'type', d.type);
end;
$$;

/* L'admin : les demandes envoyées à l'équipe (ouvertes, et réglées depuis 30 jours). */
create or replace function public.support_liste()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'type', d.type, 'categorie', d.categorie, 'plateforme', d.plateforme, 'source', d.source,
             'statut', d.statut, 'extrait', left(d.texte, 160), 'escalade_at', d.escalade_at, 'cree_at', d.cree_at,
             'posteur_at', d.posteur_at, 'equipe_at', d.equipe_at, 'resolu_at', d.resolu_at,
             'urgence', public.support_urgence(d.categorie), 'en_retard', public.support_en_retard(d),
             'poster_id', d.poster_id,
             'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email, d.slack_user, 'Unknown'),
             'messages', (select count(*) from public.support_messages m where m.demande_id = d.id))
           order by case public.support_urgence(d.categorie) when 'rouge' then 0 when 'orange' then 1 else 2 end,
                    d.escalade_at), '[]'::jsonb)
      from public.support_demandes d
      left join public.profiles pr on pr.id = d.poster_id
     where d.escalade_at is not null
       and (d.statut in ('ouvert', 'attente_posteur') or d.resolu_at > now() - interval '30 days'));
end;
$$;

/* L'admin : une demande, son fil, le brouillon et la fiche du posteur. */
create or replace function public.support_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.support_demandes%rowtype;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.support_demandes where id = p_id;
  if not found then return null; end if;
  return to_jsonb(d) || jsonb_build_object(
    'urgence', public.support_urgence(d.categorie), 'en_retard', public.support_en_retard(d),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_at', m.cree_at) order by m.cree_at)
                            from public.support_messages m where m.demande_id = p_id), '[]'::jsonb),
    'fiche', case when d.poster_id is not null then public.support_fiche(d.poster_id) end);
end;
$$;

/* L'admin : Mark solved / rouvrir, Move to Problems / Questions. */
create or replace function public.support_changer(p_id uuid, p_statut text default null, p_type text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_statut is not null and p_statut not in ('ouvert', 'attente_posteur', 'resolu') then raise exception 'statut inconnu'; end if;
  if p_type is not null and p_type not in ('question', 'probleme') then raise exception 'type inconnu'; end if;
  update public.support_demandes
     set statut = coalesce(p_statut, statut), type = coalesce(p_type, type),
         resolu_at = case when p_statut = 'resolu' then now() when p_statut is not null then null else resolu_at end,
         resolu_par = case when p_statut = 'resolu' then auth.uid() else resolu_par end,
         maj_at = now()
   where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

/* L'admin : la question et la réponse rejoignent les Official answers (validées, avec portée et catégorie). */
create or replace function public.support_vers_officielles(p_question text, p_reponse text, p_portee text, p_categorie text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_portee not in ('tous', 'ruul', 'upwork') then raise exception 'portée inconnue'; end if;
  insert into public.reponses_officielles (question, reponse, portee, categorie, ordre, valide_at, valide_par)
  values (left(btrim(p_question), 300), left(btrim(p_reponse), 2000), p_portee, nullif(p_categorie, ''), 200, now(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

/* Le point du soir et les compteurs des onglets. */
create or replace function public.support_compteurs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'problemes', count(*) filter (where d.type = 'probleme' and d.statut = 'ouvert'),
    'questions', count(*) filter (where d.type = 'question' and d.statut = 'ouvert'),
    'en_attente_posteur', count(*) filter (where d.statut = 'attente_posteur'),
    'en_retard', count(*) filter (where public.support_en_retard(d)))
    from public.support_demandes d
   where d.escalade_at is not null and d.statut in ('ouvert', 'attente_posteur')
     and (public.is_admin() or coalesce(auth.role(), '') = 'service_role');
$$;

revoke execute on function public.support_fiche(uuid) from public, anon;
revoke execute on function public.support_ajouter(jsonb) from public, anon, authenticated;
revoke execute on function public.support_mes_demandes() from public, anon;
revoke execute on function public.support_posteur_action(uuid, text, text) from public, anon;
revoke execute on function public.support_liste() from public, anon;
revoke execute on function public.support_detail(uuid) from public, anon;
revoke execute on function public.support_changer(uuid, text, text) from public, anon;
revoke execute on function public.support_vers_officielles(text, text, text, text) from public, anon;
revoke execute on function public.support_compteurs() from public, anon;
grant execute on function public.support_fiche(uuid) to authenticated, service_role;
grant execute on function public.support_ajouter(jsonb) to service_role;
grant execute on function public.support_mes_demandes() to authenticated;
grant execute on function public.support_posteur_action(uuid, text, text) to authenticated;
grant execute on function public.support_liste() to authenticated, service_role;
grant execute on function public.support_detail(uuid) to authenticated, service_role;
grant execute on function public.support_changer(uuid, text, text) to authenticated;
grant execute on function public.support_vers_officielles(text, text, text, text) to authenticated;
grant execute on function public.support_compteurs() to authenticated, service_role;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'support-alertes') then
    perform cron.schedule('support-alertes', '17 * * * *', $cmd$
      select net.http_post(
        url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/support',
        headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
        body := '{"action":"alertes"}'::jsonb,
        timeout_milliseconds := 60000)
    $cmd$);
  end if;
end
$c$;
