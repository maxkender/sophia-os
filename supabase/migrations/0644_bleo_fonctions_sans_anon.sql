-- 0644 : les fonctions BLEO ne sont plus exécutables sans être connecté.
--
-- Constaté le 2/11 (D49) : `bleo_tirage`, `bleo_nuit`, `bleo_regrouper_themes`,
-- `bleo_rapport`… gardaient le droit EXECUTE par défaut de PUBLIC et d'`anon`.
-- Leur garde (`auth.uid() is not null and not is_admin()`) laisse passer un appel
-- sans utilisateur : avec la clé publique du site, n'importe qui pouvait refaire
-- le plan du lendemain (`bleo_tirage(jour, 'actif')`), rejouer la nuit ou
-- recalculer les thèmes. Personne ne les appelle sans session : l'admin passe
-- par `authenticated` (gardé par is_admin), les crons par `postgres`, les
-- fonctions Edge et les podz par `service_role`.
--
-- Retour arrière : grant execute on function … to anon (fonction par fonction).

do $migration$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'bleo\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$migration$;
