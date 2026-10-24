/**
 * Test à blanc « contenus » — types et aides PURES (testées par vitest).
 *
 * Miroir de `ResultatContenusABlanc` (supabase/functions/_shared/a_blanc_contenus.ts) :
 * la notation d'une application (calcul du rattrapage ; pas pour Sophia) puis
 * son placement — référence et un placement par angle en test du label — sur
 * 1 à 3 slideshows par appel, sans rien enregistrer. La page en coche jusqu'à
 * `MAX_SELECTION_A_BLANC` et lance un appel par lot de 3.
 */

import type { MotifBlocageABlanc, OperationABlanc } from "./assignationABlanc";

/** Slideshows testés au plus par appel (même borne que le serveur). */
export const MAX_CONTENUS_A_BLANC = 3;

/**
 * Slideshows qu'on peut cocher d'un coup. Au-delà de `MAX_CONTENUS_A_BLANC`,
 * la page découpe la sélection en lots (`decouperEnLots`) et lance un appel
 * par lot, en parallèle : chacun garde son mur de 150 s et son plafond d'IA.
 * Les résultats sont fusionnés (`fusionnerResultats`).
 */
export const MAX_SELECTION_A_BLANC = 12;

export type MotifNonEligibleABlanc = "pertinence_sous_plancher" | "note_sous_seuil";

export interface SlideTesteeABlanc {
  position: number;
  texte: string;
  pub: boolean;
}

export interface PertinenceTesteeABlanc {
  promptCle: string;
  score: number | null;
  raison: string | null;
  accroche: string | null;
  note: number | null;
  seuil: number;
  plancher: number;
  eligible: boolean;
  motifs: MotifNonEligibleABlanc[];
  forcee: boolean;
  tier: string;
  passages: number;
  enBase: { score: number | null; note: number | null; eligible: boolean } | null;
  appelsIA: { autorises: number; bloques: number };
  erreur?: string;
}

export interface DeckTesteABlanc {
  promptCle: string;
  statut: "pret" | "ineligible" | "echec";
  raison: string | null;
  base: SlideTesteeABlanc[];
  slides: SlideTesteeABlanc[];
  slidePub: number | null;
  positionImposee: number | null;
  mode: string | null;
  variantes: string[];
  varianteRetenue: number | null;
  /** Angle de placement ajouté au prompt ; null = sans angle. */
  angle?: string | null;
  hashtags: string | null;
  appelsIA: { autorises: number; bloques: number };
}

/** Un placement du comparatif d'angles d'un contenu. */
export interface AngleTesteABlanc {
  /** `reference` : ce que ferait la nuit (angle actif, ou sans angle) ; `test` : un angle en test. */
  source: "reference" | "test";
  /** Id de l'angle en test ; null pour la référence. */
  angleId: string | null;
  /** Angle ajouté au prompt ; null = sans angle. */
  angle: string | null;
  deck: DeckTesteABlanc | null;
  erreur?: string;
}

export interface ContenuTesteABlanc {
  id: string;
  titre: string | null;
  statut: string | null;
  importStatut: string | null;
  langueSource: string;
  langue: string;
  vues: number | null;
  pisteSource: number | null;
  avertissements: string[];
  pertinence: PertinenceTesteeABlanc | null;
  /** Deck de la RÉFÉRENCE (= `angles[0].deck`). */
  deck: DeckTesteABlanc | null;
  /** Référence puis un placement par angle en test (absent : ancienne réponse). */
  angles?: AngleTesteABlanc[];
  /** Angles en test au-delà du maximum, non testés. */
  anglesNonTestes?: number;
  erreur?: string;
  dureeMs: number;
}

export interface ContenusABlancResultat {
  aBlanc: true;
  mode: "contenus";
  ia: true;
  dureeMs: number;
  resume: string;
  erreurRun?: string;
  application: { id: string; slug: string; nom: string; actif: boolean; langues: string[] | null } | null;
  prompts: {
    pertinence: { cle: string; present: boolean };
    placement: { cle: string; present: boolean };
  } | null;
  scoring: { seuil: number; plancher: number; poidsVues: number; poidsSource: number } | null;
  /** Notation testée : false pour Sophia (placement seul). Absent : true. */
  notation?: boolean;
  contenus: ContenuTesteABlanc[];
  ecrituresEvitees: Array<{ table: string; operation: OperationABlanc; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocageABlanc; nombre: number }>;
  appelsIA: { autorises: number; bloques: number };
  plafondIA: number;
  lectures: number;
  limites: string[];
  /** Page seulement (`fusionnerResultats`) : erreur de chaque lot en échec, les autres restent affichés. */
  erreursLots?: string[];
}

/** Un slideshow proposé à la sélection. */
export interface SlideshowABlanc {
  id: string;
  titre: string | null;
  langue_source: string | null;
  vues_source: number | null;
  created_at: string;
}

/** Clé i18n d'un motif de non-éligibilité. */
export function motifNonEligibleCle(motif: string): string {
  return `contenusABlanc.motifs.${motif === "pertinence_sous_plancher" ? motif : "note_sous_seuil"}`;
}

/** Clé i18n du statut d'un deck testé. */
export function statutDeckCle(statut: string): string {
  return `contenusABlanc.statutDeck.${["pret", "ineligible", "echec"].includes(statut) ? statut : "echec"}`;
}

/**
 * Raison d'un deck, lisible : « budget » (arrêt par manque de temps) n'a pas
 * de sens pour un non-développeur. `null` : rien à dire.
 */
export function raisonDeckCle(raison: string | null): { cle: string; brut?: string } | null {
  if (!raison) return null;
  if (raison === "budget") return { cle: "contenusABlanc.raisonBudget" };
  const prompt = /^prompt (\S+) manquant$/.exec(raison);
  if (prompt) return { cle: "contenusABlanc.raisonPrompt", brut: prompt[1] };
  return { cle: "contenusABlanc.raison", brut: raison };
}

