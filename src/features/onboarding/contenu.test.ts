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
    expect(paie).toContain("https://app.ruul.io/register");
    expect(texte(ecrans, "slack")).toContain("#ruul-questions");
    expect(texte(ecrans, "slack")).toContain("#welcome");
  });

  it("cohorte Ruul : l'écran Payments demande le nom de la pièce d'identité, l'accueil standard jamais", () => {
    const demande = (ecrans: ReturnType<typeof ecransPour>) =>
      ecrans.filter((e) => e.blocs.some((b) => b.type === "identite")).map((e) => e.cle);
    expect(demande(ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" }))).toEqual(["paiements"]);
    expect(demande(ECRANS)).toEqual([]);
  });

  it("cohorte Ruul sans adresse connue : renvoie à l'adresse de candidature", () => {
    const paie = texte(ecransPour({ cohorteRuul: true, emailRuul: null }), "paiements");
    expect(paie).toContain("the email address you applied with");
  });
});

describe("accueil standard", () => {
  const cles = ECRANS.map((e) => e.cle);

  it("s'ouvre sur la consigne de tout lire, sans l'écran « Our mission »", () => {
    expect(cles[0]).toBe("welcome");
    expect(texte(ECRANS, "welcome")).toContain("PLEASE READ EVERYTHING CAREFULLY.");
    expect(cles).not.toContain("mission");
  });

  it("le Slack d'abord, avec son lien", () => {
    expect(cles[1]).toBe("slack");
    expect(texte(ECRANS, "slack")).toContain("1. ALL COMMUNICATION HAPPENS ON SLACK.");
    expect(texte(ECRANS, "slack")).toContain("https://join.slack.com/");
  });

  it("la création du compte est une frise, la consigne du warm-up en dessous", () => {
    const compte = ECRANS.find((e) => e.cle === "compte")!;
    expect(compte.blocs.map((b) => b.type)).toEqual(["p", "frise", "alerte"]);
  });

  it("le timing a son propre écran, juste après la démo", () => {
    expect(cles.indexOf("timing")).toBe(cles.indexOf("posting") + 1);
    expect(texte(ECRANS, "posting")).not.toContain("peak hours");
    expect(texte(ECRANS, "timing")).toContain("peak hours");
    expect(texte(ECRANS, "posting")).toContain("Watch the demo carefully");
  });

  it("le warm-up, en rouge vif juste avant la fin : 10 min, 5 follows, sinon pas payé, avec sa vidéo", () => {
    expect(cles.indexOf("warmup")).toBe(cles.indexOf("fin") - 1);
    const warmup = ECRANS.find((e) => e.cle === "warmup")!;
    const vif = warmup.blocs.find((b) => b.type === "alerte" && b.ton === "vif");
    expect(vif).toBeDefined();
    const t = texte(ECRANS, "warmup");
    expect(t).toContain("At least 10 minutes");
    expect(t).toContain("Follow at least 5 people");
    expect(t).toContain("you will not be paid");
    expect(t).toContain("next Monday");
    expect(warmup.blocs).toContainEqual(expect.objectContaining({ type: "video", fichier: true, src: "/onboarding/warmup.mp4" }));
  });

  it("le gras est bien fermé partout (pas d'étoiles orphelines)", () => {
    for (const ecran of [...ECRANS, ...ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" })]) {
      const etoiles = JSON.stringify(ecran.blocs).match(/\*\*/g)?.length ?? 0;
      expect(etoiles % 2, ecran.cle).toBe(0);
    }
  });
});
