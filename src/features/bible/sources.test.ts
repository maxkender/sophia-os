import { describe, expect, it } from "vitest";

import type { SourceLundi } from "@/features/moteur/api";
import type { FileSources } from "@/features/moteur/fileSources";
import type { CompteReference } from "@/features/moteur/types";

import { blocageImport, type CarteLabel, carteValidable, type CompteBible, etapeAvantImport } from "./moodboard";
import {
  assemblerSources, bilanSemaine, compterSources, etapeDeLaSource, ligneResultat, phraseEtat, rangerSources, regleDeLaVue, REGLES_DEFAUT, type ReglesSources,
  type SourceBible, sourcesParHandle, versRegles,
} from "./sources";
import type { LabelBible } from "./types";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";
const REGLES: ReglesSources = { ...REGLES_DEFAUT, rMin: 0.95, rVsLabelMin: 0.95, lotMax: 8 };

const lundi = (o: Partial<SourceLundi>): SourceLundi => ({
  compteReferenceId: "s1", handle: "une.source", langue: "en", label: "smart_girl", posts: 20, r: 1.1, rVsLabel: 1.05, decision: "maj", raison: "r",
  meilleurVues: 40_000, lanceeLe: null, importes: 0, valides: 0, ...o,
});
const base = (o: Partial<Omit<SourceBible, "etape">>): Omit<SourceBible, "etape"> => ({
  id: "s1", handle: "une.source", langue: "en", actif: true, labels: [{ id: "L1", nom: "smart_girl" }], slides: [], importes: 120, valides: 90,
  perf: { posts: 20, r: 1.1, vuesMediane: 900, rVsLabel: 1.05 }, essaiMax: null, essaiVerdict: null, dernierImport: "2026-11-10T06:00:00Z", attente: null,
  sequence: null, restant: 0, semaine: null, ...o,
});
const source = (o: Partial<Omit<SourceBible, "etape">>): SourceBible => { const b = base(o); return { ...b, etape: etapeDeLaSource(b) }; };
const attente = (o: Partial<FileSources["attente"][number]>): FileSources["attente"][number] => ({
  compteReferenceId: "s1", handle: "une.source", sorte: "neuve", essaiMax: 30, prevuLe: "2026-11-20", echec: null, ...o,
});
const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "smart_girl", titre: null, section: "sophia", badge: "existe", description_da: null, label_id: "L1", ordre: 1, statut: "valide", ...o,
});
const compte = (o: Partial<CompteBible>): CompteBible => ({
  id: "c1", handle: "une.source", etape: "prochain_batch", label_propose_id: "k1", autres_cartes: [], note_import: null, remarque: null, a_podzer: false,
  posts: [], miniatures_statut: "ok", miniatures_erreur: null, vues_mediane: null, meilleur_post_vues: null, abonnes: null, ajoute_at: "2026-11-19T10:00:00Z", ...o,
});

describe("l'onglet d'une source, calculé depuis son état", () => {
  it("désactivée ou essai raté : Arrêtées", () => {
    expect(etapeDeLaSource(base({ actif: false }))).toBe("arretees");
    expect(etapeDeLaSource(base({ essaiMax: 30, essaiVerdict: "ne_tient_pas" }))).toBe("arretees");
  });

  it("source neuve dans la file, ou dont le premier import tourne : En import", () => {
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, essaiMax: 30, attente: attente({}) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 12, essaiMax: 30, sequence: "en_cours", semaine: lundi({ decision: "peu_de_mesures", raison: "ajout" }) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, sequence: "a_suivre" }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null }))).toBe("en_import");
  });

  it("une source établie qui passe sa mise à jour du lundi reste en Weekly update", () => {
    expect(etapeDeLaSource(base({ attente: attente({ sorte: "maj" }) }))).toBe("weekly");
    expect(etapeDeLaSource(base({ sequence: "en_cours", semaine: lundi({}) }))).toBe("weekly");
  });

  it("essai posé et pas encore jugé : À l'essai ; essai levé ou jamais posé : Weekly update", () => {
    expect(etapeDeLaSource(base({ importes: 30, essaiMax: 30 }))).toBe("essai");
    expect(etapeDeLaSource(base({ essaiVerdict: "tient" }))).toBe("weekly");
    expect(etapeDeLaSource(base({}))).toBe("weekly");
    expect(compterSources([source({}), source({ id: "s2", importes: 30, essaiMax: 30 }), source({ id: "s3", actif: false })])).toEqual({
      en_import: 0, essai: 1, weekly: 1, arretees: 1,
    });
  });
});

