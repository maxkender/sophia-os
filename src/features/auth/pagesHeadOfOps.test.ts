/**
 * Le menu et le routeur doivent dire la même chose.
 *
 * Le vrai risque n'est pas qu'une page manque, c'est que la liste soit
 * recopiée à deux endroits et qu'ils divergent : le menu cache une entrée, la
 * route la laisse passer, et le Head of Ops atteint par URL une page censée lui être
 * fermée. D'où la source unique, et d'où ces tests qui lisent le routeur pour
 * vérifier qu'il s'en sert vraiment.
 *
 * Deuxième invariant, moins évident : le directing manager ne doit RIEN
 * gagner. Trois personnes le portent et leur périmètre ne change pas.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { badgeManager, estRoleManager } from "./roles";
import { ACCUEIL_HO, ROUTES_HO, hoVoitLien } from "./pagesHeadOfOps";

const PAGES_DEMANDEES = [
  "/admin/calendrier", // Schedule
  "/admin/posters", // Posters
  "/admin/surveillance", // Account watch
  "/admin/reviews", // Reviews
  "/admin/file-reviews", // Today's queue
  "/admin/parrainages", // Referrals
  "/admin/documents", // Documents
  "/admin/assistant", // Assistant
];

const routeur = fs.readFileSync(
  path.join(process.cwd(), "src/app/router.tsx"),
  "utf8",
);

/** Le bloc ouvert à l'admin ET au Head of Ops, jusqu'à la porte intérieure admin-seul. */
function blocHo(): string {
  const debut = routeur.indexOf('allow={["admin", "head_of_ops"]}');
  const fin = routeur.indexOf('<RoleGate allow={["admin"]} />', debut);
  expect(debut).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  return routeur.slice(debut, fin);
}

describe("pages du Head of Ops", () => {
  it("contient exactement les pages demandées, plus les deux pages de détail", () => {
    for (const page of PAGES_DEMANDEES) expect(ROUTES_HO).toContain(page);
    expect([...ROUTES_HO].sort()).toEqual(
      [...PAGES_DEMANDEES, "/admin/createurs/:compteId", "/admin/posts/:id"].sort(),
    );
  });

  it("n'ouvre aucune page de configuration ni de production", () => {
    for (const ferme of [
      "/admin",
      "/admin/reglages",
      "/admin/prompts",
      "/admin/sources",
      "/admin/slideshows",
      "/admin/creation",
      "/admin/bibliotheque",
      "/admin/analytics",
      "/admin/suivi-rc",
      "/admin/minuit",
      "/admin/tests",
      "/admin/recrutements",
    ]) {
      expect(hoVoitLien(ferme)).toBe(false);
    }
  });

  it("atterrit sur une page qu'il a vraiment le droit de voir", () => {
    // Le piège : laisser l'accueil sur /admin, qui lui est fermé, et renvoyer
    // le Head of Ops dans une boucle de redirection à la connexion.
    expect(ROUTES_HO).toContain(ACCUEIL_HO);
  });
});

describe("routeur et liste ne peuvent pas diverger", () => {
  it("le bloc ouvert au Head of Ops ne contient que des routes de ROUTES_HO", () => {
    const chemins = [...blocHo().matchAll(/path="(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(chemins.length).toBeGreaterThan(0);
    for (const chemin of chemins) expect(ROUTES_HO).toContain(chemin);
  });

  it("toute page de ROUTES_HO a bien sa route dans ce bloc", () => {
    const bloc = blocHo();
    for (const page of ROUTES_HO) expect(bloc).toContain(`path="${page}"`);
  });

  it("les pages fermées restent derrière la porte admin-seul", () => {
    const apres = routeur.slice(routeur.indexOf('<RoleGate allow={["admin"]} />'));
    for (const ferme of ["/admin/reglages", "/admin/prompts", "/admin/sources"]) {
      expect(apres).toContain(`path="${ferme}"`);
    }
  });

  it("le Head of Ops garde son espace recrutement, en plus", () => {
    expect(routeur).toContain(
      'allow={["hiring_manager", "directing_manager", "head_of_ops"]}',
    );
  });
});

describe("le directing manager ne gagne rien", () => {
  it("n'entre pas dans la coquille admin", () => {
    expect(routeur).not.toContain('allow={["admin", "directing_manager"]}');
    expect(blocHo()).not.toContain("directing_manager");
  });

  it("garde son badge et son statut de manager", () => {
    expect(badgeManager("directing_manager")).toBe("DM");
    expect(badgeManager("head_of_ops")).toBe("HO");
    expect(estRoleManager("directing_manager")).toBe(true);
    expect(estRoleManager("head_of_ops")).toBe(true);
  });
});
