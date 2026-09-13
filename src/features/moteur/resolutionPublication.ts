/**
 * Résolution des publications — retrouver le post TikTok derrière un créneau.
 *
 * Logique pure, partagée avec l'Edge : `supabase/functions/_shared/
 * resolution_publication.ts` en est la copie Deno, à garder synchro. Les tests
 * vivent dans `resolutionPublication.test.ts`.
 *
 * Le créateur coche « publié » et colle un lien. Ce lien est la seule attache
 * entre un créneau et le post réel — et il est fragile : lien de profil au lieu
 * du post, lien d'un autre compte, lien oublié. Un compte a ainsi publié 79 fois
 * en collant à chaque coup l'URL de son profil : aucune vue relevée en un mois.
 *
 * On ne fait donc plus confiance au lien seul. Quelques minutes après la
 * déclaration, on va chercher le post sur le profil et on l'apparie nous-mêmes.
 * L'ancrage est temporel — le post que le créateur vient de publier est le
 * dernier de son profil — et non textuel : comparer le texte des slides à la
 * légende TikTok ne marche pas, ce sont deux textes sans rapport.
 */

/**
 * Minutes à attendre avant chaque tentative, comptées depuis la précédente.
 *
 * TikTok met de quelques secondes à quelques minutes à exposer un post neuf sur
 * le profil, et un créateur peut cocher « publié » avant même d'avoir posté. Les
 * deux premières tentatives couvrent le cas normal, les deux dernières laissent
 * le temps à un retard franc. Au-delà (≈ 2 h 55), le post est déclaré
 * introuvable — c'est un signal, pas un échec technique : le créneau a peut-être
 * été coché sans publication.
 */
export const DELAIS_RESOLUTION_MIN = [5, 10, 20, 120] as const;

/** Date de la prochaine tentative, ou `null` s'il n'en reste plus. */
export function prochaineTentative(
  tentativesFaites: number,
  maintenant: number = Date.now(),
): Date | null {
  const delai = DELAIS_RESOLUTION_MIN[Math.max(0, Math.trunc(tentativesFaites))];
  return delai === undefined ? null : new Date(maintenant + delai * 60_000);
}

// ---------------------------------------------------------------------------
// Liens TikTok
// ---------------------------------------------------------------------------

const RE_ID_POST = /\/(?:photo|video)\/(\d+)/;
const RE_HANDLE = /tiktok\.com\/@([A-Za-z0-9._-]+)/i;

export interface LienTiktok {
  /** Identifiant numérique du post — la seule clé stable côté TikTok. */
  id: string;
  /** Compte propriétaire, quand l'URL le porte. */
  handle: string | null;
}

/** Lit l'ID (et le compte) d'une URL de post. `null` si ce n'est pas un post. */
export function analyserLienTiktok(url: string | null | undefined): LienTiktok | null {
  const brut = String(url ?? "").trim();
  const id = brut.match(RE_ID_POST)?.[1];
  if (!id) return null;
  return { id, handle: brut.match(RE_HANDLE)?.[1]?.toLowerCase() ?? null };
}

/**
 * Lien court du bouton « Partager » (`vm.` / `vt.` / `tiktok.com/t/`).
 * Il ne porte pas l'ID : il faut suivre la redirection pour l'obtenir.
 */
export function estLienCourtTiktok(url: string | null | undefined): boolean {
  const brut = String(url ?? "").trim();
  return /\/\/(?:vm|vt)\.tiktok\.com\//i.test(brut) || /tiktok\.com\/t\//i.test(brut);
}

/** Retire les paramètres de suivi (`?_r=1&_t=…`), qui changent à chaque partage. */
export function nettoyerUrlTiktok(url: string): string {
  return url.split(/[?#]/)[0]!;
}

/** Compare deux pseudos TikTok, arobase et casse mises de côté. */
export function memeHandle(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) =>
    String(s ?? "").trim().replace(/^@/, "").toLowerCase();
  const ga = n(a);
  return ga.length > 0 && ga === n(b);
}

// ---------------------------------------------------------------------------
// Appariement créneau ↔ post en ligne
// ---------------------------------------------------------------------------

export interface PassageAResoudre {
  id: string;
  /** Quand le créateur a déclaré la publication (ISO). */
  publieAt: string;
  /** Hashtags imposés dans la consigne. */
  hashtags?: string | null;
  /** Nombre de slides du deck (0 / null si inconnu). */
  nbSlides?: number | null;
  /** Titre du son imposé. */
  musiqueTitre?: string | null;
}

export interface PostEnLigne {
  /** Identifiant numérique TikTok. */
  id: string;
  url: string;
  /** Publication côté TikTok, en millisecondes. */
  createTimeMs: number | null;
  /** Légende écrite par le créateur — PAS le texte des slides. */
  texte?: string | null;
  /** Nombre d'images du diaporama (null pour une vidéo). */
  nbImages?: number | null;
  musiqueTitre?: string | null;
}

export type SignalAppariement = "slides" | "hashtags" | "son";

export interface Corroboration {
  /** Un signal contredit franchement : on refuse l'appariement. */
  refuse: boolean;
  /** Signaux qui le confirment (journalisés pour l'admin). */
  confirme: SignalAppariement[];
}

function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hashtags contenus dans un texte, sans le `#`, en minuscules. */
export function hashtagsDe(texte: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const m of String(texte ?? "").matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.add(m[1]!.toLowerCase());
  }
  return out;
}

