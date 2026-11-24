import { describe, expect, it } from "vitest";

import type { SourceLundi } from "@/features/moteur/api";
import type { FileSources } from "@/features/moteur/fileSources";
import type { CompteReference } from "@/features/moteur/types";

import { blocageImport, blocsVersesDans, type CarteLabel, carteValidable, type CompteBible, estPodzValide, etapeAvantImport, labelsSansBloc, valeurDuLabel } from "./moodboard";
import {
  assemblerSources, bilanSemaine, compterSources, enImportEnBref, etapeDeLaSource, ligneResultat, phraseEtat, rangerSources, regleDeLaVue, REGLES_DEFAUT, type ReglesSources,
  type SourceBible, type SourceNeuve, sourcesParHandle, versNeuves, versRegles,
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
  perf: { posts: 20, r: 1.1, vuesMediane: 900, rVsLabel: 1.05 }, essaiMax: null, essaiVerdict: null, dernierImport: "2026-11-10T06:00:00Z", neuve: null, attente: null,
  sequence: null, restant: 0, semaine: null, ...o,
});
const source = (o: Partial<Omit<SourceBible, "etape">>): SourceBible => { const b = base(o); return { ...b, etape: etapeDeLaSource(b) }; };
const attente = (o: Partial<FileSources["attente"][number]>): FileSources["attente"][number] => ({
  compteReferenceId: "s1", handle: "une.source", sorte: "neuve", essaiMax: 30, prevuLe: "2026-11-20", echec: null, ...o,
});
const neuve = (o: Partial<SourceNeuve>): SourceNeuve => ({
  compteReferenceId: "s1", handle: "une.source", essais: 0, echec: null, lanceeLe: null, releve: false, enTraitement: 0, ...o,
});
const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "smart_girl", titre: null, section: "sophia", badge: "existe", description_da: null, label_id: "L1", ordre: 1, statut: "valide",
  a_podzer: false, podz_valide_at: null, ...o,
});
const compte = (o: Partial<CompteBible>): CompteBible => ({
  id: "c1", handle: "une.source", etape: "prochain_batch", label_propose_id: "k1", autres_cartes: [], note_import: null, remarque: null,
  posts: [], miniatures_statut: "ok", miniatures_erreur: null, vues_mediane: null, meilleur_post_vues: null, abonnes: null, ajoute_at: "2026-11-19T10:00:00Z", ...o,
});

