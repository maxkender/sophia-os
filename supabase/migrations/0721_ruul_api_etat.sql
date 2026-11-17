-- 17/11 : la lecture API remplace l'import manuel des statuts Ruul.
-- « Dernier import » (en haut de la page Ruul, ligne Aujourd'hui) = la dernière lecture réussie de
-- GET /workmates en prod, sinon le dernier import manuel (ancien).

create or replace function public.ruul_agent_etat()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'dernier_import_at', greatest((select max(at) from public.ruul_imports where type = 'statuts'),
                                  (select max(at) from public.ruul_api_appels where env = 'prod' and action = 'workmates' and erreur is null)),
    'emails_ab', coalesce((select valeur = 'true'::jsonb or valeur = '"on"'::jsonb from public.reglages where cle = 'ruul_emails_ab'), false),
    'a_envoyer_a', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_compte = 'invited'
                      and ruul_email_a_at is null and relances_stop_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'a_envoyer_b', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_compte = 'active'
                      and ruul_email_b_at is null and relances_stop_at is null and coalesce(ruul_statut, '') not in ('pret', 'paye_1x')),
    'envoyes_a', (select count(*) from public.profiles where canal_paie = 'ruul' and ruul_email_a_at is not null),
    'envoyes_b', (select count(*) from public.profiles where canal_paie = 'ruul' and ruul_email_b_at is not null),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.type, 'at', i.at,
                                   'par', coalesce((select btrim(concat_ws(' ', pr.prenom, pr.nom)) from public.profiles pr where pr.id = i.par), 'Claude'),
                                   'lignes', i.lignes, 'appliques', i.appliques, 'nouveaux_invited', i.nouveaux_invited,
                                   'nouveaux_active', i.nouveaux_active, 'introuvables', i.introuvables) order by i.at desc)
                           from (select * from public.ruul_imports order by at desc limit 30) i), '[]'::jsonb))
  where public.is_admin();
$function$;

-- L'état de l'API pour la page Ruul : environnement, société, dernière lecture, dernière erreur.
create or replace function public.ruul_api_etat()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'env', coalesce((select valeur->>'env' from public.reglages where cle = 'ruul_api'), 'prod'),
    'company_id', (select valeur->'company_id' from public.reglages where cle = 'ruul_api'),
    'connect_actif', coalesce((select (valeur->>'connect_actif')::boolean from public.reglages where cle = 'ruul_api'), false),
    'derniere_lecture', (select jsonb_build_object('at', a.at, 'env', a.env, 'lus', a.detail->'lus')
                           from public.ruul_api_appels a where a.action = 'workmates' and a.erreur is null order by a.at desc limit 1),
    'derniere_erreur', (select jsonb_build_object('at', a.at, 'env', a.env, 'action', a.action, 'http', a.http, 'erreur', a.erreur)
                          from public.ruul_api_appels a where a.erreur is not null order by a.at desc limit 1),
    'non_relies', (select count(*) from public.ruul_workmates w
                    where w.poster_id is null and w.env = coalesce((select valeur->>'env' from public.reglages where cle = 'ruul_api'), 'prod')))
  where public.is_admin();
$function$;
revoke all on function public.ruul_api_etat() from public, anon;
grant execute on function public.ruul_api_etat() to authenticated;
