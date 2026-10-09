/**
 * Pose de l'intercepteur du test à blanc — PREMIER import de index.ts.
 *
 * Pourquoi l'ordre d'import compte : les modules s'évaluent dans l'ordre de
 * leurs déclarations d'import, en profondeur d'abord. Importé en premier, ce
 * module (et son unique dépendance) s'évalue avant le reste du graphe —
 * supabase-js et toute la fermeture de l'assignation compris : aucun module ne
 * peut avoir capturé le vrai `fetch` à son chargement. C'est une ceinture :
 * supabase-js 2.112 relit déjà `fetch` à chaque appel (`resolveFetch`), et la
 * sonde de `executerAssignationABlanc` revérifie avant chaque test que les
 * lectures passent bien par l'intercepteur.
 *
 * Pourquoi cette pose ne touche que le test à blanc : une fonction Edge est
 * un bundle et un isolate à elle. `globalThis.fetch` est remplacé ICI, dans
 * l'isolate de `assignation-a-blanc`, qui ne sert que des tests à blanc ; la
 * nuit, l'assignation test et Sophia tournent dans les leurs, intacts.
 *
 * Ce module ne lève JAMAIS au démarrage : une fonction qui ne démarre pas
 * répondrait BOOT_ERROR au lieu du 401 que vérifie le workflow de déploiement.
 * Un échec est retenu dans `etatInstallation`, et chaque requête est alors
 * refusée (500 « intercepteur inactif ») sans rien lancer.
 *
 * Import NOMMÉ depuis index.ts (et pas un import à effet de bord seul) :
 * scripts/fonctions-touchees.mjs ne suit que les `from "…"`, et un correctif de
 * ce fichier ou de l'intercepteur doit redéployer la fonction.
 */

import { installerIntercepteur } from "../_shared/a_blanc_intercepteur.ts";

export const etatInstallation: { actif: boolean; verrouille: boolean; erreur: string | null } = {
  actif: false,
  verrouille: false,
  erreur: null,
};

try {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) {
    etatInstallation.erreur = "SUPABASE_URL manquant";
  } else {
    // Verrouillé : `fetch` devient non réinscriptible, aucun module ne peut
    // remettre le vrai pendant un test.
    etatInstallation.verrouille = installerIntercepteur({ supabaseUrl: url, verrouiller: true }).verrouille;
    etatInstallation.actif = true;
  }
} catch (e) {
  etatInstallation.erreur = e instanceof Error ? e.message : String(e);
}
