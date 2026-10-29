-- 0385 — v3 point 7 : l'agent de 7 h marque les inactifs.
--
-- 1. Inactif : un posteur actif (hors RUUL) qui a un compte en posts et
--    - aucun post publié depuis `inactif_jours_sans_post` jours (2) alors
--      que des posts étaient prévus,
--    - ET au moins `inactif_nudges_sans_reponse` nudges (2) sans réponse ni
--      résolution sur 14 jours (point 6).
--    Les deux réglages sont dans `reglages`, modifiables sur la page.
-- 2. `posteurs_inactifs` : une ligne ouverte par posteur inactif (depuis,
--    jours sans post, nudges sans réponse), fermée (`sorti_at`) quand il
--    reposte ou répond. L'agent (`inactifs_marquer`) passe chaque matin à
--    7 h (fonction `nudges`, action `agent_matin`, cron `agent-inactifs`),
--    après la mise à jour des nudges résolus.
-- 3. Le samedi, Check, Kill or Double propose Kill (« ne pas renouveler »)
--    pour chaque compte d'un inactif : nouvelle règle `inactif` (décisions :
--    Kill ou Garder). `ckd_controle` est reprise à l'identique de 0326, avec
--    ces propositions en plus.
--
-- Additive : une table, deux réglages créés s'ils manquent, la contrainte
-- de `ckd_propositions.regle` élargie à `inactif` (comme 0327), des fonctions
-- nouvelles, `ckd_controle` et `ckd_decisions_permises` réécrites à
-- signature identique.

insert into public.reglages (cle, valeur) values
  ('inactif_jours_sans_post', '2'::jsonb),
  ('inactif_nudges_sans_reponse', '2'::jsonb)
on conflict (cle) do nothing;

create table if not exists public.posteurs_inactifs (
  id                   uuid primary key default gen_random_uuid(),
  poster_id            uuid not null references public.profiles (id) on delete cascade,
  depuis               timestamptz not null default now(),
  jours_sans_post      integer not null,
  nudges_sans_reponse  integer not null,
  dernier_post_at      timestamptz,
  maj_at               timestamptz not null default now(),
  sorti_at             timestamptz
);

create unique index if not exists posteurs_inactifs_ouvert on public.posteurs_inactifs (poster_id) where sorti_at is null;

alter table public.posteurs_inactifs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posteurs_inactifs'
                  and policyname = 'posteurs_inactifs_lecture_admin') then
    create policy posteurs_inactifs_lecture_admin on public.posteurs_inactifs for select to authenticated
      using (public.is_admin());
  end if;
end
$$;

comment on table public.posteurs_inactifs is
  'Inactifs (v3, 0385) : marqués chaque matin à 7 h (sans post depuis N jours ET N nudges sans réponse), proposés en Kill le samedi.';

-- ---------------------------------------------------------------------------
-- Le calcul
-- ---------------------------------------------------------------------------

