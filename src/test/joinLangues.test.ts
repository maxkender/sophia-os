// apps/join (24/11, Max) : Join existe dans toutes les langues de l'OS, chacune avec son nom natif ; chaque pays de
// l'OS tombe sur sa langue ; he et ar s'écrivent de droite à gauche.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { estRtl, LANGUE_PAR_PAYS, langueDuNavigateur, NOMS_LANGUES } from "../../apps/join/src/langues";
import { LANGUES_CIBLES } from "@/features/moteur/langues";

const DOSSIER = join(__dirname, "../../apps/join/src/locales");
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const connue = (c: string) => fichiers.includes(c);

/** La langue de Join qui sert une langue de l'OS : les variantes régionales par leur langue (pt-BR → pt). */
const deJoin = (os: string) => os.split("-")[0];

describe("langues de apps/join", () => {
  it("a un fichier et un nom natif pour chaque langue, et inversement", () => {
    expect(fichiers.sort()).toEqual(Object.keys(NOMS_LANGUES).sort());
  });

  it("couvre toutes les langues de l'OS", () => {
    for (const l of LANGUES_CIBLES) expect(connue(deJoin(l)), l).toBe(true);
  });

  it("envoie chaque pays de l'OS vers une langue que Join connaît", () => {
    for (const [pays, l] of Object.entries(LANGUE_PAR_PAYS)) expect(connue(l), pays).toBe(true);
    expect([LANGUE_PAR_PAYS.IL, LANGUE_PAR_PAYS.FI, LANGUE_PAR_PAYS.LV, LANGUE_PAR_PAYS.LT, LANGUE_PAR_PAYS.EE,
      LANGUE_PAR_PAYS.NO, LANGUE_PAR_PAYS.DK, LANGUE_PAR_PAYS.SE, LANGUE_PAR_PAYS.SI, LANGUE_PAR_PAYS.BR])
      .toEqual(["he", "fi", "lv", "lt", "et", "no", "da", "sv", "sl", "pt"]);
  });

  it("choisit la langue du navigateur, puis celle du pays du navigateur, sinon l'anglais", () => {
    expect(langueDuNavigateur(["fi-FI", "en"], connue)).toBe("fi");
    expect(langueDuNavigateur(["nb-NO"], connue)).toBe("no");
    expect(langueDuNavigateur(["iw"], connue)).toBe("he");
    expect(langueDuNavigateur(["pt-BR"], connue)).toBe("pt");
    expect(langueDuNavigateur(["es-419"], connue)).toBe("es");
    expect(langueDuNavigateur(["xx-LV"], connue)).toBe("lv");
    expect(langueDuNavigateur(["xx"], connue)).toBe("en");
    expect(langueDuNavigateur([], connue)).toBe("en");
  });

  it("écrit l'hébreu et l'arabe de droite à gauche, seulement eux", () => {
    expect(fichiers.filter(estRtl).sort()).toEqual(["ar", "he"]);
  });
});
