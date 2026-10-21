-- 0330 : nouvelle stratégie Micabo (21/10), partie I.
--
-- 1. UN LABEL SANS APPLICATION COCHÉE N'EST DISPONIBLE POUR PERSONNE.
--    Jusqu'ici, un label sans ligne `label_applications` servait Sophia par
--    héritage. Décision du 21/10 : décocher toutes les applications d'un label
--    le met de côté, sans rien supprimer (medical_study, faceless_study).
--    Au 21/10, seuls Hook et UGC AI VIDEO (labels système, déjà exclus
--    partout) n'avaient aucune ligne : rien ne change pour la flotte.
--    Le même changement est fait dans le code (`applicationsDuLabel`,
--    `_shared/multi_app.ts` et sa copie front).
--    Ici : la vue `label_application_reserve` et les fonctions
--    `simulation_repartition` et `pods_tableau` ne prêtent plus Sophia à un
--    label sans ligne. Seul le passage concerné est réécrit, et la migration
--    s'arrête si elle ne le trouve pas.
--
-- 2. SEUIL DE PERTINENCE RÉGLABLE PAR LABEL ET PAR APPLICATION.
--    `label_applications.pertinence_min` (50 par défaut, le plancher) : à
--    l'import, un contenu entre dans le pool d'une application si son score de
--    pertinence atteint le seuil le plus exigeant de ses labels (et 50 au
--    moins), ou s'il entre en tier A. classic_study × Micabo : 60, parce que
--    le label a beaucoup de contenu. Sophia n'a pas de seuil.
--    Les contenus déjà importés ne sont pas recalculés par cette migration :
--    le recalcul exceptionnel de classic_study × Micabo a été fait à part le
--    21/10 (score sous 60, sauf tiers S et A : 8 contenus retirés, 110 restent).
--
-- Retour arrière : remettre `coalesce(la.application_id, application_id_sophia())`
-- avec un `left join` dans les trois objets, et
-- `alter table label_applications drop column pertinence_min`.

set lock_timeout = '10s';

alter table public.label_applications
  add column if not exists pertinence_min smallint not null default 50
    check (pertinence_min between 0 and 100);

comment on column public.label_applications.pertinence_min is
  'Score de pertinence minimum pour entrer dans le pool de cette application à l''import (le plus exigeant des labels du contenu, jamais sous 50 ; tier A ou mieux passe dès 50). Ignoré pour Sophia. Voir 0330.';

update public.label_applications la
   set pertinence_min = 60
  from public.labels l, public.applications a
 where la.label_id = l.id and la.application_id = a.id
   and l.nom = 'classic_study' and a.slug = 'micabo';

do $patch$
declare
  v_def text;
  v_nouveau text;
begin
  -- a) La réserve par label × application.
  v_def := pg_get_viewdef('public.label_application_reserve'::regclass, true);
  v_nouveau := replace(v_def,
    'COALESCE(la.application_id, application_id_sophia()) AS application_id',
    'la.application_id');
  v_nouveau := replace(v_nouveau,
    'LEFT JOIN label_applications la ON la.label_id = l_1.id',
    'JOIN label_applications la ON la.label_id = l_1.id');
  if v_nouveau = v_def or position('COALESCE(la.application_id' in v_nouveau) > 0 then
    raise exception '0330 : passage introuvable dans label_application_reserve';
  end if;
  execute 'create or replace view public.label_application_reserve as ' || v_nouveau;

  -- b) La simulation de la page Répartition.
  v_def := pg_get_functiondef('public.simulation_repartition(uuid)'::regprocedure);
  v_nouveau := regexp_replace(v_def,
    '\s*--\s*Héritage[^\n]*\n\s*or \(\s*v_app = ''00000000-0000-4000-8000-000000000001''::uuid\s*and not exists \(select 1 from public\.label_applications la where la\.label_id = l\.id\)\s*\)',
    '');
  if v_nouveau = v_def then
    raise exception '0330 : passage introuvable dans simulation_repartition';
  end if;
  execute v_nouveau;

  -- c) Le tableau des podz.
  v_def := pg_get_functiondef('public.pods_tableau(integer)'::regprocedure);
  v_nouveau := replace(v_def,
    'coalesce(la.application_id, application_id_sophia()) as application_id',
    'la.application_id as application_id');
  v_nouveau := replace(v_nouveau,
    'left join label_applications la on la.label_id = po.label_id',
    'join label_applications la on la.label_id = po.label_id');
  v_nouveau := replace(v_nouveau, '-- Un label sans ligne sert Sophia.', '-- Un label sans application cochée ne sert personne (0330).');
  if v_nouveau = v_def or position('coalesce(la.application_id' in v_nouveau) > 0 then
    raise exception '0330 : passage introuvable dans pods_tableau';
  end if;
  execute v_nouveau;
end
$patch$;

notify pgrst, 'reload schema';
