/**
 * Le menu et le routeur doivent dire la même chose.
 *
 * Le vrai risque n'est pas qu'une page manque, c'est que la liste soit
 * recopiée à deux endroits et qu'ils divergent : le menu cache une entrée, la
 * route la laisse passer, et le COS atteint par URL une page censée lui être
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
import { ACCUEIL_COS, ROUTES_COS, cosVoitLien } from "./pagesCos";

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

/** Le bloc ouvert à l'admin ET au COS, jusqu'à la porte intérieure admin-seul. */
function blocCos(): string {
  const debut = routeur.indexOf('allow={["admin", "chief_of_staff"]}');
  const fin = routeur.indexOf('<RoleGate allow={["admin"]} />', debut);
  expect(debut).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  return routeur.slice(debut, fin);
}

describe("pages du Chief of Staff", () => {
  it("contient exactement les pages demandées, plus les deux pages de détail", () => {
    for (const page of PAGES_DEMANDEES) expect(ROUTES_COS).toContain(page);
    expect([...ROUTES_COS].sort()).toEqual(
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
      expect(cosVoitLien(ferme)).toBe(false);
    }
  });

  it("atterrit sur une page qu'il a vraiment le droit de voir", () => {
    // Le piège : laisser l'accueil sur /admin, qui lui est fermé, et renvoyer
    // le COS dans une boucle de redirection à la connexion.
    expect(ROUTES_COS).toContain(ACCUEIL_COS);
  });
});

describe("routeur et liste ne peuvent pas diverger", () => {
  it("le bloc ouvert au COS ne contient que des routes de ROUTES_COS", () => {
    const chemins = [...blocCos().matchAll(/path="(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(chemins.length).toBeGreaterThan(0);
    for (const chemin of chemins) expect(ROUTES_COS).toContain(chemin);
  });

  it("toute page de ROUTES_COS a bien sa route dans ce bloc", () => {
    const bloc = blocCos();
    for (const page of ROUTES_COS) expect(bloc).toContain(`path="${page}"`);
  });

  it("les pages fermées restent derrière la porte admin-seul", () => {
    const apres = routeur.slice(routeur.indexOf('<RoleGate allow={["admin"]} />'));
    for (const ferme of ["/admin/reglages", "/admin/prompts", "/admin/sources"]) {
      expect(apres).toContain(`path="${ferme}"`);
    }
  });

  it("le COS garde son espace recrutement, en plus", () => {
    expect(routeur).toContain(
      'allow={["hiring_manager", "directing_manager", "chief_of_staff"]}',
    );
  });
});

describe("le directing manager ne gagne rien", () => {
  it("n'entre pas dans la coquille admin", () => {
    expect(routeur).not.toContain('allow={["admin", "directing_manager"]}');
    expect(blocCos()).not.toContain("directing_manager");
  });

  it("garde son badge et son statut de manager", () => {
    expect(badgeManager("directing_manager")).toBe("DM");
    expect(badgeManager("chief_of_staff")).toBe("COS");
    expect(estRoleManager("directing_manager")).toBe(true);
    expect(estRoleManager("chief_of_staff")).toBe(true);
  });
});
