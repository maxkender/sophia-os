-- 0497 — Slack relié sans nom identique ; étape 4 fidèle au dernier relevé valide ; FAQ « TikTok limite ».
--
-- 1. slack_noms_correspondent(slack, os) : tous les mots d'un nom retrouvés dans
--    l'autre (identiques, l'un commence par l'autre, ou 4 premières lettres
--    communes) avec au moins 2 mots, ou même nom de famille + prénom qui commence
--    pareil. « Jon Smith » = « Jonathan Smith », « Ana Lee » = « Ana Leeson »,
--    « Eva Berg » = « Eva Maria Berg ».
-- 2. slack_auto_relier() (cron toutes les 15 min) : un membre Slack libre est
--    relié quand son email = l'email perso (ou de login) connu, sinon quand un
--    seul posteur actif sans Slack correspond par le nom. Plusieurs candidats :
--    rien (il reste dans « Suggested links »). Une fois relié, les relances
--    Upwork prévues sont périmées (les suivantes passent par Slack).
-- 3. slack_me_relier() : « I've joined » sur le dashboard (le posteur connecté).
-- 4. compte_pret (même signature) : un « introuvable » lu par une seule méthode
--    ne remet plus une étape faite à « non fait » (il faut page ET Apify) ;
--    illisible n'a jamais compté.
-- 5. mon_warmup() : pour le dashboard : prêt (dernier relevé valide), follows,
--    Start warmup, pays.
-- 6. FAQ : « TikTok won't let me follow anyone ».
-- 7. etape_declarations + declarer_etape(etape, note) : « I've joined Slack / I
--    did this step » sur le dashboard, au cas où l'OS se trompe. Slack : l'OS
--    vérifie d'abord (slack_me_relier) ; pas trouvé : la déclaration attend la
--    confirmation de l'admin (etape_declarations_liste / etape_declaration_decider).
--
-- Additive : 1 table, 8 fonctions, 1 remplacée (même signature), 1 cron, 1 entrée de FAQ.

create or replace function public.slack_mots(p_nom text)
returns text[]
language sql
immutable
as $$
  select array_remove(regexp_split_to_array(btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_nom, ''))), '[^a-z]+', ' ', 'g')), ' '), '');
$$;

create or replace function public.slack_mot_proche(a text, b text)
returns boolean
language sql
immutable
as $$
  select a = b
      or (length(a) >= 2 and length(b) >= 2 and (a like b || '%' or b like a || '%'))
      or (length(a) >= 4 and length(b) >= 4 and left(a, 4) = left(b, 4));
$$;

create or replace function public.slack_noms_correspondent(p_slack text, p_os text)
returns boolean
language plpgsql
immutable
as $$
declare
  m text[] := public.slack_mots(p_slack);
  o text[] := public.slack_mots(p_os);
  m_ok int;
  o_ok int;
begin
  if coalesce(array_length(m, 1), 0) = 0 or coalesce(array_length(o, 1), 0) = 0 then
    return false;
  end if;
  select count(*) into m_ok from unnest(m) a where exists (select 1 from unnest(o) b where public.slack_mot_proche(a, b));
  select count(*) into o_ok from unnest(o) b where exists (select 1 from unnest(m) a where public.slack_mot_proche(a, b));
  -- Tous les mots du nom Slack dans le nom OS (au moins 2), ou l'inverse.
  if array_length(m, 1) >= 2 and m_ok = array_length(m, 1) then return true; end if;
  if array_length(o, 1) >= 2 and o_ok = array_length(o, 1) and m_ok >= 2 then return true; end if;
  -- Même nom de famille, prénom qui commence pareil (« Mary » / « Maria »).
  if array_length(m, 1) >= 2 and array_length(o, 1) >= 2
     and m[array_length(m, 1)] = o[array_length(o, 1)]
     and left(m[1], 3) = left(o[1], 3) then
    return true;
  end if;
  -- Un seul mot côté Slack (« Jonas ») : le même mot exactement dans le nom OS (pas un pseudo « jonas42 »).
  if array_length(m, 1) = 1 and length(m[1]) >= 4 and m[1] = any (o) then return true; end if;
  return false;
