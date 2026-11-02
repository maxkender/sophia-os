import { describe, expect, it } from "vitest";

import type { PostCalendrier } from "../calendrier/api";
import type { LigneAncien } from "./api";
import { faitsAncien, grouperAnciens, historique, problemesAncien } from "./logique";

const AUJ = "2026-10-28";

/** 2 posts par jour du `de` au `a` (décalages depuis aujourd'hui), publiés sauf les jours de `rates` / `partiels`. */
function posts(de: number, a: number, o: { rates?: number[]; partiels?: number[] } = {}): PostCalendrier[] {
  const out: PostCalendrier[] = [];
  for (let k = de; k <= a; k++) {
    const jour = new Date(Date.parse(`${AUJ}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
    for (const rang of [1, 2]) {
      const publie = !(o.rates ?? []).includes(k) && !((o.partiels ?? []).includes(k) && rang === 2);
      out.push({ jour, rang, url: publie ? "u" : null, vues: publie ? 800 : null, publie_at: null, mesure: publie });
    }
  }
  return out;
}

function ligne(o: Partial<LigneAncien> = {}): LigneAncien {
  return {
    compte_id: "c",
    poster_id: "p",
    hm_id: "hm",
    handle: "h",
    pays: "FR",
    premier_jour: "2026-09-07",
    warmup_lance: true,
    seuil_mort: 50,
    mediane_pays: 1000,
    posts: posts(-14, -1),
    diagnostic: {
      badge: "ok",
      attendus: 14,
      publies: 14,
      liens_manquants: [],
      mediane: 800,
      mediane_ref: 1000,
      morts: 0,
      seuil_mort: 50,
      shadowban: false,
      vues_basses: false,
    },
    ...o,
  };
}

describe("les problèmes d'un ancien posteur", () => {
  it("tout publié, vues correctes : aucun problème", () => {
    expect(problemesAncien(ligne(), AUJ)).toEqual([]);
  });

  it("irrégulier : 2 jours sans rien publier sur 7 ; un seul jour ne suffit pas", () => {
    expect(problemesAncien(ligne({ posts: posts(-14, -1, { rates: [-2, -5] }) }), AUJ)).toContain("irregulier");
    expect(problemesAncien(ligne({ posts: posts(-14, -1, { rates: [-2] }) }), AUJ)).not.toContain("irregulier");
  });

  it("liens manquants : un post sans lien un jour où il a publié", () => {
    expect(problemesAncien(ligne({ posts: posts(-14, -1, { partiels: [-3] }) }), AUJ)).toEqual(
      expect.arrayContaining(["liens_manquants", "baisse"]),
    );
  });

  it("baisse : moins de posts publiés que les 7 jours d'avant", () => {
    const l = ligne({ posts: posts(-14, -1, { rates: [-1] }) });
    const f = faitsAncien(l, AUJ);
    expect([f.publies7, f.publiesAvant]).toEqual([12, 14]);
    expect(problemesAncien(l, AUJ)).toEqual(["baisse"]);
  });

  it("vues basses : médiane sous 20 % du pays (même règle que le diagnostic)", () => {
    const d = { ...ligne().diagnostic, mediane: 150, mediane_ref: 1000, vues_basses: undefined };
    expect(problemesAncien(ligne({ diagnostic: d }), AUJ)).toEqual(["vues_basses"]);
    expect(problemesAncien(ligne({ diagnostic: { ...d, mediane: 250 } }), AUJ)).toEqual([]);
  });

  it("shadowban probable : vient du diagnostic (4 derniers posts mesurés sous le seuil mort)", () => {
    const d = { ...ligne().diagnostic, badge: "shadowban" as const, shadowban: true };
    expect(problemesAncien(ligne({ diagnostic: d }), AUJ)[0]).toBe("shadowban");
  });
});

describe("les groupes", () => {
  const a = ligne({ compte_id: "a", handle: "a", posts: posts(-14, -1, { rates: [-2, -3] }) });
  const b = ligne({
    compte_id: "b",
    handle: "b",
    posts: posts(-14, -1, { rates: [-2, -3] }),
    diagnostic: { ...ligne().diagnostic, shadowban: true, badge: "shadowban" },
  });
  const ok = ligne({ compte_id: "ok", handle: "ok" });

  it("par défaut, seulement les comptes à problème, sous le plus grave, dans l'ordre de gravité", () => {
    const g = grouperAnciens([ok, a, b], AUJ, false);
    expect(g.map((x) => [x.probleme, x.lignes.map((l) => l.ligne.compte_id)])).toEqual([
      ["shadowban", ["b"]],
      ["irregulier", ["a"]],
    ]);
  });

  it("Tout afficher : les comptes sans problème à la fin", () => {
    expect(grouperAnciens([ok, a], AUJ, true).map((x) => x.probleme)).toEqual(["irregulier", null]);
  });
});

it("l'historique : 14 cases, la plus récente aujourd'hui", () => {
  const h = historique(ligne(), AUJ);
  expect(h).toHaveLength(14);
  expect(h[13]!.jour).toBe(AUJ);
  expect(h[0]!.jour).toBe("2026-10-15");
});
