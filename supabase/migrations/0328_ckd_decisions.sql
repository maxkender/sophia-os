-- 0328 : Check, Kill or Double, PR 2 : les décisions.
--
-- POURQUOI. 0326 et 0327 calculaient les propositions sans rien faire. Ici,
-- l'admin décide sur la page, l'OS exécute, et le HM de la zone est prévenu
-- dans #managers-hq (fonction Edge `ckd`).
--
-- CE QUE FAIT CHAQUE DÉCISION.
--   * Kill (ne pas renouveler) : la case `comptes.non_renouveler` est cochée,
--     avec la raison, la date et l'admin. Le compte poste jusqu'au dimanche et
--     s'arrête à 23 h 30 (heure de Paris), avant les posts du lundi. Décidé un
--     lundi avant 10 h, il s'arrête tout de suite. Un posteur qui n'a plus aucun
--     compte actif est désactivé, comme avec le bouton « Désactiver » des
--     Posters ; un posteur à deux comptes garde l'autre.
--   * Recréer : la fonction `ckd` crée le nouveau compte (manage-users,
--     répartition habituelle, même application), puis `ckd_compte_cree` note la
--     recréation (`ckd_recreations`) et l'ancien compte s'arrête le dimanche
--     soir, quand le nouveau démarre.
--   * Doubler : la fonction `ckd` crée le 2ᵉ compte (label différent du 1ᵉʳ,
--     même application), puis `ckd_compte_cree` le relie à la proposition.
--   * Nudge : le pop-up habituel (`compte_nudges`), texte en anglais réglable
--     (`reglages.ckd_nudges`).
--   * Garder, Pas maintenant, Rien : la décision est notée ; la même règle ne
--     repropose pas le compte pendant 14 jours (déjà dans `ckd_calculer`).
--   Recréer et Doubler ne passent que par la fonction `ckd` (création du
--   compte) ; le reste se décide en SQL depuis la page.
--
-- ANNULER. Garder, Pas maintenant, Rien et Kill s'annulent tant que rien n'est
-- parti au HM et que le compte n'est pas arrêté. Un nudge est déjà chez le
-- posteur, un compte créé existe : pas d'annulation.
--
-- TÂCHES PLANIFIÉES (UTC ; les fonctions vérifient l'heure de Paris) :
--   * `ckd-arrets`, toutes les heures à la demie : arrête les comptes dont
--     l'heure est passée (dimanche 23 h 30) ;
--   * `ckd-envoi-dimanche`, dimanche 12 h : ce qui est décidé et pas encore
--     envoyé part aux HMs ;
--   * `ckd-rappel-lundi`, lundi 9 h : rappel des jalons dans le fil du samedi.
--
-- HIRED (Notion) : un compte arrêté par Check, Kill or Double ne compte plus.
-- Les autres dormants restent comptés, comme Aram l'a demandé (0282).
--
-- Retour arrière : `cron.unschedule` des trois tâches, remettre la vue de 0285,
-- retirer les fonctions de ce fichier, la table `ckd_arrets`, les réglages
-- `ckd_nudges` et `ckd_slack` et les colonnes ajoutées.

set lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------
alter table public.ckd_propositions
  add column if not exists nouveau_compte_id uuid,
  -- ID Slack de qui a cliqué Done.
  add column if not exists fait_par text,
  -- Le message Slack de la zone qui porte la décision (et son bouton Done).
  add column if not exists slack_ts text,
  add column if not exists erreur text;

alter table public.ckd_controles
  add column if not exists slack_canal text,
  -- Le message principal du contrôle : le récap, dont le fil porte les zones.
  add column if not exists slack_ts text,
  add column if not exists slack_erreur text,
  add column if not exists rappel_at timestamptz;

alter table public.comptes
  add column if not exists non_renouveler_raison text;

comment on column public.comptes.non_renouveler_raison is
  'Pourquoi le compte n''est pas renouvelé (ex. « ckd:absent »). Vide quand la case vient de la page Surveillance.';

-- ---------------------------------------------------------------------------
-- Arrêts programmés
-- ---------------------------------------------------------------------------
create table if not exists public.ckd_arrets (
  compte_id      uuid primary key,
  proposition_id uuid,
  raison         text not null check (raison in ('ne_pas_renouveler', 'recreer')),
  prevu_at       timestamptz not null,
  fait_at        timestamptz,
  annule_at      timestamptz,
  decide_par     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists ckd_arrets_a_faire on public.ckd_arrets (prevu_at)
  where fait_at is null and annule_at is null;

comment on table public.ckd_arrets is
  'Comptes à arrêter (is_active = false) par Check, Kill or Double, à l''heure prévue. Voir 0328.';

alter table public.ckd_arrets enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ckd_arrets'
                  and policyname = 'ckd_arrets lecture admin') then
    create policy "ckd_arrets lecture admin" on public.ckd_arrets
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.ckd_arrets from public, anon, authenticated;
grant select on public.ckd_arrets to authenticated;
grant all on public.ckd_arrets to service_role;

-- ---------------------------------------------------------------------------
-- Réglages : textes des nudges (en anglais, pour les posteurs) et Slack
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur)
values (
  'ckd_nudges',
  jsonb_build_object(
    'reveil', jsonb_build_object(
      'titre', 'Your first posts need a boost',
      'corps', 'None of the first posts on @{handle} has taken off yet. Check the posting time, the first slide '
               || 'and the sound, and publish everything planned this week: your first week is what we look at.'),
    'surveiller', jsonb_build_object(
      'titre', 'One of your first posts got almost no views',
      'corps', 'One of the first posts on @{handle} stayed almost without views. It happens: keep an eye on the '
               || 'first slide and the posting time, and keep publishing everything planned.'),
    'discipline', jsonb_build_object(
      'titre', 'Some posts are missing',
      'corps', 'Some posts planned for @{handle} were not published, or their TikTok link was not pasted in the '
               || 'OS. Publish what is waiting in your calendar and paste each link.'),
    'absent', jsonb_build_object(
      'titre', 'We haven''t seen your posts this week',
      'corps', 'Most of the posts planned for @{handle} this week were not published, or their link was not '
               || 'pasted in the OS. Publish what is waiting in your calendar and paste each link, or tell your '
               || 'manager if something is blocking you.')
  )
)
on conflict (cle) do nothing;

