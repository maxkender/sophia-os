-- 0480 — Un seul profil de posteur par contrat Upwork, vérifié en base.
--
-- Cas du 31/10 : Karolina Jurackova (contrat 44804526), 2 profils créés à 41 s
-- d'écart par le formulaire HM (même session d'Olizhia, 2 envois) ; puis
-- contrats_relier a relié les DEUX au contrat, d'après la même URL.
--
-- 1. poster_creation_reserver(contrat, par) : appelée par manage-users avant de
--    créer quoi que ce soit (formulaire HM comme onboarding de l'OS).
--    - un posteur actif a déjà ce contrat (n° relié, ou dans l'URL saisie) →
--      { statut: 'existe', poster_id } : rien n'est créé ;
--    - une autre création du même contrat est en cours (moins de 3 min) →
--      { statut: 'en_cours' } : refusée ;
--    - sinon le contrat est réservé → { statut: 'ok' }.
--    Un verrou par contrat (pg_advisory_xact_lock) : deux appels simultanés
--    passent l'un après l'autre, le 2e voit le 1er.
-- 2. poster_creation_terminer(contrat, poster) : la réservation est levée.
-- 3. contrats_relier : ne relie jamais un contrat déjà tenu par un autre
--    posteur actif, ni le même contrat à deux profils dans un même passage
--    (le plus ancien gagne).
--
-- Additive : 1 table, 3 fonctions, contrats_relier réécrite à une ancre vérifiée.

create table if not exists public.poster_creations (
  contrat_id text primary key,
  par text,
  debut_at timestamptz not null default now(),
  poster_id uuid,
  fin_at timestamptz
);
alter table public.poster_creations enable row level security;

create or replace function public.contrat_de_url(p_url text)
returns text
language sql
immutable
as $$
  select substring(btrim(coalesce(p_url, '')) from '/(?:workroom|contracts?)/([0-9]{6,})');
$$;

create or replace function public.poster_creation_reserver(p_contrat text, p_par text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existant record;
  v_ok boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_contrat is null or p_contrat !~ '^[0-9]{6,}$' then
    return jsonb_build_object('statut', 'ok');
  end if;
  perform pg_advisory_xact_lock(hashtext('poster_creation:' || p_contrat));
  select pr.id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), '') as nom, pr.email, pr.manager_id
    into v_existant
    from public.profiles pr
   where pr.is_active
     and (pr.upwork_contract_id = p_contrat or public.contrat_de_url(pr.upwork_contrat_url) = p_contrat)
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'poster')
   order by pr.created_at
   limit 1;
  if found then
    return jsonb_build_object('statut', 'existe', 'poster_id', v_existant.id, 'nom', v_existant.nom,
                              'email', v_existant.email, 'hm_id', v_existant.manager_id);
  end if;
  insert into public.poster_creations as pc (contrat_id, par, debut_at, poster_id, fin_at)
  values (p_contrat, p_par, now(), null, null)
  on conflict (contrat_id) do update set par = excluded.par, debut_at = now(), poster_id = null, fin_at = null
   where pc.fin_at is not null or pc.debut_at < now() - interval '3 minutes'
  returning true into v_ok;
  if v_ok is null then
    return jsonb_build_object('statut', 'en_cours', 'par', (select pc.par from public.poster_creations pc where pc.contrat_id = p_contrat));
  end if;
  return jsonb_build_object('statut', 'ok');
end;
$$;
revoke all on function public.poster_creation_reserver(text, text) from public, anon, authenticated;
grant execute on function public.poster_creation_reserver(text, text) to service_role;

create or replace function public.poster_creation_terminer(p_contrat text, p_poster uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.poster_creations set poster_id = p_poster, fin_at = now() where contrat_id = p_contrat and fin_at is null;
$$;
revoke all on function public.poster_creation_terminer(text, uuid) from public, anon, authenticated;
grant execute on function public.poster_creation_terminer(text, uuid) to service_role;

do $p$
declare
  v_def text := pg_get_functiondef('public.contrats_relier(boolean)'::regprocedure);
  v_ancre text := $a$     where not p_simuler and c.cid is not null and pr.id = c.id and pr.upwork_contract_id is null$a$;
begin
  if position('poster_creation' in v_def) > 0 or position('0480' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0480 : contrats_relier : ancre introuvable ou en double';
  end if;
  execute replace(v_def, v_ancre, v_ancre || $a$
       -- 0480 : un seul profil par contrat : jamais un contrat déjà tenu, le plus ancien gagne.
       and not exists (select 1 from public.profiles x where x.upwork_contract_id = c.cid and x.is_active and x.id <> c.id)
       and not exists (select 1 from c c2 join public.profiles p2 on p2.id = c2.id
                        where c2.cid = c.cid and c2.id <> c.id and (p2.created_at, p2.id) < (pr.created_at, pr.id))$a$);
end;
$p$;

notify pgrst, 'reload schema';
