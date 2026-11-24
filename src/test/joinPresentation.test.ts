// apps/join : la présentation avant le formulaire (24/11) — texte tapé, vue une fois par session, textes dans
// les 17 langues sans promesse de montant ni mot interdit.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLES_PRESENTATION, longueurTape, marquerPresentationVue, NB_ECRANS, presentationVue, texteTape,
} from "../../apps/join/src/presentation";

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

  it("a ses textes dans les 17 langues, sans montant ni mot interdit", () => {
    expect(langues).toHaveLength(17);
    expect(CLES_PRESENTATION).toHaveLength(9 + 2 * NB_ECRANS);
    for (const l of langues) {
      const d = dico(l);
      for (const cle of CLES_PRESENTATION) {
        expect(d[cle], `${l} · ${cle}`).toBeTruthy();
        if (/^onb\.\d\./.test(cle)) {
          expect(d[cle], `${l} · ${cle}`).not.toMatch(/[$€]|\b(AI|IA)\b|\b[Bb]ots?\b|[Aa]utomati/);
        }
      }
      expect(d["onb.progress"]).toContain("{n}");
      expect(d["onb.progress"]).toContain("{total}");
    }
  });
});
