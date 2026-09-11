import { describe, expect, it } from "vitest";

import {
  cibleComptePapier,
  signaturesCorrespondent,
  validerSignatureContrat,
} from "./papierCmCompte";
import { texteContratPapier } from "./papierCmContratTexte";

describe("compte Paper Instagram", () => {
  it("pose Gmail et @ Instagram selon la langue (exemple Espagne du contrat)", () => {
    const es = cibleComptePapier("es");
    expect(es.email).toBe("sophia.knowledge.spain@gmail.com");
    expect(es.instagram).toBe("sophia.app.es");
    expect(cibleComptePapier("fr").instagram).toBe("sophia.app.fr");
    expect(cibleComptePapier("en").instagram).toBe("sophia.app.us");
  });

  it("exige une signature identique au nom légal", () => {
    expect(signaturesCorrespondent("Ada Lovelace", "Ada Lovelace")).toBe(true);
    expect(signaturesCorrespondent("Ada Lovelace", "ada  lovelace")).toBe(true);
    expect(signaturesCorrespondent("Ada Lovelace", "Ada")).toBe(false);
    expect(
      validerSignatureContrat({
        nomLegal: "Ada Lovelace",
        pays: "Spain",
        signature: "Ada Lovelace",
        lu: true,
        accepte: true,
      }),
    ).toBeNull();
    expect(
      validerSignatureContrat({
        nomLegal: "Ada Lovelace",
        pays: "Spain",
        signature: "Ada Lovelace",
        lu: true,
        accepte: false,
      }),
    ).toBe("papierContrat.errCases");
  });

  it("remplit le tableau Schedule A du contrat", () => {
    const es = cibleComptePapier("es");
    const md = texteContratPapier({
      email: es.email,
      instagram: es.instagram,
      paysEn: es.paysEn,
    });
    expect(md).toContain("sophia.app.es");
    expect(md).toContain("sophia.knowledge.spain@gmail.com");
    expect(md).toContain("Spain");
  });
});
