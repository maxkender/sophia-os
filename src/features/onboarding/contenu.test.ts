import { describe, expect, it } from "vitest";

import { ECRANS, QUESTIONS, REGLE_ARGENT, REGLE_HELP, ecransPour, questionsPour } from "./contenu";

function texte(ecrans: ReturnType<typeof ecransPour>, cle: string): string {
  return JSON.stringify(ecrans.find((e) => e.cle === cle)?.blocs ?? []);
}

describe("ecransPour", () => {
  it("garde l'accueil standard pour un poster recruté par un HM (seule la 1re semaine est personnelle)", () => {
    const ecrans = ecransPour({ cohorteRuul: false, emailRuul: null });
    expect(ecrans.map((e) => e.cle)).toEqual(ECRANS.map((e) => e.cle));
    expect(ecrans.filter((e, i) => e !== ECRANS[i]).map((e) => e.cle)).toEqual(["compte"]);
  });

  it("cohorte Ruul : mêmes écrans, dans le même ordre ; Slack, Payments et la 1re semaine remplacés", () => {
    const ecrans = ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" });
    // La reprise et le compteur d'étapes s'appuient sur ECRANS.length.
    expect(ecrans.map((e) => e.cle)).toEqual(ECRANS.map((e) => e.cle));
    const changes = ecrans.filter((e, i) => e !== ECRANS[i]).map((e) => e.cle);
    expect(changes).toEqual(["slack", "paiements", "compte"]);
  });

  it("cohorte Ruul : paie par Ruul avec l'adresse du site, plus de HM ni d'Upwork", () => {
    const ecrans = ecransPour({ cohorteRuul: true, emailRuul: "ana@example.com" });
    const paie = texte(ecrans, "paiements");
    expect(paie).toContain("Ruul");
    expect(paie).toContain("ana@example.com");
    expect(paie).not.toMatch(/hiring manager|upwork/i);
    // 13/11 (Max) : jamais « crée ton compte sur ruul.io » : depuis l'email d'invitation.
    expect(paie).not.toMatch(/ruul\.io/i);
    expect(paie).toContain("invitation email from Ruul");
    expect(paie).toContain("FROM that email");
    expect(paie).toContain("It's done");
    expect(paie).toContain(REGLE_ARGENT);
    const slack = texte(ecrans, "slack");
    expect(slack).toContain("#ruul-posters");
    expect(slack).toContain("#posting-help");
    expect(slack).not.toMatch(/#ruul-questions|#questions|Lucia/);
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

  it("13/11 : l'écran Slack porte la règle unique (Help, puis Slack dans le bon salon, puis l'argent)", () => {
    expect(cles[1]).toBe("slack");
    const t = texte(ECRANS, "slack");
    expect(t).toContain(REGLE_HELP.replace(/"/g, '\\"'));
    expect(t).toContain("#posting-help");
    expect(t).toContain("#upwork-posters");
    expect(t).toContain("Please make sure you join Slack");
    expect(t).toContain("Maximilien Kender");
    expect(t).not.toMatch(/#questions|Lucia|ask all your questions/);
    expect(ECRANS.find((e) => e.cle === "slack")!.blocs.some((b) => b.type === "rejoindreSlack")).toBe(true);
  });

  it("13/11 : plus jamais #questions, #ruul-questions ni Lucia dans l'accueil et le quiz", () => {
    const tout = JSON.stringify([ECRANS, ecransPour({ cohorteRuul: true, emailRuul: null }), QUESTIONS]);
    expect(tout).not.toMatch(/#questions|#ruul-questions|Lucia|ask all your questions/);
  });

  it("la 1re semaine, dans l'ordre, jusqu'au 1er paiement (Upwork : par milestone)", () => {
    const compte = ECRANS.find((e) => e.cle === "compte")!;
    expect(compte.blocs.map((b) => b.type)).toEqual(["frise", "regle", "regle", "alerte"]);
    const frise = compte.blocs[0] as Extract<(typeof compte.blocs)[number], { type: "frise" }>;
    expect(frise.items.map((i) => i.titre)).toEqual([
      "1. Log in",
      "2. Join Slack",
      "3. Create your TikTok account",
      "4. Start warmup + follow 5 accounts",
      "5. Your first post",
      "6. Your first payment: the Monday after your first week, via your Upwork milestone",
    ]);
    expect(frise.items[3]!.quand).toBe("Before Sunday midnight");
    expect(compte.blocs).toContainEqual({ type: "regle", regle: "warmup" });
    expect(compte.blocs).toContainEqual({ type: "regle", regle: "lien" });
  });

  it("13/11 : Ruul, l'étape « Prepare your Ruul account » et le 1er paiement avec SON montant", () => {
    const ecrans = ecransPour({ cohorteRuul: true, emailRuul: null, handle: "ana.studies", premierPost: "Monday 16 November", premierPaiement: "Monday 23 November", montantSemaine: 10 });
    const compte = ecrans.find((e) => e.cle === "compte")!;
    const frise = compte.blocs[0] as Extract<(typeof compte.blocs)[number], { type: "frise" }>;
    expect(frise.items.map((i) => i.titre)).toEqual([
      "1. Log in",
      "2. Join Slack",
      "3. Create your TikTok account @ana.studies",
      "4. Start warmup + follow 5 accounts",
      "5. Prepare your Ruul account",
      "6. Your first post",
      "7. Your first payment: Monday 23 November, 10 $ for your first week",
    ]);
    expect(frise.items[4]!.texte).toContain("Invitation email from Ruul");
    // Montant inconnu : pas de montant inventé.
    const sans = ecransPour({ cohorteRuul: true, emailRuul: null, premierPaiement: "Monday 23 November" });
    expect(texte(sans, "compte")).toContain("7. Your first payment: Monday 23 November\"");
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
    expect(q("question").options).toEqual(["I DM the CEO", "I ask Help in the Sophia OS", "I ask anybody"]);
    expect(q("question").options[q("question").bonne]).toBe("I ask Help in the Sophia OS");
    const paie = q("paiement").options[q("paiement").bonne]!;
    expect(paie).toBe("I ask Help in the OS; if it's really a problem, I DM Maximilien Kender on Slack");
    expect(paie).not.toMatch(/hiring manager/i);
  });

  it("chaque réponse attendue se lit sur l'écran où le quiz renvoie", () => {
    expect(texte(ECRANS, "slack")).toContain("Click **Help**");
    expect(texte(ECRANS, "paiements")).toContain(REGLE_ARGENT);
    expect(texte(ecransPour({ cohorteRuul: true, emailRuul: null }), "paiements")).toContain(REGLE_ARGENT);
  });

  it("13/11 : mêmes questions pour Ruul et Upwork", () => {
    expect(questionsPour({ cohorteRuul: true, emailRuul: null })).toBe(QUESTIONS);
    expect(questionsPour(null)).toBe(QUESTIONS);
  });
});
