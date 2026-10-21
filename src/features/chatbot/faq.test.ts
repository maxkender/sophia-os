import { describe, expect, it } from "vitest";

import { compterDecisions, dansFiltre, lienSlack, lireReglagesFaq } from "./faq";

describe("réglages de la FAQ", () => {
  it("démarre en test et ne passe jamais en actif sur une valeur inconnue", () => {
    expect(lireReglagesFaq(undefined)).toEqual({
      mode_slack: "test",
      mode_os: "test",
      canaux_slack: ["C0BL56RJH7T"],
      message_attente: true,
    });
    expect(lireReglagesFaq({ mode_slack: "on", mode_os: "Actif" }).mode_slack).toBe("test");
    expect(lireReglagesFaq({ mode_slack: "on", mode_os: "Actif" }).mode_os).toBe("test");
    expect(lireReglagesFaq({ mode_slack: "eteint" }).mode_slack).toBe("eteint");
    expect(lireReglagesFaq({ canaux_slack: ["#questions", "C0BL0084Y3F"] }).canaux_slack).toEqual(["C0BL0084Y3F"]);
  });
});

describe("journal", () => {
  it("range relances avec « À traiter » et les trois issues humaines avec « Traité »", () => {
    expect(dansFiltre("relance", "a_traiter")).toBe(true);
    expect(dansFiltre("traite_slack", "traite")).toBe(true);
    expect(dansFiltre("ignore", "traite")).toBe(true);
    expect(dansFiltre("bug", "repondu")).toBe(false);
    expect(dansFiltre(null, "tous")).toBe(true);
    expect(compterDecisions(["repondu", "bug", "a_traiter", "relance", "traite_admin"])).toEqual({
      tous: 5,
      repondu: 1,
      bug: 1,
      a_traiter: 2,
      hors_sujet: 0,
      traite: 1,
    });
  });

  it("lien Slack d'un message", () => {
    expect(lienSlack("C0BL56RJH7T", "1792143200.511969")).toBe(
      "https://sophia-system.slack.com/archives/C0BL56RJH7T/p1792143200511969",
    );
  });
});
