import { describe, expect, it } from "vitest";

import { ID_SOPHIA, type ApplicationMoteur } from "../multiApp";
import {
  applicationsAfficheesCompte,
  contenuHorsSophia,
  curseursBornes,
  diagnosticCompteSansSophia,
  etatRequalifCycle,
  etatPartsCompte,
  labelsPoolSophiaCompteMixte,
  nomApplicationPromue,
  nomsApplicationsDuLabel,
  partsDepuisCurseurs,
  posterServiApplication,
  resumeParts,
} from "./logique";

const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const SOPHIA: ApplicationMoteur = { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true };
const UNSWIPE: ApplicationMoteur = {
  id: ID_UNSWIPE,
  slug: "unswipe",
  nom: "Unswipe",
  langues: ["fr", "en"],
  actif: true,
};
const APPS = [SOPHIA, UNSWIPE];

const CLEAN = { id: "l-clean", slug: "clean-girl", nom: "Clean Girl" };
const CINEMA = { id: "l-cinema", slug: "cinema", nom: "Cinéma" };
const HOOK = { id: "l-hook", slug: "hook", nom: "Hook" };

/** Clean Girl sert Sophia + Unswipe ; Cinéma n'a aucune ligne (= Sophia). */
const LIENS = [
  { label_id: CLEAN.id, application_id: ID_SOPHIA },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE },
];

describe("nomApplicationPromue", () => {
  it("nomme l'application du post, Sophia si absente ou inconnue", () => {
    expect(nomApplicationPromue(ID_UNSWIPE, APPS)).toBe("Unswipe");
    expect(nomApplicationPromue(ID_SOPHIA, APPS)).toBe("Sophia");
    expect(nomApplicationPromue(null, APPS)).toBe("Sophia");
    expect(nomApplicationPromue(undefined, [])).toBe("Sophia");
    expect(nomApplicationPromue("inconnue", APPS)).toBe("Sophia");
  });
});

describe("applications d'un label", () => {
  it("un label sans ligne sert Sophia", () => {
    expect(nomsApplicationsDuLabel(CINEMA.id, LIENS, APPS)).toEqual(["Sophia"]);
    expect(nomsApplicationsDuLabel(CLEAN.id, LIENS, APPS).sort()).toEqual(["Sophia", "Unswipe"]);
  });

  it("filtre Posters : au moins un compte dont les labels servent l'application", () => {
    expect(posterServiApplication([[CINEMA], [CLEAN]], LIENS, ID_UNSWIPE)).toBe(true);
    expect(posterServiApplication([[CINEMA]], LIENS, ID_UNSWIPE)).toBe(false);
    // Compte sans label, ou seulement des labels système : Sophia.
    expect(posterServiApplication([[]], LIENS, ID_SOPHIA)).toBe(true);
    expect(posterServiApplication([[HOOK]], LIENS, ID_SOPHIA)).toBe(true);
    expect(posterServiApplication([], LIENS, ID_SOPHIA)).toBe(false);
  });
});

describe("curseurs de répartition", () => {
  it("arrondit au pas de 10 et garde un total ≤ 100", () => {
    expect(curseursBornes({ unswipe: 33 })).toEqual({ unswipe: 30 });
    expect(curseursBornes({ a: 70, b: 60 })).toEqual({ a: 70, b: 30 });
    expect(curseursBornes({ a: -5 })).toEqual({ a: 0 });
  });

  it("Sophia = 100 − les autres ; rien hors Sophia = null (100 % Sophia)", () => {
    expect(partsDepuisCurseurs({ unswipe: 30 })).toEqual({ sophia: 70, unswipe: 30 });
    expect(partsDepuisCurseurs({ unswipe: 100 })).toEqual({ unswipe: 100 });
    expect(partsDepuisCurseurs({ unswipe: 0 })).toBeNull();
    expect(partsDepuisCurseurs({})).toBeNull();
  });

  it("résume dans l'ordre Sophia d'abord", () => {
    expect(resumeParts({ unswipe: 30, sophia: 70 }, APPS)).toBe("Sophia 70 % · Unswipe 30 %");
  });
});