describe("l'état d'une source, en une phrase", () => {
  const texte = (o: Partial<Omit<SourceBible, "etape">>) => phraseEtat(source(o), REGLES).texte;

  it("en import : dans la file avec son jour, en cours avec ce qui reste, en échec", () => {
    expect(texte({ importes: 0, dernierImport: null, attente: attente({}) })).toBe("Dans la file, départ prévu le 20/11");
    expect(texte({ importes: 4, sequence: "en_cours", restant: 26, semaine: lundi({ raison: "ajout" }) })).toBe("Import en cours : 26 slideshows encore dans la file");
    expect(texte({ importes: 0, dernierImport: null, sequence: "a_suivre" })).toBe("À suivre dans la séquence en cours");
    expect(phraseEtat(source({ importes: 0, dernierImport: null, attente: attente({ echec: "clé Apify refusée" }) }), REGLES)).toEqual({
      texte: "Import en échec, repart au lot suivant (clé Apify refusée)", ton: "alerte",
    });
  });

  it("à l'essai : importés sur le plafond, mesurés sur ce qu'il faut pour juger", () => {
    expect(texte({ importes: 28, essaiMax: 30, perf: { posts: 16, r: 0.96, vuesMediane: 700 } })).toBe("Essai : 28 sur 30 importés, 10 sur 10 mesurés");
    expect(texte({ importes: 30, essaiMax: 30, perf: null })).toBe("Essai : 30 sur 30 importés, 0 sur 10 mesurés");
  });

  it("weekly : la décision du lundi avec sa raison et le seuil en vigueur", () => {
    expect(texte({ semaine: lundi({ lanceeLe: "2026-11-17T05:40:00Z" }) })).toBe("Mise à jour le 17/11 (r au-dessus de 0,95)");
    expect(texte({ semaine: lundi({ raison: "label" }), attente: attente({ sorte: "maj", prevuLe: "2026-11-21" }) })).toBe(
      "Retenue, mise à jour prévue le 21/11 (au-dessus de 0,95 face à son label)",
    );
    expect(texte({ semaine: lundi({ raison: "100k", meilleurVues: 214_000 }) })).toBe("Retenue, mise à jour à venir (un post à 214 000 vues)");
    expect(phraseEtat(source({ semaine: lundi({ decision: "pas_maj", raison: null }) }), REGLES)).toEqual({ texte: "Pas retenue cette semaine", ton: "alerte" });
    expect(texte({ sequence: "en_cours", semaine: lundi({}) })).toBe("Mise à jour en cours");
    expect(texte({})).toBe("À jour");
  });

  it("arrêtées", () => {
    expect(texte({ actif: false })).toBe("Désactivée");
    expect(texte({ importes: 30, essaiMax: 30, essaiVerdict: "ne_tient_pas" })).toBe("Essai raté : arrêtée à 30 posts");
  });
});