/**
 * Le post peut-il être celui de ce créneau ?
 *
 * Un seul signal a droit de veto : **le nombre d'images**. Un deck de 6 slides
 * ne peut pas être un post de 3 — c'est vérifiable et sans faux positif.
 *
 * Les hashtags et le son ne font que confirmer : le créateur réécrit souvent sa
 * légende et change parfois le son, un désaccord ne prouve donc rien. Sans
 * aucun signal exploitable, la fenêtre temporelle et l'unicité du post suffisent.
 */
export function corroborer(passage: PassageAResoudre, post: PostEnLigne): Corroboration {
  const confirme: SignalAppariement[] = [];

  if (passage.nbSlides && post.nbImages) {
    if (passage.nbSlides !== post.nbImages) return { refuse: true, confirme: [] };
    confirme.push("slides");
  }

  const nos = hashtagsDe(passage.hashtags);
  if (nos.size > 0) {
    const siens = hashtagsDe(post.texte);
    for (const h of nos) {
      if (siens.has(h)) {
        confirme.push("hashtags");
        break;
      }
    }
  }

  if (
    passage.musiqueTitre &&
    post.musiqueTitre &&
    normaliser(passage.musiqueTitre) === normaliser(post.musiqueTitre)
  ) {
    confirme.push("son");
  }

  return { refuse: false, confirme };
}

export interface ReglagesAppariement {
  /** Le post ne peut pas être plus vieux que ça au moment du clic. */
  fenetreAvantHeures: number;
  /** Tolérance quand l'horodatage TikTok dépasse le clic. */
  fenetreApresMinutes: number;
}

export const APPARIEMENT_DEFAUT: ReglagesAppariement = {
  // Large : un créateur publie parfois le matin et ne coche que le soir. Le
  // resserrement vient de l'unicité (un post déjà attaché n'est plus candidat)
  // et du veto sur le nombre d'images, pas de la fenêtre.
  fenetreAvantHeures: 24,
  fenetreApresMinutes: 15,
};

export interface Appariement {
  passageId: string;
  post: PostEnLigne;
  signaux: SignalAppariement[];
}

/**
 * Apparie des créneaux déclarés publiés aux posts réellement en ligne.
 *
 * Dans l'ordre chronologique des deux côtés : le premier créneau coché prend le
 * plus ancien post éligible, le suivant le suivant. Un post déjà attaché à un
 * autre créneau — `pris` — n'est jamais réutilisé, ce qui empêche le lien
 * unique recollé 79 fois de contaminer tous les créneaux d'un compte.
 */
export function apparierPublications(
  passages: PassageAResoudre[],
  posts: PostEnLigne[],
  opts: { pris?: Iterable<string>; reglages?: ReglagesAppariement } = {},
): Appariement[] {
  const reglages = opts.reglages ?? APPARIEMENT_DEFAUT;
  const pris = new Set(opts.pris ?? []);
  const avantMs = reglages.fenetreAvantHeures * 3_600_000;
  const apresMs = reglages.fenetreApresMinutes * 60_000;

  const candidats = posts
    .filter((p) => p.id && p.createTimeMs != null && !pris.has(p.id))
    .sort((a, b) => a.createTimeMs! - b.createTimeMs!);

  const aTraiter = passages
    .map((p) => ({ passage: p, clic: Date.parse(p.publieAt) }))
    .filter((x) => Number.isFinite(x.clic))
    .sort((a, b) => a.clic - b.clic);

  const out: Appariement[] = [];
  for (const { passage, clic } of aTraiter) {
    for (const post of candidats) {
      if (pris.has(post.id)) continue;
      const t = post.createTimeMs!;
      if (t < clic - avantMs || t > clic + apresMs) continue;
      const { refuse, confirme } = corroborer(passage, post);
      if (refuse) continue;
      pris.add(post.id);
      out.push({ passageId: passage.id, post, signaux: confirme });
      break;
    }
  }
  return out;
}
