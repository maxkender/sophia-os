/**
 * Deck placé d'une application AUTRE que Sophia, par contenu × langue.
 *
 * Le deck Sophia ne passe jamais par ici : il reste dans
 * `contenu_langues.slides` (assurerDeckPourLangue, inchangé). Ce module écrit
 * dans `contenu_langue_decks`, à partir d'une base SANS placement.
 *
 * STUB DE CONTRAT — implémentation à venir (spec multi-app, § B).
 */
import type { SlideLangue, Supabase } from "./import_contenu.ts";
import type { ApplicationMoteur } from "./multi_app.ts";

export type DeckApplicationResultat =
  | { statut: "pret"; slides: SlideLangue[]; hashtags: string | null }
  | { statut: "ineligible" | "echec"; raison: string };

/**
 * Assure (cache ou cuisson) le deck de `app` pour (contenu, langue).
 * Ne lève pas pour un refus métier : renvoie `ineligible` / `echec`, que
 * l'assignation traite comme « prends un autre contenu ou replie sur Sophia ».
 * Lève seulement sur une panne d'infrastructure (lecture base impossible).
 */
export async function assurerDeckApplication(
  _supabase: Supabase,
  _contenuId: string,
  _langue: string,
  app: ApplicationMoteur,
): Promise<DeckApplicationResultat> {
  return { statut: "echec", raison: `deck ${app.slug} non implémenté` };
}
