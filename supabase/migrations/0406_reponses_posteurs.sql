-- 0406 — Système du 2 nov., partie E : l'OS lit les messages des posteurs et
-- y répond.
--
-- Ramasser (dans `posteur_reponses`, 0402) :
--   - les DM au bot Slack (slack-faq, `reponse_noter_slack`) ;
--   - les boutons « Done » / « I need help » / « I want to stop » sous les
--     messages Slack de l'OS (slack-interactions) ;
--   - les conversations Upwork : 2 fois par jour (cron « reponses-upwork »,
--     8 h 45 et 15 h 45 UTC), seulement les posteurs ciblés (un message de
--     l'OS sur Upwork ces 14 derniers jours, ou un Kill en attente).
-- Classer (cron « reponses », toutes les 10 minutes, recrues-check action
-- « reponses ») : IA, seuil 0,8 ; puis le cas : arrêt (partie C), réponse
-- depuis le guide, renvoi vers Slack, liste « Questions de paie », pause
-- (7 jours au plus), liste « À lire ». 1 réponse automatique par message
-- reçu, 3 par posteur et par jour.
-- Interrupteur `reponses_auto` : off | test | on, défaut test (le cas est
-- noté, la réponse « simulée », rien ne part, ni arrêt ni pause).
--
-- Additive : colonnes nouvelles, une table, réglages, fonctions, deux crons
-- clonés (sans écrire de secret). Aucune donnée existante modifiée.
-- Retour arrière : cron.unschedule('reponses'), cron.unschedule('reponses-upwork') ;
-- drop des fonctions reponse_noter_slack, reponses_liste, reponse_corriger,
-- reponses_cibles_upwork ; drop table posteur_pauses ; drop des colonnes
-- ajoutées à posteur_reponses ; delete des réglages reponses_*, reponse_texte_*.

insert into public.reglages (cle, valeur) values
  ('reponses_auto', to_jsonb('test'::text)),
  ('reponses_reglages', jsonb_build_object('seuil', 0.8, 'max_jour', 3, 'pause_max_jours', 7)),
  ('reponse_texte_upwork', to_jsonb('Thanks! For anything about the work, please ask on Slack: {slack}.'::text)),
  ('reponse_texte_augmentation', to_jsonb('The rate is fixed.'::text)),
  ('reponse_texte_propre_compte', to_jsonb('Please use the account your dashboard gives you.'::text)),
  -- Vide : pas de message quand le posteur dit qu'il est absent (seulement la pause).
  ('reponse_texte_absent', to_jsonb(''::text))
on conflict (cle) do nothing;

alter table public.posteur_reponses
  add column if not exists statut          text not null default 'a_classer'
                                           check (statut in ('a_classer', 'classe', 'erreur')),
  add column if not exists cas             text check (cas in ('stop', 'travail', 'paie', 'absent', 'a_lire', 'accuse')),
  add column if not exists cas_ia          text,
  add column if not exists confiance       numeric,
  add column if not exists sous_cas        text,
  add column if not exists liste           text check (liste in ('paie', 'a_lire')),
  add column if not exists reponse_texte   text,
  -- simule (test) | envoye | erreur | limite (3 par jour atteint) | aucune
  add column if not exists reponse_statut  text,
  add column if not exists reponse_at      timestamptz,
  -- arret | pause | null ; en test : arret_simule | pause_simulee
  add column if not exists action          text,
  add column if not exists erreur          text,
  add column if not exists traite_at       timestamptz,
  add column if not exists lu_at           timestamptz,
  add column if not exists lu_par          uuid references auth.users (id) on delete set null,
  add column if not exists corrige_cas     text,
  add column if not exists corrige_par     uuid references auth.users (id) on delete set null,
  add column if not exists corrige_at      timestamptz;

create index if not exists posteur_reponses_a_classer on public.posteur_reponses (recu_at) where statut = 'a_classer';

-- Pause des relances (malade, absent) : 7 jours au plus.
create table if not exists public.posteur_pauses (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null references public.profiles (id) on delete cascade,
  debut       timestamptz not null default now(),
  jusqu_au    timestamptz not null,
  reponse_id  uuid references public.posteur_reponses (id) on delete set null,
  raison      text,
  created_at  timestamptz not null default now()
);

create index if not exists posteur_pauses_poster on public.posteur_pauses (poster_id, jusqu_au desc);

comment on table public.posteur_pauses is
  'Système du 2 nov., partie E (0406) : relances, messages et Kill automatique en pause (malade, absent), 7 jours au plus.';

alter table public.posteur_pauses enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posteur_pauses'
                  and policyname = 'posteur_pauses lecture') then
    create policy "posteur_pauses lecture" on public.posteur_pauses
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.posteur_pauses from public, anon, authenticated;
grant select on public.posteur_pauses to authenticated;
grant all on public.posteur_pauses to service_role;

