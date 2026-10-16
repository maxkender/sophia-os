import { describe, expect, it } from "vitest";

import {
  CLE_AUCUN,
  cleDefaut,
  estJuge,
  grouperAvis,
  normaliserAvis,
  pourcentage,
  statsBanc,
  type AvisRelecture,
} from "./bancRelecture";
import type { DefautRelecture, RelectureAuto } from "./relectureAgent";

const point = (code: string, slides: number[], niveau: "remarque" | "info" = "remarque"): DefautRelecture => ({
  code,
  niveau,
  slides,
  detail: code,
});

const relecture = (
  id: string,
  defauts: DefautRelecture[],
  statut: RelectureAuto["statut"] = "fait",
  vues: number | null = null,
): Pick<RelectureAuto, "statut" | "defauts" | "brouillon" | "vues"> & { id: string } => ({
  id,
  statut,
  defauts,
  vues,
  brouillon: vues !== null && vues >= 5000 ? null : defauts.some((d) => d.niveau === "remarque") ? "Hi!" : null,
});

let n = 0;
const avis = (
  relecture_id: string,
  cle: string,
  code: string,
  verdict: AvisRelecture["verdict"],
): AvisRelecture => ({ id: `a${++n}`, relecture_id, cle, code, verdict, commentaire: null, detail: null });

describe("bancRelecture", () => {
  it("un post est jugé quand chaque point relevé a un ✓ ou un ✗ — les notes ne se jugent pas", () => {
    const r = relecture("r1", [point("justification", [1, 3]), point("taille", [2]), point("gras", [1], "info")]);
    const j = avis("r1", cleDefaut(r.defauts[0]), "justification", "juste");
    expect(estJuge(r, [j])).toBe(false);
    expect(estJuge(r, [j, avis("r1", "taille|2", "taille", "faux")])).toBe(true);
    // Un raté ne remplace pas le jugement d'un point.
    expect(estJuge(r, [j, avis("r1", "rate:x", "couleur", "rate")])).toBe(false);
  });

  it("sans point relevé : jugé par « rien à signaler » ou par un raté", () => {
    const r = relecture("r2", [point("police", [1], "info")]);
    expect(estJuge(r, [])).toBe(false);
    expect(estJuge(r, [avis("r2", CLE_AUCUN, "aucun", "juste")])).toBe(true);
    expect(estJuge(r, [avis("r2", "rate:y", "justification", "rate")])).toBe(true);
  });

  it("une relecture ignorée ou en cours ne se juge pas", () => {
    expect(estJuge(relecture("r3", [], "ignore"), [avis("r3", CLE_AUCUN, "aucun", "juste")])).toBe(false);
    expect(estJuge(relecture("r4", [], "analyse"), [avis("r4", CLE_AUCUN, "aucun", "juste")])).toBe(false);
  });

  it("compte la justesse par règle et les ratés, en ignorant les points disparus", () => {
    const r1 = relecture("r1", [point("justification", [1, 3]), point("taille", [2])]);
    const r2 = relecture("r2", [point("justification", [4])]);
    const r3 = relecture("r3", []);
    const r4 = relecture("r4", [], "ignore");
    const r5 = relecture("r5", [], "scrape");
    const tous = grouperAvis([
      avis("r1", "justification|1,3", "justification", "juste"),
      avis("r1", "taille|2", "taille", "faux"),
      avis("r1", "rate:a", "hierarchie", "rate"),
      avis("r2", "justification|4", "justification", "faux"),
      // Point d'une version précédente de la relecture : plus compté.
      avis("r2", "largeur|4", "largeur", "juste"),
      avis("r3", CLE_AUCUN, "aucun", "juste"),
    ]);
    const s = statsBanc([r1, r2, r3, r4, r5], tous);
    expect(s).toMatchObject({
      total: 5,
      jugeables: 3,
      horsBanc: 1,
      enCours: 1,
      juges: 3,
      proposees: 2,
      quiMarchent: 0,
      justes: 1,
      faux: 2,
      rates: 1,
      aucunConfirme: 1,
    });
    expect(s.parRegle).toEqual([
      { code: "justification", compte: { juste: 1, faux: 1, rate: 0 } },
      { code: "hierarchie", compte: { juste: 0, faux: 0, rate: 1 } },
      { code: "taille", compte: { juste: 0, faux: 1, rate: 0 } },
    ]);
  });

  it("pourcentage arrondi, null sans dénominateur", () => {
    expect(pourcentage(9, 11)).toBe(82);
    expect(pourcentage(0, 0)).toBeNull();
  });

  it("lit une ligne de relecture_avis et rejette l'inutilisable", () => {
    expect(
      normaliserAvis({
        id: "a",
        relecture_id: "r",
        cle: "rate:1",
        code: "couleur",
        verdict: "rate",
        commentaire: "  texte jaune au lieu de blanc ",
        detail: "",
      }),
    ).toEqual({
      id: "a",
      relecture_id: "r",
      cle: "rate:1",
      code: "couleur",
      verdict: "rate",
      commentaire: "texte jaune au lieu de blanc",
      detail: null,
    });
    expect(normaliserAvis({ id: "a", relecture_id: "r", cle: "x", code: "x", verdict: "peut-être" })).toBeNull();
  });

  it("compte à part les posts qui marchent, laissés sans message", () => {
    const s = statsBanc(
      [
        relecture("r1", [point("justification", [1])], "fait", 12000),
        relecture("r2", [point("taille", [2])], "fait", 800),
        relecture("r3", [], "fait", null),
      ],
      {},
    );
    expect(s).toMatchObject({ jugeables: 3, proposees: 1, quiMarchent: 1 });
  });
});
