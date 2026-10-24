import { describe, expect, it } from "vitest";

import {
  CONTEXTE_MAX,
  assemblerContexte,
  audiencesPour,
  audiencesSnippets,
  formaterSnapshotAdmin,
  formaterSnapshotHm,
  formaterSnapshotPoster,
  ATTENTE_CHAT,
  htmlVersTexte,
  LANGUES_CHAT,
  langueDepuisProfil,
  langueDuCompte,
  PLACEHOLDER_CHAT,
  SALUTATION_CHAT,
} from "./prompt";

describe("htmlVersTexte", () => {
  it("retire les balises et garde le texte", () => {
    expect(htmlVersTexte("<p>Bonjour <strong>toi</strong></p>")).toBe("Bonjour toi");
  });

  it("transforme les listes en puces", () => {
    expect(htmlVersTexte("<ul><li>A</li><li>B</li></ul>")).toBe("• A\n• B");
  });

  it("décode les entités courantes", () => {
    expect(htmlVersTexte("A&nbsp;&amp;&nbsp;B")).toBe("A & B");
  });
});

describe("langueDuCompte", () => {
  it("prend la langue du compte, variantes régionales comprises", () => {
    expect(langueDuCompte("tr")).toBe("tr");
    expect(langueDuCompte("es-419")).toBe("es");
    expect(langueDuCompte("pt-BR")).toBe("pt");
    expect(langueDuCompte("hr")).toBe("hr");
  });

  it("retombe sur l'anglais, jamais sur le français par défaut du profil", () => {
    expect(langueDuCompte(null)).toBe("en");
    expect(langueDuCompte("xx")).toBe("en");
  });

  it("chaque langue de la bulle a son accueil, son champ et son attente", () => {
    for (const l of LANGUES_CHAT) {
      expect(SALUTATION_CHAT[l], l).toBeTruthy();
      expect(PLACEHOLDER_CHAT[l], l).toBeTruthy();
      expect(ATTENTE_CHAT[l], l).toBeTruthy();
    }
  });
});

describe("langueDepuisProfil", () => {
  it("prend la première langue cible du profil", () => {
    expect(langueDepuisProfil(["de", "en"], "fr")).toBe("de");
  });

  it("retombe sur le repli UI si le profil est vide", () => {
    expect(langueDepuisProfil([], "es")).toBe("es");
    expect(langueDepuisProfil(null, "fr")).toBe("fr");
  });

  it("ignore un code inconnu", () => {
    expect(langueDepuisProfil(["xx"], "it")).toBe("it");
  });
});

describe("textes widget dans la langue du profil", () => {
  it("salut et placeholder suivent le code langue", async () => {
    const { placeholderChat, salutationChat } = await import("./prompt");
    expect(salutationChat("de")).toMatch(/Stell deine Frage/);
    expect(placeholderChat("de")).toBe("Deine Frage…");
    expect(placeholderChat("es")).toBe("Tu pregunta…");
    expect(placeholderChat("fr")).toBe("Ta question…");
  });
});

describe("audiences", () => {
  it("sépare docs et snippets par rôle", () => {
    expect(audiencesPour("poster")).toEqual(["poster", "all"]);
    expect(audiencesPour("hiring_manager")).toEqual(["manager", "all"]);
    expect(audiencesPour("directing_manager")).toEqual(["manager", "all"]);
    expect(audiencesSnippets("admin")).toEqual(["admin", "all"]);
    expect(audiencesSnippets("poster")).toEqual(["poster", "all"]);
    expect(audiencesSnippets("hiring_manager")).toEqual(["hiring_manager", "all"]);
    expect(audiencesSnippets("directing_manager")).toEqual(["hiring_manager", "all"]);
  });
});

describe("assemblerContexte", () => {
  const docs = [
    {
      titre: "Guide créateur",
      titre_en: "Creator guide",
      contenu: "<p>Poste le carrousel</p>",
      contenu_en: "<p>Post the carousel</p>",
      audience: "poster" as const,
    },
    {
      titre: "Guide manager",
      titre_en: null,
      contenu: "<p>Recrute un poster</p>",
      contenu_en: null,
      audience: "manager" as const,
    },
  ];

  it("n'injecte pas le guide manager à un créateur", () => {
    const texte = assemblerContexte([], docs, "poster", "fr");
    expect(texte).toContain("Guide créateur");
    expect(texte).not.toContain("Guide manager");
  });

  it("n'injecte pas un snippet admin à un créateur", () => {
    const texte = assemblerContexte(
      [
        { titre: "Chiffres", contenu: "42 posts hier", audience: "admin" },
        { titre: "FAQ créateur", contenu: "Ouvre le calendrier", audience: "poster" },
      ],
      docs,
      "poster",
      "fr",
    );
    expect(texte).toContain("FAQ créateur");
    expect(texte).not.toContain("42 posts");
  });

  it("prend la version anglaise pour une langue non-FR", () => {
    const texte = assemblerContexte([], docs, "poster", "de");
    expect(texte).toContain("Creator guide");
    expect(texte).toContain("Post the carousel");
  });

  it("tronque un contexte trop long", () => {
    const gros = "x".repeat(CONTEXTE_MAX + 80);
    const texte = assemblerContexte([{ titre: "Gros", contenu: gros, audience: "all" }], [], "admin", "fr");
    expect(texte.length).toBeLessThan(gros.length);
    expect(texte.endsWith("[…contexte tronqué]")).toBe(true);
  });
});

describe("snapshots métier", () => {
  it("formate un snapshot admin avec les totaux", () => {
    const texte = formaterSnapshotAdmin({
      aujourdHui: "2026-08-14",
      hier: "2026-08-13",
      postsHier: { date: "2026-08-13", prevus: 40, publies: 31 },
      postsAuj: { date: "2026-08-14", prevus: 38, publies: 12 },
      postersActifs: 70,
      postersTotal: 80,
      hiringManagers: 5,
      comptesActifs: 72,
      parLangueHier: { fr: 10, de: 8 },
    });
    expect(texte).toContain("40 prévus, 31 publiés");
    expect(texte).toContain("70 actifs / 80");
    expect(texte).toContain("fr 10");
  });

  it("ne liste que les créateurs du HM", () => {
    const texte = formaterSnapshotHm({
      aujourdHui: "2026-08-14",
      hier: "2026-08-13",
      createurs: [{ nom: "Marie", langue: "de", handle: "marie", actifs: true }],
      postsHier: { date: "2026-08-13", prevus: 2, publies: 2 },
      postsAuj: { date: "2026-08-14", prevus: 2, publies: 0 },
    });
    expect(texte).toContain("Marie");
    expect(texte).toContain("autres équipes");
  });

  it("borne le créateur à son calendrier", () => {
    const texte = formaterSnapshotPoster({
      aujourdHui: "2026-08-14",
      demain: "2026-08-15",
      nom: "Léa",
      langue: "es",
      handle: "lea",
      persona: "Luna",
      postsParJour: 1,
      warmup: "termine",
      postsAuj: { date: "2026-08-14", prevus: 1, publies: 0 },
      postsDemain: { date: "2026-08-15", prevus: 1, publies: 0 },
    });
    expect(texte).toContain("Léa");
    expect(texte).toContain("es");
    expect(texte).toContain("TON calendrier");
  });
});