describe("etatPartsCompte", () => {
  const compte = { langue: "fr", ugc_ai: false, parts_applications: null };

  it("compte Sophia seul : rien à afficher, 100 % Sophia", () => {
    const e = etatPartsCompte({ compte, labels: [CINEMA], liens: LIENS, applications: APPS });
    expect(e.afficher).toBe(false);
    expect(e.sophiaServie).toBe(true);
    expect(e.bloque).toBe(false);
    expect(e.autres).toEqual([]);
    expect(e.effectives).toEqual({ sophia: 100 });
    expect(e.avertissements).toEqual([]);
  });

  it("compte Sophia seul, même avec Unswipe éteinte ou hors langue : toujours caché", () => {
    // Aucune application autre que Sophia servie : l'état d'Unswipe ne le
    // concerne pas, la carte reste cachée exactement comme avant.
    for (const applications of [[SOPHIA, { ...UNSWIPE, actif: false }], [SOPHIA, { ...UNSWIPE, langues: [] }]]) {
      const e = etatPartsCompte({ compte, labels: [CINEMA], liens: LIENS, applications });
      expect(e.afficher).toBe(false);
      expect(e.avertissements).toEqual([]);
    }
    // Sans label, ou seulement des labels système : Sophia, caché.
    expect(etatPartsCompte({ compte, labels: [], liens: LIENS, applications: APPS }).afficher).toBe(false);
    expect(etatPartsCompte({ compte, labels: [HOOK], liens: LIENS, applications: APPS }).afficher).toBe(false);
  });

  it("label partagé : un curseur Unswipe, initialisé depuis la répartition", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CLEAN, CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(e.afficher).toBe(true);
    expect(e.servies.map((a) => a.slug)).toEqual(["sophia", "unswipe"]);
    expect(e.autres.map((a) => a.slug)).toEqual(["unswipe"]);
    expect(e.curseurs).toEqual({ unswipe: 30 });
    expect(e.effectives).toEqual({ sophia: 70, unswipe: 30 });
    expect(e.avertissements).toEqual([]);
  });

  it("prévient : application éteinte, langue non ciblée, compte UGC", () => {
    // Répartition mixte (Sophia y garde une part) : la part exclue lui revient.
    const eteinte = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: [SOPHIA, { ...UNSWIPE, actif: false }],
    });
    expect(eteinte.avertissements).toEqual([{ type: "inactive", app: "Unswipe" }]);
    expect(eteinte.effectives).toEqual({ sophia: 100 });
    expect(eteinte.repliSophia).toBe(true);
    expect(eteinte.bloque).toBe(false);

    const langue = etatPartsCompte({
      compte: { ...compte, langue: "de", parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: APPS,
    });
    expect(langue.avertissements).toEqual([{ type: "langue", app: "Unswipe", langue: "de" }]);
    expect(langue.effectives).toEqual({ sophia: 100 });

    const ugc = etatPartsCompte({
      compte: { ...compte, ugc_ai: true, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: APPS,
    });
    expect(ugc.avertissements).toEqual([{ type: "ugc" }]);
    expect(ugc.effectives).toEqual({ sophia: 100 });
  });

  it("répartition enregistrée devenue sans objet : affichée pour être réinitialisée", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(e.afficher).toBe(true);
    expect(e.autres).toEqual([]);
    expect(e.avertissements).toEqual([{ type: "obsolete", app: "Unswipe" }]);
    expect(e.effectives).toEqual({ sophia: 100 });
  });

  it("labels qui ne servent QUE Unswipe : Sophia non servie, 100 % Unswipe", () => {
    const liens = [{ label_id: CLEAN.id, application_id: ID_UNSWIPE }];
    const e = etatPartsCompte({ compte, labels: [CLEAN], liens, applications: APPS });
    expect(e.servies.map((a) => a.slug)).toEqual(["unswipe"]);
    // Affiché : c'est la seule carte qui dirait « Unswipe désactivée » ou
    // « langue non ciblée » pour ce compte.
    expect(e.afficher).toBe(true);
    expect(e.sophiaServie).toBe(false);
    expect(e.bloque).toBe(false);
    expect(e.effectives).toEqual({ unswipe: 100 });
    expect(e.avertissements).toEqual([]);
  });

  describe("compte 100 % Unswipe qu'aucune application ne peut servir", () => {
    const liens = [{ label_id: CLEAN.id, application_id: ID_UNSWIPE }];

    it("Unswipe éteinte", () => {
      const e = etatPartsCompte({
        compte,
        labels: [CLEAN],
        liens,
        applications: [SOPHIA, { ...UNSWIPE, actif: false }],
      });
      expect(e.afficher).toBe(true);
      expect(e.bloque).toBe(true);
      expect(e.effectives).toEqual({});
      expect(e.avertissements).toEqual([{ type: "inactive", app: "Unswipe" }]);
    });

    it("langue non ciblée", () => {
      const e = etatPartsCompte({
        compte: { ...compte, langue: "de" },
        labels: [CLEAN],
        liens,
        applications: APPS,
      });
      expect(e.bloque).toBe(true);
      expect(e.avertissements).toEqual([{ type: "langue", app: "Unswipe", langue: "de" }]);
    });

    it("désactivée ET sans langue (état de 0258) : les deux causes, comme le moteur", () => {
      const e = etatPartsCompte({
        compte,
        labels: [CLEAN],
        liens,
        applications: [SOPHIA, { ...UNSWIPE, actif: false, langues: [] }],
      });
      expect(e.bloque).toBe(true);
      expect(e.avertissements).toEqual([
        { type: "inactive", app: "Unswipe" },
        { type: "langue", app: "Unswipe", langue: "fr" },
      ]);
    });

    it("compte UGC", () => {
      const e = etatPartsCompte({ compte: { ...compte, ugc_ai: true }, labels: [CLEAN], liens, applications: APPS });
      expect(e.bloque).toBe(true);
      expect(e.avertissements).toEqual([{ type: "ugc" }]);
    });

    it("une part Sophia enregistrée devient un reliquat à effacer", () => {
      const e = etatPartsCompte({
        compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
        labels: [CLEAN],
        liens,
        applications: APPS,
      });
      expect(e.bloque).toBe(false);
      expect(e.effectives).toEqual({ unswipe: 100 });
      expect(e.avertissements).toEqual([{ type: "obsolete", app: "Sophia" }]);
    });
  });
});

