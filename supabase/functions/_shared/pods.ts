/**
 * Pods — le seul point de contact entre l'assignation et les contenus livrés
 * par un pod (migration 0259).
 *
 * Un contenu `livre` a, pour chaque langue livrée, un deck d'IMAGES FINIES
 * (texte en dur) dans `contenu_langues.slides[].media_id`. L'assignation ne le
 * traduit pas, n'y place pas l'app, et ne le sert que dans ses langues livrées.
 */

import { schemaMultiAppPret } from "./applications_moteur.ts";
import {
  clePromptPertinenceApp,
  PERTINENCE_MIN_HORS_SOPHIA,
  pertinenceSuffisante,
  scoreStockable,
} from "./pertinence_apps.ts";
import { ID_SOPHIA, SLUG_SOPHIA } from "./multi_app.ts";
import { chargerPrompt } from "./supabase.ts";
import { passagesPourTier, type Tier } from "./tierlist.ts";
import { sonderSchemaTiersApplication, TABLE_TIERS_APPLICATION } from "./tiers_application.ts";

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
// Decks livrés d'une APPLICATION autre que Sophia (migration 0276)
// ---------------------------------------------------------------------------

/** Ce qu'il faut d'une application pour lire ses decks livrés. */
export interface ApplicationDeck {
  id: string;
  slug: string;
}

export type DeckLivreApplicationResultat =
  | { statut: "pret"; slides: SlideLivree[]; hashtags: string | null; cuit: false }
  | { statut: "ineligible"; raison: string };

/**
 * Deck livré par le pod pour `app` dans `langue` (une ligne `pret` de
 * `contenu_langue_decks`, écrite à la validation). Jamais de cuisson ni
 * d'écriture : un contenu livré n'est servi à une application que si le pod a
 * fourni son deck. Sinon `ineligible` (le créneau prend un autre contenu ou
 * replie sur Sophia). Une lecture en panne lève.
 */
export async function deckLivreApplication(
  supabase: Supabase,
  contenuId: string,
  langue: string,
  app: ApplicationDeck,
): Promise<DeckLivreApplicationResultat> {
  const { data: deck, error } = await supabase
    .from("contenu_langue_decks")
    .select("statut, slides")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .eq("variante", app.slug)
    .maybeSingle();
  if (error) throw new Error(`Deck livré ${app.slug} ${langue} illisible : ${error.message ?? error}`);
  const slides = ((deck?.slides ?? []) as Partial<SlideLivree>[]).map((s) => ({
    position: Number(s.position),
    media_id: s.media_id ?? null,
    texte_overlay: s.texte_overlay ?? "",
    position_sophia: Boolean(s.position_sophia),
  }));
  if (deck?.statut !== "pret" || !deckLivrePret(slides)) {
    return { statut: "ineligible", raison: `contenu livré : pas de deck ${app.slug} en ${langue}` };
  }
  const { data: cl, error: e2 } = await supabase
    .from("contenu_langues")
    .select("hashtags")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .maybeSingle();
  if (e2) throw new Error(`Légende ${langue} illisible : ${e2.message ?? e2}`);
  const hashtags = ((cl?.hashtags as string | null) ?? "").trim();
  return { statut: "pret", slides, hashtags: hashtags || null, cuit: false };
}

/**
 * Pendant de `contenusLivresHorsLangue` pour un créneau d'application : les
 * contenus livrés SANS deck `app` prêt dans `langue` sortent du pool. Tolérant
 * (ensemble vide en cas d'erreur) : `deckLivreApplication` reste le garde-fou.
 */