describe("assembler les lectures", () => {
  const ref = (o: Partial<CompteReference>): CompteReference => ({
    id: "s1", handle_tiktok: "@Une.Source", niche: "smart_girl", langue: "en", application_id: SOPHIA, style_profile: null, genre: "femme", parent_id: null,
    ordre_assignation: null, ordre_par_langue: {}, is_active: true, dernier_scrape_at: "2026-11-10T06:00:00Z", essai_max: null, essai_verdict: null,
    created_at: "2026-10-01T00:00:00Z", ...o,
  });
  const file: FileSources = {
    enCours: { handle: "en.cours", restant: 12, faits: 1, total: 3, aSuivre: ["a.suivre"] },
    attente: [attente({ compteReferenceId: "s4", handle: "qui.attend" })],
    essais: [],
    reglages: { lotMax: 8, nouvellesParJour: 1000, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100 },
  };

  it("relie stock, r, slides, file et décision du lundi à chaque source ; le handle est normalisé", () => {
    const sources = assemblerSources({
      refs: [ref({}), ref({ id: "s2", handle_tiktok: "en.cours", dernier_scrape_at: null }), ref({ id: "s3", handle_tiktok: "a.suivre", dernier_scrape_at: null }), ref({ id: "s4", handle_tiktok: "qui.attend", dernier_scrape_at: null, essai_max: 30 })],
      importes: [{
        compte_reference_id: "s1", handle: "une.source", langue: "en", niche: "smart_girl", actif: true, application_id: SOPHIA, ajoute_at: "2026-10-01T00:00:00Z",
        labels: [{ id: "L1", nom: "smart_girl" }], slides: ["https://m.test/a.jpg", "https://m.test/b.jpg"], slides_posts: ["https://www.tiktok.com/@une.source/photo/1", null],
        posts: 120, vues_mediane: 9000, bible_id: null,
      }],
      perf: { s1: { posts: 20, r: 1.1, vuesMediane: 900 } },
      stocks: { s1: { importes: 120, valides: 90 } },
      file,
      semaine: { semaine: "2026-11-16", sources: [lundi({ lanceeLe: "2026-11-17T05:40:00Z" })] },
    });
    expect(sources[0]).toMatchObject({
      handle: "une.source", importes: 120, valides: 90, etape: "weekly", sequence: null,
      slides: [{ url: "https://m.test/a.jpg", post: "https://www.tiktok.com/@une.source/photo/1" }, { url: "https://m.test/b.jpg", post: null }],
    });
    expect(sources[0]!.semaine?.lanceeLe).toBe("2026-11-17T05:40:00Z");
    expect(sources.slice(1).map((s) => [s.handle, s.sequence, s.restant, s.etape])).toEqual([
      ["en.cours", "en_cours", 12, "en_import"], ["a.suivre", "a_suivre", 0, "en_import"], ["qui.attend", null, 0, "en_import"],
    ]);
    expect(sourcesParHandle(sources).get("une.source")).toEqual({ labelIds: ["L1"], labels: ["smart_girl"] });
  });
});

describe("un compte de la Bible face à sa source", () => {
  it("pas de source : il suit son étape à la main ; « importe » sans source revient dans À importer", () => {
    expect(etapeAvantImport(compte({}), carte({}), undefined)).toBe("prochain_batch");
    expect(etapeAvantImport(compte({ etape: "a_importer" }), carte({}), null)).toBe("a_importer");
    expect(etapeAvantImport(compte({ etape: "importe" }), carte({}), null)).toBe("a_importer");
  });

  it("sa source porte le label de sa carte (ou il n'a pas de carte) : il quitte les onglets d'avant import", () => {
    expect(etapeAvantImport(compte({}), carte({}), { labelIds: ["L1"], labels: ["smart_girl"] })).toBeNull();
    expect(etapeAvantImport(compte({ label_propose_id: null }), null, { labelIds: [], labels: [] })).toBeNull();
  });

  it("déjà source sous un autre label : il reste à faire, marqué « déjà une source »", () => {
    const micabo = carte({ id: "k2", nom: "study_notes", section: "micabo", badge: "nouveau", label_id: null, statut: "a_valider" });
    const dejaSource = { labelIds: ["L9"], labels: ["classic_study"] };
    expect(etapeAvantImport(compte({ label_propose_id: "k2" }), micabo, dejaSource)).toBe("prochain_batch");
    expect(blocageImport(compte({ label_propose_id: "k2" }), micabo, dejaSource)).toBe("deja_source");
    expect(etapeAvantImport(compte({}), carte({ label_id: "L2" }), dejaSource)).toBe("prochain_batch");
  });

  it("ce qui bloque un compte du batch : podz, pas de label, label à créer ; sinon prêt", () => {
    expect(blocageImport(compte({ a_podzer: true }), carte({}), null)).toBe("podz");
    expect(blocageImport(compte({ label_propose_id: null }), null, null)).toBe("sans_label");
    expect(blocageImport(compte({}), carte({ label_id: null, badge: "nouveau", section: "micabo" }), null)).toBe("label_a_creer");
    // Atala existe dans l'OS : sa carte attend son label, plus son appli.
    expect(blocageImport(compte({}), carte({ label_id: null, badge: "propose", section: "atala" }), null)).toBe("label_a_creer");
    expect(blocageImport(compte({}), carte({}), null)).toBe("pret");
  });

  it("un label se crée d'ici s'il est proposé ou nouveau, pour une app qui existe", () => {
    expect(carteValidable(carte({ label_id: null, badge: "nouveau", section: "micabo" }))).toBe(true);
    expect(carteValidable(carte({ label_id: null, badge: "propose", section: "sophia" }))).toBe(true);
    expect(carteValidable(carte({ label_id: null, badge: "propose", section: "atala" }))).toBe(true);
    expect(carteValidable(carte({ label_id: null, badge: "a_confirmer", section: "sophia" }))).toBe(false);
    expect(carteValidable(carte({ label_id: null, badge: "idee", section: "idees" }))).toBe(false);
    expect(carteValidable(carte({}))).toBe(false);
  });
});