describe("etatPartsCompte — deux niveaux : la répartition choisit parmi ce que les labels permettent", () => {
  const compte = { langue: "fr", ugc_ai: false, parts_applications: null };

  it("défaut (NULL), label partagé : repli Sophia, 100 % Sophia (inchangé)", () => {
    const e = etatPartsCompte({ compte, labels: [CLEAN], liens: LIENS, applications: APPS });
    expect(e.repliSophia).toBe(true);
    expect(e.bloque).toBe(false);
    expect(e.effectives).toEqual({ sophia: 100 });
  });

  it("label partagé réglé 100 % Unswipe : Unswipe seule, pas de repli Sophia", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { unswipe: 100 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: APPS,
    });
    expect(e.sophiaServie).toBe(true);
    expect(e.repliSophia).toBe(false);
    expect(e.bloque).toBe(false);
    expect(e.effectives).toEqual({ unswipe: 100 });
  });

  it("label partagé réglé 100 % Unswipe, Unswipe éteinte / hors langue / UGC : ne publiera rien", () => {
    for (const [patch, applications] of [
      [{}, [SOPHIA, { ...UNSWIPE, actif: false }]],
      [{ langue: "de" }, APPS],
      [{ ugc_ai: true }, APPS],
    ] as const) {
      const e = etatPartsCompte({
        compte: { ...compte, ...patch, parts_applications: { unswipe: 100 } },
        labels: [CLEAN],
        liens: LIENS,
        applications,
      });
      expect(e.repliSophia).toBe(false);
      expect(e.effectives).toEqual({});
      expect(e.bloque).toBe(true);
    }
  });

  it("labels Sophia seuls, répartition enregistrée : la carte reste visible", () => {
    const sophia100 = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 100 } },
      labels: [CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(sophia100.afficher).toBe(true);
    expect(sophia100.repliSophia).toBe(true);
    expect(sophia100.bloque).toBe(false);

    // Réglée 100 % Unswipe alors qu'aucun label ne sert Unswipe : rien.
    const unswipe100 = etatPartsCompte({
      compte: { ...compte, parts_applications: { unswipe: 100 } },
      labels: [CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(unswipe100.afficher).toBe(true);
    expect(unswipe100.repliSophia).toBe(false);
    expect(unswipe100.bloque).toBe(true);
    expect(unswipe100.effectives).toEqual({});
    expect(unswipe100.avertissements).toEqual([{ type: "obsolete", app: "Unswipe" }]);
  });

  it("labels 100 % Unswipe, réglage resté 100 % Sophia : ne publiera rien (plus de parts égales)", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 100 } },
      labels: [CLEAN],
      liens: [{ label_id: CLEAN.id, application_id: ID_UNSWIPE }],
      applications: APPS,
    });
    expect(e.effectives).toEqual({});
    expect(e.bloque).toBe(true);
  });
});