export async function contenusLivresHorsApplication(
  supabase: Supabase,
  langue: string,
  app: ApplicationDeck,
): Promise<Set<string>> {
  const { data: livres, error } = await supabase.from("contenus").select("id").eq("livre", true);
  if (error || !livres?.length) return new Set();
  const ids = (livres as { id: string }[]).map((c) => c.id);
  const { data: decks, error: e2 } = await supabase
    .from("contenu_langue_decks")
    .select("contenu_id, statut, slides")
    .eq("variante", app.slug)
    .eq("langue", langue)
    .in("contenu_id", ids);
  if (e2) return new Set();
  const servables = new Set(
    ((decks ?? []) as { contenu_id: string; statut: string; slides: Partial<SlideLivree>[] | null }[])
      .filter((d) => d.statut === "pret" && deckLivrePret(d.slides))
      .map((d) => d.contenu_id),
  );
  return new Set(ids.filter((id) => !servables.has(id)));
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
  /** Alias de `position_sophia` (la slide de l'app), surtout pour les decks d'application. */
  position_app?: boolean;
  jpeg_base64: string;
}

export interface DeckDepose {
  hashtags?: string;
  slides: SlideDeposee[];
}

/**
 * Forme d'un code de langue cible : deux lettres, éventuellement suivies d'une
 * région BCP-47 (`pt-BR`, `es-419`). Une simple paire de lettres refusait les
 * variantes régionales, donc tout deck brésilien ou latino-américain déposé
 * par un pod. Pas d'import de `LANGUES_CIBLES` ici : `import_contenu.ts`
 * importe déjà ce module, et le cycle rendrait la constante indéfinie.
 */
const RE_CODE_LANGUE = /^[a-z]{2}(-(?:[A-Z]{2}|\d{3}))?$/;

/**
 * Contrôles d'un dépôt AVANT tout envoi au stockage. Renvoie les erreurs.
 *
 * `slideApp` :
 * - `"sophia"` (défaut) : le label sert Sophia, chaque deck porte la slide
 *   Sophia (`position_sophia`) ;
 * - `"application"` : le label ne sert PAS Sophia (pod 6, label UnSwipe seul).
 *   Chaque deck porte UNE slide de l'application du label (`position_app`, ou
 *   son alias `position_sophia`), jamais la couverture : l'OS en tire la
 *   variante de l'application (`decksApplicationDepuisBase`).
 */
export function verifierDepot(
  decks: Record<string, DeckDepose> | null | undefined,
  langueSource: string,
  slideApp: "sophia" | "application" = "sophia",
): string[] {
  const erreurs: string[] = [];
  const langues = Object.keys(decks ?? {});
  if (!langues.length) return ["aucun deck"];
  if (!langues.includes(langueSource)) erreurs.push(`pas de deck dans la langue source (${langueSource})`);
  for (const [langue, deck] of Object.entries(decks ?? {})) {
    if (!RE_CODE_LANGUE.test(langue)) erreurs.push(`langue invalide : ${langue}`);
    const slides = deck?.slides ?? [];
    const positions = slides.map((s) => Number(s.position));
    if (!positions.length) erreurs.push(`${langue} : deck vide`);
    if (new Set(positions).size !== positions.length) erreurs.push(`${langue} : positions en double`);
    if (slideApp === "sophia") {
      if (!slides.some((s) => s.position_sophia)) erreurs.push(`${langue} : aucune slide de l'app`);
      continue;
    }
    const apps = slides.filter(estSlideApp);
    if (apps.length !== 1) erreurs.push(`${langue} : ${apps.length} slide(s) de l'app (une seule attendue)`);
    else if (positions.length && Number(apps[0].position) === Math.min(...positions)) {
      erreurs.push(`${langue} : la slide de l'app ne peut pas être la couverture`);
    }
  }
  return erreurs;
}

/** Slide d'un deck déposé, une fois son image au stockage. */
export interface SlideEnvoyee {
  position: number;
  media_id: string;
  url: string | null;
  /** La slide de l'application (`position_app` ou `position_sophia` au dépôt). */
  app: boolean;
}

