-- 0772 : une source neuve s'importe tout de suite (décision d'Adrien du 19/11 :
-- « si je mets un compte à importer, il est importé immédiatement ; c'est sur
-- l'essai et la mise à jour de la semaine que ça se lisse »).
--
-- Avant : le premier import d'une source passait par la séquence des mises à
-- jour (0669, 0686) : une source à la fois, la suivante seulement quand la file
-- d'import était vide (20 à 30 minutes de nettoyage et de notes par source), et
-- une source lancée pendant qu'autre chose tournait attendait le lot du
-- lendemain (6 h 37). Le 19/11 : @mondorunning part, le compte suivant attend
-- ses 21 posts en cours, le troisième est renvoyé au lendemain.
--
-- Désormais :
--   * `maj_sources_ajouter` ne lance plus de séquence : elle pose l'essai (ou
--     pas : label neuf, 0721, 0766), inscrit la source « à lancer » et réveille
--     la fonction d'import. Elle répond toujours `file: lancee`.
--   * `sources_neuves_prendre()` donne à la fonction d'import UNE source à
--     lancer (trois relevés de profil au plus en même temps) ; la fonction
--     relève le profil et enfile ses slideshows sans attendre que la file soit
--     vide, puis `sources_neuves_finir` note le relevé fait
--     (`urls_ajoutees`, inutilisée jusqu'ici). Un relevé raté repart 10 minutes
--     plus tard, 5 essais au plus (`bleo_sources_decisions.essais`) ; au-delà,
--     la source repart avec le lot du matin, comme une mise à jour.
--   * cron `sources-neuves`, chaque minute : le filet.
--   * `bleo_sources_lot` et la file (`sources_file`) ne comptent plus ces
--     sources dans l'attente du lot ; `sources_file` les rend à part (`neuves`)
--     avec ce qui leur reste en traitement, pour l'onglet « En import ».
-- La séquence (une source à la fois, file vidée entre chaque, `lot_max` par
-- jour) reste le chemin des mises à jour de la semaine. `bible_lancer_batch`
-- n'est pas touchée : sa jonction à la séquence ne se déclenche plus (toutes les
-- sources reviennent « lancee »).
--
-- À appliquer APRÈS le déploiement de la fonction `import-contenu` (elle doit
-- connaître `{ sourcesNeuves: true }`), sinon une source ajoutée entre-temps ne
-- serait relevée par personne.
--
-- ✅ Appliquée le 2026-11-19 (MCP).
--
-- Retour arrière : `select cron.unschedule('sources-neuves')` ;
-- `maj_sources_ajouter` de 0766 (corps complet : 0686 + 0721, 0725, 0766),
-- `bleo_sources_lot` de 0686, `sources_file` de 0686 + 0698. La colonne et
-- les deux fonctions `sources_neuves_*` peuvent rester.

set lock_timeout = '5s';

-- 1. Les essais du premier import.
alter table public.bleo_sources_decisions add column if not exists essais integer not null default 0;

comment on column public.bleo_sources_decisions.essais is
  'Sources (0772) : combien de fois le relevé du profil d''une source neuve (raison « ajout ») a été tenté. 0 : jamais pris par le chemin immédiat. À 5, il n''est plus relancé seul : la source repart avec le lot du matin.';
comment on column public.bleo_sources_decisions.urls_ajoutees is
  'Sources (0772) : pour une source neuve (raison « ajout »), le nombre de slideshows enfilés par le relevé de son profil. Nul : relevé pas encore fait.';

-- 2. Une source neuve à lancer, pour la fonction d'import.
create or replace function public.sources_neuves_prendre()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_en_cours integer;
  r record;