end;
$$;

-- Relie les membres Slack libres. p_posteur : seulement ce posteur (« I've joined »). Rend le nombre de liens.
create or replace function public.slack_relier_regles(p_posteur uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_pid uuid;
  v_par text;
  v_n int := 0;
begin
  for m in
    select sm.slack_user_id, coalesce(nullif(sm.nom_reel, ''), sm.nom_affiche) as nom, lower(sm.email) as email
      from public.slack_membres sm
     where not coalesce(sm.bot, false) and not coalesce(sm.supprime, false)
       and not exists (select 1 from public.profiles q where q.slack_user_id = sm.slack_user_id)
       -- Les arrivées récentes seulement (« I've joined » : toutes) ; les anciens restent dans « Suggested links ».
       and (p_posteur is not null or coalesce(sm.premier_vu_at, sm.vu_at) > now() - interval '14 days')
  loop
    v_pid := null;
    -- 1. L'email Slack = l'email perso (ou de login) connu.
    select pr.id into v_pid from public.profiles pr
     where pr.is_active and pr.slack_user_id is null and m.email is not null
       and (lower(pr.email_perso) = m.email or lower(pr.email) = m.email)
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and (p_posteur is null or pr.id = p_posteur)
     limit 1;
    v_par := 'email';
    -- 2. Le nom : un seul candidat possible.
    if v_pid is null then
      v_par := 'nom';
      select case when count(*) = 1 then min(pr.id::text)::uuid end into v_pid
        from public.profiles pr
       where pr.is_active and pr.slack_user_id is null
         and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
         and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
         -- Les cohortes récentes ou à venir : un seul candidat possible dans la cohorte.
         and (pr.cohorte_lundi is null or pr.cohorte_lundi >= (now() at time zone 'Europe/Paris')::date - 14)
         and public.slack_noms_correspondent(m.nom, concat_ws(' ', pr.prenom, pr.nom));
      if v_pid is not null and p_posteur is not null and v_pid <> p_posteur then
        v_pid := null;
      end if;
    end if;
    if v_pid is null then
      continue;
    end if;
    update public.profiles set slack_user_id = m.slack_user_id, slack_lie_par = v_par, slack_lie_at = now()
     where id = v_pid and slack_user_id is null;
    if found then
      v_n := v_n + 1;
      update public.relances_prevues r set statut = 'perime', raison = 'slack relié : la relance passe par Slack', maj_at = now()
       where r.poster_id = v_pid and r.statut = 'prevu' and (r.canal = 'upwork' or r.donnees ->> 'canal_relance' = 'upwork');
      perform public.recrue_evenement_noter(v_pid, null, 'slack_relie', now(),
        'Slack linked (' || v_par || ') : ' || coalesce(m.nom, m.slack_user_id), 'slack_relie:' || m.slack_user_id);
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.slack_relier_regles(uuid) from public, anon, authenticated;

create or replace function public.slack_auto_relier()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.slack_relier_regles(null);
end;
$$;
revoke all on function public.slack_auto_relier() from public, anon;
grant execute on function public.slack_auto_relier() to authenticated, service_role;

-- « I've joined » : le posteur connecté ; rend true s'il est (maintenant) relié.
create or replace function public.slack_me_relier()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  perform public.slack_relier_regles(auth.uid());
  return exists (select 1 from public.profiles p where p.id = auth.uid() and p.slack_user_id is not null);
end;
$$;
revoke all on function public.slack_me_relier() from public, anon;
grant execute on function public.slack_me_relier() to authenticated;

create or replace function public.compte_pret(p_compte uuid, p_avant timestamp with time zone default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select w.existe
       and c.warmup_started_at is not null
       and (p_avant is null or c.warmup_started_at < p_avant)
       and coalesce(w.abonnements, 0) >= 5
       and (coalesce(w.videos, 0) = 0 or w.releve_at >= public.compte_debut(c.id))
      from public.comptes c
      join lateral (
        select x.existe, x.abonnements, x.videos, x.releve_at
          from public.ckd_warmup_releves x
         where x.compte_id = c.id and x.existe is not null
           -- 0497 : « introuvable » ne compte que lu par la page ET Apify ; illisible ne compte jamais.
           and (x.existe or public.releve_methode(x.erreur) = 'page+apify')
           and (p_avant is null or x.releve_at < p_avant)
         order by x.releve_at desc
         limit 1
      ) w on true
     where c.id = p_compte), false)
  or exists (
    select 1 from public.warmup_declarations d
      join public.comptes c on c.id = d.compte_id
     where d.compte_id = p_compte and d.statut = 'valide'
       and c.warmup_started_at is not null
       and (p_avant is null or d.decide_at < p_avant));
$$;

create or replace function public.mon_warmup()
returns table (compte_id uuid, pret boolean, abonnements integer, existe boolean, releve_at timestamptz, warmup_started_at timestamptz, pays text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, public.compte_pret(c.id), w.abonnements, w.existe, w.releve_at, c.warmup_started_at, c.pays
    from public.comptes c
    left join lateral (
      select x.existe, x.abonnements, x.releve_at from public.ckd_warmup_releves x
       where x.compte_id = c.id and x.existe is not null and (x.existe or public.releve_methode(x.erreur) = 'page+apify')
       order by x.releve_at desc limit 1
    ) w on true
   where c.poster_id = auth.uid() and c.is_active and coalesce(c.type_compte, 'perso') = 'perso'
   order by c.created_at
   limit 1;
$$;
revoke all on function public.mon_warmup() from public, anon;
grant execute on function public.mon_warmup() to authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'slack-auto-relier') then
    perform cron.unschedule('slack-auto-relier');
  end if;
  perform cron.schedule('slack-auto-relier', '*/15 * * * *', 'select public.slack_auto_relier()');
end
$cron$;

do $faq$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.faq_entrees where cle = 'tiktok_follow_bloque') then
    insert into public.faq_entrees (cle, question, formulations)
    values ('tiktok_follow_bloque', 'TikTok won''t let me follow anyone',
            array['I can''t follow anybody', 'follow button reverts', 'it shows Following then Follow again',
                  'TikTok doesn''t let me follow', 'can''t warm up the account', 'follows don''t stay'])
    returning id into v_id;
    insert into public.faq_reponses (entree_id, texte)
    values (v_id, 'TikTok sometimes limits new accounts. Fill in your profile (photo, name, birthday), verify your phone in TikTok settings, watch videos on the For You page for 10–15 minutes, then follow accounts one by one (not too fast). If it still doesn''t work, wait a few hours and try again, then tell us in #questions.');
  end if;
end
$faq$;

create table if not exists public.etape_declarations (
  poster_id uuid not null references public.profiles(id),
  etape text not null check (etape in ('slack', 'tiktok', 'warmup')),
  note text,
  declare_at timestamptz not null default now(),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'refuse')),
  decide_par uuid,
  decide_at timestamptz,
  primary key (poster_id, etape)
);
alter table public.etape_declarations enable row level security;