insert into public.reglages (cle, valeur)
values ('ckd_slack', jsonb_build_object('canal', 'C0BL0084Y3F'))
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------------

-- Les décisions possibles pour chaque règle (même liste que la page).
create or replace function public.ckd_decisions_permises(p_regle text)
returns text[]
language sql
immutable
as $$
  select case p_regle
    when 'jeudi'            then array['nudge', 'rien']
    when 'absent'           then array['ne_pas_renouveler', 'nudge', 'garder']
    when 'premiere_semaine' then array['ne_pas_renouveler', 'recreer', 'garder']
    when 'anciens'          then array['recreer', 'ne_pas_renouveler', 'garder']
    when 'doubler'          then array['doubler', 'pas_maintenant']
    else array[]::text[]
  end
$$;

-- L'heure d'arrêt d'un compte décidé à `p_at` : le dimanche 23 h 30 (Paris)
-- qui suit. Un Kill décidé un lundi avant 10 h part tout de suite : les jalons
-- de la semaine ne sont pas encore financés.
create or replace function public.ckd_prochain_arret(p_at timestamptz, p_kill boolean)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_local timestamp := p_at at time zone 'Europe/Paris';
  v_dimanche date;
  v_arret timestamptz;
begin
  if p_kill and extract(isodow from v_local) = 1 and v_local::time < time '10:00' then
    return p_at;
  end if;
  v_dimanche := v_local::date + (7 - extract(isodow from v_local)::int);
  v_arret := (v_dimanche + time '23:30') at time zone 'Europe/Paris';
  if v_arret <= p_at then
    v_arret := (v_dimanche + 7 + time '23:30') at time zone 'Europe/Paris';
  end if;
  return v_arret;
end;
$$;

