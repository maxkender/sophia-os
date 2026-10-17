import { describe, expect, it } from "vitest";

import { ECRANS, ecransPour } from "./contenu";

function texte(ecrans: ReturnType<typeof ecransPour>, cle: string): string {
  return JSON.stringify(ecrans.find((e) => e.cle === cle)?.blocs ?? []);
}

describe("ecransPour", () => {
  it("garde l'accueil standard pour un poster recruté par un HM", () => {
    expect(ecransPour(null)).toBe(ECRANS);
    expect(ecransPour({ cohorteRuul: false, emailRuul: null })).toBe(ECRANS);
  });

  it("cohorte Ruul : mêmes écrans, dans le même ordre, deux seulement remplacés", () => {
    const ecrans = ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" });
    // La reprise et le compteur d'étapes s'appuient sur ECRANS.length.
    expect(ecrans.map((e) => e.cle)).toEqual(ECRANS.map((e) => e.cle));
    const changes = ecrans.filter((e, i) => e !== ECRANS[i]).map((e) => e.cle);
    expect(changes).toEqual(["slack", "paiements"]);
  });

  it("cohorte Ruul : paie par Ruul avec l'adresse du site, plus de HM ni d'Upwork", () => {
    const ecrans = ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" });
    const paie = texte(ecrans, "paiements");
    expect(paie).toContain("Ruul");
    expect(paie).toContain("ana@example.com");
    expect(paie).not.toMatch(/hiring manager|upwork/i);
    expect(texte(ecrans, "slack")).toContain("#ruul-cohort");
  });

  it("cohorte Ruul sans adresse connue : renvoie à l'adresse de candidature", () => {
    const paie = texte(ecransPour({ cohorteRuul: true, emailRuul: null }), "paiements");
    expect(paie).toContain("the email address you applied with");
  });
});