-- Le posteur connecté : « I did this step ». Slack : vérifié tout de suite ; relié → validé.
create or replace function public.declarer_etape(p_etape text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relie boolean := false;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_etape not in ('slack', 'tiktok', 'warmup') then
    raise exception 'étape inconnue';
  end if;
  if p_etape = 'slack' then
    v_relie := public.slack_me_relier();
  end if;
  insert into public.etape_declarations (poster_id, etape, note, statut, decide_at)
  values (auth.uid(), p_etape, nullif(btrim(p_note), ''), case when v_relie then 'valide' else 'en_attente' end, case when v_relie then now() end)
  on conflict (poster_id, etape) do update
    set note = coalesce(excluded.note, etape_declarations.note), declare_at = now(),
        statut = case when v_relie then 'valide' when etape_declarations.statut = 'valide' then 'valide' else 'en_attente' end,
        decide_at = case when v_relie then now() else etape_declarations.decide_at end;
  perform public.recrue_evenement_noter(auth.uid(), null, 'etape_declaree', now(),
    'Dashboard: « I did this step » (' || p_etape || ')' || case when v_relie then ' : Slack linked' else ' : to confirm' end,
    'etape_declaree:' || p_etape || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  return case when v_relie then 'relie' else 'en_attente' end;
end;
$$;
revoke all on function public.declarer_etape(text, text) from public, anon;
grant execute on function public.declarer_etape(text, text) to authenticated;

create or replace function public.mes_declarations()
returns table (etape text, statut text, declare_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.etape, d.statut, d.declare_at from public.etape_declarations d where d.poster_id = auth.uid();
$$;
revoke all on function public.mes_declarations() from public, anon;
grant execute on function public.mes_declarations() to authenticated;

-- L'admin : les déclarations à confirmer, avec les membres Slack libres qui pourraient être la personne.
create or replace function public.etape_declarations_liste()
returns table (poster_id uuid, nom text, cohorte_lundi date, etape text, note text, declare_at timestamptz, statut text, candidats jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('head_of_ops', 'hiring_manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select d.poster_id, concat_ws(' ', p.prenom, p.nom), p.cohorte_lundi, d.etape, d.note, d.declare_at, d.statut,
         case when d.etape = 'slack' then (
           select coalesce(jsonb_agg(jsonb_build_object('slack_user_id', sm.slack_user_id, 'nom', coalesce(nullif(sm.nom_reel, ''), sm.nom_affiche), 'vu', sm.premier_vu_at)
                                     order by sm.premier_vu_at desc), '[]'::jsonb)
             from public.slack_membres sm
            where not coalesce(sm.bot, false) and not coalesce(sm.supprime, false)
              and not exists (select 1 from public.profiles q where q.slack_user_id = sm.slack_user_id)
              and sm.premier_vu_at > now() - interval '14 days') end
    from public.etape_declarations d
    join public.profiles p on p.id = d.poster_id and p.is_active
   where d.statut = 'en_attente'
   order by d.declare_at;
end;
$$;
revoke all on function public.etape_declarations_liste() from public, anon;
grant execute on function public.etape_declarations_liste() to authenticated;

-- Confirmer (avec le membre Slack choisi pour l'étape Slack) ou refuser une déclaration.
create or replace function public.etape_declaration_decider(p_poster uuid, p_etape text, p_valide boolean, p_slack text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('head_of_ops', 'hiring_manager'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_valide and p_etape = 'slack' and p_slack is not null then
    if exists (select 1 from public.profiles q where q.slack_user_id = p_slack and q.id <> p_poster) then
      raise exception 'Ce compte Slack est déjà relié à un autre posteur';
    end if;
    update public.profiles set slack_user_id = p_slack, slack_lie_par = 'manuel', slack_lie_at = now(), slack_lie_auteur = auth.uid()
     where id = p_poster;
    update public.relances_prevues r set statut = 'perime', raison = 'slack relié : la relance passe par Slack', maj_at = now()
     where r.poster_id = p_poster and r.statut = 'prevu' and (r.canal = 'upwork' or r.donnees ->> 'canal_relance' = 'upwork');
  end if;
  update public.etape_declarations set statut = case when p_valide then 'valide' else 'refuse' end, decide_par = auth.uid(), decide_at = now()
   where poster_id = p_poster and etape = p_etape;
end;
$$;
revoke all on function public.etape_declaration_decider(uuid, text, boolean, text) from public, anon;
grant execute on function public.etape_declaration_decider(uuid, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
