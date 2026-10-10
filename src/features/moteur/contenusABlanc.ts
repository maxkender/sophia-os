/**
 * Test à blanc « contenus » — types et aides PURES (testées par vitest).
 *
 * Miroir de `ResultatContenusABlanc` (supabase/functions/_shared/a_blanc_contenus.ts) :
 * la notation d'une application autre que Sophia (calcul du rattrapage) puis
 * son placement, sur 1 à 3 slideshows, sans rien enregistrer.
 */

import type { MotifBlocageABlanc, OperationABlanc } from "./assignationABlanc";

/** Slideshows testés au plus par appel (même borne que le serveur). */
export const MAX_CONTENUS_A_BLANC = 3;

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
  hashtags: string | null;
  appelsIA: { autorises: number; bloques: number };
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
  deck: DeckTesteABlanc | null;
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
  contenus: ContenuTesteABlanc[];
  ecrituresEvitees: Array<{ table: string; operation: OperationABlanc; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocageABlanc; nombre: number }>;
  appelsIA: { autorises: number; bloques: number };
  plafondIA: number;
  lectures: number;
  limites: string[];
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

/** Ajoute ou retire un id de la sélection, sans jamais dépasser le maximum. */
export function basculerSelection(selection: readonly string[], id: string, max = MAX_CONTENUS_A_BLANC): string[] {
  if (selection.includes(id)) return selection.filter((x) => x !== id);
  if (selection.length >= max) return [...selection];
  return [...selection, id];
}

/** Note arrondie au dixième, ou « — ». */
export function formatNote(note: number | null | undefined): string {
  return note === null || note === undefined || !Number.isFinite(note) ? "—" : (Math.round(note * 10) / 10).toString();
}
