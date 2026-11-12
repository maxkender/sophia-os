-- 0684 : les propositions de sources (demande d'Adrien du 12/11).
--
-- Un agent éclaireur cherche des comptes TikTok qui pourraient devenir des
-- sources, dans toutes les langues. Il ne touche jamais `comptes_reference` :
-- il dépose ses candidats ici, et un admin tranche sur la page Sources
-- (panneau « Propositions »).
--
--   sources_candidats             : un compte proposé, une seule fois (handle
--                                   unique). `sorte` : `label` (il nourrit un
--                                   label qui existe) ou `concept` (un format
--                                   qu'on n'a pas, qui pourrait faire un label
--                                   ou un podz). `piste` et `requete` disent
--                                   comment il a été trouvé.
--   sources_candidats_valider     : crée la source, pose son label et la met
--                                   dans la file des mises à jour (0669, une
--                                   source à la fois). Tout ou rien.
--   sources_candidats_decider     : refuser (avec la raison), remettre à plus
--                                   tard, ou remettre à décider.
--   sources_candidats_rendement   : la mémoire de l'agent. Par piste et par
--                                   requête : proposés, validés, refusés, et le
--                                   r réel des sources validées
--                                   (`source_performance`).
--
-- Un compte déjà source, ou déjà compte de publication, ne peut pas être
-- proposé (déclencheur à l'insertion).
--
-- ✅ Appliquée le 2026-11-12 (MCP).
--
-- Retour arrière : drop view sources_candidats_rendement ; drop function
-- sources_candidats_valider, sources_candidats_decider ; drop table
-- sources_candidats. Les sources déjà validées restent dans comptes_reference.

set lock_timeout = '5s';

create table public.sources_candidats (
  id uuid primary key default gen_random_uuid(),
  handle_tiktok text not null unique
    check (handle_tiktok = lower(handle_tiktok) and handle_tiktok !~ '[@/[:space:]]'),
  langue text not null,
  sorte text not null default 'label' check (sorte in ('label', 'concept')),
  -- Le label proposé (`label`), ou le plus proche pour un concept (peut manquer).
  label_id uuid references public.labels (id) on delete set null,
  -- Le format en quelques mots (« fautes d'orthographe », « question et réponse »).
  concept text,
  pourquoi text not null,
  risques text,
  -- 0 à 100 : l'ordre d'affichage, le plus haut d'abord.
  score integer not null default 50 check (score between 0 and 100),
  -- { posts, vues_mediane, vues_max, posts_10k, posts_100k, slides_moy, releve_le }
  chiffres jsonb not null default '{}'::jsonb,
  -- [{ url, vues, accroche }]
  exemples jsonb not null default '[]'::jsonb,
  piste text not null check (piste in ('ancien_agent', 'accroches', 'voisins', 'mots_cles', 'exploration')),
  requete text,
  statut text not null default 'propose' check (statut in ('propose', 'plus_tard', 'valide', 'refuse')),
  raison_refus text,
  decide_par uuid references auth.users (id) on delete set null,
  decide_le timestamptz,
  compte_reference_id uuid references public.comptes_reference (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_candidats_statut_idx on public.sources_candidats (statut, score desc);

comment on table public.sources_candidats is
  'Sources (0684) : les comptes TikTok proposés par l''agent éclaireur. Un admin valide (la source est créée et part dans la file des mises à jour) ou refuse, sur la page Sources.';

alter table public.sources_candidats enable row level security;
create policy sources_candidats_admin on public.sources_candidats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Le front ne fait que lire : toute décision passe par les deux fonctions.
grant select on public.sources_candidats to authenticated;
grant all on public.sources_candidats to service_role;

-- Un compte déjà connu de l'OS ne se propose pas.
create or replace function public.sources_candidats_garde()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if exists (select 1 from comptes_reference
              where lower(ltrim(btrim(handle_tiktok), '@')) = new.handle_tiktok) then
    raise exception 'sources : @% est déjà une source', new.handle_tiktok using errcode = '23505';
  end if;
  if exists (select 1 from comptes
              where lower(ltrim(btrim(handle_tiktok), '@')) = new.handle_tiktok) then
    raise exception 'sources : @% est un de nos comptes de publication', new.handle_tiktok using errcode = '23505';
  end if;
  return new;
end;
$function$;

create trigger sources_candidats_garde
  before insert on public.sources_candidats
  for each row execute function public.sources_candidats_garde();

create or replace function public.sources_candidats_valider(p_id uuid, p_label uuid, p_langue text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_candidat sources_candidats;
  v_label text;
  v_source uuid;
  v_file jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select * into v_candidat from sources_candidats where id = p_id for update;
  if v_candidat.id is null then
    raise exception 'sources : proposition introuvable';
  end if;
  if v_candidat.statut = 'valide' then
    raise exception 'sources : @% est déjà validé', v_candidat.handle_tiktok;
  end if;

  select nom into v_label from labels where id = p_label;
  if v_label is null then
    raise exception 'sources : choisis un label';
  end if;
  if coalesce(btrim(p_langue), '') = '' then
    raise exception 'sources : choisis une langue';
  end if;
  if exists (select 1 from comptes_reference
              where lower(ltrim(btrim(handle_tiktok), '@')) = v_candidat.handle_tiktok) then
    raise exception 'sources : @% est déjà une source', v_candidat.handle_tiktok;
  end if;

  insert into comptes_reference (handle_tiktok, niche, langue)
  values (v_candidat.handle_tiktok, v_label, p_langue)
  returning id into v_source;

  perform public.set_labels_source(v_source, array[p_label]);
  v_file := public.maj_sources_ajouter(v_source);

  update sources_candidats
     set statut = 'valide', label_id = p_label, langue = p_langue, raison_refus = null,
         compte_reference_id = v_source, decide_par = auth.uid(), decide_le = now(), updated_at = now()
   where id = p_id;

  return jsonb_build_object('compte_reference_id', v_source, 'handle', v_candidat.handle_tiktok,
                            'file', v_file->>'file');
end;
$function$;

comment on function public.sources_candidats_valider(uuid, uuid, text) is
  'Sources (0684) : valide une proposition. Crée la source, pose son label, la met dans la file des mises à jour (0669). Rend {compte_reference_id, handle, file: lancee | attente}.';

create or replace function public.sources_candidats_decider(p_id uuid, p_statut text, p_raison text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_statut text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;
  if p_statut not in ('refuse', 'plus_tard', 'propose') then
    raise exception 'sources : décision inconnue (%)', p_statut;
  end if;

  select statut into v_statut from sources_candidats where id = p_id for update;
  if v_statut is null then
    raise exception 'sources : proposition introuvable';
  end if;
  -- Une proposition validée est devenue une source : elle se gère dans le tableau des sources.
  if v_statut = 'valide' then
    raise exception 'sources : cette proposition est déjà validée';
  end if;

  update sources_candidats
     set statut = p_statut,
         raison_refus = case when p_statut = 'refuse' then nullif(btrim(p_raison), '') end,
         decide_par = case when p_statut = 'propose' then null else auth.uid() end,
         decide_le = case when p_statut = 'propose' then null else now() end,
         updated_at = now()
   where id = p_id;
end;
$function$;

comment on function public.sources_candidats_decider(uuid, text, text) is
  'Sources (0684) : refuse une proposition (avec la raison), la remet à plus tard, ou la remet à décider.';

revoke all on function public.sources_candidats_valider(uuid, uuid, text) from public, anon;
revoke all on function public.sources_candidats_decider(uuid, text, text) from public, anon;
grant execute on function public.sources_candidats_valider(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.sources_candidats_decider(uuid, text, text) to authenticated, service_role;

-- La mémoire de l'agent : ce que chaque piste et chaque requête ont rendu.
create or replace view public.sources_candidats_rendement
  with (security_invoker = true)
as
  select c.piste,
         coalesce(c.requete, '') as requete,
         c.langue,
         count(*) as proposes,
         count(*) filter (where c.statut = 'valide') as valides,
         count(*) filter (where c.statut = 'refuse') as refuses,
         count(sp.r_mediane) as sources_mesurees,
         round(avg(sp.r_mediane), 2) as r_moyen,
         string_agg(distinct c.raison_refus, ' · ') filter (where c.raison_refus is not null) as raisons_refus
    from public.sources_candidats c
    left join public.source_performance sp on sp.compte_reference_id = c.compte_reference_id
   group by c.piste, coalesce(c.requete, ''), c.langue;

comment on view public.sources_candidats_rendement is
  'Sources (0684) : le rendement de chaque piste et de chaque requête de l''agent éclaireur (proposés, validés, refusés, r réel des sources validées).';

grant select on public.sources_candidats_rendement to authenticated, service_role;