/**
 * Label qui ne sert pas Sophia : le deck déposé EST celui de l'application.
 * On en tire sa variante (`decks_applications`), mêmes images, la slide de
 * l'app marquée ; le deck de base garde ces images sans aucune slide Sophia.
 */
export function decksApplicationDepuisBase(
  slugApp: string,
  decks: Record<string, { hashtags: string; slides: SlideEnvoyee[] }>,
): DecksApplicationsLivres {
  const parLangue: Record<string, { hashtags?: string; slides: SlideAppLivree[] }> = {};
  for (const [langue, deck] of Object.entries(decks)) {
    parLangue[langue] = {
      hashtags: deck.hashtags,
      slides: [...deck.slides]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ position: s.position, media_id: s.media_id, url: s.url, position_sophia: s.app })),
    };
  }
  return { [slugApp]: parLangue };
}

/**
 * Applications servies par le label d'un pod, hors Sophia, ou `null` s'il sert
 * Sophia. Sans application cochée : `null` aussi (deck Sophia, comme les pods
 * d'avant), mais le label n'est disponible pour personne (0330).
 */
export function applicationsHorsSophia(idsApplicationsDuLabel: readonly string[], idSophia: string): string[] | null {
  if (!idsApplicationsDuLabel.length || idsApplicationsDuLabel.includes(idSophia)) return null;
  return [...idsApplicationsDuLabel];
}

/**
 * Slide d'un deck d'APPLICATION déposé : une image (`jpeg_base64`), ou
 * `reprendre: true` pour réutiliser l'image Sophia de même langue et position.
 * `position_app` (alias `position_sophia`) marque LA slide de l'application.
 */
export interface SlideAppDeposee {
  position: number;
  jpeg_base64?: string;
  reprendre?: boolean;
  position_app?: boolean;
  position_sophia?: boolean;
}

/** `{ "<slug app>": { "<langue>": { hashtags?, slides } } }` */
export type DecksApplicationsDeposes = Record<string, Record<string, { hashtags?: string; slides: SlideAppDeposee[] }>>;

/** Slide d'une variante d'application telle que stockée dans `pod_livraisons.decks_applications`. */
export interface SlideAppLivree {
  position: number;
  media_id: string;
  url?: string | null;
  position_sophia: boolean;
}

export type DecksApplicationsLivres = Record<string, Record<string, { hashtags?: string; slides: SlideAppLivree[] }>>;

/** La slide de l'application (`position_app`, ou son alias `position_sophia`). */
export const estSlideApp = (s: Partial<SlideAppDeposee>): boolean => Boolean(s.position_app || s.position_sophia);

/**
 * Contrôles des decks d'application d'un dépôt, AVANT tout envoi au stockage.
 *
 * - `languesSophia` : langues qui ont un deck Sophia (ce dépôt, la livraison
 *   existante, ou le contenu déjà en ligne) — un deck d'app n'existe qu'à côté ;
 * - `positionsSophia` : positions de ces decks, que la variante doit reprendre
 *   à l'identique ;
 * - `slidesAppSophia` (facultatif) : positions de la slide Sophia par langue,
 *   qu'aucune slide `reprendre` ne peut recopier (ce serait la pub Sophia).
 */
