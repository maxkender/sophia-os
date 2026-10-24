/**
 * Angle de placement : consigne propre à un label pour UNE application,
 * ajoutée au prompt de placement de cette application quand elle n'est pas
 * vide.
 *
 * Exemple : weird_alpha × Unswipe = « insister sur le côté … ». Le prompt de
 * placement de l'application reste le socle ; l'angle oriente le FOND de la
 * slide pub (ce qu'elle met en avant), jamais sa forme.
 *
 * Depuis 0285 (2026-10-14), les angles vivent dans `angles_placement` : une
 * paire peut en porter plusieurs, chacun ACTIF (ajouté au prompt partout) ou
 * en TEST (lu seulement par le test à blanc « contenus », une variante par
 * angle pour comparer). Depuis 0353 (2026-10-24), une paire peut avoir
 * plusieurs actifs : chaque contenu en reçoit UN (`choisirAngleActif`), le
 * même dans toutes ses langues, et les contenus se répartissent entre eux.
 * Le moteur de la nuit ne lit que les actifs ; `label_applications.angle`
 * n'est plus lue. Seuls comptent
 * les angles des labels qui SERVENT l'application (décocher l'application
 * d'un label garde ses angles, inutilisés).
 *
 * Décision du 2026-10-13 (l'angle avait été retiré le 2026-10-08) :
 *  - placement seulement : la pertinence (le contenu entre-t-il dans la réserve
 *    de l'application ?) ne lit pas l'angle ;
 *  - toutes les applications, Sophia comprise ;
 *  - l'angle est celui du label du CONTENU (le cache des decks est par contenu ×
 *    langue × application, partagé entre comptes) ;
 *  - il ne vaut que pour les prochaines préparations : un deck déjà prêt est
 *    servi tel quel, un post déjà assigné garde son texte ;
 *  - angle vide : le prompt envoyé au modèle est identique OCTET POUR OCTET à
 *    celui d'avant (`blocConsignePlacement` rend une chaîne vide).
 *
 * Module pur : testé sans réseau ni base.
 */
import { estLabelSystemeSlug, type LabelRef } from "./multi_app.ts";

/** Longueur maximale d'un angle (page Angles de placement, contrainte SQL). */
export const ANGLE_LONGUEUR_MAX = 500;

/**
 * Une variante qui reprend autant de mots d'affilée de l'angle l'a recopié
 * (voir `variantesSansCopieAngle`).
 */
export const MOTS_COPIE_ANGLE = 6;

/**
 * Angles en test lus par le test à blanc pour une paire : au-delà, les plus
 * récents attendent (le test le dit). Chacun coûte un placement par slideshow.
 */
export const MAX_ANGLES_TEST = 4;

export type StatutAngle = "test" | "actif";

/** Ligne de `angles_placement` (0285). */
export interface AnglePlacementLigne {
  id: string;
  label_id: string;
  application_id: string;
  texte: string;
  statut: StatutAngle | string;
}

/**
 * Angles EN TEST des labels d'un contenu pour une application : non vides,
 * dédoublonnés (par texte), dans l'ordre reçu (le plus ancien d'abord), labels
 * système exclus.
 */
export function anglesTestPourApplication(
  labels: readonly LabelRef[],
  angles: readonly AnglePlacementLigne[],
  applicationId: string,
): Array<{ id: string; texte: string }> {
  const ids = new Set(labels.filter((l) => !estLabelSystemeSlug(l.slug)).map((l) => l.id));
  const vus = new Set<string>();
  const out: Array<{ id: string; texte: string }> = [];
  for (const a of angles) {
    if (a.statut !== "test" || a.application_id !== applicationId || !ids.has(a.label_id)) continue;
    const texte = normaliserAngle(a.texte);
    if (!texte || vus.has(texte)) continue;
    vus.add(texte);
    out.push({ id: a.id, texte });
  }
  return out;
}

/** Angle saisi, sans les blancs de bord ; chaîne vide = pas d'angle. */
export function normaliserAngle(angle: string | null | undefined): string {
  return (angle ?? "").trim();
}

/**
 * Angles ACTIFS des labels d'un contenu pour une application (0353 : une paire
 * peut en avoir plusieurs) : non vides, dédoublonnés par texte (le plus ancien
 * reçu reste), labels système exclus, rangés par id pour que le choix de
 * `choisirAngleActif` ne dépende pas de l'ordre de lecture.
 */
