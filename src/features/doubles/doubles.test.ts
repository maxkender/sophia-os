import { describe, expect, it } from "vitest";

import { compterStatuts, etapesAccepte, type LigneDouble, resteAvant } from "./logique";
import { alerteMemoire, type MemoireSamedi, texteMemoire } from "./memoire";
import { TEXTES_DOUBLE, textesDouble } from "./textes";

const ligne = (o: Partial<LigneDouble>): LigneDouble => ({
  id: "1", poster_id: "p", nom: "Posteur Test", pays: "FR", samedi: "2026-11-07", propose_at: "2026-11-07T20:00:00Z",
  expire_at: null, vu_at: null, repondu_at: null, statut: "propose", tarif: 10, compte1: "a.b", compte2: null,
  compte2_cree_at: null, warmup_debut: null, warmup_fin: null, warmup_fait: false, premier_post: null, posts_2: 0,
  milestone: null, erreur: null, ...o,
});

describe("0559 : Doubler avec l'accord du posteur", () => {
  it("le texte de Max avec le tarif et son double, en anglais et en français", () => {
    expect(TEXTES_DOUBLE.en.texte(10)).toBe(
      "Your work these past weeks has been great. Would you like to manage a second TikTok account? Same work (2 posts a day on it too), and your weekly pay goes from $10 to $20.",
    );
    expect(textesDouble("fr-FR").oui).toBe("Oui, je suis partant(e)");
    expect(textesDouble("de").titre).toBe("🎉 You've been selected for a second account");
    expect(TEXTES_DOUBLE.en.confirmation("lea.new")).toContain("@lea.new is on your dashboard");
  });

  it("statuts et temps restant", () => {
    const n = compterStatuts([ligne({}), ligne({ statut: "accepte" }), ligne({ statut: "accepte" })]);
    expect(n.accepte).toBe(2);
    const t0 = Date.parse("2026-11-08T00:00:00Z");
    expect(resteAvant("2026-11-09T12:00:00Z", t0)).toBe("reste 36 h");
    expect(resteAvant("2026-11-11T00:00:00Z", t0)).toBe("reste 3 j");
    expect(resteAvant("2026-11-07T00:00:00Z", t0)).toBe("expiré");
  });

  it("étapes d'un accepté : compte, warm-up, 1er post, milestone", () => {
    const e = etapesAccepte(ligne({ statut: "accepte", compte2: "c.d", warmup_debut: "2026-11-02T10:00:00Z", warmup_fin: "2026-11-08T23:00:00Z",
      milestone: { nom: "Week 46 (2nd acc)", etat: "NotFunded", depot: "10" } }), Date.parse("2026-11-08T12:00:00Z"));
    expect(e.map((x) => x.etat)).toEqual(["ok", "attente", "non", "attente"]);
    expect(e[3].libelle).toBe("Week 46 (2nd acc) : créé, à financer");
  });

  it("mémoire du samedi : gardé et 0 post → Kill ; 2e compte sous 50 % → recréer ou retirer", () => {
    const garde: MemoireSamedi = { jour: "2026-10-31", decision: "garder", action: "ne_pas_renouveler", posts: 0, mediane: null, compte2: null, offre: null };
    expect(alerteMemoire(garde, "2026-11-07")).toEqual({ choix: "kill", texte: "Kill : déjà gardé le 31/10, 0 post avec lien depuis" });
    expect(texteMemoire({ ...garde, posts: 9, mediane: 1234.4 })).toBe("Gardé le 31/10 · 9 post(s) avec lien depuis, médiane 1234 vues");
    const double: MemoireSamedi = { jour: "2026-10-24", decision: "doubler", action: "doubler", posts: 20, mediane: 900, offre: "oui",
      compte2: { handle: "x", posts: 8, mediane: 300, mediane1: 900 } };
    expect(alerteMemoire(double, "2026-11-07")?.texte).toContain("recréer ou retirer le 2e compte");
    expect(alerteMemoire({ ...double, jour: "2026-11-01" }, "2026-11-07")).toBeNull();
  });
});
