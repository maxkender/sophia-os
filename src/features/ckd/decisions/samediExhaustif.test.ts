import { describe, expect, it } from "vitest";

import { calculerCouverture, type LigneCouverture, posteursEnSetup } from "./samediExhaustif";

/** 26/11 (Max) : un posteur en set-up (cohorte à venir) n'est pas compté comme posteur actif le samedi. */
describe("couverture du samedi", () => {
  const lignes: LigneCouverture[] = [
    { poster_id: "ancien", nom: "Ancien", comptes: 1, raison: null },
    { poster_id: "premiere", nom: "Première semaine", comptes: 2, raison: null },
    { poster_id: "setup", nom: "En set-up", comptes: 1, raison: null },
    { poster_id: "absent", nom: "Absent", comptes: 1, raison: "ruul" },
    { poster_id: "vide", nom: "Sans compte", comptes: 0, raison: "sans_compte" },
  ];
  const comptes = [
    { poster_id: "ancien", cohorte_lundi: "2026-11-02" },
    { poster_id: "premiere", cohorte_lundi: "2026-11-23" },
    { poster_id: "premiere", cohorte_lundi: "2026-11-30" },
    { poster_id: "setup", cohorte_lundi: "2026-11-30" },
  ];

  it("posteursEnSetup : tous les comptes dans une cohorte pas commencée", () => {
    expect([...posteursEnSetup(comptes, "2026-11-23")]).toEqual(["setup"]);
    // Un compte déjà lancé suffit : « premiere » n'est pas en set-up.
    expect(posteursEnSetup([{ poster_id: "x", cohorte_lundi: null }], "2026-11-23").size).toBe(0);
  });

  it("calculerCouverture : les posteurs en set-up sont comptés à part", () => {
    const montres = new Set(["ancien", "premiere", "setup"]);
    const c = calculerCouverture(lignes, montres, posteursEnSetup(comptes, "2026-11-23"));
    expect(c).toMatchObject({ montres: 2, posteurs: 3, comptes: 4, sansCompte: 1, enSetup: 1 });
    expect(c.absents.map((a) => a.poster_id)).toEqual(["absent"]);
  });

  it("calculerCouverture : sans liste de set-up, le compte d'avant", () => {
    const c = calculerCouverture(lignes, new Set(["ancien", "premiere", "setup"]));
    expect(c).toMatchObject({ montres: 3, posteurs: 4, comptes: 5, enSetup: 0 });
  });
});
