import { describe, expect, it } from "vitest";

import { ECRANS, QUESTIONS, QUESTIONS_PAIE, SALON_COHORTE_RUUL, ecransPour, questionsPour } from "./contenu";

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

  it("Slack d'abord, recommandé (28 oct.) : « Join Slack » et la phrase sur le nom complet", () => {
    expect(cles[1]).toBe("slack");
    expect(texte(ECRANS, "slack")).toContain("1. JOIN SLACK (RECOMMENDED)");
    expect(texte(ECRANS, "slack")).toContain("Join with your **full name**: that's where you get news and answers to your questions.");
    expect(ECRANS.find((e) => e.cle === "slack")!.blocs.some((b) => b.type === "rejoindreSlack")).toBe(true);
  });

  it("28 oct., G : la 1re semaine en 5 étapes, dans l'ordre, avec les règles du warm-up et du lien", () => {
    const compte = ECRANS.find((e) => e.cle === "compte")!;
    expect(compte.blocs.map((b) => b.type)).toEqual(["frise", "regle", "regle", "alerte"]);
    const frise = compte.blocs[0] as Extract<(typeof compte.blocs)[number], { type: "frise" }>;
    expect(frise.items.map((i) => i.titre)).toEqual([
      "1. Log in",
      "2. Join Slack",
      "3. Create your TikTok account",
      "4. Start warmup + follow 5 accounts",
      "5. Your first post",
    ]);
    expect(frise.items[3]!.quand).toBe("Before Sunday midnight");
    expect(compte.blocs).toContainEqual({ type: "regle", regle: "warmup" });
    expect(compte.blocs).toContainEqual({ type: "regle", regle: "lien" });
  });

  it("28 oct., G : le @ et le lundi du posteur quand on les connaît", () => {
    const ecrans = ecransPour({ cohorteRuul: false, emailRuul: null, handle: "@ana.studies", premierPost: "Monday 2 November" });
    expect(ecrans.map((e) => e.cle)).toEqual(ECRANS.map((e) => e.cle));
    const t = texte(ecrans, "compte");
    expect(t).toContain("3. Create your TikTok account @ana.studies");
    expect(t).toContain("Monday 2 November");
    expect(t).not.toContain("@@");
  });

  it("28 oct. : la règle du lien sur l'écran du post, et plus aucun repost demandé au posteur", () => {
    expect(ECRANS.find((e) => e.cle === "posting")!.blocs).toContainEqual({ type: "regle", regle: "lien" });
    expect(JSON.stringify(ECRANS).toLowerCase()).not.toContain("repost");
    expect(JSON.stringify(QUESTIONS).toLowerCase()).not.toContain("repost");
  });

  it("le timing a son propre écran, juste après la démo", () => {
    expect(cles.indexOf("timing")).toBe(cles.indexOf("posting") + 1);
    expect(texte(ECRANS, "posting")).not.toContain("peak hours");
    expect(texte(ECRANS, "timing")).toContain("peak hours");
    expect(texte(ECRANS, "posting")).toContain("Watch the demo carefully");
  });

  it("le warm-up, en rouge vif : 10 min, 5 follows, sinon pas payé, avec sa vidéo", () => {
    expect(cles.indexOf("warmup")).toBe(cles.indexOf("timing") + 1);
    expect(texte(ECRANS, "warmup")).toContain("WARM UP YOUR ACCOUNT BEFORE YOU START POSTING");
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

  it("28 oct., G : aucun texte posteur ne renvoie à la HM pour la paie", () => {
    expect(JSON.stringify(ECRANS)).not.toMatch(/hiring manager/i);
    expect(JSON.stringify(QUESTIONS.find((x) => x.cle === "paiement"))).not.toMatch(/hiring manager/i);
  });

  it("le gras est bien fermé partout (pas d'étoiles orphelines)", () => {
    for (const ecran of [...ECRANS, ...ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" })]) {
      const etoiles = JSON.stringify(ecran.blocs).match(/\*\*/g)?.length ?? 0;
      expect(etoiles % 2, ecran.cle).toBe(0);
    }
  });
});

describe("pas de warm-up, pas de paie", () => {
  it("un écran à part, juste après le warm-up et avant la fin, en rouge vif", () => {
    const cles = ECRANS.map((e) => e.cle);
    expect(cles.indexOf("sans-warmup")).toBe(cles.indexOf("warmup") + 1);
    expect(cles.indexOf("fin")).toBe(cles.indexOf("sans-warmup") + 1);
    const ecran = ECRANS.find((e) => e.cle === "sans-warmup")!;
    expect(ecran.blocs[0]).toMatchObject({ type: "alerte", ton: "vif" });
    expect(texte(ECRANS, "sans-warmup")).toContain("NO monetary compensation");
    expect(texte(ECRANS, "sans-warmup")).toContain("shadowbanned");
  });
});

describe("quiz", () => {
  const q = (cle: string, liste = QUESTIONS) => liste.find((x) => x.cle === cle)!;

  it("sept questions, dont la paie sans warm-up, les questions et les paiements", () => {
    expect(QUESTIONS).toHaveLength(7);
    expect(q("paye-sans-warmup").options[q("paye-sans-warmup").bonne]).toBe("No");
    expect(q("question").options[q("question").bonne]).toContain("#questions");
    const paie = q("paiement").options[q("paiement").bonne]!;
    expect(paie).toContain("#questions");
    expect(paie).toContain("Upwork");
    expect(paie).not.toMatch(/hiring manager/i);
  });

  it("chaque réponse attendue se lit sur l'écran où le quiz renvoie", () => {
    expect(texte(ECRANS, "slack")).toContain("#questions");
    expect(texte(ECRANS, "paiements")).toContain(QUESTIONS_PAIE);
    expect(QUESTIONS_PAIE).toBe("Questions? Ask in #questions on Slack, or reply to our message on Upwork.");
  });

  it("cohorte Ruul : questions dans son salon, paie sans HM", () => {
    const ruul = questionsPour({ cohorteRuul: true, emailRuul: null });
    expect(ruul.map((x) => x.cle)).toEqual(QUESTIONS.map((x) => x.cle));
    expect(q("question", ruul).options[q("question", ruul).bonne]).toContain(SALON_COHORTE_RUUL);
    const paie = q("paiement", ruul).options[q("paiement", ruul).bonne]!;
    expect(paie).not.toMatch(/hiring manager/i);
    expect(paie).toContain("Lucia De Mojà or Maximilien Kender");
    expect(questionsPour(null)).toBe(QUESTIONS);
  });
});
