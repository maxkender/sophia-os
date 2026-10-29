/**
 * BLEO — le guichet des podz (L4, P1 de docs/bleo.md). Les règles pures ; les
 * lectures et le jugement en base (`bleo_verifier_depot`, migration 0615) sont
 * dans `pods/index.ts`.
 *
 * Un dépôt d'original de la voie 1 déclare son type :
 *   - `full_test` : une accroche neuve pour le label, sans parent ;
 *   - `declinaison` : une variante d'une famille gagnante de la boîte, avec son
 *     parent (`parent_contenu_id`). Génération 1 : l'accroche du parent mot pour
 *     mot. Génération 2 : l'accroche reformulée (D35).
 * La preuve (veille Apify) n'est plus demandée : la boîte la remplace.
 */
import { normaliserAccroche } from "./doublons.ts";

export type TypeBleo = "full_test" | "declinaison";

export const TYPES_BLEO: ReadonlyArray<TypeBleo> = ["full_test", "declinaison"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ce que le dépôt déclare. `typeBleo` null : dépôt d'avant BLEO (outil pas encore à jour). */
export interface DeclarationBleo {
  typeBleo: string | null;
  parentContenuId: string | null;
}

/** Lit `type_bleo` et `parent_contenu_id` du corps ; seule la forme est vérifiée ici. */
export function lireDeclarationBleo(body: Record<string, unknown>): DeclarationBleo | { erreur: string } {
  const brut = body.type_bleo;
  const typeBleo = brut == null || brut === "" ? null : String(brut).trim();
  const parentBrut = body.parent_contenu_id;
  const parent = parentBrut == null || parentBrut === "" ? null : String(parentBrut).trim().toLowerCase();
  if (parent && !UUID.test(parent)) return { erreur: "parent_contenu_id : un id de contenu (uuid), comme dans la boîte" };
  if (parent && !typeBleo) return { erreur: "parent_contenu_id sans type_bleo : ajouter type_bleo « declinaison »" };
  return { typeBleo, parentContenuId: parent };
}

/** L'accroche comparable d'un deck : le texte de sa première slide, normalisé. */
export function accrocheDuDeck(slides: ReadonlyArray<{ position: number; texte_overlay?: string | null }>): string | null {
  const premiere = [...slides].sort((a, b) => Number(a.position) - Number(b.position))[0];
  return normaliserAccroche(premiere?.texte_overlay ?? null);
}

/**
 * Accroches des livraisons d'originaux en attente (première slide de leur deck
 * source), hors la livraison qu'un nouveau dépôt du même `source_id` remplace.
 */
export function accrochesEnAttente(
  livraisons: ReadonlyArray<{ id: string; langue_source?: string | null; decks?: unknown }>,
  sauf: string | null,
): Map<string, string> {
  const parAccroche = new Map<string, string>();
  for (const l of livraisons) {
    if (l.id === sauf) continue;
    const decks = (l.decks ?? {}) as Record<string, { slides?: Array<{ position: number; texte_overlay?: string }> }>;
    const deck = decks[l.langue_source ?? ""] ?? Object.values(decks)[0];
    const accroche = accrocheDuDeck(deck?.slides ?? []);
    if (accroche && !parAccroche.has(accroche)) parAccroche.set(accroche, l.id);
  }
  return parAccroche;
}

/**
 * Nombre de full tests à déposer aujourd'hui : `par_jour × part` en moyenne,
 * réparti jour après jour sans hasard (le cumul arrondi par défaut avance d'un
 * cran quand la part l'exige). Boîte vide : tout le jour en full tests.
 */
export function fullTestsDuJour(parJour: number, part: number | null, jour: string, boiteVide: boolean): number {
  const n = Math.max(0, Math.round(parJour));
  if (n === 0) return 0;
  if (boiteVide) return n;
  const taux = n * Math.min(1, Math.max(0, part ?? 0));
  const j = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  const avant = Math.floor(taux * j + 1e-9);
  const apres = Math.floor(taux * (j + 1) + 1e-9);
  return Math.min(n, apres - avant);
}

/** Minuit à Paris pour ce jour (AAAA-MM-JJ), en ISO UTC : 23 h la veille en hiver, 22 h en été. */
export function debutJourParis(jour: string): string {
  const midi = new Date(`${jour}T12:00:00Z`);
  const heureParis = Number(midi.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }));
  return new Date(Date.parse(`${jour}T00:00:00Z`) - (heureParis - 12) * 3_600_000).toISOString();
}