describe("diagnosticCompteSansSophia (panneau Minuit)", () => {
  const SEUL_UNSWIPE = [{ label_id: CLEAN.id, application_id: ID_UNSWIPE }];
  const base = {
    compte: { langue: "fr", ugc: false },
    labels: [CLEAN],
    applications: APPS,
    labelsTxt: "Clean Girl",
  };

  it("un label sert Sophia : null, le diagnostic historique s'applique tel quel", () => {
    expect(diagnosticCompteSansSophia({ ...base, liens: LIENS })).toBeNull();
    expect(diagnosticCompteSansSophia({ ...base, labels: [CINEMA], liens: [] })).toBeNull();
    expect(diagnosticCompteSansSophia({ ...base, labels: [CLEAN, CINEMA], liens: SEUL_UNSWIPE })).toBeNull();
    // Labels système seuls : Sophia (même règle que le moteur).
    expect(diagnosticCompteSansSophia({ ...base, labels: [HOOK], liens: SEUL_UNSWIPE })).toBeNull();
  });

  it("Unswipe servable : réserve à vérifier, jamais « timeout batch »", () => {
    const d = diagnosticCompteSansSophia({ ...base, liens: SEUL_UNSWIPE })!;
    expect(d).toContain("ne sert Sophia");
    expect(d).toContain("réserve à vérifier");
    expect(d).not.toMatch(/timeout|baisse/);
  });

  it("dit la cause quand rien ne peut servir le compte", () => {
    const eteinte = diagnosticCompteSansSophia({
      ...base,
      liens: SEUL_UNSWIPE,
      applications: [SOPHIA, { ...UNSWIPE, actif: false }],
    })!;
    expect(eteinte).toContain("il ne publiera rien");
    expect(eteinte).toContain("Unswipe est désactivée");

    const langue = diagnosticCompteSansSophia({ ...base, compte: { langue: "de", ugc: false }, liens: SEUL_UNSWIPE })!;
    expect(langue).toContain("Unswipe ne cible pas le DE");

    const ugc = diagnosticCompteSansSophia({ ...base, compte: { langue: "fr", ugc: true }, liens: SEUL_UNSWIPE })!;
    expect(ugc).toContain("compte UGC");
    expect(ugc).toContain("il ne publiera rien");
  });

  it("répartition explicite avec part Sophia, label sans ligne (Sophia héritée) : rien à signaler", () => {
    // L'appelant (api.ts) ne liste que les applications jointes aux lignes
    // `label_applications` : Sophia peut y manquer, le moteur l'a toujours.
    const sansLigne = { id: "L9", slug: "nouveau", nom: "nouveau" };
    expect(
      diagnosticCompteSansSophia({
        ...base,
        compte: { langue: "fr", ugc: false, parts_applications: { sophia: 100 } },
        labels: [sansLigne],
        liens: [],
        applications: [UNSWIPE],
      }),
    ).toBeNull();
    expect(
      diagnosticCompteSansSophia({
        ...base,
        compte: { langue: "fr", ugc: false, parts_applications: { sophia: 70, unswipe: 30 } },
        labels: [sansLigne, CINEMA],
        liens: SEUL_UNSWIPE,
        applications: [UNSWIPE],
      }),
    ).toBeNull();
  });

  it("désactivée ET sans langue (état de 0258) : les deux causes, pas seulement « désactivée »", () => {
    const d = diagnosticCompteSansSophia({
      ...base,
      liens: SEUL_UNSWIPE,
      applications: [SOPHIA, { ...UNSWIPE, actif: false, langues: [] }],
    })!;
    expect(d).toContain("Unswipe est désactivée");
    expect(d).toContain("Unswipe ne cible encore aucune langue (à cocher dans Pilotage → Applications)");
  });

  describe("deux niveaux : répartition explicite", () => {
    const partage = (parts: Record<string, number>) => ({
      ...base,
      compte: { langue: "fr", ugc: false, parts_applications: parts },
      liens: LIENS,
    });

    it("répartition NULL ou part Sophia > 0 : null, diagnostic historique", () => {
      expect(diagnosticCompteSansSophia({ ...base, compte: { ...base.compte, parts_applications: null }, liens: LIENS })).toBeNull();
      expect(diagnosticCompteSansSophia(partage({ sophia: 70, unswipe: 30 }))).toBeNull();
    });

    it("label partagé réglé 100 % Unswipe : la répartition coupe le repli, réserve Unswipe à vérifier", () => {
      const d = diagnosticCompteSansSophia(partage({ unswipe: 100 }))!;
      expect(d).toContain("La répartition de ce compte donne 0 % à Sophia");
      expect(d).toContain("sans repli possible sur Sophia");
      expect(d).toContain("Unswipe peut le servir");
      expect(d).not.toContain("ne sert Sophia");
      expect(d).not.toMatch(/timeout|baisse/);
    });

    it("label partagé réglé 100 % Unswipe, Unswipe éteinte : il ne publiera rien, cause dite", () => {
      const d = diagnosticCompteSansSophia({
        ...partage({ unswipe: 100 }),
        applications: [SOPHIA, { ...UNSWIPE, actif: false }],
      })!;
      expect(d).toContain("il ne publiera rien");
      expect(d).toContain("Unswipe est désactivée");
    });

    it("labels Sophia seuls réglés 100 % Unswipe : aucun label ne sert Unswipe", () => {
      const d = diagnosticCompteSansSophia({ ...partage({ unswipe: 100 }), labels: [CINEMA], liens: [] })!;
      expect(d).toContain("il ne publiera rien");
      expect(d).toContain("aucun label de ce compte ne sert Unswipe");
    });
  });
});