export function verifierDecksApplications(
  decksApps: DecksApplicationsDeposes | null | undefined,
  languesSophia: Set<string>,
  positionsSophia: Map<string, number[]>,
  slidesAppSophia: Map<string, number[]> = new Map(),
): string[] {
  if (decksApps === null || decksApps === undefined) return [];
  if (typeof decksApps !== "object" || Array.isArray(decksApps)) return ["decks_applications invalide"];
  const erreurs: string[] = [];
  for (const [slug, parLangue] of Object.entries(decksApps)) {
    if (!/^[a-z0-9_-]+$/.test(slug)) {
      erreurs.push(`application invalide : ${slug}`);
      continue;
    }
    if (slug === SLUG_SOPHIA) {
      erreurs.push("sophia : son deck va dans decks, pas dans decks_applications");
      continue;
    }
    const langues = Object.entries(parLangue ?? {});
    if (!langues.length) erreurs.push(`${slug} : aucun deck`);
    for (const [langue, deck] of langues) {
      const ou = `${slug} ${langue}`;
      if (!RE_CODE_LANGUE.test(langue)) {
        erreurs.push(`${slug} : langue invalide : ${langue}`);
        continue;
      }
      if (!languesSophia.has(langue)) erreurs.push(`${ou} : pas de deck Sophia dans cette langue`);
      const slides = Array.isArray(deck?.slides) ? deck.slides : [];
      if (!slides.length) {
        erreurs.push(`${ou} : deck vide`);
        continue;
      }
      const positions = slides.map((s) => Number(s.position));
      if (positions.some((p) => !Number.isInteger(p))) erreurs.push(`${ou} : position invalide`);
      if (new Set(positions).size !== positions.length) erreurs.push(`${ou} : positions en double`);
      const apps = slides.filter(estSlideApp);
      if (apps.length !== 1) erreurs.push(`${ou} : ${apps.length} slide(s) de l'app (une seule attendue)`);
      else if (Number(apps[0].position) === Math.min(...positions)) {
        erreurs.push(`${ou} : la slide de l'app ne peut pas être la couverture`);
      }
      const pubSophia = new Set(slidesAppSophia.get(langue) ?? []);
      for (const s of slides) {
        if (s.reprendre) {
          if (estSlideApp(s)) erreurs.push(`${ou} #${s.position} : la slide de l'app doit être une image (pas reprendre)`);
          else if (pubSophia.has(Number(s.position))) erreurs.push(`${ou} #${s.position} : reprendrait la slide Sophia`);
        } else if (!s.jpeg_base64) erreurs.push(`${ou} #${s.position} : image manquante (jpeg_base64 ou reprendre)`);
      }
      const attendues = positionsSophia.get(langue);
      if (attendues) {
        const a = [...new Set(attendues)].sort((x, y) => x - y).join(",");
        const b = [...new Set(positions)].sort((x, y) => x - y).join(",");
        if (a !== b) erreurs.push(`${ou} : positions ${b} au lieu de celles du deck Sophia (${a})`);
      }
    }
  }
  return erreurs;
}

/** Note d'import stockée pour une application, par rang d'entrée (miroir de `tierInitialDepuisNote`). */
export const NOTE_TIER_POD: Record<"A" | "B" | "C", number> = { A: 70, B: 60, C: 50 };

/**
 * Validation d'une livraison : ses decks d'application deviennent des decks
 * `pret` de `contenu_langue_decks` (origine pod), le contenu entre dans la
 * réserve de chaque application (`contenu_pertinences` éligible) et, si 0270
 * est là, y prend son rang d'entrée (sans écraser un rang déjà vécu).
 *
 * Exige la ligne `contenu_langues` de chaque langue (insérée juste avant par
 * la validation). Toute erreur LÈVE : l'appelant défait le contenu.
 * Rend les slugs écrits (vide : rien à faire).
 */
