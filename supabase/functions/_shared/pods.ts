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

/**
 * Contenus livrés qu'on ne peut PAS servir dans `langue` (pas de deck complet
 * dans cette langue). L'assignation les retire du pool avant le tirage : sinon
 * un compte « de » les piocherait, échouerait au deck et perdrait l'essai (et un
 * repêchage leur rendrait des passages pour rien). Tolérant : en cas d'erreur
 * de lecture, rien n'est retiré et l'échec franc de `deckLivre` reste le garde-fou.
 */
export async function contenusLivresHorsLangue(supabase: Supabase, langue: string): Promise<Set<string>> {
  const { data: livres, error } = await supabase.from("contenus").select("id").eq("livre", true);
  if (error || !livres?.length) return new Set();
  const ids = (livres as { id: string }[]).map((c) => c.id);
  const { data: decks, error: e2 } = await supabase
    .from("contenu_langues")
    .select("contenu_id, slides")
    .eq("langue", langue)
    .in("contenu_id", ids);
  if (e2) return new Set();
  const servables = new Set(
    ((decks ?? []) as { contenu_id: string; slides: Partial<SlideLivree>[] | null }[])
      .filter((d) => deckLivrePret(d.slides))
      .map((d) => d.contenu_id),
  );
  return new Set(ids.filter((id) => !servables.has(id)));
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

// ---------------------------------------------------------------------------
// Originaux traduisibles (pod 2 et suivants)
// ---------------------------------------------------------------------------

/**
 * Un ORIGINAL est un slideshow écrit par l'agent d'un pod : texte dans la langue
 * source + images de la banque du label (par identifiant). Contrairement à un
 * contenu livré, il passe par le circuit classique à l'assignation : traduction
 * dans la langue du compte, placement de l'app, poster qui pose le texte.
 */
export interface SlideOriginale {
  position: number;
  media_id: string;
  /** Texte de base, SANS appli : c'est lui que l'OS traduit dans chaque langue. */
  texte_overlay: string;
  /**
   * Sur UNE slide : la version de ce texte qui intègre l'appli Sophia, écrite
   * par le pod dans la langue source. Servie telle quelle aux comptes de cette
   * langue ; les autres langues reçoivent le placement de l'OS sur la base.
   */
  texte_sophia?: string | null;
  /**
   * Slide TikTok d'inspiration (texte d'origine posé dessus), stockée dans
   * `medias/brut/` : le poster s'en sert de modèle pour placer le texte.
   */
  reference_url: string;
}

/** Rang d'entrée d'un original validé (pas de vues source : pas de note d'import). */
export const TIER_ORIGINAL = "B";

const LONGUEUR_MAX_ACCROCHE = 120;
const LONGUEUR_MAX_SLIDE = 320;
const MOT_SOPHIA = /\bsophia\b/i;
const AUTRE_APPLI = /\b(vent[\s-]?now|readup|unswipe)\b/i;
/** Les slides d'inspiration viennent du stockage de l'OS (`medias/brut/`), jamais d'un CDN qui expire. */
export const REFERENCE_VALIDE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/medias\/brut\//;

/** Contrôles d'un original AVANT tout accès base. */
export function verifierOriginal(slides: Partial<SlideOriginale>[] | null | undefined): string[] {
  const deck = slides ?? [];
  const erreurs: string[] = [];
  if (deck.length < 4 || deck.length > 10) erreurs.push(`${deck.length} slides (4 à 10 attendues)`);
  const positions = deck.map((s) => Number(s.position)).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1)) erreurs.push("positions attendues : 1, 2, 3… sans trou ni doublon");
  const medias = deck.map((s) => String(s.media_id ?? ""));
  if (medias.some((m) => !/^[0-9a-f-]{36}$/i.test(m))) erreurs.push("media_id manquant ou invalide");
  if (new Set(medias).size !== medias.length) erreurs.push("même image utilisée deux fois");
  const sophia = deck.filter((s) => String(s.texte_sophia ?? "").trim());
  if (sophia.length !== 1) erreurs.push(`${sophia.length} slide(s) Sophia (une seule attendue)`);
  for (const s of deck) {
    const t = String(s.texte_overlay ?? "").trim();
    const max = Number(s.position) === 1 ? LONGUEUR_MAX_ACCROCHE : LONGUEUR_MAX_SLIDE;
    if (!t) erreurs.push(`#${s.position} : texte vide`);
    else if (t.length > max) erreurs.push(`#${s.position} : ${t.length} caractères (max ${max})`);
    if (MOT_SOPHIA.test(t)) erreurs.push(`#${s.position} : le texte de base cite Sophia (mettre la version Sophia dans texte_sophia)`);
    if (AUTRE_APPLI.test(t)) erreurs.push(`#${s.position} : mention d'appli interdite`);
    if (!REFERENCE_VALIDE.test(String(s.reference_url ?? ""))) erreurs.push(`#${s.position} : slide d'inspiration manquante (medias/brut/…)`);
    const ts = String(s.texte_sophia ?? "").trim();
    if (ts) {
      if (Number(s.position) === 1) erreurs.push("#1 : la slide Sophia ne peut pas être la couverture");
      if (!MOT_SOPHIA.test(ts)) erreurs.push(`#${s.position} : texte_sophia ne cite pas Sophia`);
      if (AUTRE_APPLI.test(ts)) erreurs.push(`#${s.position} : texte_sophia cite une autre appli`);
      if (ts.length > LONGUEUR_MAX_SLIDE) erreurs.push(`#${s.position} : texte_sophia ${ts.length} caractères (max ${LONGUEUR_MAX_SLIDE})`);
      if (/[—;]/.test(ts)) erreurs.push(`#${s.position} : texte_sophia avec tiret long ou point-virgule`);
    }
  }
  return erreurs;
}