export function anglesActifsPourApplication(
  labels: readonly LabelRef[],
  angles: readonly AnglePlacementLigne[],
  applicationId: string,
): Array<{ id: string; texte: string }> {
  const ids = new Set(labels.filter((l) => !estLabelSystemeSlug(l.slug)).map((l) => l.id));
  const vus = new Set<string>();
  const out: Array<{ id: string; texte: string }> = [];
  for (const a of angles) {
    if (a.statut !== "actif" || a.application_id !== applicationId || !ids.has(a.label_id)) continue;
    const texte = normaliserAngle(a.texte);
    if (!texte || vus.has(texte)) continue;
    vus.add(texte);
    out.push({ id: a.id, texte });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Empreinte FNV-1a 32 bits d'un texte (répartition, pas sécurité). */
function empreinte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * L'angle servi à un contenu : UN seul parmi les actifs de ses labels (choix
 * du 2026-10-24), tiré par l'empreinte de son id. Il est donc le même dans
 * toutes les langues et pour toutes les préparations du contenu (les decks
 * sont par contenu × langue × application), et les contenus se répartissent à
 * parts égales entre les angles actifs. Ajouter ou retirer un angle actif
 * rebat la répartition des PROCHAINS decks seulement. null : aucun actif.
 */
export function choisirAngleActif(
  contenuId: string,
  actifs: ReadonlyArray<{ id: string; texte: string }>,
): { id: string; texte: string } | null {
  if (actifs.length === 0) return null;
  return actifs[empreinte(contenuId) % actifs.length];
}

/**
 * Bloc ajouté juste après le prompt maître de placement, avant les données du
 * deck. Chaîne VIDE quand l'angle est vide : le prompt ne bouge alors pas d'un
 * octet.
 *
 * Le mot « angle » n'y figure pas : les prompts maîtres l'emploient déjà pour
 * les 3 variantes (« 3 VARIANTES — 3 ANGLES DIFFÉRENTS »).
 */
export function blocConsignePlacement(
  angle: string | null | undefined,
  nomApplication: string,
  langue: string,
): string {
  const consigne = normaliserAngle(angle);
  if (!consigne) return "";
  return `

--- CONSIGNE PROPRE À CE SLIDESHOW ---
${consigne}
Cette consigne oriente le FOND de la slide ${nomApplication} : ce qu'elle met en avant.
Elle ne remplace aucune règle de forme (langue, longueur, préfixe, casse, ton,
façon de mentionner ${nomApplication}). Les 3 variantes la suivent, chacune à sa
façon. N'en recopie aucune formule telle quelle : tes variantes sont en ${langue}.`;
}

/** Mots d'un texte, sans casse, sans accents ni ponctuation. */
function mots(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * La variante reprend-elle `n` mots d'affilée de l'angle (casse, accents et
 * ponctuation ignorés) ? Un angle plus court que `n` mots ne déclenche jamais.
 */
export function copieAngle(variante: string, angle: string, n = MOTS_COPIE_ANGLE): boolean {
  const motsAngle = mots(normaliserAngle(angle));
  if (motsAngle.length < n) return false;
  const suites = new Set<string>();
  for (let i = 0; i + n <= motsAngle.length; i += 1) suites.add(motsAngle.slice(i, i + n).join(" "));
  const motsVariante = mots(variante);
  for (let i = 0; i + n <= motsVariante.length; i += 1) {
    if (suites.has(motsVariante.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

/**
 * Garde-fou déterministe : l'angle est écrit en français comme une consigne,
 * et le prompt interdit d'en recopier une formule. Hors français, une variante
 * qui en reprend `MOTS_COPIE_ANGLE` mots d'affilée porterait du français (ou
 * un slogan) dans une slide d'une autre langue : elle est écartée, et s'il n'en
 * reste aucune l'appelant relance le modèle. Sans angle, ou en français :
 * aucune variante n'est touchée.
 */
export function variantesSansCopieAngle(
  variantes: readonly string[],
  angle: string | null | undefined,
  langue: string | null | undefined,
): string[] {
  const consigne = normaliserAngle(angle);
  if (!consigne || (langue ?? "fr") === "fr") return [...variantes];
  return variantes.filter((v) => !copieAngle(v, consigne));
}
