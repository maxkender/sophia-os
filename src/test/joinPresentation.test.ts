// apps/join : la présentation avant le formulaire (24/11) — 8 écrans, texte tapé ligne par ligne (les lignes
// « 1. … » en vraie liste), vue une fois par session, textes dans toutes les langues sans montant ni mot interdit.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLES_PRESENTATION, decouperCorps, ligneTapee, longueurTape, marquerPresentationVue, NB_ECRANS, presentationVue, texteTape,
} from "../../apps/join/src/presentation";
import { NOMS_LANGUES } from "../../apps/join/src/langues";

const DOSSIER = join(__dirname, "../../apps/join/src/locales");
const langues = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const dico = (l: string): Record<string, string> => JSON.parse(readFileSync(join(DOSSIER, `${l}.json`), "utf8"));

describe("présentation de apps/join", () => {
  it("tape le titre puis le texte, caractère par caractère", () => {
    expect(texteTape("Hi", "Ça va", 0)).toEqual({ titre: "", corps: "", fini: false });
    expect(texteTape("Hi", "Ça va", 1)).toEqual({ titre: "H", corps: "", fini: false });
    expect(texteTape("Hi", "Ça va", 3)).toEqual({ titre: "Hi", corps: "Ç", fini: false });
    expect(texteTape("Hi", "Ça va", longueurTape("Hi", "Ça va"))).toEqual({ titre: "Hi", corps: "Ça va", fini: true });
    expect(texteTape("Hi", "Ça va", Number.POSITIVE_INFINITY).fini).toBe(true);
  });

  it("découpe le texte en lignes et en vraie liste numérotée, tapées dans l'ordre", () => {
    const corps = "Chaque jour :\n1. Ouvrir.\n2. Publier.\nC'est tout.";
    const blocs = decouperCorps(corps);
    expect(blocs.map((b) => (b.liste ? b.lignes.map((l) => l.texte) : b.ligne.texte))).toEqual([
      "Chaque jour :", ["Ouvrir.", "Publier."], "C'est tout.",
    ]);
    // Les positions suivent le texte tapé : « 1. » et les retours à la ligne comptent.
    const liste = blocs[1];
    if (!liste.liste) throw new Error("liste attendue");
    expect([...corps].slice(liste.lignes[1].debut, liste.lignes[1].debut + 8).join("")).toBe("Publier.");
    expect(ligneTapee(liste.lignes[0], 0)).toBe("");
    expect(ligneTapee(liste.lignes[0], liste.lignes[0].debut + 3)).toBe("Ouv");
    expect(ligneTapee(liste.lignes[0], Number.POSITIVE_INFINITY)).toBe("Ouvrir.");
  });

  it("est vue une fois par session, même sans stockage", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
    expect(presentationVue(s)).toBe(false);
    marquerPresentationVue(s);
    expect(presentationVue(s)).toBe(true);
    const casse = { getItem: () => { throw new Error("bloqué"); }, setItem: () => { throw new Error("bloqué"); } } as unknown as Storage;
    expect(presentationVue(casse)).toBe(false);
    expect(() => marquerPresentationVue(casse)).not.toThrow();
    expect(presentationVue(null)).toBe(false);
  });

  it("a ses 8 écrans dans toutes les langues, sans montant ni mot interdit, avec les mêmes listes", () => {
    expect(NB_ECRANS).toBe(8);
    expect(langues.sort()).toEqual(Object.keys(NOMS_LANGUES).sort());
    expect(CLES_PRESENTATION).toHaveLength(10 + 2 * NB_ECRANS);
    const listes = (d: Record<string, string>) => Array.from({ length: NB_ECRANS }, (_, i) =>
      decouperCorps(d[`onb.${i + 1}.body`]).map((b) => (b.liste ? b.lignes.length : 0)).join());
    for (const l of langues) {
      const d = dico(l);
      for (const cle of CLES_PRESENTATION) {
        expect(d[cle], `${l} · ${cle}`).toBeTruthy();
        if (/^onb\.\d\./.test(cle)) {
          expect(d[cle], `${l} · ${cle}`).not.toMatch(/[$€]|\b(AI|IA)\b|\b[Bb]ots?\b|[Aa]utomati/);
        }
      }
      // Les listes numérotées (écrans 5 et 7) gardent le même nombre d'étapes que l'anglais.
      expect(listes(d), l).toEqual(listes(dico("en")));
      expect(d["onb.progress"]).toContain("{n}");
      expect(d["onb.progress"]).toContain("{total}");
    }
  });
});