describe("labelsPoolSophiaCompteMixte (panneau Minuit, pool Sophia)", () => {
  const DETOX = { id: "l-detox", slug: "detox", nom: "Detox" };
  const AVEC_DETOX = [...LIENS, { label_id: DETOX.id, application_id: ID_UNSWIPE }];

  it("compte Sophia pur (système compris) : null, ses labels restent tels quels", () => {
    expect(labelsPoolSophiaCompteMixte([CINEMA], AVEC_DETOX)).toBeNull();
    expect(labelsPoolSophiaCompteMixte([CINEMA, CLEAN], AVEC_DETOX)).toBeNull();
    expect(labelsPoolSophiaCompteMixte([CINEMA, HOOK], AVEC_DETOX)).toBeNull();
    expect(labelsPoolSophiaCompteMixte([], AVEC_DETOX)).toBeNull();
  });

  it("compte mixte : seulement les labels qui servent Sophia, comme le moteur", () => {
    expect(labelsPoolSophiaCompteMixte([CINEMA, DETOX], AVEC_DETOX)).toEqual([CINEMA]);
    expect(labelsPoolSophiaCompteMixte([DETOX, CLEAN, HOOK], AVEC_DETOX)).toEqual([CLEAN]);
  });
});

describe("0270 — avis « ne sert pas Sophia » de la fiche", () => {
  const liens = [
    { label_id: "L-sophia", application_id: ID_SOPHIA },
    { label_id: "L-unswipe", application_id: ID_UNSWIPE },
  ];

  it("seulement si AUCUN label ne sert Sophia", () => {
    expect(contenuHorsSophia([{ id: "L-unswipe", slug: "focus" }], liens)).toBe(true);
    expect(contenuHorsSophia([{ id: "L-unswipe", slug: "focus" }, { id: "L-sophia", slug: "s" }], liens)).toBe(false);
    // Label sans ligne : sert Sophia par héritage.
    expect(contenuHorsSophia([{ id: "L-neuf", slug: "neuf" }], liens)).toBe(false);
    // Aucun label utile (aucun, ou système seulement) : Sophia, comme le moteur.
    expect(contenuHorsSophia([], liens)).toBe(false);
    expect(contenuHorsSophia([{ id: "H", slug: "hook" }], liens)).toBe(false);
  });

  it("liens illisibles : jamais d'avis (affichage d'avant)", () => {
    expect(contenuHorsSophia([{ id: "L-unswipe", slug: "focus" }], undefined)).toBe(false);
  });
});