describe("rangement des sources", () => {
  const labels: LabelBible[] = [
    { id: "L1", nom: "smart_girl", style_theme: null, application_id: SOPHIA, apps: [SOPHIA] },
    { id: "L2", nom: "classic_study", style_theme: null, application_id: MICABO, apps: [MICABO] },
    { id: "L3", nom: "clean_study", style_theme: null, application_id: SOPHIA, apps: [MICABO] },
    { id: "L4", nom: "beau_smart_girl", style_theme: null, application_id: SOPHIA, apps: [MICABO, SOPHIA] },
  ];
  const sources = [
    source({ id: "s1", handle: "moyenne", perf: { posts: 20, r: 0.97, vuesMediane: 1 }, semaine: lundi({ decision: "pas_maj", raison: null }) }),
    source({ id: "s2", handle: "meilleure", perf: { posts: 20, r: 1.4, vuesMediane: 1 }, semaine: lundi({}) }),
    source({ id: "s3", handle: "etude", labels: [{ id: "L2", nom: "classic_study" }] }),
    source({ id: "s4", handle: "propre", labels: [{ id: "L3", nom: "clean_study" }] }),
    source({ id: "s5", handle: "deux.labels", labels: [{ id: "L1", nom: "smart_girl" }, { id: "L4", nom: "beau_smart_girl" }] }),
    source({ id: "s6", handle: "orpheline", labels: [] }),
    source({ id: "s7", handle: "essai", importes: 30, essaiMax: 30 }),
  ];
  const handles = (g: ReturnType<typeof rangerSources>) => g.map((x) => [x.section, x.cartes.map((c) => [c.carte?.nom ?? null, c.sources.map((s) => s.source.handle + (s.aussi ? "+" : ""))])]);

  it("par app (carte de la Bible, sinon app servie) puis par label ; les meilleurs r d'abord ; « Sans label » en dernier", () => {
    const g = rangerSources(sources, labels, [carte({})], { etape: "weekly", recherche: "", section: "" });
    expect(handles(g)).toEqual([
      ["micabo", [["classic_study", ["etude"]], ["clean_study", ["propre"]]]],
      ["sophia", [["smart_girl", ["meilleure", "deux.labels+", "moyenne"]], ["beau_smart_girl", ["deux.labels"]]]],
      ["sans", [[null, ["orpheline"]]]],
    ]);
    expect(g[1]!.total).toBe(3);
  });

  it("filtre de la semaine, recherche et app", () => {
    const de = (f: Partial<Parameters<typeof rangerSources>[3]>) =>
      rangerSources(sources, labels, [], { etape: "weekly", recherche: "", section: "", ...f }).flatMap((g) => g.cartes.flatMap((c) => c.sources.map((s) => s.source.handle)));
    expect(de({ semaine: "pas_retenues" })).toEqual(["moyenne"]);
    expect(de({ semaine: "retenues" })).toEqual(["meilleure"]);
    expect(de({ recherche: "@etu" })).toEqual(["etude"]);
    expect(de({ recherche: "clean" })).toEqual(["propre"]);
    expect(de({ section: "micabo" })).toEqual(["etude", "propre"]);
    expect(de({ etape: "essai" })).toEqual(["essai"]);
  });
});