// ---------------------------------------------------------------------------
// Vidéos par compte (pod 3, réactions UGC)
// ---------------------------------------------------------------------------

/** Une réaction refaite pour UN compte (son persona), avec ses textes. */
export interface ItemVideo {
  compte_id: string;
  /** Chemin dans le bucket medias, sous pods/<pod>/reactions/ (MP4 sans métadonnées). */
  reaction_path: string;
  /** Texte à poser à l'écran en texte TikTok natif, dans la langue du compte. */
  texte_ecran: string;
  /** Légende à coller, dans la langue du compte. */
  legende: string;
}

/**
 * Fichiers qu'un pod peut envoyer au stockage (chemins relatifs à pods/<pod>/) :
 * le persona d'un compte, la réaction livrée d'un compte, et les entrées de
 * l'animation (la réaction source coupée, l'image de départ de chaque compte).
 */
export const CHEMIN_POD =
  /^(personas\/[0-9a-f-]{36}\.(jpg|png)|reactions\/[a-z0-9_-]{3,60}\/[0-9a-f-]{36}\.mp4|sources\/[a-z0-9_-]{3,60}\/(reaction\.mp4|[0-9a-f-]{36}\.(jpg|png)))$/i;

export function verifierVideo(pod: string, items: Partial<ItemVideo>[] | null | undefined): string[] {
  const liste = items ?? [];
  const erreurs: string[] = [];
  if (!liste.length) return ["aucun compte"];
  if (liste.length > 30) erreurs.push(`${liste.length} comptes (30 max)`);
  const comptes = liste.map((i) => String(i.compte_id ?? ""));
  if (new Set(comptes).size !== comptes.length) erreurs.push("même compte deux fois");
  for (const i of liste) {
    const c = String(i.compte_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(c)) erreurs.push(`compte_id invalide : ${c}`);
    const chemin = String(i.reaction_path ?? "");
    if (!chemin.startsWith(`pods/${pod}/reactions/`) || !chemin.endsWith(`/${c}.mp4`)) {
      erreurs.push(`${c} : reaction_path attendu pods/${pod}/reactions/<source>/${c}.mp4`);
    }
    const ecran = String(i.texte_ecran ?? "").trim();
    if (!ecran) erreurs.push(`${c} : texte_ecran vide`);
    if (ecran.length > 200) erreurs.push(`${c} : texte_ecran trop long`);
    if (!String(i.legende ?? "").trim()) erreurs.push(`${c} : legende vide`);
  }
  return erreurs;
}

/**
 * Jour de publication d'une nouvelle vidéo pour un compte : le lendemain de sa
 * dernière vidéo prévue, et jamais avant demain. Une vidéo par jour et par compte.
 */
export function prochainJour(dernier: string | null, aujourdhui: string): string {
  const demain = new Date(`${aujourdhui}T00:00:00Z`);
  demain.setUTCDate(demain.getUTCDate() + 1);
  let jour = demain;
  if (dernier) {
    const apres = new Date(`${dernier}T00:00:00Z`);
    apres.setUTCDate(apres.getUTCDate() + 1);
    if (apres > jour) jour = apres;
  }
  return jour.toISOString().slice(0, 10);
}
