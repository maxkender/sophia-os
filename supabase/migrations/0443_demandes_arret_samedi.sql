-- 0443 — Décisions finales, partie 1 : plus aucun Kill ni fin de contrat automatique.
--
-- - Une demande d'arrêt (« I want to stop », « STOP », un message classé « stop »,
--   un persona refusé, ou Max depuis Onboarding posters) n'arrête plus rien :
--   elle coupe les relances et met la personne dans la masterlist du samedi,
--   Kill pré-coché, avec la raison (`demandes_arret`). Seul « Validate » du
--   samedi désactive et ferme (file `arrets`) ; l'arrêt clôt la demande.
--   Keep / Postpone le samedi : la demande est classée « garder ».
-- - Le freelance a fermé le contrat lui-même (le contrat n'est plus rendu
--   actif par Upwork) : on désactive seulement le posteur et ses comptes
--   (`contrats_termines_desactiver`, appelée par la fonction upwork après une
--   lecture complète des contrats).
--
-- Additive : 1 table, 6 fonctions, 2 déclencheurs, samedi_recrues complétée
-- (même signature). Aucune donnée existante modifiée.

create table if not exists public.demandes_arret (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null references public.profiles(id) on delete cascade,
  source      text not null check (source in ('bouton', 'message', 'persona', 'manuel')),
  raison      text,
  reponse_id  uuid unique references public.posteur_reponses(id) on delete set null,
  demande_at  timestamptz not null default now(),
  demande_par uuid references auth.users(id) on delete set null,
  decision    text check (decision in ('kill', 'garder', 'contrat_termine')),
  decide_at   timestamptz,
  decide_par  uuid references auth.users(id) on delete set null
);
comment on table public.demandes_arret is
  'Décisions finales (0443) : une demande d''arrêt coupe les relances et attend le samedi (Kill pré-coché). Seul Validate arrête.';
create unique index if not exists demandes_arret_ouverte on public.demandes_arret (poster_id) where decision is null;

alter table public.demandes_arret enable row level security;
drop policy if exists demandes_arret_admin_lecture on public.demandes_arret;
create policy demandes_arret_admin_lecture on public.demandes_arret for select to authenticated using (public.is_admin());

