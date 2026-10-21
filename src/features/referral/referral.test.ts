import { describe, expect, it } from "vitest";

import { LANGUES_CIBLES, PAYS_OS, estPaysOs } from "@/features/moteur/langues";
import { en } from "@/locales/en";
import { fr } from "@/locales/fr";
import {
  BONUS_PAR_RECRUE_USD,
  bonusPotentielUsd,
  texteOuNull,
  validerReferral,
  type ReferralPayload,
} from "./referral";

function payloadValide(over: Partial<ReferralPayload> = {}): ReferralPayload {
  return {
    prenom: "Alex",
    nom: "Martin",
    pays: "fr",
    contact_upwork: "https://www.upwork.com/freelancers/~alex",
    contact_email: "",
    confirme_present: true,
    confirme_fiable: true,
    confirme_majeur: true,
    ...over,
  };
}

describe("PAYS_OS", () => {
  it("couvre toutes les langues cibles de l’OS", () => {
    expect([...PAYS_OS]).toEqual([...LANGUES_CIBLES]);
    for (const code of LANGUES_CIBLES) {
      expect(estPaysOs(code)).toBe(true);
    }
    expect(estPaysOs("xx")).toBe(false);
    expect(estPaysOs("")).toBe(false);
  });

  it("a un libellé de pays FR et EN pour chaque pays OS", () => {
    for (const code of PAYS_OS) {
      expect(fr.translation.referral.pays[code].length).toBeGreaterThan(0);
      expect(en.translation.referral.pays[code].length).toBeGreaterThan(0);
    }
  });
});

describe("bonusPotentielUsd", () => {
  it("compte 10 $ par recrue éligible (première semaine de posts terminée)", () => {
    expect(BONUS_PAR_RECRUE_USD).toBe(10);
    expect(bonusPotentielUsd(0)).toBe(0);
    expect(bonusPotentielUsd(1)).toBe(10);
    expect(bonusPotentielUsd(10)).toBe(100);
    expect(bonusPotentielUsd(-2)).toBe(0);
    expect(bonusPotentielUsd(2.9)).toBe(20);
  });
});

describe("validerReferral", () => {
  it("accepte un formulaire complet avec Upwork", () => {
    expect(validerReferral(payloadValide())).toBeNull();
  });

  it("accepte l’email à la place d’Upwork", () => {
    expect(
      validerReferral(
        payloadValide({
          contact_upwork: "",
          contact_email: "alex@example.com",
        }),
      ),
    ).toBeNull();
  });

  it("exige prénom, pays OS, un contact et les 3 confirmations", () => {
    expect(validerReferral(payloadValide({ prenom: "  " }))).toBe("referral.err.prenom");
    expect(validerReferral(payloadValide({ pays: "xx" }))).toBe("referral.err.pays");
    expect(
      validerReferral(
        payloadValide({
          contact_upwork: "",
          contact_email: "",
        }),
      ),
    ).toBe("referral.err.contact");
    expect(validerReferral(payloadValide({ confirme_present: false }))).toBe(
      "referral.err.present",
    );
    expect(validerReferral(payloadValide({ confirme_fiable: false }))).toBe(
      "referral.err.fiable",
    );
    expect(validerReferral(payloadValide({ confirme_majeur: false }))).toBe(
      "referral.err.majeur",
    );
  });

  it("contrôle le format si un contact est rempli", () => {
    expect(validerReferral(payloadValide({ contact_upwork: "pas-un-lien" }))).toBe(
      "referral.err.upwork",
    );
    expect(
      validerReferral(
        payloadValide({
          contact_upwork: "",
          contact_email: "pas-un-mail",
        }),
      ),
    ).toBe("referral.err.email");
  });

  it("accepte un profil Upwork sans schéma http", () => {
    expect(
      validerReferral(payloadValide({ contact_upwork: "www.upwork.com/freelancers/~x" })),
    ).toBeNull();
    expect(validerReferral(payloadValide({ contact_upwork: "upwork.com/freelancers/~x" }))).toBe(
      null,
    );
  });
});

describe("texteOuNull", () => {
  it("normalise les chaînes vides", () => {
    expect(texteOuNull("  ")).toBeNull();
    expect(texteOuNull("Alex")).toBe("Alex");
  });
});
