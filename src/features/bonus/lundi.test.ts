import { describe, expect, it } from "vitest";

import { lirePhraseBonus, noteBonus } from "../../../supabase/functions/_shared/bonus";
import type { LigneBonusLundi } from "./api";
import { delaiCm, jourMois, totaux } from "./lundi";

const ligne = (p: Partial<LigneBonusLundi>): LigneBonusLundi => ({
  id: "x", type: "comment_master", nom: "A", detail: "", quantite: 1, a_verifier: 0, tarif: 0.5, zone: "A", montant: 1,
  statut: "a_valider", erreur: null, raison: null, periode_debut: "2026-01-01", periode_fin: "2026-11-08",
  delai_median_min: 249, part_moins_2h: 0.357, contrat_ok: true, envoi_at: null, paye_at: null, ...p,
});

describe("bonus du lundi (0564)", () => {
  it("lit une phrase en français et en anglais", () => {
    expect(lirePhraseBonus("donne 2 $ de bonus à Martin Befeld lundi, raison test", 2026))
      .toEqual({ montant: 2, nom: "Martin Befeld", lundi: null, raison: "test" });
    expect(lirePhraseBonus("give a bonus of $5 to Jane Doe monday 16/11 reason great week", 2026))
      .toEqual({ montant: 5, nom: "Jane Doe", lundi: "2026-11-16", raison: "great week" });
    expect(lirePhraseBonus("donne 2,5 $ à Jean, pour la vidéo", 2026)).toEqual({ montant: 2.5, nom: "Jean", lundi: null, raison: "la vidéo" });
    expect("erreur" in lirePhraseBonus("donne du bonus à Martin", 2026)).toBe(true);
    expect("erreur" in lirePhraseBonus("donne 2 $", 2026)).toBe(true);
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