begin
  -- Un seul appel à la fois compte puis prend.
  perform pg_advisory_xact_lock(hashtext('sources_neuves_prendre'));

  -- Un dernier essai resté sans réponse (fonction coupée) : c'est un échec, le lot du matin reprendra la source.
  update bleo_sources_decisions
     set lancee_le = null, echec = 'relevé du profil interrompu', echec_le = now()
   where raison = 'ajout' and semaine >= v_semaine - 7 and essais >= 5
     and urls_ajoutees is null and echec is null and lancee_le <= now() - interval '6 minutes';

  -- Trois relevés de profil au plus en même temps : chacun retient une invocation pendant tout l'appel Apify.
  select count(*) into v_en_cours
    from bleo_sources_decisions d
   where d.raison = 'ajout' and d.semaine >= v_semaine - 7
     and d.essais >= 1 and d.urls_ajoutees is null and d.echec is null
     and d.lancee_le > now() - interval '6 minutes';
  if v_en_cours >= 3 then
    return null;
  end if;

  select d.semaine, d.compte_reference_id, cr.handle_tiktok, cr.langue into r
    from bleo_sources_decisions d
    join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
   where d.raison = 'ajout' and d.semaine >= v_semaine - 7 and d.essais < 5
     -- Pas une vieille ligne : la source a été rejugée un lundi depuis, elle suit les mises à jour.
     and not exists (select 1 from bleo_sources_decisions d2
                      where d2.compte_reference_id = d.compte_reference_id and d2.semaine > d.semaine)
     and (
       -- à lancer (10 minutes après un échec),
       (d.lancee_le is null and (d.echec_le is null or d.echec_le < now() - interval '10 minutes'))
       -- ou prise par ce chemin et restée sans réponse (fonction coupée en plein relevé).
       or (d.essais >= 1 and d.urls_ajoutees is null and d.echec is null and d.lancee_le <= now() - interval '6 minutes'))
   order by d.essais, cr.created_at
   limit 1
   for update of d skip locked;
  if r.compte_reference_id is null then
    return null;
  end if;

  update bleo_sources_decisions
     set lancee_le = now(), essais = essais + 1, echec = null, echec_le = null
   where semaine = r.semaine and compte_reference_id = r.compte_reference_id;
  return jsonb_build_object('id', r.compte_reference_id, 'handle', r.handle_tiktok, 'langue', r.langue);
end;
$function$;

comment on function public.sources_neuves_prendre() is
  'Sources (0772) : donne à la fonction d''import une source neuve à lancer (la plus ancienne en attente), ou rien : trois relevés de profil au plus en même temps, 10 minutes après un échec, 5 essais au plus. Rend {id, handle, langue}.';

revoke all on function public.sources_neuves_prendre() from public, anon, authenticated;
grant execute on function public.sources_neuves_prendre() to service_role;

-- Le relevé est fait : tant de slideshows enfilés.
create or replace function public.sources_neuves_finir(p_compte uuid, p_enfilees integer)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update bleo_sources_decisions d
     set urls_ajoutees = greatest(coalesce(p_enfilees, 0), 0), echec = null, echec_le = null
   where d.compte_reference_id = p_compte and d.raison = 'ajout'
     and d.semaine = (select max(semaine) from bleo_sources_decisions where compte_reference_id = p_compte);
$function$;

comment on function public.sources_neuves_finir(uuid, integer) is
  'Sources (0772) : la fonction d''import note que le relevé du profil d''une source neuve est fait, et combien de slideshows il a enfilés.';

revoke all on function public.sources_neuves_finir(uuid, integer) from public, anon, authenticated;
grant execute on function public.sources_neuves_finir(uuid, integer) to service_role;

-- 3. Le filet : chaque minute, la fonction d'import regarde s'il reste une source neuve à lancer.
--    Même appel que les workers de la file (URL, secret du coffre), seul le corps change.
do $cron$
declare
  v_commande text;
begin
  select command into v_commande from cron.job where jobname = 'import-contenu-drain-1';
  if v_commande is null then
    raise exception '0772 : cron import-contenu-drain-1 introuvable, impossible de copier son appel';
  end if;
  v_commande := regexp_replace(v_commande, $re$body\s*:=\s*'[^']*'::jsonb$re$, $new$body:='{"sourcesNeuves":true}'::jsonb$new$, 'i');
  if position('"sourcesNeuves":true' in v_commande) = 0 then
    raise exception '0772 : le corps de l''appel n''a pas pu être remplacé';
  end if;
  perform cron.unschedule('sources-neuves') where exists (select 1 from cron.job where jobname = 'sources-neuves');
  perform cron.schedule('sources-neuves', '* * * * *', v_commande);
end
$cron$;