describe("l'onglet d'une source, calculé depuis son état", () => {
  it("essai raté : sa propre case, la source est gardée ; désactivée : Arrêtées", () => {
    expect(etapeDeLaSource(base({ essaiMax: 30, essaiVerdict: "ne_tient_pas" }))).toBe("essai_rate");
    // même avec du stock et des mesures : elle ne retombe ni en « À l'essai » ni en « Mise à jour hebdo »
    expect(etapeDeLaSource(base({ importes: 30, valides: 24, essaiMax: 30, essaiVerdict: "ne_tient_pas", semaine: lundi({}) }))).toBe("essai_rate");
    expect(etapeDeLaSource(base({ actif: false }))).toBe("arretees");
    // désactivée à la main après un essai raté : c'est la désactivation qui compte
    expect(etapeDeLaSource(base({ actif: false, essaiMax: 30, essaiVerdict: "ne_tient_pas" }))).toBe("arretees");
  });

  it("source neuve dans la file, ou dont le premier import tourne : En import", () => {
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, essaiMax: 30, attente: attente({}) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 12, essaiMax: 30, sequence: "en_cours", semaine: lundi({ decision: "peu_de_mesures", raison: "ajout" }) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, sequence: "a_suivre" }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null }))).toBe("en_import");
  });

  it("une source neuve part tout de suite : En import tant que son premier import n'est pas fini, puis elle en sort seule", () => {
    // à relever, relevé en cours, slideshows en traitement : toujours « En import », même avec du stock déjà arrivé
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, neuve: neuve({}) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 0, dernierImport: null, neuve: neuve({ essais: 1, lanceeLe: "2026-11-19T16:30:00Z" }) }))).toBe("en_import");
    expect(etapeDeLaSource(base({ importes: 24, essaiMax: 30, neuve: neuve({ essais: 1, releve: true, enTraitement: 18 }) }))).toBe("en_import");
    // tout traité : la base ne la rend plus dans `neuves`, elle passe à l'essai ou en Mise à jour hebdo
    expect(etapeDeLaSource(base({ importes: 30, essaiMax: 30, semaine: lundi({ decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-19T16:30:00Z" }) }))).toBe("essai");
    expect(etapeDeLaSource(base({ importes: 100, semaine: lundi({ decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-19T16:30:00Z" }) }))).toBe("weekly");
  });

  it("une source établie qui passe sa mise à jour du lundi reste en Mise à jour hebdo", () => {
    expect(etapeDeLaSource(base({ attente: attente({ sorte: "maj" }) }))).toBe("weekly");
    expect(etapeDeLaSource(base({ sequence: "en_cours", semaine: lundi({}) }))).toBe("weekly");
  });

  it("essai posé et pas encore jugé : À l'essai ; essai levé ou jamais posé : Mise à jour hebdo", () => {
    expect(etapeDeLaSource(base({ importes: 30, essaiMax: 30 }))).toBe("essai");
    expect(etapeDeLaSource(base({ essaiVerdict: "tient" }))).toBe("weekly");
    expect(etapeDeLaSource(base({}))).toBe("weekly");
    expect(compterSources([source({}), source({ id: "s2", importes: 30, essaiMax: 30 }), source({ id: "s3", actif: false })])).toEqual({
      en_import: 0, essai: 1, weekly: 1, essai_rate: 0, arretees: 1,
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

  it("source neuve : relevé dans la minute, relevé en cours, ce qui reste en traitement, relevé raté ; jamais de renvoi au lendemain", () => {
    expect(phraseEtat(source({ importes: 0, dernierImport: null, neuve: neuve({}) }), REGLES)).toEqual({ texte: "Relevé du profil dans la minute", ton: "attente" });
    expect(texte({ importes: 0, dernierImport: null, neuve: neuve({ essais: 1, lanceeLe: "2026-11-19T16:30:00Z" }) })).toBe("Relevé du profil en cours");
    expect(texte({ importes: 0, dernierImport: null, neuve: neuve({ essais: 3, lanceeLe: "2026-11-19T16:52:00Z" }) })).toBe("Relevé du profil en cours (essai 3 sur 5)");
    expect(texte({ importes: 24, neuve: neuve({ essais: 1, lanceeLe: "2026-11-19T16:30:00Z", releve: true, enTraitement: 18 }) })).toBe("Import en cours : 18 slideshows en traitement");
    expect(texte({ importes: 0, dernierImport: null, neuve: neuve({ essais: 1, lanceeLe: "2026-11-19T16:30:00Z", releve: true, enTraitement: 1 }) })).toBe("Import en cours : 1 slideshow en traitement");
    expect(phraseEtat(source({ importes: 0, dernierImport: null, neuve: neuve({ essais: 2, echec: "profil illisible" }) }), REGLES)).toEqual({
      texte: "Relevé du profil raté, nouvel essai dans quelques minutes (profil illisible)", ton: "alerte",
    });
    // profil relevé, rien dessus : elle n'est plus « neuve », et on dit pourquoi elle reste là
    expect(texte({ importes: 0, dernierImport: null, semaine: lundi({ decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-19T16:30:00Z" }) })).toBe(
      "Profil relevé le 19/11 : aucun slideshow à importer",
    );
  });

  it("« En import », en une ligne : relevés en cours, profils à relever, relevés ratés, slideshows en traitement", () => {
    expect(enImportEnBref([source({})])).toBeNull();
    expect(enImportEnBref([
      source({ id: "a", importes: 0, dernierImport: null, neuve: neuve({ essais: 1, lanceeLe: "2026-11-19T16:30:00Z" }) }),
      source({ id: "b", importes: 0, dernierImport: null, neuve: neuve({}) }),
      source({ id: "c", importes: 0, dernierImport: null, neuve: neuve({}) }),
      source({ id: "d", importes: 0, dernierImport: null, neuve: neuve({ essais: 1, echec: "profil illisible" }) }),
      source({ id: "e", importes: 24, neuve: neuve({ essais: 1, releve: true, enTraitement: 18 }) }),
      source({ id: "f", importes: 3, neuve: neuve({ essais: 1, releve: true, enTraitement: 40 }) }),
      source({ id: "g" }),
    ])).toEqual({
      total: 6,
      detail: "1 relevé de profil en cours, 2 profils à relever (départ dans la minute), 1 relevé raté (nouvel essai dans quelques minutes), 58 slideshows en traitement",
    });
    expect(enImportEnBref([source({ importes: 0, dernierImport: null, neuve: neuve({}) })])).toEqual({ total: 1, detail: "1 profil à relever (départ dans la minute)" });
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

  it("essai raté : la source est gardée avec ses slideshows validés, elle n'importe plus ; désactivée", () => {
    expect(phraseEtat(source({ importes: 30, valides: 24, essaiMax: 30, essaiVerdict: "ne_tient_pas" }), REGLES)).toEqual({
      texte: "Essai raté : gardée avec ses 24 slideshows validés, plus d'import", ton: "alerte",
    });
    expect(texte({ importes: 30, valides: 1, essaiMax: 30, essaiVerdict: "ne_tient_pas" })).toBe("Essai raté : gardée avec ses 1 slideshow validé, plus d'import");
    expect(texte({ importes: 30, valides: 0, essaiMax: 30, essaiVerdict: "ne_tient_pas" })).toBe("Essai raté : gardée, plus d'import");
    expect(texte({ actif: false })).toBe("Désactivée");
    expect(compterSources([source({ essaiMax: 30, essaiVerdict: "ne_tient_pas" }), source({ id: "s2", actif: false })])).toEqual({
      en_import: 0, essai: 0, weekly: 0, essai_rate: 1, arretees: 1,
    });
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

  it("lit les sources neuves de la file (`neuves`) et les relie à leur source", () => {
    const neuves = versNeuves({ neuves: [
      { compte_reference_id: "s5", handle: "toute.neuve", essai_max: null, essais: 1, echec: null, lancee_le: "2026-11-19T16:30:00+00:00", releve: true, enfilees: 100, en_traitement: 64 },
      { compte_reference_id: "s6", handle: "a.relever", essai_max: 30, essais: 0, echec: null, lancee_le: null, releve: false, enfilees: null, en_traitement: 0 },
    ] });
    expect(neuves).toEqual([
      { compteReferenceId: "s5", handle: "toute.neuve", essais: 1, echec: null, lanceeLe: "2026-11-19T16:30:00+00:00", releve: true, enTraitement: 64, enfilees: 100 },
      { compteReferenceId: "s6", handle: "a.relever", essais: 0, echec: null, lanceeLe: null, releve: false, enTraitement: 0, enfilees: null },
    ]);
    // une file d'avant 0772 (pas de `neuves`) se lit sans erreur
    expect(versNeuves({})).toEqual([]);
    const sources = assemblerSources({
      refs: [ref({ id: "s5", handle_tiktok: "toute.neuve" }), ref({ id: "s6", handle_tiktok: "a.relever", dernier_scrape_at: null, essai_max: 30 })],
      importes: [], perf: {}, stocks: { s5: { importes: 36, valides: 20 } },
      file: { ...file, enCours: null, attente: [] }, neuves, semaine: null,
    });
    expect(sources.map((s) => [s.handle, s.etape, phraseEtat(s, REGLES).texte])).toEqual([
      ["toute.neuve", "en_import", "Import en cours : 64 slideshows en traitement"],
      ["a.relever", "en_import", "Relevé du profil dans la minute"],
    ]);
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
    expect(blocageImport(micabo, dejaSource)).toBe("deja_source");
    expect(etapeAvantImport(compte({}), carte({ label_id: "L2" }), dejaSource)).toBe("prochain_batch");
  });

  it("ce qui bloque un compte du batch : label à podzer, pas de label, label à créer ; sinon prêt", () => {
    // « À podzer » est sur le LABEL : tous ses comptes sont bloqués, même si le label existe dans l'OS.
    expect(blocageImport(carte({ a_podzer: true }), null)).toBe("podz");
    expect(blocageImport(carte({ a_podzer: true, label_id: null, badge: "nouveau" }), null)).toBe("podz");
    expect(blocageImport(null, null)).toBe("sans_label");
    expect(blocageImport(carte({ label_id: null, badge: "nouveau", section: "micabo" }), null)).toBe("label_a_creer");
    // Atala existe dans l'OS : sa carte attend son label, plus son appli.
    expect(blocageImport(carte({ label_id: null, badge: "propose", section: "atala" }), null)).toBe("label_a_creer");
    expect(blocageImport(carte({}), null)).toBe("pret");
  });

  it("un label à podzer validé : ses comptes quittent les onglets d'avant import, ils ne sont jamais importés", () => {
    const valide = carte({ a_podzer: true, podz_valide_at: "2026-11-20T09:00:00Z" });
    expect(estPodzValide(valide)).toBe(true);
    expect(etapeAvantImport(compte({}), valide, null)).toBeNull();
    expect(etapeAvantImport(compte({ etape: "a_importer" }), valide, null)).toBeNull();
    // À podzer mais pas encore validé : ses comptes restent dans leur onglet (bloqués à l'import).
    const propose = carte({ a_podzer: true });
    expect(estPodzValide(propose)).toBe(false);
    expect(etapeAvantImport(compte({}), propose, null)).toBe("prochain_batch");
    // Plus à podzer (la marque retirée efface la validation), sans label, ou jamais marqué : pas un podz.
    expect(estPodzValide(carte({ a_podzer: false, podz_valide_at: "2026-11-20T09:00:00Z" }))).toBe(false);
    expect(estPodzValide(null)).toBe(false);
    expect(estPodzValide(carte({}))).toBe(false);
  });

  it("les labels de l'OS qui n'ont pas encore de bloc dans la Bible", () => {
    expect(labelsSansBloc([{ id: "L1", nom: "smart_girl" }, { id: "L7", nom: "History" }], [carte({})])).toEqual([{ id: "L7", nom: "History" }]);
    // Dans la liste de choix : le bloc du label s'il en a un, sinon le label lui-même ; rien si le label est inconnu.
    const labels = [{ id: "L1", nom: "smart_girl" }, { id: "L7", nom: "History" }];
    expect(valeurDuLabel("L1", [carte({})], labels)).toBe("k1");
    expect(valeurDuLabel("L7", [carte({})], labels)).toBe("label:L7");
    expect(valeurDuLabel("L99", [carte({})], labels)).toBe("");
    expect(valeurDuLabel(null, [carte({})], labels)).toBe("");
  });

  it("les blocs dont les comptes ont été versés dans un autre par un rattachement : ils peuvent revenir", () => {
    const cible = carte({ id: "k3" });
    const verse = carte({ id: "k1", label_id: null, rattachement: { label: "smart_girl", fusion: true, vers: "k3", comptes: ["c1", "c2"] } });
    const vide = carte({ id: "k5", label_id: null, rattachement: { label: "smart_girl", fusion: true, vers: "k3", comptes: [] } });
    const ailleurs = carte({ id: "k6", label_id: null, rattachement: { label: "x", fusion: true, vers: "k9", comptes: ["c7"] } });
    const pris = carte({ id: "k7", rattachement: { label: "History", fusion: false, vers: null, comptes: ["c8"] } });
    expect(blocsVersesDans(cible, [cible, verse, vide, ailleurs, pris]).map((c) => c.id)).toEqual(["k1"]);
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
    expect(regleDeLaVue("prochain_batch", REGLES)).toContain("Un label marqué « à podzer » ne s'importe pas : valide son podz depuis l'en-tête de son bloc");
    expect(regleDeLaVue("a_importer", REGLES)).toContain("se marque « À podzer » sur l'en-tête de son bloc");
    expect(regleDeLaVue("a_importer", REGLES)).toContain("s'importe d'un clic");
    expect(regleDeLaVue("en_import", REGLES)).toContain("Une source part dès qu'elle est créée, sans attendre les autres");
    expect(regleDeLaVue("en_import", REGLES)).toContain("Seules les mises à jour de la semaine sont étalées, 8 sources par jour.");
    expect(regleDeLaVue("prochain_batch", REGLES)).toContain("leur import part tout de suite");
    expect(regleDeLaVue("weekly", REGLES)).toContain("Les labels à podzer validés y figurent à part, avec leurs comptes, à titre indicatif.");
    expect(regleDeLaVue("essai", REGLES)).toContain("sinon elle va dans « Essai raté » (gardée, plus importée)");
    expect(regleDeLaVue("essai_rate", REGLES)).toContain("avec 10 posts mesurés chez nous, leur r est resté sous 0,95, et sous 0,95 face à leur label");
    expect(regleDeLaVue("essai_rate", REGLES)).toContain("Rien n'est effacé : la source reste, ses slideshows validés restent en stock");
    expect(regleDeLaVue("arretees", REGLES)).toBe("Les sources désactivées à la main : elles ne sont plus mises à jour.");
  });

  it("le bilan du lundi et le résultat d'un lancement", () => {
    expect(bilanSemaine(null)).toBeNull();
    expect(bilanSemaine({ semaine: "2026-11-16", sources: [
      lundi({ lanceeLe: "2026-11-16T05:10:00Z", importes: 12, valides: 9 }), lundi({ compteReferenceId: "s2", importes: 0 }),
      lundi({ compteReferenceId: "s3", decision: "pas_maj", raison: null }), lundi({ compteReferenceId: "s4", decision: "peu_de_mesures", raison: "neuve", lanceeLe: "2026-11-17T05:40:00Z", importes: 30, valides: 30 }),
      // Une source ajoutée dans la semaine : un premier import, pas une mise à jour du lundi.
      lundi({ compteReferenceId: "s5", decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-18T10:00:00Z", importes: 30, valides: 28 }),
    ] })).toEqual({ semaine: "2026-11-16", retenues: 3, faites: 2, aVenir: 1, pasRetenues: 1, importes: 42, valides: 39 });

    expect(ligneResultat({ id: "c1", handle: "un", statut: "lancee", essai_max: 30 }, REGLES)).toEqual({ texte: "@un : import lancé, essai de 30 posts", ok: true });
    expect(ligneResultat({ id: "c2", handle: "deux", statut: "attente", essai_max: null, prevu_le: "2026-11-20" }, REGLES).texte).toBe(
      "@deux : dans la file, départ au plus tôt le 20/11, ses 100 posts les plus vus",
    );
    expect(ligneResultat({ id: "c3", handle: "trois", statut: "refuse", raison: "label à créer" }, REGLES)).toEqual({ texte: "@trois : pas lancé (label à créer)", ok: false });
  });
});