-- Un DM au bot (slack-faq) : la ligne, et ses nudges « répondus » (comme 0384).
create or replace function public.reponse_noter_slack(p_slack_user text, p_ts text, p_texte text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poster uuid;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'reponse_noter_slack : réservé à slack-faq';
  end if;
  select id into v_poster from public.profiles where slack_user_id = p_slack_user limit 1;
  if v_poster is null then
    return null;
  end if;
  insert into public.posteur_reponses (poster_id, canal, source_id, texte)
  values (v_poster, 'slack', p_ts, left(coalesce(p_texte, ''), 4000))
  on conflict (canal, source_id) where source_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.reponse_noter_slack(text, text, text) from public, anon, authenticated;
grant execute on function public.reponse_noter_slack(text, text, text) to service_role;

-- Les posteurs dont on lit la conversation Upwork : un message de l'OS sur
-- Upwork ces 14 derniers jours (relance, accueil), ou un Kill en attente ; et
-- le dernier message déjà lu (on ne relit que ce qui est plus récent).
create or replace function public.reponses_cibles_upwork()
returns table (poster_id uuid, contrat_id text, organisation_id text, depuis timestamptz)
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
  with cibles as (
    select n.poster_id, min(n.envoye_at) as premier from public.nudges n
     where n.canal = 'upwork' and n.envoye_at > now() - interval '14 days'
     group by n.poster_id
    union all
    select a.poster_id, a.message_at from public.accueils a
     where a.poster_id is not null and a.message_at > now() - interval '14 days'
    union all
    select k.poster_id, k.message_at from public.kills_auto k where k.statut = 'en_attente'
  )
  select pr.id, pr.upwork_contract_id, uc.organisation_id,
         greatest(min(c.premier),
                  coalesce((select max(x.recu_at) from public.posteur_reponses x
                             where x.poster_id = pr.id and x.canal = 'upwork'), '-infinity'::timestamptz))
    from cibles c
    join public.profiles pr on pr.id = c.poster_id
    left join public.upwork_contrats uc on uc.contrat_id = pr.upwork_contract_id
   where pr.upwork_contract_id is not null
   group by pr.id, pr.upwork_contract_id, uc.organisation_id;
end;
$$;

revoke execute on function public.reponses_cibles_upwork() from public, anon, authenticated;
grant execute on function public.reponses_cibles_upwork() to service_role;

-- La page « Réponses » (admin et Head of Ops) : les messages reçus.
create or replace function public.reponses_liste(p_depuis timestamptz)
returns table (
  id             uuid,
  poster_id      uuid,
  poster_nom     text,
  hm_prenom      text,
  canal          text,
  texte          text,
  recu_at        timestamptz,
  statut         text,
  cas            text,
  cas_ia         text,
  confiance      numeric,
  sous_cas       text,
  liste          text,
  reponse_texte  text,
  reponse_statut text,
  action         text,
  erreur         text,
  lu_at          timestamptz,
  corrige_cas    text,
  upwork_contrat_url text
)
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
  select x.id, x.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom,
         x.canal, x.texte, x.recu_at, x.statut, x.cas, x.cas_ia, x.confiance, x.sous_cas, x.liste,
         x.reponse_texte, x.reponse_statut, x.action, x.erreur, x.lu_at, x.corrige_cas, pr.upwork_contrat_url
    from public.posteur_reponses x
    join public.profiles pr on pr.id = x.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
   where x.recu_at >= p_depuis or (x.liste is not null and x.lu_at is null)
   order by x.recu_at desc
   limit 500;
end;
$$;

revoke execute on function public.reponses_liste(timestamptz) from public, anon;
grant execute on function public.reponses_liste(timestamptz) to authenticated;

-- « Mauvais cas » : le bon cas, noté (pour revoir le classement) ; « Lu » :
-- sort des listes « À lire » et « Questions de paie ». Rien n'est renvoyé au posteur.
create or replace function public.reponse_corriger(p_id uuid, p_cas text, p_lu boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'reponse_corriger : réservé à l''admin et au Head of Ops';
  end if;
  if p_cas is not null and p_cas not in ('stop', 'travail', 'paie', 'absent', 'a_lire', 'accuse') then
    raise exception 'reponse_corriger : cas %', p_cas;
  end if;
  update public.posteur_reponses
     set corrige_cas = coalesce(p_cas, corrige_cas),
         corrige_par = case when p_cas is not null then auth.uid() else corrige_par end,
         corrige_at = case when p_cas is not null then now() else corrige_at end,
         lu_at = case when p_lu then coalesce(lu_at, now()) else lu_at end,
         lu_par = case when p_lu then coalesce(lu_par, auth.uid()) else lu_par end
   where id = p_id;
  if not found then
    raise exception 'reponse_corriger : message introuvable';
  end if;
end;
$$;

revoke execute on function public.reponse_corriger(uuid, text, boolean) from public, anon;
grant execute on function public.reponse_corriger(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Les crons, clonés (même adresse, même secret, déjà en base) : seule
-- l'action change.
-- ---------------------------------------------------------------------------
do $cron$
declare
  v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'recrues-check';
  if v_cmd is null then
    raise notice 'reponses : cron recrues-check introuvable, cron non créé';
  else
    v_cmd := regexp_replace(v_cmd, '"action"\s*:\s*"verifier"', '"action":"reponses"');
    if exists (select 1 from cron.job where jobname = 'reponses') then
      perform cron.unschedule('reponses');
    end if;
    perform cron.schedule('reponses', '*/10 * * * *', v_cmd);
  end if;

  select command into v_cmd from cron.job where jobname = 'upwork-verifier';
  if v_cmd is null then
    raise notice 'reponses-upwork : cron upwork-verifier introuvable, cron non créé';
  else
    v_cmd := regexp_replace(v_cmd, '"action"\s*:\s*"verifier"', '"action":"reponses_lire"');
    if exists (select 1 from cron.job where jobname = 'reponses-upwork') then
      perform cron.unschedule('reponses-upwork');
    end if;
    perform cron.schedule('reponses-upwork', '45 8,15 * * *', v_cmd);
  end if;
end
$cron$;

notify pgrst, 'reload schema';