describe("0270 — état de requalification d'un cycle (tier par application)", () => {
  const base = {
    contenu_id: "c",
    tier: "B" as const,
    passages_prevus: 2,
    tier_cycle: 0,
    tier_maj_at: null,
    publies: 2,
    en_vol: 0,
    restants: 0,
    moyenne_vues: 1200,
    max_vues: 2000,
    nb_150k: 0,
    mesures: 2,
    introuvables: 0,
    en_attente_mesure: 0,
    dernier_publie_at: "2026-01-01T00:00:00Z",
  };
  const reglages = { recul_jours: 1, requalif_max_jours: 3 };

  it("même décision que minuit : cycle non fini → rien ; fini et mesuré → « prete »", () => {
    expect(etatRequalifCycle({ ...base, publies: 1 }, reglages)).toBeNull();
    expect(etatRequalifCycle(base, reglages)).toEqual({ cle: "prete", alerte: false, echeance: null });
    expect(etatRequalifCycle(base, undefined)).toBeNull();
  });

  it("sans mesure, tout introuvable : relance au même rang, signalée", () => {
    expect(
      etatRequalifCycle({ ...base, moyenne_vues: null, mesures: 0, introuvables: 2 }, reglages),
    ).toEqual({ cle: "sansMesure_introuvable", alerte: true, echeance: null });
  });
});

describe("applicationsAfficheesCompte", () => {
  const ID_MICABO = "00000000-0000-4000-8000-000000000002";
  const STUDY = { id: "l-study", slug: "classic-study", nom: "classic_study" };
  const liens = [
    ...LIENS,
    { label_id: STUDY.id, application_id: ID_MICABO },
    { label_id: STUDY.id, application_id: ID_UNSWIPE },
  ];
  const slugParId = (id: string) =>
    ({ [ID_SOPHIA]: "sophia", [ID_UNSWIPE]: "unswipe", [ID_MICABO]: "micabo" })[id];

  it("répartition explicite : ses applications, même sans label (compte micabo en sommeil)", () => {
    expect(applicationsAfficheesCompte({ parts: { micabo: 100 }, labels: [], liens, slugParId })).toEqual([
      { slug: "micabo", part: null },
    ]);
  });

  it("répartition à plusieurs applications : Sophia d'abord, avec les parts", () => {
    expect(applicationsAfficheesCompte({ parts: { unswipe: 30, sophia: 70 } })).toEqual([
      { slug: "sophia", part: 70 },
      { slug: "unswipe", part: 30 },
    ]);
  });

  it("répartition null : Sophia dès qu'un label la sert, ou sans label utile", () => {
    expect(applicationsAfficheesCompte({ parts: null, labels: [CLEAN], liens, slugParId })).toEqual([
      { slug: "sophia", part: null },
    ]);
    expect(applicationsAfficheesCompte({ parts: null, labels: [CINEMA], liens, slugParId })).toEqual([
      { slug: "sophia", part: null },
    ]);
    expect(applicationsAfficheesCompte({ parts: null, labels: [HOOK], liens, slugParId })).toEqual([
      { slug: "sophia", part: null },
    ]);
  });

  it("répartition null et labels hors Sophia : les applications de ses labels", () => {
    expect(applicationsAfficheesCompte({ parts: null, labels: [STUDY], liens, slugParId })).toEqual([
      { slug: "micabo", part: null },
      { slug: "unswipe", part: null },
    ]);
  });

  it("labels non chargés et pas de répartition : Sophia, comme avant", () => {
    expect(applicationsAfficheesCompte({ parts: null })).toEqual([{ slug: "sophia", part: null }]);
  });
});