export async function ecrireDecksApplications(
  supabase: Supabase,
  contenuId: string,
  livraison: { id: string; decks_applications?: DecksApplicationsLivres | null },
  opts: { tierForce: "A" | "B" | "C" | null; pertinenceScore: number | null; pod: string; tierApp?: Tier | null },
): Promise<string[]> {
  const decksApps = livraison.decks_applications ?? {};
  const slugs = Object.keys(decksApps).filter((s) => Object.keys(decksApps[s] ?? {}).length > 0);
  if (!slugs.length) return [];

  const { data: apps, error: aErr } = await supabase.from("applications").select("id, slug").in("slug", slugs);
  if (aErr) throw new Error(`applications : ${aErr.message ?? aErr}`);
  const idParSlug = new Map(((apps ?? []) as { id: string; slug: string }[]).map((a) => [a.slug, a.id]));
  const inconnue = slugs.find((s) => !idParSlug.has(s));
  if (inconnue) throw new Error(`application inconnue : ${inconnue}`);

  const maintenant = new Date().toISOString();
  const medias: string[] = [];
  for (const slug of slugs) {
    for (const [langue, deck] of Object.entries(decksApps[slug])) {
      const { data: cl, error } = await supabase
        .from("contenu_langues")
        .select("id")
        .eq("contenu_id", contenuId)
        .eq("langue", langue)
        .maybeSingle();
      if (error) throw new Error(`contenu_langues ${langue} : ${error.message ?? error}`);
      if (!cl) throw new Error(`deck ${slug} ${langue} : pas de deck Sophia ${langue} sur le contenu`);
      const slides = [...deck.slides]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          position: Number(s.position),
          media_id: s.media_id,
          texte_overlay: "",
          position_sophia: Boolean(s.position_sophia),
        }));
      medias.push(...slides.map((s) => s.media_id));
      const { error: dErr } = await supabase.from("contenu_langue_decks").upsert(
        {
          contenu_langue_id: cl.id,
          contenu_id: contenuId,
          langue,
          application_id: idParSlug.get(slug),
          variante: slug,
          statut: "pret",
          raison: null,
          slides,
          placement: {
            origine: "pod",
            pod: opts.pod,
            livraison_id: livraison.id,
            hashtags_pod: String(deck.hashtags ?? "").trim() || null,
          },
          updated_at: maintenant,
        },
        { onConflict: "contenu_langue_id,variante" },
      );
      if (dErr) throw new Error(`deck ${slug} ${langue} : ${dErr.message ?? dErr}`);
    }
  }
  if (medias.length) {
    const { error } = await supabase.from("media_library").update({ contenu_id: contenuId }).in("id", [...new Set(medias)]);
    if (error) throw new Error(`médias : ${error.message ?? error}`);
  }

  // Label hors Sophia (pod 6) : le rang vient de la note d'import, comme le
  // rang Sophia d'un pod classique. Sinon : rang imposé, ou celui d'un original.
  const tierApp: Tier = opts.tierApp ?? opts.tierForce ?? (TIER_ORIGINAL as Tier);
  const brut = Math.round(Number(opts.pertinenceScore ?? 0));
  const score = Math.max(PERTINENCE_MIN_HORS_SOPHIA, Math.min(100, Math.max(0, Number.isFinite(brut) ? brut : 0)));
  const note = NOTE_TIER_POD[tierApp as "A" | "B" | "C"] ?? NOTE_TIER_POD.B;
  const tiersPrets = (await sonderSchemaTiersApplication(supabase)) === "pret";
  for (const slug of slugs) {
    const applicationId = idParSlug.get(slug);
    const { error: pErr } = await supabase.from("contenu_pertinences").upsert(
      {
        contenu_id: contenuId,
        application_id: applicationId,
        score,
        note,
        eligible: true,
        raison: `livraison pod ${opts.pod} (deck ${slug} fourni)`,
        prompt_cle: "pod",
        angles: null,
        updated_at: maintenant,
      },
      { onConflict: "contenu_id,application_id" },
    );
    if (pErr) throw new Error(`pertinence ${slug} : ${pErr.message ?? pErr}`);
    if (!tiersPrets) continue;
    const passages = passagesPourTier(tierApp);
    const { error: tErr } = await supabase.from(TABLE_TIERS_APPLICATION).upsert(
      {
        contenu_id: contenuId,
        application_id: applicationId,
        tier: tierApp,
        passages_prevus: passages,
        tier_cycle: 0,
        tier_maj_at: maintenant,
        tier_rapport: { origine: "pod", pod: opts.pod, tier: tierApp, force: Boolean(opts.tierForce), passages },
      },
      { onConflict: "contenu_id,application_id", ignoreDuplicates: true },
    );
    if (tErr) throw new Error(`rang ${slug} : ${tErr.message ?? tErr}`);
  }
  return slugs;
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
const AUTRE_APPLI = /\b(vent[\s-]?now|readup|turbo[\s-]?resume|bycat|actualize|unscroll|elqo|kodi[\s-]+(?:ai|app)|unswipe|micabo)\b/i;
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
// Preuve d'un original (pod 4) : « uniquement des posts qui font des vues »
// ---------------------------------------------------------------------------

