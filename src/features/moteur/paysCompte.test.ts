import { describe, expect, it } from "vitest";

import { paysAEnvoyer, paysRequis } from "./paysCompte";
import { LANGUES_CIBLES } from "./langues";

/**
 * Le défaut que ce champ corrige : rien ne renseignait le pays à la création,
 * et un compte sans pays n'apparaît dans AUCUNE ligne des cibles de
 * recrutement. Pas d'erreur, juste un chiffre un cran trop bas. Quatre comptes
 * sont nés comme ça en deux jours.
 */
describe("quand faut-il saisir le pays", () => {
  it("ne demande rien pour une langue qui ne désigne qu'un marché", () => {
    // Faire ressaisir « suédois → Suède » n'apprend rien à personne, et le
    // trigger comptes_pays_defaut le fait déjà à l'insert.
    for (const langue of ["sv", "pl", "pt-BR", "de", "bg", "et"]) {
      expect(paysRequis(langue), langue).toBe(false);
    }
  });

  it("exige le pays pour les quatre langues qui couvrent plusieurs marchés", () => {
    // en : UK, US, Australie, NZ, Irlande, Canada. ar : Émirats, Égypte.
    // es-419 : toute l'Amérique latine. ru : Kazakhstan, Ukraine, Biélorussie.
    for (const langue of ["en", "ar", "es-419", "ru"]) {
      expect(paysRequis(langue), langue).toBe(true);
    }
  });

  it("ne demande rien tant qu'aucune langue n'est choisie", () => {
    expect(paysRequis("")).toBe(false);
  });

  it("couvre toutes les langues de l'OS, sans trou", () => {
    const ambigues = ["en", "ar", "es-419", "ru"];
    for (const langue of LANGUES_CIBLES) {
      expect(paysRequis(langue), langue).toBe(ambigues.includes(langue));
    }
  });
});

describe("ce qui part réellement à la création", () => {
  it("n'envoie rien quand la langue tranche, même si un pays traîne dans l'état", () => {
    // Deux sources de vérité finissent par diverger : si la langue suffit,
    // c'est le trigger qui décide, point.
    expect(paysAEnvoyer("sv", "")).toBeUndefined();
    expect(paysAEnvoyer("sv", "NO")).toBeUndefined();
  });

  it("envoie le pays choisi quand la langue ne tranche pas", () => {
    expect(paysAEnvoyer("en", "AU")).toBe("AU");
    expect(paysAEnvoyer("ru", "KZ")).toBe("KZ");
  });

  it("n'envoie rien si la langue est ambiguë et que rien n'est choisi", () => {
    // Le formulaire bloque avant d'en arriver là ; si jamais il laissait
    // passer, mieux vaut un pays vide et visible qu'un pays deviné.
    expect(paysAEnvoyer("en", "")).toBeUndefined();
  });
});
