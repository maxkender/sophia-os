-- 0446 — Prompt 25, mises à jour, point 1 : plus de « To approve », tout part
-- automatiquement, avec des freins.
--
-- - nudges : la raison du message (les données utilisées, en clair) et ces
--   données ; l'expéditeur (compte d'Adrien, de Max, ou la HM) ; le contrôle
--   fait après coup (l'étape était-elle déjà faite au moment de l'envoi ?).
-- - freins_envoi : un type de message mis en pause (plafond par heure dépassé,
--   ou plus de 20 % des destinataires d'un envoi avaient déjà fait l'étape).
--   Tant qu'un frein est ouvert, ce type ne part plus ; Max le lève en haut
--   d'Overview (« Resume »).
-- - Réglage freins_envoi : plafond_heure (40), part_deja_faite (20 %).
-- - relances_controle_apres_coup() : le contrôle, une fois par message.
-- - messages_envoyes et onboarding_posteurs montrent la raison et l'expéditeur.
--
-- Additive : 5 colonnes, 1 table, 3 fonctions, 1 réglage, 2 fonctions
-- complétées. Aucune donnée existante modifiée.

alter table public.nudges add column if not exists raison text;
alter table public.nudges add column if not exists donnees jsonb;
alter table public.nudges add column if not exists expediteur text;
alter table public.nudges add column if not exists controle_at timestamptz;
alter table public.nudges add column if not exists controle_deja_fait boolean;
comment on column public.nudges.raison is
  'Prompt 25 MAJ (0446) : pourquoi le message est parti, en clair (« pas connectée depuis le 29/10 »).';
comment on column public.nudges.expediteur is
  'Prompt 25 MAJ (0446) : secours (compte d''Adrien), principal (compte de Max), hm, slack.';

create table if not exists public.freins_envoi (
  id       uuid primary key default gen_random_uuid(),
  type     text not null,
  motif    text not null check (motif in ('plafond_heure', 'deja_fait')),
  detail   text,
  cree_at  timestamptz not null default now(),
  leve_at  timestamptz,
  leve_par uuid references auth.users(id) on delete set null
);
comment on table public.freins_envoi is
  'Prompt 25 MAJ (0446) : un type de message en pause (plafond par heure, ou étape déjà faite chez plus de 20 % des destinataires).';
create unique index if not exists freins_envoi_ouvert on public.freins_envoi (type) where leve_at is null;
alter table public.freins_envoi enable row level security;
drop policy if exists freins_envoi_lecture on public.freins_envoi;
create policy freins_envoi_lecture on public.freins_envoi for select to authenticated using (public.is_admin());

insert into public.reglages (cle, valeur)
values ('freins_envoi', jsonb_build_object('plafond_heure', 40, 'part_deja_faite', 20))
on conflict (cle) do nothing;

-- Max lève le frein : le type repart (sans rattrapage : ce qui était dû pendant la pause ne part pas).
create or replace function public.frein_lever(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin_strict() then
    raise exception 'frein_lever : réservé à l''admin' using errcode = '42501';
  end if;
  update public.freins_envoi set leve_at = now(), leve_par = auth.uid() where id = p_id and leve_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function public.frein_lever(uuid) from public, anon;
grant execute on function public.frein_lever(uuid) to authenticated;

-- Le contrôle après coup : pour chaque relance partie il y a 30 min à 6 h, pas
-- encore contrôlée, une des choses qu'elle demandait était-elle déjà faite au
-- moment de l'envoi ? Rend, par envoi (l'heure de départ), combien de
-- destinataires et combien l'avaient déjà fait.
create or replace function public.relances_controle_apres_coup()
returns table (envoi timestamptz, type text, destinataires integer, deja_fait integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user = 'postgres') then
    raise exception 'relances_controle_apres_coup : réservé à recrues-check' using errcode = '42501';
  end if;
  return query
  with a as (
    select n.id, n.type, n.envoye_at, n.poster_id,
           coalesce(array(select jsonb_array_elements_text(n.donnees -> 'elements')), array[]::text[]) as el
      from public.nudges n
     where n.type in ('relance', 'handle', 'handle_upwork')
       and n.controle_at is null
       and n.envoye_at between now() - interval '6 hours' and now() - interval '30 minutes'
       and coalesce(array_length(n.canaux, 1), 0) > 0
  ),
  c as (
    select a.id, a.type, a.envoye_at,
           (('connexion' = any (a.el) and pr.premiere_connexion_at < a.envoye_at)
            or ('slack' = any (a.el) and pr.slack_lie_at < a.envoye_at)
            or ('warmup' = any (a.el) and exists (select 1 from public.comptes co
                 where co.poster_id = a.poster_id and co.warmup_started_at < a.envoye_at))
            or (('tiktok' = any (a.el) or a.type in ('handle', 'handle_upwork')) and exists (
                 select 1 from public.ckd_warmup_releves x join public.comptes co on co.id = x.compte_id
                  where co.poster_id = a.poster_id and x.existe and x.releve_at < a.envoye_at
                    and lower(x.handle) = lower(co.handle_tiktok)))
            or ('follows' = any (a.el) and exists (
                 select 1 from public.ckd_warmup_releves x join public.comptes co on co.id = x.compte_id
                  where co.poster_id = a.poster_id and x.abonnements >= 5 and x.releve_at < a.envoye_at))) as deja
      from a join public.profiles pr on pr.id = a.poster_id
  ),
  m as (
    update public.nudges n set controle_at = now(), controle_deja_fait = c.deja
      from c where n.id = c.id
    returning n.type, date_trunc('hour', n.envoye_at) as envoi, c.deja
  )
  select m.envoi, m.type, count(*)::int, (count(*) filter (where m.deja))::int
    from m group by 1, 2;
end;
$$;
revoke all on function public.relances_controle_apres_coup() from public, anon, authenticated;
grant execute on function public.relances_controle_apres_coup() to service_role;

-- Messages sent : la raison (ou l'erreur) et l'expéditeur.
do $me$
declare
  v_def text := pg_get_functiondef('public.messages_envoyes(timestamptz)'::regprocedure);
  v_avant text := $q$           n.texte, n.slack_erreur as detail,$q$;
  v_apres text := $q$           n.texte, coalesce(n.slack_erreur, concat_ws(' · ', n.raison,
             case n.expediteur when 'secours' then 'Upwork : compte d''Adrien' when 'principal' then 'Upwork : compte de Max'
                               when 'hm' then 'Upwork : envoyé par la HM' end)) as detail,$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0446 : messages_envoyes, bloc nudges introuvable'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$me$;

-- La carte de la recrue : la raison et l'expéditeur de chaque message.
do $op$
declare
  v_def text := pg_get_functiondef('public.onboarding_posteurs()'::regprocedure);
  v_avant text := $q$'canaux', n.canaux, 'texte', n.texte,$q$;
  v_apres text := $q$'canaux', n.canaux, 'texte', n.texte, 'raison', n.raison, 'expediteur', n.expediteur,$q$;
begin
  if position(v_avant in v_def) = 0 then raise exception '0446 : onboarding_posteurs, messages introuvables'; end if;
  execute replace(v_def, v_avant, v_apres);
end;
$op$;

notify pgrst, 'reload schema';