/**
 * Pods dont chaque original doit arriver avec la PREUVE que son schéma
 * d'accroche fait des vues aujourd'hui (décidé le 15/10 pour le pod 4, même
 * règle pour les pods 5, 7, 8 et 9).
 */
export const PODS_AVEC_PREUVE = new Set([
  "originaux_alpha_yellow",
  "originaux_rh",
  "originaux_beau_smart_girl",
  "originaux_smart_girl",
  "originaux_alpha_male",
]);
export const PREUVE_VUES_MIN = 200_000;
export const PREUVE_JOURS_MAX = 30;
export const PREUVE_R_MIN = 2;

/**
 * Un post TikTok de la niche (vues déclarées par l'agent, lien cliquable dans
 * la file) ou un contenu du label (r recalculé par l'OS au dépôt).
 */
export type ReferencePreuve =
  | { type: "tiktok"; url: string; vues: number; publie_le: string; enregistrements?: number | null }
  | { type: "os"; contenu_id: string };

export interface PreuveOriginal {
  /** Le schéma d'accroche, tel qu'écrit dans le playbook du pod. */
  schema: string;
  references: ReferencePreuve[];
}

const URL_TIKTOK = /^https:\/\/www\.tiktok\.com\/@[\w.-]{2,40}\/(video|photo)\/\d{10,25}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const joursEntre = (debut: string, fin: string) =>
  Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);

/**
 * Contrôle d'une preuve AVANT tout accès base. Rend les erreurs de forme, si
 * une référence TikTok suffit déjà (≥ 200 k vues, publiée dans les 30 derniers
 * jours) et les contenus du label dont l'OS doit recalculer le r.
 */
