-- 0306 : retirer `anon` des deux fonctions de la page Répartition.
--
-- La 0305 écrit `revoke all ... from public`, ce qui ne suffit pas : Supabase
-- pose un ALTER DEFAULT PRIVILEGES qui accorde EXECUTE à `anon` et
-- `authenticated` sur toute fonction créée dans `public`. Révoquer à PUBLIC
-- n'enlève pas une subvention nominative, et `anon` gardait donc le droit
-- d'appeler.
--
-- Aucune donnée n'a fuité : les deux fonctions commencent par `is_admin()` et
-- lèvent 42501. Mais un appel anonyme doit être refusé par les droits, pas
-- seulement par le corps de la fonction — c'est ce que font déjà
-- `stats_choix_label` et `stats_choix_label_creation` (anon et authenticated
-- à false). On aligne, en gardant `authenticated` : c'est par là que l'admin
-- de l'OS appelle, et `is_admin()` tranche ensuite.
--
-- Retour arrière : grant execute ... to anon; (sans intérêt, c'était un oubli).

revoke execute on function public.simulation_repartition(uuid) from anon;
revoke execute on function public.simulation_repartition_apps() from anon;