-- Les inactifs du moment, selon les deux réglages.
create or replace function public.inactifs_calculer()
returns table (poster_id uuid, jours_sans_post integer, nudges_sans_reponse integer, dernier_post_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jours integer := coalesce((select (valeur #>> '{}')::int from public.reglages where cle = 'inactif_jours_sans_post'), 2);
  v_nudges integer := coalesce((select (valeur #>> '{}')::int from public.reglages where cle = 'inactif_nudges_sans_reponse'), 2);
  v_auj date := (now() at time zone 'Europe/Paris')::date;
begin
  return query
  with posteurs as (
    select distinct c.poster_id
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id
     where c.is_active and pr.is_active and c.type_compte = 'perso'
       and c.warmup_ends_at is not null and c.warmup_ends_at <= now()
       and not coalesce(c.ugc_ai_video, false) and not coalesce(c.videos_uniquement, false)
       and not exists (select 1 from public.hub_posteurs h where h.profile_id = c.poster_id)
  ),
  stats as (
    select po.poster_id,
           (select max(p.publie_at) from public.passages p join public.comptes c on c.id = p.compte_id
             where c.poster_id = po.poster_id) as dernier,
           -- Des posts étaient prévus sur la période (sinon il n'avait rien à poster).
           exists (select 1 from public.passages p join public.comptes c on c.id = p.compte_id
                    where c.poster_id = po.poster_id and c.is_active
                      and p.date_publication_prevue between v_auj - v_jours and v_auj - 1
                      and p.statut::text <> 'brouillon' and not coalesce(p.est_rappel, false)) as prevus,
           (select count(*)::int from public.nudges n
             where n.poster_id = po.poster_id and n.reponse_at is null and n.resolu_at is null
               and n.envoye_at > now() - interval '14 days') as nudges
      from posteurs po
  )
  select s.poster_id,
         case when s.dernier is null then v_jours
              else greatest(v_auj - (s.dernier at time zone 'Europe/Paris')::date - 1, 0) end,
         s.nudges, s.dernier
    from stats s
   where s.prevus
     and (s.dernier is null or (s.dernier at time zone 'Europe/Paris')::date < v_auj - v_jours)
     and s.nudges >= v_nudges;
end;
$$;

revoke execute on function public.inactifs_calculer() from public, anon, authenticated;
grant execute on function public.inactifs_calculer() to service_role;

-- L'agent du matin : ouvre, met à jour, ferme. Rend les compteurs.
create or replace function public.inactifs_marquer()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nouveaux integer;
  v_sortis integer;
  v_total integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  create temporary table if not exists _inactifs on commit drop as select * from public.inactifs_calculer();

  update public.posteurs_inactifs i
     set sorti_at = now(), maj_at = now()
   where i.sorti_at is null
     and not exists (select 1 from _inactifs x where x.poster_id = i.poster_id);
  get diagnostics v_sortis = row_count;

  update public.posteurs_inactifs i
     set jours_sans_post = x.jours_sans_post, nudges_sans_reponse = x.nudges_sans_reponse,
         dernier_post_at = x.dernier_post_at, maj_at = now()
    from _inactifs x
   where x.poster_id = i.poster_id and i.sorti_at is null;

  insert into public.posteurs_inactifs (poster_id, jours_sans_post, nudges_sans_reponse, dernier_post_at)
  select x.poster_id, x.jours_sans_post, x.nudges_sans_reponse, x.dernier_post_at
    from _inactifs x
   where not exists (select 1 from public.posteurs_inactifs i where i.poster_id = x.poster_id and i.sorti_at is null);
  get diagnostics v_nouveaux = row_count;

  select count(*) into v_total from public.posteurs_inactifs where sorti_at is null;
  drop table if exists _inactifs;
  return jsonb_build_object('inactifs', v_total, 'nouveaux', v_nouveaux, 'sortis', v_sortis);
end;
$$;

revoke execute on function public.inactifs_marquer() from public, anon;
grant execute on function public.inactifs_marquer() to authenticated, service_role;

-- La page « Inactifs » (admin, Head of Ops).
create or replace function public.inactifs_liste()
returns table (
  poster_id           uuid,
  poster_nom          text,
  hm_prenom           text,
  depuis              timestamptz,
  jours_sans_post     integer,
  nudges_sans_reponse integer,
  dernier_post_at     timestamptz,
  maj_at              timestamptz,
  upwork_contrat_url  text,
  kill_propose        boolean,
  kill_decide         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select i.poster_id, nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), hm.prenom, i.depuis,
         i.jours_sans_post, i.nudges_sans_reponse, i.dernier_post_at, i.maj_at, pr.upwork_contrat_url,
         k.id is not null, k.decision
    from public.posteurs_inactifs i
    join public.profiles pr on pr.id = i.poster_id
    left join public.profiles hm on hm.id = pr.manager_id
    left join lateral (
      select p.id, p.decision from public.ckd_propositions p
       where p.poster_id = i.poster_id and p.regle = 'inactif' and p.jour >= (i.depuis at time zone 'Europe/Paris')::date
       order by p.jour desc limit 1
    ) k on true
   where i.sorti_at is null
   order by i.depuis;
end;
$$;

revoke execute on function public.inactifs_liste() from public, anon;
grant execute on function public.inactifs_liste() to authenticated;

-- ---------------------------------------------------------------------------
-- Le samedi : la règle « inactif »
-- ---------------------------------------------------------------------------
alter table public.ckd_propositions drop constraint if exists ckd_propositions_regle_check;
alter table public.ckd_propositions add constraint ckd_propositions_regle_check
  check (regle in ('jeudi', 'premiere_semaine', 'anciens', 'doubler', 'absent', 'inactif'));

create or replace function public.ckd_decisions_permises(p_regle text)
returns text[]
language sql
immutable
as $$
  select case p_regle
    when 'jeudi'            then array['nudge', 'recreer', 'rien']
    when 'absent'           then array['ne_pas_renouveler', 'garder']
    when 'premiere_semaine' then array['ne_pas_renouveler', 'garder']
    when 'anciens'          then array['recreer', 'ne_pas_renouveler', 'garder']
    when 'doubler'          then array['doubler', 'pas_maintenant']
    when 'inactif'          then array['ne_pas_renouveler', 'garder']
    else array[]::text[]
  end
$$;

-- Les propositions « inactif » du samedi : chaque compte actif d'un inactif,
-- sauf ceux déjà proposés en Kill par une autre règle ce jour-là.
create or replace function public.ckd_calculer_inactifs(p_ctrl uuid, p_jour date)
returns table (
  regle text, action text, compte_id uuid, poster_id uuid, hm_id uuid, pays text, langue text,
  label_id uuid, application text, donnees jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select 'inactif'::text, 'ne_pas_renouveler'::text, c.id, c.poster_id, pr.manager_id, c.pays, c.langue,
         null::uuid, public.application_principale(c.parts_applications),
         jsonb_build_object(
           'handle', c.handle_tiktok,
           'motifs', jsonb_build_array('inactif'),
           'jours_sans_post', i.jours_sans_post,
           'nudges_sans_reponse', i.nudges_sans_reponse,
           'dernier_post_at', i.dernier_post_at,
           'inactif_depuis', i.depuis)
    from public.posteurs_inactifs i
    join public.profiles pr on pr.id = i.poster_id
    join public.comptes c on c.poster_id = i.poster_id and c.is_active and c.type_compte = 'perso'
   where i.sorti_at is null
     and not exists (select 1 from public.ckd_propositions p
                      where p.controle_id = p_ctrl and p.compte_id = c.id and p.action = 'ne_pas_renouveler');
$$;

revoke execute on function public.ckd_calculer_inactifs(uuid, date) from public, anon, authenticated;
grant execute on function public.ckd_calculer_inactifs(uuid, date) to service_role;

-- 0326, à l'identique, plus les inactifs le samedi.
create or replace function public.ckd_controle(p_type text, p_jour date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date;
  v_ctrl uuid;
  v_n    integer;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'ckd_controle : réservé à l''admin';
  end if;
  v_jour := coalesce(p_jour, public.ckd_jour_controle(p_type, (now() at time zone 'Europe/Paris')::date));

  insert into public.ckd_controles as k (type, jour, lance_par)
  values (p_type, v_jour, auth.uid())
  on conflict (type, jour) do update set lance_at = now(), lance_par = excluded.lance_par
  returning k.id into v_ctrl;

  delete from public.ckd_propositions where controle_id = v_ctrl and decision is null;

  insert into public.ckd_propositions
    (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees)
  select v_ctrl, p_type, v_jour, c.regle, c.action, c.compte_id, c.poster_id, c.hm_id, c.pays, c.langue,
         c.label_id, c.application, c.donnees
    from public.ckd_calculer(p_type, v_jour) c
  on conflict (compte_id, regle, jour) do nothing;

  -- v3 (0385) : les inactifs, proposés en Kill le samedi.
  if p_type = 'samedi' then
    insert into public.ckd_propositions
      (controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees)
    select v_ctrl, p_type, v_jour, c.regle, c.action, c.compte_id, c.poster_id, c.hm_id, c.pays, c.langue,
           c.label_id, c.application, c.donnees
      from public.ckd_calculer_inactifs(v_ctrl, v_jour) c
    on conflict (compte_id, regle, jour) do nothing;
  end if;

  select count(*) into v_n from public.ckd_propositions where controle_id = v_ctrl;
  update public.ckd_controles set nb_propositions = v_n where id = v_ctrl;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : 7 h à Paris (la fonction vérifie l'heure), comme 0373.
-- ---------------------------------------------------------------------------
do $ai$
declare
  template text;
  cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'agent-inactifs') then
    perform cron.unschedule('agent-inactifs');
  end if;
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'comment-masters-synchro' then 0 when c.jobname = 'slack-relier' then 1 else 2 end
   limit 1;
  if template is null then
    raise notice 'agent-inactifs : aucun cron modèle avec secret, à planifier à la main';
    return;
  end if;
  cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/nudges', 'i');
  if position('body' in cmd) > 0 then
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                          'body := ''{"action":"agent_matin"}''::jsonb', 'i');
  end if;
  if position('agent_matin' in cmd) = 0 then
    raise notice 'agent-inactifs : réécriture de la commande échouée';
    return;
  end if;
  perform cron.schedule('agent-inactifs', '0 5,6 * * *', cmd);
end
$ai$;

notify pgrst, 'reload schema';
