import { describe, expect, it } from "vitest";

import { lirePhraseBonus, noteBonus, personneSure, raisonBonus } from "../../../supabase/functions/_shared/bonus";
import type { LigneBonusLundi } from "./api";
import { delaiCm, jourMois, totaux } from "./lundi";

const ligne = (p: Partial<LigneBonusLundi>): LigneBonusLundi => ({
  id: "x", type: "comment_master", nom: "A", detail: "", quantite: 1, a_verifier: 0, tarif: 0.5, zone: "A", montant: 1,
  statut: "a_valider", erreur: null, raison: null, periode_debut: "2026-01-01", periode_fin: "2026-11-08",
  delai_median_min: 249, part_moins_2h: 0.357, contrat_ok: true, envoi_at: null, paye_at: null, ...p,
});

describe("bonus du lundi (0564)", () => {
  it("lit n'importe quelle phrase (0571)", () => {
    const lu = (t: string) => lirePhraseBonus(t, 2026);
    expect(lu("donne 2 $ de bonus à Martin Befeld lundi, raison test")).toMatchObject({ montant: 2, nom: "Martin Befeld", lundi: null, raison: "test" });
    expect(lu("give a bonus of $5 to Jane Doe monday 16/11 reason great week")).toMatchObject({ montant: 5, nom: "Jane Doe", lundi: "2026-11-16", raison: "great week" });
    expect(lu("15$ à bogdan kugcas")).toMatchObject({ montant: 15, nom: "bogdan kugcas", texteNom: "15$ à bogdan kugcas", raison: "", apresPour: null });
    expect(lu("Bogdan a bien bossé, mets lui 15 balles")).toMatchObject({ montant: 15, texteNom: "Bogdan a bien bossé, mets lui 15 balles" });
    expect(lu("bonus de 10 pour Jenivia")).toMatchObject({ montant: 10, apresPour: "Jenivia" });
    expect(lu("donne 2,5 $ à Jean pour la vidéo")).toMatchObject({ montant: 2.5, nom: "Jean", apresPour: "la vidéo" });
    expect(lu("20 € to Ana on 23/11 because she helped")).toMatchObject({ montant: 20, lundi: "2026-11-23", raison: "she helped" });
    expect("erreur" in lu("donne du bonus à Martin")).toBe(true);
    expect("erreur" in lu("donne 2 $")).toBe(true);
  });

  it("la raison et la personne sûre", () => {
    expect(raisonBonus({ raison: "", apresPour: "Jenivia" }, "Jenivia Selvarajah")).toBe("bonus");
    expect(raisonBonus({ raison: "", apresPour: "la vidéo" }, "Jean Dupont")).toBe("la vidéo");
    expect(raisonBonus({ raison: "test", apresPour: "x" }, "Jean Dupont")).toBe("test");
    const p = (nom: string, exact: boolean) => ({ id: nom, nom, actif: true, score: exact ? 1 : 0.8, exact });
    expect(personneSure([p("Martin Befeld", true), p("Martini Assonga", false)])?.nom).toBe("Martin Befeld");
    expect(personneSure([p("Bogdan Kocsis", false)])).toBeNull();
    expect(personneSure([p("Ana Silva", true), p("Ana Silva", true)])).toBeNull();
  });

  it("écrit la note Upwork de chaque type", () => {
    expect(noteBonus({ type: "comment_master", quantite: 49, periode_fin: "2026-11-08", raison: null }))
      .toBe("Comment Masters bonus (until Nov 8): 49 comments");
    expect(noteBonus({ type: "parrainage", quantite: 2, periode_fin: null, raison: null, prenom_filleul: "Ana" }))
      .toBe("Referral bonus: thank you for bringing Ana to the team!");
    expect(noteBonus({ type: "manuel", quantite: 1, periode_fin: null, raison: "test" })).toBe("Bonus: test");
  });

  it("ajoute 10 % de frais aux seules lignes à envoyer", () => {
    const t = totaux([
      ligne({ montant: 24.5 }),
      ligne({ id: "b", montant: 10, type: "parrainage" }),
      ligne({ id: "c", montant: 3, statut: "retire" }),
      ligne({ id: "d", montant: 0 }),
      ligne({ id: "e", montant: 2, statut: "paye" }),
    ]);
    expect(t).toEqual({ n: 2, total: 34.5, frais: 3.45, totalFrais: 37.95 });
  });

  it("montre le délai des Comment Masters seulement après le 9/11", () => {
    expect(delaiCm(ligne({}))).toBeNull();
    expect(delaiCm(ligne({ periode_debut: "2026-11-09" }))).toBe("médiane 4 h 09 · 36 % en moins de 2 h");
    expect(delaiCm(ligne({ periode_debut: "2026-11-09", delai_median_min: 45, part_moins_2h: 1 }))).toBe("médiane 45 min · 100 % en moins de 2 h");
    expect(jourMois("2026-11-09")).toBe("9/11");
  });
});

describe("délais des Comment Masters (0566)", () => {
  it("écrit une durée lisible", async () => {
    const { dureeLisible } = await import("../commentMasters/suivi/delais");
    expect(dureeLisible(45)).toBe("45 min");
    expect(dureeLisible(65)).toBe("1 h 05");
    expect(dureeLisible(null)).toBe("—");
  });
});
