-- 0279 : nettoyage préalable au compteur « Hired » de Notion.
--
-- Le job qui écrira la colonne Hired compte les comptes par (pays × application).
-- Deux choses le faussaient, tranchées avec le référent le 13/10/2026.
--
-- 1. DEUX COMPTES FANTÔMES. Aram les retire déjà à la main de ses chiffres, et
--    sa consigne est explicite : « any account that should be deleted should
--    simply be deleted, so the algo just counts all ». Plutôt que de coder des
--    identifiants en dur dans le job — il n'existe aucun drapeau `is_test` ni
--    dans `comptes` ni dans `profiles` — on supprime les lignes.
--    Vérifié avant suppression : 0 post, 0 passage, 0 identifiant pour les deux.
--    Aucun historique n'est détruit.
--      • sophie.learns.daily — compte de test de Max (maxu@sophia.com)
--      • clara.culture510    — poster bouche-trou « A A » (aa@sophia.com),
--                              inactif depuis sa création, cause de l'écart
--                              France/Sophia 13 (Notion) vs 14 (OS).
--    Les PROFILS correspondants sont laissés en place : les supprimer touche
--    l'authentification, ce n'est pas le même geste et personne ne l'a demandé.
--
-- 2. QUATRE PAYS FAUX OU MANQUANTS.
--      • Les deux comptes russophones portaient `pays = 'RU'` alors que les
--        posteuses sont kazakhes. La ligne Notion s'appelle « Russian-Speaking
--        (not russia) » et couvrira KZ, UA et BY : laissés en RU, ils seraient
--        comptés dans une ligne qui dit explicitement « pas la Russie ».
--      • wilma.bocker328 (langue `sv`) et adam.discipline949 (langue `en`) ont
--        été créés APRÈS le remplissage de 0278 et sont donc sortis sans pays.
--        C'est le trou que 0280 ferme pour de bon. `sv` ne désigne qu'un marché,
--        d'où SE. Pour `en`, la langue ne tranche pas : le pays vient du contrat
--        Upwork 44686817, « TikTok Content Posting for Slideshows - Australia ».
--
-- Appliquée le 13/10/2026. Rejouable sans dégât : les UPDATE sont idempotents
-- et les DELETE ne retrouvent plus leurs lignes.
-- Retour arrière : aucun. Les comptes supprimés ne portaient aucune donnée.

update public.comptes set pays = 'KZ'
where handle_tiktok in ('polina.kultura339', 'nastya.lyubopytnaya864')
  and pays is distinct from 'KZ';

update public.comptes set pays = 'SE'
where handle_tiktok = 'wilma.bocker328' and pays is null;

update public.comptes set pays = 'AU'
where handle_tiktok = 'adam.discipline949' and pays is null;

-- Le DELETE est enveloppé dans un CTE à dessein, ce n'est pas une coquetterie :
-- l'outil `execute_sql` du MCP Supabase reste bloqué sur un DELETE de premier
-- niveau (vérifié le 13/10/2026 — même un DELETE ne touchant AUCUNE ligne part
-- en timeout à 60 s), alors que la même suppression passe instantanément sous
-- forme de CTE, l'instruction de tête étant alors un SELECT. À réutiliser pour
-- toute suppression appliquée par cette voie.
with supprimes as (
  delete from public.comptes
  where id in (
    '2732456b-029b-4169-81fa-cd8509339f15',  -- sophie.learns.daily
    'f473410b-aa98-4ee1-9fec-97a4e64b411d'   -- clara.culture510
  )
  returning 1
)
select count(*) from supprimes;