-- Une demande d'arrêt : une seule ouverte par posteur (la suivante est ignorée).
create or replace function public.demande_arret_noter(
  p_poster uuid, p_source text, p_raison text default null, p_reponse uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_id uuid;
begin
  if not (v_service or public.is_admin() or current_user = 'postgres') then
    raise exception 'demande_arret_noter : réservé à l''admin' using errcode = '42501';
  end if;
  if exists (select 1 from public.hub_posteurs h where h.profile_id = p_poster) then
    return false;
  end if;
  insert into public.demandes_arret (poster_id, source, raison, reponse_id, demande_par)
  values (p_poster, p_source, left(nullif(btrim(coalesce(p_raison, '')), ''), 500), p_reponse,
          case when v_service then null else auth.uid() end)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  insert into public.recrue_evenements (poster_id, type, at, detail, cle)
  values (p_poster, 'demande_arret', now(),
          'Demande d''arrêt (' || p_source || ') : relances coupées, Kill pré-coché le samedi'
            || coalesce(' : ' || left(btrim(p_raison), 200), ''),
          v_id::text)
  on conflict (poster_id, type, cle) do nothing;
  return true;
end;
$$;
revoke all on function public.demande_arret_noter(uuid, text, text, uuid) from public, anon;
grant execute on function public.demande_arret_noter(uuid, text, text, uuid) to authenticated, service_role;

-- « I want to stop » (bouton Slack) et « STOP » écrit seul : la demande est notée
-- tout de suite, même quand le classement des réponses est sur off.
create or replace function public.posteur_reponses_stop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.canal = 'bouton' and coalesce(new.source_id, '') ~ '(^|:)posteur_stop$' then
    perform public.demande_arret_noter(new.poster_id, 'bouton', 'I want to stop (button)', new.id);
  elsif coalesce(new.texte, '') ~* '^\s*(stop|i want to stop|i want to quit)\s*[.!]*\s*$' then
    perform public.demande_arret_noter(new.poster_id, 'message', new.texte, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists posteur_reponses_stop on public.posteur_reponses;
create trigger posteur_reponses_stop after insert on public.posteur_reponses
  for each row execute function public.posteur_reponses_stop();

-- L'arrêt est parti (Validate du samedi, ou un arrêt à la main) : la demande est close.
create or replace function public.arrets_clore_demande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.demandes_arret
     set decision = 'kill', decide_at = now(), decide_par = new.demande_par
   where poster_id = new.poster_id and decision is null;
  return new;
end;
$$;
drop trigger if exists arrets_clore_demande on public.arrets;
create trigger arrets_clore_demande after insert on public.arrets
  for each row execute function public.arrets_clore_demande();

-- Les demandes ouvertes (la masterlist du samedi, la page Onboarding posters).
create or replace function public.demandes_arret_ouvertes()
returns table (poster_id uuid, source text, raison text, demande_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'demandes_arret_ouvertes : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  select d.poster_id, d.source, d.raison, d.demande_at
    from public.demandes_arret d
   where d.decision is null
   order by d.demande_at;
end;
$$;
revoke all on function public.demandes_arret_ouvertes() from public, anon;
grant execute on function public.demandes_arret_ouvertes() to authenticated, service_role;

-- Keep (ou Postpone) le samedi : la demande est classée, les relances reprennent.
create or replace function public.demande_arret_garder(p_poster uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'demande_arret_garder : réservé à l''admin' using errcode = '42501';
  end if;
  update public.demandes_arret
     set decision = 'garder', decide_at = now(), decide_par = auth.uid()
   where poster_id = p_poster and decision is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function public.demande_arret_garder(uuid) from public, anon;
grant execute on function public.demande_arret_garder(uuid) to authenticated;

-- Le samedi, les recrues : celles de la cohorte suivante relancées sans réaction
-- (comme avant), plus toute recrue d'une cohorte pas commencée qui a demandé à arrêter.
create or replace function public.samedi_recrues(p_lundi date)
returns table (
  poster_id uuid, nom text, hm_nom text, pays text, compte_id uuid, handle text, cohorte_lundi date,
  connecte boolean, tiktok_trouve boolean, start_warmup boolean, abonnements integer, relances integer,
  derniere_relance timestamptz, repondu_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'samedi_recrues : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  return query
  with dem as (
    select d.poster_id from public.demandes_arret d where d.decision is null
  ),
  r as (
    select e.* from public.etapes_recrues_v2() e
     where not coalesce(e.deuxieme, false)
       and ((e.cohorte_lundi = p_lundi + 7 and not coalesce(e.pret, false))
            or (e.cohorte_lundi > p_lundi and e.poster_id in (select dem.poster_id from dem)))
  ),
  n as (
    select nu.poster_id, count(*)::int as relances, max(nu.envoye_at) as derniere
      from public.nudges nu
     where nu.poster_id in (select r.poster_id from r)
       and nu.type in ('relance', 'connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait', 'jeudi_recrue')
       and nu.envoye_at >= p_lundi
       and (nu.slack_erreur is null or coalesce(array_length(nu.canaux, 1), 0) > 0)
     group by nu.poster_id
  )
  select r.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), nullif(btrim(concat_ws(' ', hm.prenom, hm.nom)), ''),
         r.pays, r.compte_id, r.handle, r.cohorte_lundi,
         r.premiere_connexion_at is not null, coalesce(r.tiktok_existe, false), r.warmup_started_at is not null, r.abonnements,
         coalesce(n.relances, 0), n.derniere, r.repondu_at
    from r
    left join n on n.poster_id = r.poster_id
    join public.profiles pr on pr.id = r.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where r.poster_id in (select dem.poster_id from dem)
      or (n.poster_id is not null and (r.repondu_at is null or r.repondu_at < n.derniere));
end;
$$;

-- Le freelance a fermé le contrat lui-même : le posteur et ses comptes sont
-- désactivés, rien d'autre (ni message, ni Slack, ni Upwork). Seulement les
-- contrats qui viennent de quitter la liste des contrats actifs (lecture complète).
create or replace function public.contrats_termines_desactiver(p_contrats text[])
returns table (poster_id uuid, nom text, contrat_id text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v record;
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres') then
    raise exception 'contrats_termines_desactiver : réservé à la fonction upwork' using errcode = '42501';
  end if;
  for v in
    select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.upwork_contract_id::text as contrat
      from public.profiles pr
     where pr.is_active
       and pr.upwork_contract_id::text = any (p_contrats)
       and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = pr.id)
       and not exists (select 1 from public.contrats_test t where t.contrat_id = pr.upwork_contract_id::text and t.retire_at is null)
       and not exists (select 1 from public.upwork_contrats u where u.contrat_id = pr.upwork_contract_id::text and u.actif)
  loop
    update public.profiles set is_active = false where id = v.id;
    update public.comptes set is_active = false where poster_id = v.id;
    update public.relances_prevues
       set statut = 'ecarte', raison = 'contrat_termine', maj_at = now()
     where poster_id = v.id and statut in ('prevu', 'main');
    update public.demandes_arret
       set decision = 'contrat_termine', decide_at = now()
     where poster_id = v.id and decision is null;
    insert into public.recrue_evenements (poster_id, type, at, detail, cle)
    values (v.id, 'contrat_termine_freelance', now(),
            'Contrat ' || v.contrat || ' fermé côté Upwork (pas par l''OS) : posteur et comptes désactivés', v.contrat)
    on conflict (poster_id, type, cle) do nothing;
    poster_id := v.id;
    nom := v.nom;
    contrat_id := v.contrat;
    return next;
  end loop;
end;
$$;
revoke all on function public.contrats_termines_desactiver(text[]) from public, anon, authenticated;
grant execute on function public.contrats_termines_desactiver(text[]) to service_role;

notify pgrst, 'reload schema';