-- 4. Ajouter une source : l'essai, puis « à lancer ». Plus de séquence, plus d'attente.
create or replace function public.maj_sources_ajouter(p_compte uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_essai integer := coalesce((reg->>'essai_posts')::integer, 30);
  v_essai_pose integer;
  v_reveils integer := coalesce(nullif(current_setting('sophia.sources_neuves_reveils', true), '')::integer, 0);
  v_appel text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;
  if not exists (select 1 from comptes_reference where id = p_compte and is_active) then
    raise exception 'sources : source introuvable ou inactive';
  end if;

  -- L'essai : seulement pour une source qui n'a encore rien en stock et jamais été jugée,
  update comptes_reference
     set essai_max = v_essai, essai_depuis = now()
   where id = p_compte and v_essai > 0 and essai_max is null and essai_verdict is null
     and not exists (select 1 from contenus c where c.compte_reference_id = p_compte)
     -- 0721 : dans un label déjà porté par des comptes (sinon l'essai ne serait jamais jugé),
     and exists (select 1 from compte_reference_labels crl
                   join compte_labels cl on cl.label_id = crl.label_id
                  where crl.compte_reference_id = p_compte)
     -- 0766 : et pas dans un label créé depuis moins de `label_neuf_jours` (5) jours.
     and not exists (select 1 from compte_reference_labels crl
                       join labels l on l.id = crl.label_id
                      where crl.compte_reference_id = p_compte
                        and l.created_at > now() - make_interval(days => greatest(0, coalesce((reg->>'label_neuf_jours')::integer, 5))));
  select essai_max into v_essai_pose from comptes_reference where id = p_compte;

  -- 0772 : « à lancer ». La fonction d'import la prend tout de suite (`sources_neuves_prendre`),
  -- sans séquence et sans attendre que la file soit vide.
  insert into bleo_sources_decisions (semaine, compte_reference_id, posts, decision, raison)
  values (v_semaine, p_compte, 0, 'peu_de_mesures', 'ajout')
  on conflict (semaine, compte_reference_id) do update
     set decision = 'peu_de_mesures', raison = 'ajout', lancee_le = null,
         echec = null, echec_le = null, essais = 0, urls_ajoutees = null;

  -- On réveille la fonction d'import (l'appel part à la fin de la transaction), trois fois au plus par
  -- transaction : un batch de 50 comptes n'ouvre pas 50 invocations, les relevés s'enchaînent seuls.
  -- Un réveil raté n'est pas grave : le cron de la minute passe derrière.
  if v_reveils < 3 then
    begin
      select command into v_appel from cron.job where jobname = 'sources-neuves';
      if v_appel is not null then
        execute v_appel;
        perform set_config('sophia.sources_neuves_reveils', (v_reveils + 1)::text, true);
      end if;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('file', 'lancee', 'essai_max', v_essai_pose);
end;
$function$;

comment on function public.maj_sources_ajouter(uuid) is
  'Sources (0669, 0686, 0721, 0766, 0772) : une source ajoutée part tout de suite. Neuve, dans un label porté par des comptes et créé depuis plus de `label_neuf_jours` (5) jours, elle est mise en essai (ses 30 posts les plus vus) ; sinon 100 posts au plus. Elle est inscrite « à lancer » et la fonction d''import la prend aussitôt, sans séquence. Rend {file: lancee, essai_max}.';

-- 5. Le lot du matin : les mises à jour de la semaine, et les sources neuves dont le relevé a raté 5 fois.
create or replace function public.bleo_sources_lot(p_forcer boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_paris timestamp := now() at time zone 'Europe/Paris';
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_lot_max integer := greatest(1, coalesce((reg->>'lot_max')::integer, 6));
  v_npj integer := greatest(0, coalesce((reg->>'nouvelles_par_jour')::integer, 2));
  v_lancees integer;
  v_ids uuid[];
  v_comptes jsonb;
  v_demarrage jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'bleo : réservé aux admins' using errcode = '42501';
  end if;
  if not p_forcer and extract(hour from v_paris) <> 6 then
    return jsonb_build_object('ignore', 'pas 6 h à Paris');
  end if;
  if (select valeur->>'statut' from reglages where cle = 'maj_sources_run') = 'running' then
    return jsonb_build_object('lot', 'attend : une mise à jour est en cours');
  end if;

  select count(*) into v_lancees from bleo_sources_decisions
   where raison = 'ajout' and (lancee_le at time zone 'Europe/Paris')::date = v_paris::date;

  select array_agg(id order by neuve, rang) into v_ids
    from (select d.compte_reference_id as id, (d.raison = 'ajout') as neuve,
                 row_number() over (partition by (d.raison = 'ajout')
                                    order by case when d.raison = 'ajout' then cr.created_at end,
                                             d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang
            from bleo_sources_decisions d
            join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
           where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null
             -- 0772 : une source neuve part seule, tout de suite ; elle ne vient ici qu'après 5 relevés ratés.
             and not (d.raison = 'ajout' and d.essais < 5)) z
   where (not neuve and rang <= v_lot_max) or (neuve and rang <= greatest(v_npj - v_lancees, 0));

  if v_ids is null then
    return jsonb_build_object('lot', 'rien à lancer');
  end if;

  select jsonb_agg(jsonb_build_object('id', cr.id, 'handle', cr.handle_tiktok, 'langue', cr.langue)
                   order by array_position(v_ids, cr.id))
    into v_comptes
    from comptes_reference cr where cr.id = any (v_ids);

  v_demarrage := public.maj_sources_demarrer(v_comptes);
  if v_demarrage->>'action' = 'deja' then
    return jsonb_build_object('lot', 'attend : une mise à jour est en cours');
  end if;

  update bleo_sources_decisions set lancee_le = now()
   where semaine = v_semaine and compte_reference_id = any (v_ids);

  return jsonb_build_object(
    'lot', 'lancé',
    'sources', (select jsonb_agg(c->>'handle') from jsonb_array_elements(v_comptes) c),
    'restent', (select count(*) from bleo_sources_decisions d
                 where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null
                   and not (d.raison = 'ajout' and d.essais < 5))
  );
end;
$function$;

-- 6. La file, vue des écrans : l'attente du lot sans les sources neuves, et celles-ci à part (`neuves`).
create or replace function public.sources_file()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  reg jsonb := coalesce((select valeur->'sources' from reglages where cle = 'bleo'), '{}'::jsonb);
  v_lot_max integer := greatest(1, coalesce((reg->>'lot_max')::integer, 6));
  v_npj integer := greatest(0, coalesce((reg->>'nouvelles_par_jour')::integer, 2));
  v_semaine date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_base date := public.sources_file_prochain_lot();
  v_lancees integer;
  v_dispo integer;
  run jsonb := (select valeur from reglages where cle = 'maj_sources_run');
  v_en_cours jsonb;
  v_attente jsonb;
  v_essais jsonb;
  v_neuves jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'sources : réservé aux admins' using errcode = '42501';
  end if;

  select count(*) into v_lancees from bleo_sources_decisions
   where raison = 'ajout' and (lancee_le at time zone 'Europe/Paris')::date = v_jour;
  v_dispo := greatest(v_npj - case when v_base = v_jour then v_lancees else 0 end, 0);

  if coalesce(run->>'statut', '') = 'running' then
    v_en_cours := jsonb_build_object(
      'handle', run->>'handle',
      'phase', run->>'phase',
      'restant', coalesce((run->>'restant')::integer, 0),
      'faits', coalesce((run->>'faits')::integer, 0),
      'total', jsonb_array_length(coalesce(run->'comptes', '[]'::jsonb)),
      'a_suivre', coalesce((select jsonb_agg(c->>'handle' order by o)
                              from jsonb_array_elements(run->'comptes') with ordinality as t(c, o)
                             where o > coalesce((run->>'index')::integer, 0)), '[]'::jsonb));
  end if;

  with attente as (
    select d.compte_reference_id, cr.handle_tiktok, cr.langue, cr.essai_max, d.raison, d.r_mediane, d.echec,
           (d.raison = 'ajout') as neuve,
           row_number() over (partition by (d.raison = 'ajout')
                              order by case when d.raison = 'ajout' then cr.created_at end,
                                       d.r_mediane desc nulls last, d.meilleur_vues desc nulls last, cr.handle_tiktok) as rang
      from bleo_sources_decisions d
      join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
     where d.semaine = v_semaine and d.decision in ('maj', 'peu_de_mesures') and d.lancee_le is null
       -- 0772 : une source neuve n'attend pas le lot (voir `neuves`), sauf après 5 relevés ratés.
       and not (d.raison = 'ajout' and d.essais < 5)
  ),
  datee as (
    select a.*,
           case when not a.neuve then v_base + ((a.rang - 1) / v_lot_max)::integer
                when v_npj = 0 then null
                when a.rang <= v_dispo then v_base
                else v_base + 1 + ((a.rang - v_dispo - 1) / v_npj)::integer end as prevu_le
      from attente a
  )
  select jsonb_agg(jsonb_build_object(
           'compte_reference_id', compte_reference_id, 'handle', handle_tiktok, 'langue', langue,
           'sorte', case when neuve then 'neuve' else 'maj' end, 'raison', raison,
           'essai_max', essai_max, 'r', r_mediane, 'prevu_le', prevu_le, 'echec', echec)
         order by prevu_le nulls last, neuve, rang)
    into v_attente from datee;

  -- 0772 : les sources neuves dont le premier import n'est pas fini. `releve` : le profil a été relevé
  -- (par le chemin immédiat, ou par une séquence d'avant 0772) ; `en_traitement` : ce qui reste dans la file
  -- et dans le pipeline (lecture, pertinence, note, nettoyage).
  select jsonb_agg(jsonb_build_object(
           'compte_reference_id', z.id, 'handle', z.handle_tiktok, 'essai_max', z.essai_max,
           'essais', z.essais, 'echec', z.echec, 'lancee_le', z.lancee_le,
           'releve', z.releve, 'enfilees', z.urls_ajoutees, 'en_traitement', z.en_traitement)
         order by z.created_at)
    into v_neuves
    from (select cr.id, cr.handle_tiktok, cr.essai_max, cr.created_at, d.essais, d.echec, d.lancee_le, d.urls_ajoutees,
                 (d.urls_ajoutees is not null or (d.essais = 0 and d.lancee_le is not null)) as releve,
                 (select count(*) from import_file f where f.compte_reference_id = cr.id and f.statut in ('pending', 'running'))
                 + (select count(*) from contenus c where c.compte_reference_id = cr.id and c.import_statut in ('pending', 'running')) as en_traitement
            from bleo_sources_decisions d
            join comptes_reference cr on cr.id = d.compte_reference_id and cr.is_active
           where d.raison = 'ajout' and d.semaine >= v_semaine - 7
             and not exists (select 1 from bleo_sources_decisions d2
                              where d2.compte_reference_id = d.compte_reference_id and d2.semaine > d.semaine)) z
   where (not z.releve and (z.essais < 5 or z.lancee_le is not null)) or z.en_traitement > 0;

  select jsonb_agg(jsonb_build_object(
           'compte_reference_id', cr.id, 'handle', cr.handle_tiktok, 'langue', cr.langue,
           'label', (select min(l.nom) from compte_reference_labels crl join labels l on l.id = crl.label_id
                      where crl.compte_reference_id = cr.id),
           'essai_max', cr.essai_max, 'essai_depuis', cr.essai_depuis,
           'verdict', cr.essai_verdict, 'juge_le', cr.essai_juge_le,
           'importes', (select count(*) from contenus c where c.compte_reference_id = cr.id),
           'valides', (select count(*) from contenus c where c.compte_reference_id = cr.id
                        and c.statut = 'valide' and c.import_statut = 'done'),
           'posts', coalesce(sp.posts, 0), 'r', sp.r_mediane, 'r_vs_label', sp.r_vs_label)
         order by cr.essai_depuis desc)
    into v_essais
    from comptes_reference cr
    left join source_performance sp on sp.compte_reference_id = cr.id
   where cr.essai_depuis is not null and cr.is_active
     and (cr.essai_juge_le is null or cr.essai_juge_le > now() - interval '30 days');

  return jsonb_build_object(
    'en_cours', v_en_cours,
    'attente', coalesce(v_attente, '[]'::jsonb),
    'neuves', coalesce(v_neuves, '[]'::jsonb),
    'essais', coalesce(v_essais, '[]'::jsonb),
    'prochain_lot', v_base,
    'reglages', jsonb_build_object(
      'lot_max', v_lot_max, 'nouvelles_par_jour', v_npj,
      'essai_posts', coalesce((reg->>'essai_posts')::integer, 30),
      'essai_mesures_min', coalesce((reg->>'essai_mesures_min')::integer, 10),
      'posts_max_par_maj', coalesce((reg->>'posts_max_par_maj')::integer, 100)));
end;
$function$;