describe("les règles, avec les vrais seuils", () => {
  it("lit les réglages ; un réglage absent prend la valeur par défaut des fonctions SQL", () => {
    expect(versRegles({ r_min: 0.95, r_vs_label_min: 0.95, lot_max: 8, nouvelles_par_jour: 1000, essai_posts: 30 })).toEqual({
      rMin: 0.95, rVsLabelMin: 0.95, vuesCoup: 100_000, postsMin: 5, lotMax: 8, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100, labelNeufJours: 5,
    });
    expect(versRegles({ label_neuf_jours: 0 }).labelNeufJours).toBe(0);
    expect(versRegles(null)).toEqual(REGLES_DEFAUT);
  });

  it("chaque onglet dit comment on y entre et comment on en sort", () => {
    expect(regleDeLaVue("essai", REGLES)).toContain("ses 30 posts les plus vus");
    expect(regleDeLaVue("essai", REGLES)).toContain("r au-dessus de 0,95");
    // Pas d'essai dans un label neuf : créé depuis moins de 5 jours, ou que personne ne porte.
    expect(regleDeLaVue("essai", REGLES)).toContain("Pas d'essai dans un label neuf (créé depuis moins de 5 jours, ou que personne ne porte encore)");
    expect(regleDeLaVue("essai", { ...REGLES, labelNeufJours: 0 })).toContain("Pas d'essai dans un label neuf (que personne ne porte encore)");
    // Le lundi décide ; les mises à jour, elles, partent chaque matin.
    expect(regleDeLaVue("weekly", REGLES)).toContain("celles dont le r dépasse 0,95, ou 0,95 face à leur label, qui ont un post à 100 000 vues, ou moins de 5 posts mesurés");
    expect(regleDeLaVue("weekly", REGLES)).toContain("Les mises à jour partent ensuite chaque matin à 6 h 37, 8 sources par jour");
    expect(regleDeLaVue("propositions", REGLES)).toContain("l'agent éclaireur trouve chaque jour");
    expect(regleDeLaVue("prochain_batch", REGLES)).toContain("les comptes à podzer ne partent pas");
  });

  it("le bilan du lundi et le résultat d'un lancement", () => {
    expect(bilanSemaine(null)).toBeNull();
    expect(bilanSemaine({ semaine: "2026-11-16", sources: [
      lundi({ lanceeLe: "2026-11-16T05:10:00Z", importes: 12, valides: 9 }), lundi({ compteReferenceId: "s2", importes: 0 }),
      lundi({ compteReferenceId: "s3", decision: "pas_maj", raison: null }), lundi({ compteReferenceId: "s4", decision: "peu_de_mesures", raison: "neuve", lanceeLe: "2026-11-17T05:40:00Z", importes: 30, valides: 30 }),
      // Une source ajoutée dans la semaine : un premier import, pas une mise à jour du lundi.
      lundi({ compteReferenceId: "s5", decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-18T10:00:00Z", importes: 30, valides: 28 }),
    ] })).toEqual({ semaine: "2026-11-16", retenues: 3, faites: 2, aVenir: 1, pasRetenues: 1, importes: 42, valides: 39 });

    expect(ligneResultat({ id: "c1", handle: "un", statut: "lancee", essai_max: 30 }, REGLES)).toEqual({ texte: "@un : dans la séquence d'import, essai de 30 posts", ok: true });
    expect(ligneResultat({ id: "c2", handle: "deux", statut: "attente", essai_max: null, prevu_le: "2026-11-20" }, REGLES).texte).toBe(
      "@deux : dans la file, départ au plus tôt le 20/11, ses 100 posts les plus vus",
    );
    expect(ligneResultat({ id: "c3", handle: "trois", statut: "refuse", raison: "label à créer" }, REGLES)).toEqual({ texte: "@trois : pas lancé (label à créer)", ok: false });
  });
});
