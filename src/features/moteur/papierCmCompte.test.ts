import { describe, expect, it } from "vitest";

import {
  cibleComptePapier,
  identifiantsCmDepuisLangue,
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

  it("génère handle et Gmail si le HM laisse vide", () => {
    const auto = identifiantsCmDepuisLangue("es");
    expect(auto.handle_tiktok).toBe("sophia.app.es");
    expect(auto.tiktok_email).toBe("sophia.knowledge.spain@gmail.com");
    expect(auto.tiktok_password.length).toBeGreaterThanOrEqual(12);
    expect(identifiantsCmDepuisLangue("es", { handle: "@custom" }).handle_tiktok).toBe("custom");
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
    expect(md).toContain("automatically generated names");
  });
});
