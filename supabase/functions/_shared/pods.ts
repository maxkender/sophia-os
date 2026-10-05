/**
 * Pods — le seul point de contact entre l'assignation et les contenus livrés
 * par un pod (migration 0259).
 *
 * Un contenu `livre` a, pour chaque langue livrée, un deck d'IMAGES FINIES
 * (texte en dur) dans `contenu_langues.slides[].media_id`. L'assignation ne le
 * traduit pas, n'y place pas l'app, et ne le sert que dans ses langues livrées.
 */

// deno-lint-ignore no-explicit-any
type Supabase = any;

export interface SlideLivree {
  position: number;
  media_id: string | null;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/** Un deck livré est servable : au moins une slide, toutes avec leur image. */
export function deckLivrePret(slides: Partial<SlideLivree>[] | null | undefined): boolean {
  const deck = slides ?? [];
  return deck.length > 0 && deck.every((s) => typeof s.media_id === "string" && s.media_id.length > 0);
}

/**
 * Le contenu est-il livré par un pod ? Lecture séparée et tolérante : si la
 * colonne n'existe pas encore (0259 non appliquée), c'est « non » et
 * l'assignation suit le chemin d'avant, à l'identique.
 */
export async function estContenuLivre(supabase: Supabase, contenuId: string): Promise<boolean> {
  const { data, error } = await supabase.from("contenus").select("livre").eq("id", contenuId).maybeSingle();
  if (error) return false;
  return Boolean((data as { livre?: boolean } | null)?.livre);
}

/** Deck livré d'une langue, tel quel. Échec franc si la langue n'est pas livrée. */
export async function deckLivre(
  supabase: Supabase,
  contenuId: string,
  langue: string,
): Promise<{ slides: SlideLivree[]; hashtags: string }> {
  const { data: cl, error } = await supabase
    .from("contenu_langues")
    .select("slides, hashtags")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .maybeSingle();
  if (error) throw new Error(`Deck livré ${langue} illisible : ${error.message ?? error}`);
  const slides = ((cl?.slides ?? []) as SlideLivree[]).map((s) => ({
    position: Number(s.position),
    media_id: s.media_id ?? null,
    texte_overlay: s.texte_overlay ?? "",
    position_sophia: Boolean(s.position_sophia),
  }));
  if (!deckLivrePret(slides)) throw new Error(`Contenu livré : pas de deck en ${langue}`);
  return { slides, hashtags: ((cl?.hashtags as string | null) ?? "").trim() };
}

// ---------------------------------------------------------------------------
// Dépôt d'une livraison (fonction `pods`)
// ---------------------------------------------------------------------------

/** SHA-256 hexadécimal (jeton d'agent comparé à `pods.jeton_hash`). */
export async function sha256Hex(texte: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Segments de métadonnées encore présents dans un JPEG (vide = propre) : APP1 à
 * APP15 (EXIF/XMP, ICC, C2PA/JUMBF, Photoshop, Adobe) et commentaires. Même règle
 * que pods/page-blanche/atelier/metadonnees.ts : un dépôt qui en porte est refusé.
 */
export function metadonneesJpeg(jpeg: Uint8Array): string[] | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null; // pas un JPEG
  const restes: string[] = [];
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const m = jpeg[i + 1];
    if (m === 0xda) break;
    const longueur = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) restes.push(`0x${m.toString(16)}`);
    i += 2 + longueur;
  }
  return restes;
}

export interface SlideDeposee {
  position: number;
  position_sophia?: boolean;
  jpeg_base64: string;
}

export interface DeckDepose {
  hashtags?: string;
  slides: SlideDeposee[];
}

/** Contrôles d'un dépôt AVANT tout envoi au stockage. Renvoie les erreurs. */
export function verifierDepot(decks: Record<string, DeckDepose> | null | undefined, langueSource: string): string[] {
  const erreurs: string[] = [];
  const langues = Object.keys(decks ?? {});
  if (!langues.length) return ["aucun deck"];
  if (!langues.includes(langueSource)) erreurs.push(`pas de deck dans la langue source (${langueSource})`);
  for (const [langue, deck] of Object.entries(decks ?? {})) {
    if (!/^[a-z]{2}$/.test(langue)) erreurs.push(`langue invalide : ${langue}`);
    const positions = (deck?.slides ?? []).map((s) => Number(s.position));
    if (!positions.length) erreurs.push(`${langue} : deck vide`);
    if (new Set(positions).size !== positions.length) erreurs.push(`${langue} : positions en double`);
    if (!(deck?.slides ?? []).some((s) => s.position_sophia)) erreurs.push(`${langue} : aucune slide de l'app`);
  }
  return erreurs;
}