-- Arrête les comptes dont l'heure est passée. Un posteur sans plus aucun compte
-- actif est désactivé (comme `activer` de manage-users).
create or replace function public.ckd_arreter_comptes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select a.compte_id, c.poster_id
      from public.ckd_arrets a
      join public.comptes c on c.id = a.compte_id
     where a.fait_at is null and a.annule_at is null and a.prevu_at <= now()
     for update of a skip locked
  loop
    update public.comptes set is_active = false where id = r.compte_id;
    update public.ckd_arrets set fait_at = now() where compte_id = r.compte_id;
    if not exists (select 1 from public.comptes c where c.poster_id = r.poster_id and c.is_active) then
      update public.profiles set is_active = false where id = r.poster_id and is_active;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Le nudge d'une proposition : un motif par paragraphe, le titre du premier.
create or replace function public.ckd_texte_nudge(p_regle text, p_motifs text[], p_handle text,
                                                  out titre text, out corps text, out modele text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_textes jsonb := coalesce((select valeur from public.reglages where cle = 'ckd_nudges'), '{}'::jsonb);
  v_motifs text[];
  m text;
begin
  v_motifs := case when p_regle = 'absent' then array['absent']
                   else array(select x from unnest(array['reveil', 'surveiller', 'discipline']) x
                               where x = any(coalesce(p_motifs, array[]::text[]))) end;
  if cardinality(v_motifs) = 0 then
    v_motifs := array['discipline'];
  end if;
  modele := 'ckd_' || v_motifs[1];
  titre := coalesce(v_textes->v_motifs[1]->>'titre', 'A message from your team');
  foreach m in array v_motifs loop
    if v_textes->m->>'corps' is not null then
      corps := concat_ws(E'\n\n', corps, v_textes->m->>'corps');
    end if;
  end loop;
  corps := replace(coalesce(corps, ''), '{handle}', coalesce(p_handle, ''));
  titre := replace(titre, '{handle}', coalesce(p_handle, ''));
end;
$$;

-- Décider. Appelée par la page (admin) pour tout sauf Recréer et Doubler, et
-- par la fonction `ckd` (service_role, `p_par` = l'admin) pour ces deux-là :
-- elle ne fait alors que réserver la proposition avant la création du compte.
create or replace function public.ckd_decider(p_id uuid, p_decision text, p_note text default null,
                                              p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_par uuid;
  p public.ckd_propositions%rowtype;
  v_prevu timestamptz;
  v_nudge record;
  v_motifs text[];
begin
  if not v_service and not public.is_admin() then
    raise exception 'ckd_decider : réservé à l''admin';
  end if;
  v_par := case when v_service then p_par else auth.uid() end;
  if p_decision in ('recreer', 'doubler') and not v_service then
    raise exception 'ckd_decider : % crée un compte et passe par la fonction ckd', p_decision;
  end if;

  select * into p from public.ckd_propositions where id = p_id for update;
  if not found then
    raise exception 'ckd_decider : proposition introuvable';
  end if;
  if p.decision is not null then
    raise exception 'ckd_decider : déjà décidé (%)', p.decision;
  end if;
  if not (p_decision = any(public.ckd_decisions_permises(p.regle))) then
    raise exception 'ckd_decider : % impossible pour la règle %', p_decision, p.regle;
  end if;

  update public.ckd_propositions
     set decision = p_decision, decision_par = v_par, decision_at = now(),
         note = nullif(btrim(coalesce(p_note, '')), ''), erreur = null
   where id = p_id;

  if p_decision = 'ne_pas_renouveler' then
    update public.comptes
       set non_renouveler = true, non_renouveler_at = now(), non_renouveler_par = v_par,
           non_renouveler_raison = 'ckd:' || p.regle
     where id = p.compte_id;
    v_prevu := public.ckd_prochain_arret(now(), true);
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'ne_pas_renouveler', v_prevu, v_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
    if v_prevu <= now() then
      perform public.ckd_arreter_comptes();
    end if;
  elsif p_decision = 'nudge' then
    v_motifs := array(select jsonb_array_elements_text(coalesce(p.donnees->'motifs', '[]'::jsonb)));
    select * into v_nudge from public.ckd_texte_nudge(p.regle, v_motifs, p.donnees->>'handle');
    insert into public.compte_nudges (compte_id, modele_id, titre, corps, envoye_par)
    values (p.compte_id, v_nudge.modele, v_nudge.titre, v_nudge.corps, v_par);
  end if;

  return jsonb_build_object('id', p_id, 'decision', p_decision, 'arret_at', v_prevu);
end;
$$;

-- Le compte de Recréer ou Doubler est créé (fonction `ckd`) : on le relie, et
-- pour Recréer on note la recréation et on programme l'arrêt de l'ancien.
create or replace function public.ckd_compte_cree(p_id uuid, p_compte uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_compte_cree : réservé à la fonction ckd';
  end if;
  select * into p from public.ckd_propositions where id = p_id for update;
  if not found or p.decision not in ('recreer', 'doubler') then
    raise exception 'ckd_compte_cree : proposition introuvable ou pas en Recréer / Doubler';
  end if;
  update public.ckd_propositions set nouveau_compte_id = p_compte, erreur = null where id = p_id;
  if p.decision = 'recreer' then
    insert into public.ckd_recreations (poster_id, ancien_compte_id, nouveau_compte_id, regle, proposition_id, decide_par)
    values (p.poster_id, p.compte_id, p_compte, p.regle, p_id, p.decision_par);
    insert into public.ckd_arrets as a (compte_id, proposition_id, raison, prevu_at, decide_par)
    values (p.compte_id, p_id, 'recreer', public.ckd_prochain_arret(now(), false), p.decision_par)
    on conflict (compte_id) do update
      set proposition_id = excluded.proposition_id, raison = excluded.raison, prevu_at = excluded.prevu_at,
          decide_par = excluded.decide_par, annule_at = null
      where a.fait_at is null;
  end if;
end;
$$;

-- La création du compte a échoué : la proposition redevient libre, avec l'erreur.
create or replace function public.ckd_liberer(p_id uuid, p_erreur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ckd_liberer : réservé à la fonction ckd';
  end if;
  update public.ckd_propositions
     set decision = null, decision_par = null, decision_at = null, erreur = left(p_erreur, 500)
   where id = p_id and decision in ('recreer', 'doubler') and nouveau_compte_id is null;
end;
$$;

-- Annuler une décision tant que rien n'est parti ni arrêté.
create or replace function public.ckd_annuler(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.ckd_propositions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ckd_annuler : réservé à l''admin';
  end if;
  select * into p from public.ckd_propositions where id = p_id for update;
  if not found or p.decision is null then
    raise exception 'ckd_annuler : rien à annuler';
  end if;
  if p.decision not in ('garder', 'pas_maintenant', 'rien', 'ne_pas_renouveler') then
    raise exception 'ckd_annuler : % ne s''annule pas', p.decision;
  end if;
  if p.envoye_at is not null then
    raise exception 'ckd_annuler : déjà envoyé au HM';
  end if;
  if p.decision = 'ne_pas_renouveler' then
    if exists (select 1 from public.ckd_arrets a where a.compte_id = p.compte_id and a.fait_at is not null
                 and a.proposition_id = p_id) then
      raise exception 'ckd_annuler : le compte est déjà arrêté';
    end if;
    update public.ckd_arrets set annule_at = now()
     where compte_id = p.compte_id and proposition_id = p_id and fait_at is null;
    update public.comptes
       set non_renouveler = false, non_renouveler_at = null, non_renouveler_par = null, non_renouveler_raison = null
     where id = p.compte_id and non_renouveler_raison like 'ckd:%';
  end if;
  update public.ckd_propositions
     set decision = null, decision_par = null, decision_at = null, note = null
   where id = p_id;
end;
$$;

-- Le bouton « Envoyer les nudges » : toutes les propositions de nudge du
-- contrôle encore sans décision.
create or replace function public.ckd_envoyer_nudges(p_controle uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  if not public.is_admin() then
    raise exception 'ckd_envoyer_nudges : réservé à l''admin';
  end if;
  for r in
    select id from public.ckd_propositions
     where controle_id = p_controle and action = 'nudge' and decision is null
  loop
    perform public.ckd_decider(r.id, 'nudge');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.ckd_decisions_permises(text) from public, anon;
revoke all on function public.ckd_prochain_arret(timestamptz, boolean) from public, anon;
revoke all on function public.ckd_arreter_comptes() from public, anon, authenticated;
revoke all on function public.ckd_texte_nudge(text, text[], text) from public, anon, authenticated;
revoke all on function public.ckd_decider(uuid, text, text, uuid) from public, anon;
revoke all on function public.ckd_compte_cree(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ckd_liberer(uuid, text) from public, anon, authenticated;
revoke all on function public.ckd_annuler(uuid) from public, anon;
revoke all on function public.ckd_envoyer_nudges(uuid) from public, anon;
grant execute on function public.ckd_decisions_permises(text) to authenticated, service_role;
grant execute on function public.ckd_prochain_arret(timestamptz, boolean) to authenticated, service_role;
grant execute on function public.ckd_arreter_comptes() to service_role;
grant execute on function public.ckd_texte_nudge(text, text[], text) to service_role;
grant execute on function public.ckd_decider(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.ckd_compte_cree(uuid, uuid) to service_role;
grant execute on function public.ckd_liberer(uuid, text) to service_role;
grant execute on function public.ckd_annuler(uuid) to authenticated, service_role;
grant execute on function public.ckd_envoyer_nudges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hired : un compte arrêté par Check, Kill or Double ne compte plus
-- ---------------------------------------------------------------------------
create or replace view public.hired_pays_application
with (security_invoker = true) as
select
  c.pays,
  case
    when c.parts_applications is null then 'sophia'
    when (
      select count(*) from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0
    ) = 1 then (
      select e.key from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0 limit 1
    )
    else null  -- compte partagé entre applications : le job doit s'arrêter
  end as application,
  count(*)::int as hired
from public.comptes c
join public.profiles p on p.id = c.poster_id
where coalesce(c.type_compte, '') <> 'cm'
  and c.pays is not null
  and p.is_active
  and not exists (
    select 1 from public.ckd_arrets a
     where a.compte_id = c.id and a.fait_at is not null and a.annule_at is null
  )
group by 1, 2;

comment on view public.hired_pays_application is
  'Comptes TikTok par (pays × application) pour la colonne Hired de Notion. Warm-ups et dormants INCLUS, comptes des créateurs désactivés EXCLUS (0285), comptes arrêtés par Check, Kill or Double EXCLUS (0328), compte marque (cm) et comptes sans pays exclus. application NULL = compte partagé entre apps : anomalie, le job s''arrête.';

-- ---------------------------------------------------------------------------
-- Tâches planifiées
-- ---------------------------------------------------------------------------
do $ckd$
declare
  template text;
  cmd text;
  j record;
begin
  if exists (select 1 from cron.job where jobname = 'ckd-arrets') then
    perform cron.unschedule('ckd-arrets');
  end if;
  -- À la demie de chaque heure : 23 h 30 à Paris tombe juste, été comme hiver.
  perform cron.schedule('ckd-arrets', '30 * * * *', 'select public.ckd_arreter_comptes()');

  -- Les deux autres appellent la fonction `ckd` : on recopie l'URL et l'en-tête
  -- x-cron-secret d'un cron existant, sans jamais écrire le secret ici.
  select c.command into template
    from cron.job c
   where position('x-cron-secret' in c.command) > 0
     and position('functions/v1/' in c.command) > 0
   order by case when c.jobname = 'comment-masters' then 0 else 1 end
   limit 1;
  if template is null then
    raise notice 'ckd : aucun cron modèle avec secret, envoi du dimanche et rappel du lundi à planifier à la main';
    return;
  end if;

  for j in
    select * from (values
      ('ckd-envoi-dimanche', '0 10,11 * * 0', 'envoi_auto'),
      ('ckd-rappel-lundi',   '0 7,8 * * 1',   'rappel_lundi')
    ) as v(nom, quand, action)
  loop
    if exists (select 1 from cron.job where jobname = j.nom) then
      perform cron.unschedule(j.nom);
    end if;
    cmd := regexp_replace(template, 'functions/v1/[a-z0-9-]+', 'functions/v1/ckd', 'i');
    cmd := regexp_replace(cmd, 'body\s*:=\s*''[^'']*''::jsonb',
                          format('body := ''{"action":"%s"}''::jsonb', j.action), 'i');
    if position('functions/v1/ckd' in cmd) = 0 or position(j.action in cmd) = 0 then
      raise notice 'ckd : réécriture de la commande de % échouée', j.nom;
      continue;
    end if;
    perform cron.schedule(j.nom, j.quand, cmd);
  end loop;
end
$ckd$;

notify pgrst, 'reload schema';