export function verifierPreuve(
  preuve: unknown,
  aujourdhui: string,
): { erreurs: string[]; tiktokSuffit: boolean; contenusOs: string[] } {
  const erreurs: string[] = [];
  const p = (preuve ?? {}) as Partial<PreuveOriginal>;
  const schema = String(p.schema ?? "").trim();
  if (!schema) erreurs.push("preuve : schéma d'accroche manquant");
  else if (schema.length > 200) erreurs.push("preuve : schéma trop long (200 caractères au plus)");
  const refs = Array.isArray(p.references) ? p.references : [];
  if (!refs.length || refs.length > 6) erreurs.push(`preuve : ${refs.length} référence(s) (1 à 6 attendues)`);
  let tiktokSuffit = false;
  const contenusOs: string[] = [];
  for (const [i, ref] of refs.entries()) {
    const r = (ref ?? {}) as Record<string, unknown>;
    if (r.type === "tiktok") {
      const urlOk = URL_TIKTOK.test(String(r.url ?? ""));
      const vues = Number(r.vues);
      const vuesOk = Number.isInteger(vues) && vues >= 0;
      const date = String(r.publie_le ?? "");
      if (!urlOk) erreurs.push(`preuve #${i + 1} : lien TikTok invalide`);
      if (!vuesOk) erreurs.push(`preuve #${i + 1} : vues invalides`);
      if (!DATE_ISO.test(date) || Number.isNaN(Date.parse(date))) {
        erreurs.push(`preuve #${i + 1} : date de publication invalide (AAAA-MM-JJ)`);
      } else if (date > aujourdhui) {
        erreurs.push(`preuve #${i + 1} : date de publication dans le futur`);
      } else if (urlOk && vuesOk && vues >= PREUVE_VUES_MIN && joursEntre(date, aujourdhui) <= PREUVE_JOURS_MAX) {
        tiktokSuffit = true;
      }
    } else if (r.type === "os") {
      const id = String(r.contenu_id ?? "");
      if (UUID.test(id)) contenusOs.push(id.toLowerCase());
      else erreurs.push(`preuve #${i + 1} : contenu_id invalide (uuid complet attendu)`);
    } else {
      erreurs.push(`preuve #${i + 1} : type « tiktok » ou « os » attendu`);
    }
  }
  return { erreurs, tiktokSuffit, contenusOs: [...new Set(contenusOs)] };
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

// ---------------------------------------------------------------------------
// Originaux servis aux autres applications du label (UnSwipe, Micabo)
// ---------------------------------------------------------------------------

/**
 * Pertinence d'un original pour une application autre que Sophia. Un original
 * n'a pas de vues source : la note d'import classique (70 % de vues) l'écarte
 * toujours. Il entre donc au rang d'un original (note NOTE_TIER_POD.B, rang B
 * paresseux de 0270) dès que son SUJET convient à l'application.
 */
export function pertinenceOriginalApplication(applicationId: string, score: number): { note: number; eligible: boolean } {
  return { note: NOTE_TIER_POD.B, eligible: pertinenceSuffisante(applicationId, score) };
}

export interface ApplicationOuverte {
  slug: string;
  score: number;
  eligible: boolean;
  /** Score déjà mesuré (campagne de rattrapage) : repris, sans nouvel appel. */
  repris: boolean;
}

type NoteurPertinence = (input: { caption: string; hookText: string; instructions?: string }) => Promise<{
  score: number;
  reason: string;
}>;

/**
 * Ouvre un original validé aux applications de son label autres que Sophia.
 * Pour chacune qui a son prompt `pertinence_<slug>` (sans prompt : rien, jamais
 * la grille Sophia), une ligne `contenu_pertinences` (note d'un original,
 * éligible si le sujet convient) et, si 0270 est là, son rang d'entrée B sans
 * écraser un rang déjà vécu. Le deck de l'application naît à l'assignation,
 * depuis `slides_base` (traduit, appli placée), comme pour un import.
 * Un score déjà en base est repris : rejouer ne coûte aucun appel.
 */
export async function ouvrirApplicationsOriginal(
  supabase: Supabase,
  contenuId: string,
  labelId: string,
  texte: { accroche: string; legende: string; pod: string },
  noter: NoteurPertinence,
): Promise<ApplicationOuverte[]> {
  if (!(await schemaMultiAppPret(supabase))) return [];
  const { data: liens, error } = await supabase.from("label_applications").select("application_id").eq("label_id", labelId);
  if (error) throw new Error(`label_applications : ${error.message ?? error}`);
  const ids = [...new Set(((liens ?? []) as { application_id: string }[]).map((l) => l.application_id))]
    .filter((id) => id !== ID_SOPHIA);
  if (!ids.length) return [];
  const { data: apps, error: aErr } = await supabase.from("applications").select("id, slug").in("id", ids);
  if (aErr) throw new Error(`applications : ${aErr.message ?? aErr}`);
  const { data: deja, error: pErr } = await supabase
    .from("contenu_pertinences")
    .select("application_id, score")
    .eq("contenu_id", contenuId)
    .in("application_id", ids);
  if (pErr) throw new Error(`contenu_pertinences : ${pErr.message ?? pErr}`);
  const scoreDeja = new Map(
    ((deja ?? []) as { application_id: string; score: number | null }[])
      .filter((l) => l.score != null)
      .map((l) => [l.application_id, Number(l.score)]),
  );

  const tiersPrets = (await sonderSchemaTiersApplication(supabase)) === "pret";
  const resultats: ApplicationOuverte[] = [];
  const triees = [...((apps ?? []) as { id: string; slug: string }[])].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const app of triees) {
    const cle = clePromptPertinenceApp(app);
    const repris = scoreDeja.has(app.id);
    let score = scoreDeja.get(app.id) ?? 0;
    let raison: string | null = null;
    if (!repris) {
      const prompt = await chargerPrompt(supabase, cle);
      if (!prompt) continue;
      const r = await noter({ caption: texte.legende, hookText: texte.accroche, instructions: prompt });
      score = scoreStockable(r.score);
      raison = r.reason;
    }
    const { note, eligible } = pertinenceOriginalApplication(app.id, score);
    const maintenant = new Date().toISOString();
    const { error: uErr } = await supabase.from("contenu_pertinences").upsert(
      {
        contenu_id: contenuId,
        application_id: app.id,
        score,
        note,
        eligible,
        // Score repris : sa raison et son prompt restent ceux de la mesure.
        ...(repris ? {} : { raison, prompt_cle: cle, angles: null }),
        updated_at: maintenant,
      },
      { onConflict: "contenu_id,application_id" },
    );
    if (uErr) throw new Error(`pertinence ${app.slug} : ${uErr.message ?? uErr}`);
    if (eligible && tiersPrets) {
      const tier = TIER_ORIGINAL as Tier;
      const passages = passagesPourTier(tier);
      const { error: tErr } = await supabase.from(TABLE_TIERS_APPLICATION).upsert(
        {
          contenu_id: contenuId,
          application_id: app.id,
          tier,
          passages_prevus: passages,
          tier_cycle: 0,
          tier_maj_at: maintenant,
          tier_rapport: { origine: "pod_original", pod: texte.pod, tier, passages },
        },
        { onConflict: "contenu_id,application_id", ignoreDuplicates: true },
      );
      if (tErr) throw new Error(`rang ${app.slug} : ${tErr.message ?? tErr}`);
    }
    resultats.push({ slug: app.slug, score, eligible, repris });
  }
  return resultats;
}