/**
 * Labels dans l'ordre d'affichage : ceux qui servent l'application d'abord
 * (par nom), puis les autres (par nom).
 */
export function ordonnerLabels<T extends { id: string; nom: string }>(
  labels: readonly T[],
  servis: ReadonlySet<string>,
): Array<T & { sert: boolean }> {
  return labels
    .map((l) => ({ ...l, sert: servis.has(l.id) }))
    .sort((a, b) => Number(b.sert) - Number(a.sert) || a.nom.localeCompare(b.nom));
}

/** `n` éléments tirés au hasard, sans doublon (Fisher-Yates partiel). */
export function tirerAuHasard<T>(liste: readonly T[], n: number, aleatoire: () => number = Math.random): T[] {
  const copie = [...liste];
  const k = Math.max(0, Math.min(n, copie.length));
  for (let i = 0; i < k; i += 1) {
    const j = i + Math.floor(aleatoire() * (copie.length - i));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, k);
}

/** Découpe une sélection en lots d'au plus `taille`, dans l'ordre. */
export function decouperEnLots<T>(liste: readonly T[], taille = MAX_CONTENUS_A_BLANC): T[][] {
  const pas = Math.max(1, Math.floor(taille));
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += pas) lots.push(liste.slice(i, i + pas));
  return lots;
}

/** Issue d'un appel serveur (un lot) : son résultat, ou l'erreur qui l'a arrêté. */
export type LotABlanc = { ok: true; resultat: ContenusABlancResultat } | { ok: false; erreur: string };

/**
 * Un seul résultat à partir des lots, comme si le serveur avait tout testé :
 * slideshows dans l'ordre de la sélection, compteurs additionnés, durée du
 * lot le plus long (ils tournent en parallèle). Un lot en échec n'efface pas
 * les autres : son erreur va dans `erreursLots`, avec son numéro. Aucun lot
 * abouti : null (l'appelant remonte l'erreur).
 */
export function fusionnerResultats(lots: readonly LotABlanc[]): ContenusABlancResultat | null {
  const reussis = lots.flatMap((l) => (l.ok ? [l.resultat] : []));
  if (reussis.length === 0) return null;
  if (lots.length === 1) return reussis[0];

  const base = reussis[0];
  const erreurs = lots.flatMap((l, i) => {
    const erreur = l.ok ? l.resultat.erreurRun : l.erreur;
    return erreur ? [`[${i + 1}/${lots.length}] ${erreur}`] : [];
  });

  const ecritures = new Map<string, ContenusABlancResultat["ecrituresEvitees"][number]>();
  const bloques = new Map<string, ContenusABlancResultat["appelsBloques"][number]>();
  for (const r of reussis) {
    for (const e of r.ecrituresEvitees) {
      const cle = `${e.table}|${e.operation}`;
      const deja = ecritures.get(cle);
      ecritures.set(
        cle,
        deja
          ? {
              ...deja,
              requetes: deja.requetes + e.requetes,
              lignes: deja.lignes === null && e.lignes === null ? null : (deja.lignes ?? 0) + (e.lignes ?? 0),
            }
          : { ...e },
      );
    }
    for (const b of r.appelsBloques) {
      const cle = `${b.hote}|${b.motif}`;
      const deja = bloques.get(cle);
      bloques.set(cle, deja ? { ...deja, nombre: deja.nombre + b.nombre } : { ...b });
    }
  }

  const contenus = reussis.flatMap((r) => r.contenus);
  const notation = reussis.every((r) => r.notation !== false);
  const eligibles = contenus.filter((c) => c.pertinence?.eligible).length;
  const prets = contenus.filter((c) => c.deck?.statut === "pret").length;
  const somme = (f: (r: ContenusABlancResultat) => number) => reussis.reduce((s, r) => s + f(r), 0);

  return {
    ...base,
    dureeMs: Math.max(...reussis.map((r) => r.dureeMs)),
    resume: notation
      ? `${contenus.length} slideshow(s) testé(s) : ${eligibles} éligible(s), ${prets} deck(s) prêt(s) — rien n'a été écrit`
      : `${contenus.length} slideshow(s) testé(s) : ${prets} deck(s) prêt(s) — rien n'a été écrit`,
    erreurRun: undefined,
    erreursLots: erreurs.length ? erreurs : undefined,
    application: reussis.find((r) => r.application)?.application ?? null,
    prompts: reussis.find((r) => r.prompts)?.prompts ?? null,
    scoring: reussis.find((r) => r.scoring)?.scoring ?? null,
    notation,
    contenus,
    ecrituresEvitees: [...ecritures.values()],
    appelsBloques: [...bloques.values()],
    appelsIA: { autorises: somme((r) => r.appelsIA.autorises), bloques: somme((r) => r.appelsIA.bloques) },
    plafondIA: somme((r) => r.plafondIA),
    lectures: somme((r) => r.lectures),
    limites: [...new Set(reussis.flatMap((r) => r.limites))],
  };
}

/** Ajoute ou retire un id de la sélection, sans jamais dépasser le maximum. */
export function basculerSelection(selection: readonly string[], id: string, max = MAX_SELECTION_A_BLANC): string[] {
  if (selection.includes(id)) return selection.filter((x) => x !== id);
  if (selection.length >= max) return [...selection];
  return [...selection, id];
}

/** Note arrondie au dixième, ou « — ». */
export function formatNote(note: number | null | undefined): string {
  return note === null || note === undefined || !Number.isFinite(note) ? "—" : (Math.round(note * 10) / 10).toString();
}
