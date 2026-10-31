-- 0634 : l'empreinte du secret des crons, pour le test à blanc.
--
-- `assignation-a-blanc` vérifie l'en-tête x-cron-secret dans son bac à sable,
-- qui bloque tout appel RPC (liste blanche vide) : `cron_secret_lire()` (0477)
-- lui est fermé, et elle retombait sur la variable d'environnement CRON_SECRET,
-- périmée depuis la rotation du 31/10 au matin. Résultat : 401 pour tout appel
-- au secret des crons ; seul un admin connecté pouvait lancer un test à blanc.
--
-- Une lecture de table, elle, passe le bac à sable. Cette vue ne rend que
-- l'empreinte SHA-256 (hex) du secret, jamais sa valeur ; la fonction compare
-- l'empreinte de l'en-tête reçu. Lisible par service_role seulement.
--
-- Retour arrière : drop view public.cron_secret_empreinte.

set lock_timeout = '5s';

create or replace view public.cron_secret_empreinte as
  select encode(extensions.digest(s.decrypted_secret, 'sha256'), 'hex') as empreinte
    from vault.decrypted_secrets s
   where s.name = 'cron_secret';

revoke all on public.cron_secret_empreinte from public, anon, authenticated;
grant select on public.cron_secret_empreinte to service_role;

comment on view public.cron_secret_empreinte is
  '0634 : empreinte SHA-256 du secret des crons (jamais la valeur), pour que assignation-a-blanc vérifie l''en-tête sans RPC. service_role seulement.';