// ---------------------------------------------------------------------------
// Validation automatique des podz sûrs (0323)
// ---------------------------------------------------------------------------

/** Délai par défaut entre le dépôt et la validation automatique (`pods.auto_validation_heures`). */
export const AUTO_VALIDATION_HEURES = 12;

export interface PodAutoValidation {
  slug: string;
  actif: boolean;
  auto_validation: boolean;
  auto_validation_heures: number | null;
}

export interface LivraisonEnAttente {
  id: string;
  pod: string;
  type: string;
  statut: string;
  depose_le: string | null;
  auto_erreur: string | null;
}

/**
 * Livraisons à valider automatiquement, la plus ancienne d'abord : podz sûr et
 * actif, livraison toujours en attente, déposée depuis au moins le délai du
 * podz, jamais en échec (`auto_erreur` : à décider à la main). Jamais une
 * vidéo : chaque compte y reçoit une date de publication, à voir par une
 * personne.
 */
export function livraisonsAutoValidables<T extends LivraisonEnAttente>(
  pods: readonly PodAutoValidation[],
  livraisons: readonly T[],
  maintenant: Date,
): T[] {
  const delaiMs = new Map(
    pods
      .filter((p) => p.actif && p.auto_validation)
      .map((p) => [p.slug, (p.auto_validation_heures ?? AUTO_VALIDATION_HEURES) * 3_600_000]),
  );
  const depot = (l: T) => Date.parse(l.depose_le ?? "");
  return livraisons
    .filter((l) => {
      const delai = delaiMs.get(l.pod);
      return delai !== undefined && l.statut === "a_valider" && l.type !== "video" && !l.auto_erreur &&
        Number.isFinite(depot(l)) && maintenant.getTime() - depot(l) >= delai;
    })
    .sort((a, b) => depot(a) - depot(b));
}
