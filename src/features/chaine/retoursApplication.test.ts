import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { blocRetoursApplication, groupesRetours, MAX_RETOURS_APPLICATION, type RetourApplication } from "./retoursApplication";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

const retour = (langue: string, application_id: string, fautif: string, minute: number, corrige: string | null = "x"): RetourApplication => ({
  langue,
  application_id,
  fautif,
  corrige,
  explication: null,
  created_at: `2026-11-18T10:${String(minute).padStart(2, "0")}:00Z`,
});

describe("blocRetoursApplication", () => {
  it("écrit une ligne par retour, sans doublon, avec l'explication", () => {
    expect(
      blocRetoursApplication("de", [
        { fautif: " eine App wie Sophia ", corrige: "ich les das auf Sophia", explication: "sonne pub" },
        { fautif: "EINE APP WIE SOPHIA", corrige: "autre", explication: null },
        { fautif: "Lade Sophia herunter", corrige: null, explication: null },
      ]),
    ).toBe(
      [
        "=== RETOURS DES RELECTEURS NATIFS SUR LA SLIDE DE L'APPLI (DE) ===",
        "Des natifs ont relu nos slides d'appli dans cette langue et relevé ceci. Applique ces retours, et ne refais pas ces erreurs dans des phrases voisines :",
        "- au lieu de « eine App wie Sophia », écris « ich les das auf Sophia » (sonne pub)",
        "- évite « Lade Sophia herunter »",
      ].join("\n"),
    );
  });

  it("rien à dire : null, le prompt de placement reste celui d'avant", () => {
    expect(blocRetoursApplication("de", [])).toBeNull();
    expect(blocRetoursApplication("de", [{ fautif: "  ", corrige: "x", explication: null }])).toBeNull();
  });
});

describe("groupesRetours", () => {
  it("un bloc par langue et par application : l'allemand de Sophia ne va ni à l'italien ni à micabo", () => {
    const groupes = groupesRetours([
      retour("de", SOPHIA, "eine App wie Sophia", 1),
      retour("it", SOPHIA, "un'app come Sophia", 2),
      retour("de", MICABO, "die micabo App", 3),
      retour("DE", SOPHIA, "Sophia App nutzen", 4),
    ]);
    expect(groupes.map((g) => [g.langue, g.applicationId, g.n])).toEqual([
      ["de", SOPHIA, 2],
      ["de", MICABO, 1],
      ["it", SOPHIA, 1],
    ]);
    const deSophia = groupes[0].bloc;
    expect(deSophia).toContain("(DE)");
    expect(deSophia).toContain("eine App wie Sophia");
    expect(deSophia).not.toContain("micabo");
    expect(deSophia).not.toContain("un'app come Sophia");
    // Les plus récentes d'abord, comme la lecture du moteur.
    expect(deSophia.indexOf("Sophia App nutzen")).toBeLessThan(deSophia.indexOf("eine App wie Sophia"));
  });

  it("au-delà des 40 plus récentes, le placement ne reçoit plus : le reste est compté à part", () => {
    const lignes = Array.from({ length: MAX_RETOURS_APPLICATION + 3 }, (_, i) => retour("de", SOPHIA, `fragment ${i}`, i));
    const [g] = groupesRetours(lignes);
    expect(g.n).toBe(MAX_RETOURS_APPLICATION);
    expect(g.horsBloc).toBe(3);
    expect(g.bloc).not.toContain("« fragment 0 »");
    expect(g.bloc).toContain(`« fragment ${MAX_RETOURS_APPLICATION + 2} »`);
  });
});

describe("copie du moteur", () => {
  it("`ligneRetour` et `blocRetoursApplication` sont identiques à celles de corrections_natives.ts", () => {
    const extrait = (chemin: string) => {
      const source = readFileSync(chemin, "utf8");
      const debut = source.indexOf("function ligneRetour(");
      const fin = source.indexOf("\n}\n", source.indexOf("export function blocRetoursApplication(")) + 3;
      expect(debut).toBeGreaterThan(-1);
      expect(fin).toBeGreaterThan(debut);
      return source.slice(debut, fin);
    };
    expect(extrait("src/features/chaine/retoursApplication.ts")).toBe(extrait("supabase/functions/_shared/corrections_natives.ts"));
  });

  it("le plafond est celui de `chargerRetoursApplication`", () => {
    const moteur = readFileSync("supabase/functions/_shared/corrections_natives.ts", "utf8");
    expect(moteur).toMatch(new RegExp(`applicationId: string,\\s+max = ${MAX_RETOURS_APPLICATION},`));
  });
});
