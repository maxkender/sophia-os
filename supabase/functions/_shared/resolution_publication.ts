import { scrapeStats } from "./apify.ts";
import { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * Résolution des publications — retrouver le post TikTok derrière un créneau.
 *
 * La partie pure (cadence, lecture des liens, corroboration, appariement) est
 * une copie Deno de `src/features/moteur/resolutionPublication.ts`, où vivent
 * les tests — garder synchro. Le bas du fichier est le run qui la branche sur
 * la base et sur Apify.
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

/** Ce qu'un créneau offre pour se reconnaître — déclaré ou non. */
export type SignauxCreneau = Pick<PassageAResoudre, "hashtags" | "nbSlides" | "musiqueTitre">;

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
export function corroborer(passage: SignauxCreneau, post: PostEnLigne): Corroboration {
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

// ---------------------------------------------------------------------------
// Créneaux publiés sans jamais avoir été déclarés
// ---------------------------------------------------------------------------

/** Jour calendaire Paris d'un instant, en YYYY-MM-DD. */
function jourParisDeMs(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(ms));
}

/** Créneau échu que le créateur n'a jamais coché « publié ». */
export interface CreneauNonDeclare extends SignauxCreneau {
  id: string;
  /** Jour prévu, calendaire Paris (YYYY-MM-DD). */
  jourPrevu: string;
}

/**
 * Apparie des créneaux JAMAIS déclarés aux posts réellement en ligne.
 *
 * Symétrique de `apparierPublications`, à ceci près qu'il n'y a pas de clic sur
 * quoi s'ancrer : l'ancrage est le jour prévu. Un post publié le jour J remplit
 * le créneau prévu le jour J, même jour calendaire Paris, strictement — un post
 * de la veille appartient au créneau de la veille.
 *
 * Sans ça, un créateur qui publie sans jamais cocher est compté 0 posté et
 * tombe en INACTIF alors que son profil tourne : c'est le cas qui a motivé ce
 * code (13 800 vues relevées sur le profil, 0 post déclaré, classé INACTIF).
 *
 * Mêmes garde-fous que l'appariement déclaré, moins la fenêtre temporelle
 * (remplacée par l'égalité des jours) : unicité du post — un post déjà attaché
 * à un créneau n'est jamais réattribué —, veto sur le nombre d'images, et ordre
 * chronologique des deux côtés.
 */
export function apparierCreneauxNonDeclares(
  creneaux: CreneauNonDeclare[],
  posts: PostEnLigne[],
  opts: { pris?: Iterable<string> } = {},
): Appariement[] {
  const pris = new Set(opts.pris ?? []);
  const candidats = posts
    .filter((p) => p.id && p.createTimeMs != null && !pris.has(p.id))
    .sort((a, b) => a.createTimeMs! - b.createTimeMs!);

  const aTraiter = creneaux
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.jourPrevu))
    .slice()
    .sort((a, b) => a.jourPrevu.localeCompare(b.jourPrevu));

  const out: Appariement[] = [];
  for (const creneau of aTraiter) {
    for (const post of candidats) {
      if (pris.has(post.id)) continue;
      if (jourParisDeMs(post.createTimeMs!) !== creneau.jourPrevu) continue;
      const { refuse, confirme } = corroborer(creneau, post);
      if (refuse) continue;
      pris.add(post.id);
      out.push({ passageId: creneau.id, post, signaux: confirme });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Run : la file de résolution
// ---------------------------------------------------------------------------

/**
 * Comptes traités par passage du drain. Chaque compte non résolu par son lien
 * coûte un scrape de profil Apify (quelques secondes à quelques dizaines) : au
 * -delà, le run frôle le plafond Edge. Le cron tourne à la minute, la file
 * s'écoule donc à 240 comptes/heure — très au-dessus du débit réel.
 */
const MAX_COMPTES_PAR_RUN = 4;

/** Profondeur du scrape de profil. Couvre plusieurs jours de publication. */
const POSTS_PROFIL = 20;

/** Fenêtre de recherche des posts déjà attachés, pour ne jamais en réutiliser un. */
const JOURS_POSTS_CONNUS = 60;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** Suit la redirection d'un lien court. Gratuit — aucun appel Apify. */
async function suivreLienCourt(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA } });
    return res.url || null;
  } catch {
    return null;
  }
}

interface LignePassage {
  id: string;
  post_id: string | null;
  compte_id: string;
  publie_at: string;
  publie_url: string | null;
  hashtags: string | null;
  slides: unknown;
  musique_titre: string | null;
  resolution_tentatives: number | null;
}

export interface ResolutionDetail {
  passageId: string;
  handle: string;
  issue: "lien" | "scrape" | "reprogramme" | "introuvable";
  detail: string;
}

export interface ResolutionResultat {
  dus: number;
  comptes: number;
  resolus: number;
  parLien: number;
  parScrape: number;
  reprogrammes: number;
  introuvables: number;
  restants: number;
  details: ResolutionDetail[];
  erreurs: string[];
}

/**
 * Traite un lot de créneaux en attente de résolution.
 *
 * Deux étages, du moins cher au plus cher :
 *
 *   1. le lien du créateur — s'il porte déjà un ID de post, ou si c'est un lien
 *      court dont la redirection en donne un, il n'y a rien à scraper ;
 *   2. le profil TikTok — un seul scrape par compte, puis appariement
 *      chronologique de tous ses créneaux en attente.
 *
 * Un créneau non résolu repart pour une tentative plus tard
 * (`DELAIS_RESOLUTION_MIN`) ; épuisé, il passe `introuvable` — le créateur a
 * probablement coché sans publier.
 */
export async function resoudrePublicationsLot(
  supabase: Supabase,
  opts: { dryRun?: boolean; compteId?: string | null } = {},
): Promise<ResolutionResultat> {
  const dryRun = Boolean(opts.dryRun);
  const out: ResolutionResultat = {
    dus: 0,
    comptes: 0,
    resolus: 0,
    parLien: 0,
    parScrape: 0,
    reprogrammes: 0,
    introuvables: 0,
    restants: 0,
    details: [],
    erreurs: [],
  };

  let q = supabase
    .from("passages")
    .select(
      "id, post_id, compte_id, publie_at, publie_url, hashtags, slides, musique_titre, resolution_tentatives",
    )
    .eq("resolution_statut", "a_resoudre")
    .lte("resolution_prochaine_at", new Date().toISOString())
    .not("publie_at", "is", null)
    .order("resolution_prochaine_at", { ascending: true })
    .limit(200);
  if (opts.compteId) q = q.eq("compte_id", opts.compteId);

  const { data: dus, error } = await q;
  if (error) throw error;
  const lignes = (dus ?? []) as unknown as LignePassage[];
  out.dus = lignes.length;
  if (lignes.length === 0) return out;

  // Groupé par compte, dans l'ordre d'échéance : un scrape sert tous les
  // créneaux en attente du compte.
  const parCompte = new Map<string, LignePassage[]>();
  for (const l of lignes) {
    const liste = parCompte.get(l.compte_id) ?? [];
    liste.push(l);
    parCompte.set(l.compte_id, liste);
  }
  const compteIds = [...parCompte.keys()];
  const traites = compteIds.slice(0, MAX_COMPTES_PAR_RUN);
  out.restants = lignes
    .filter((l) => !traites.includes(l.compte_id))
    .length;

  const { data: comptes } = await supabase
    .from("comptes")
    .select("id, handle_tiktok")
    .in("id", traites);
  const handles = new Map(
    (comptes ?? []).map((c) => [c.id as string, (c.handle_tiktok as string | null) ?? ""]),
  );

  for (const compteId of traites) {
    const attente = parCompte.get(compteId) ?? [];
    const handle = handles.get(compteId) ?? "";
    const resolus = new Map<string, { url: string; detail: string; via: "lien" | "scrape" }>();

    try {
      // Posts déjà attachés à un créneau de ce compte : jamais réattribués.
      const depuis = new Date(Date.now() - JOURS_POSTS_CONNUS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { data: connus } = await supabase
        .from("passages")
        .select("id, publie_url")
        .eq("compte_id", compteId)
        .not("publie_url", "is", null)
        .gte("date_publication_prevue", depuis);
      const enAttente = new Set(attente.map((l) => l.id));
      const pris = new Set<string>();
      for (const c of connus ?? []) {
        if (enAttente.has(c.id as string)) continue;
        const lu = analyserLienTiktok(c.publie_url as string | null);
        if (lu) pris.add(lu.id);
      }

      // 1) Le lien du créateur, quand il suffit.
      for (const l of attente) {
        if (!l.publie_url) continue;
        let lu = analyserLienTiktok(l.publie_url);
        let url = l.publie_url;
        if (!lu && estLienCourtTiktok(l.publie_url)) {
          const suivi = await suivreLienCourt(l.publie_url);
          if (suivi) {
            lu = analyserLienTiktok(suivi);
            if (lu) url = suivi;
          }
        }
        if (!lu) continue;
        // Un lien qui pointe ailleurs que sur le compte, ou un post déjà pris
        // (le même lien recollé), ne vaut pas mieux que pas de lien du tout.
        if (lu.handle && handle && !memeHandle(lu.handle, handle)) continue;
        if (pris.has(lu.id)) continue;
        pris.add(lu.id);
        resolus.set(l.id, {
          url: nettoyerUrlTiktok(url),
          detail: "lien du créateur",
          via: "lien",
        });
      }

      // 2) Le profil, pour le reste.
      const restants = attente.filter((l) => !resolus.has(l.id));
      if (restants.length > 0 && handle) {
        const enLigne = await scrapeStats(handle, POSTS_PROFIL);
        const appariements = apparierPublications(
          restants.map((l) => ({
            id: l.id,
            publieAt: l.publie_at,
            hashtags: l.hashtags,
            nbSlides: Array.isArray(l.slides) ? l.slides.length : null,
            musiqueTitre: l.musique_titre,
          })),
          enLigne.map((p) => ({
            id: p.postId,
            url: p.webVideoUrl,
            createTimeMs: p.createTime == null ? null : p.createTime * 1000,
            texte: p.text,
            nbImages: p.imageUrls.length || null,
            musiqueTitre: p.musicTitle,
          })),
          { pris },
        );
        for (const a of appariements) {
          resolus.set(a.passageId, {
            url: nettoyerUrlTiktok(a.post.url),
            detail: a.signaux.length > 0
              ? `retrouvé sur le profil (${a.signaux.join(", ")})`
              : "retrouvé sur le profil (horodatage)",
            via: "scrape",
          });
        }
      } else if (restants.length > 0 && !handle) {
        out.erreurs.push(`compte ${compteId.slice(0, 8)} sans pseudo TikTok`);
      }
    } catch (e) {
      out.erreurs.push(
        `@${handle || compteId.slice(0, 8)} : ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 3) Écriture : résolus d'un côté, reprogrammés de l'autre.
    for (const l of attente) {
      const trouve = resolus.get(l.id);
      const tentatives = Number(l.resolution_tentatives ?? 0) + 1;

      if (trouve) {
        out.resolus += 1;
        if (trouve.via === "lien") out.parLien += 1;
        else out.parScrape += 1;
        out.details.push({
          passageId: l.id,
          handle,
          issue: trouve.via,
          detail: trouve.detail,
        });
        if (!dryRun) {
          await supabase
            .from("passages")
            .update({
              publie_url: trouve.url,
              resolution_statut: "resolu",
              resolution_at: new Date().toISOString(),
              resolution_tentatives: tentatives,
              resolution_prochaine_at: null,
              resolution_detail: trouve.detail,
            })
            .eq("id", l.id);
          // Le post pont porte le même lien — l'admin le lit depuis les deux.
          if (l.post_id) {
            await supabase
              .from("posts")
              .update({ publie_url: trouve.url })
              .eq("id", l.post_id);
          }
        }
        continue;
      }

      const prochaine = prochaineTentative(tentatives);
      if (prochaine) {
        out.reprogrammes += 1;
        out.details.push({
          passageId: l.id,
          handle,
          issue: "reprogramme",
          detail: `tentative ${tentatives}/${DELAIS_RESOLUTION_MIN.length}`,
        });
        if (!dryRun) {
          await supabase
            .from("passages")
            .update({
              resolution_tentatives: tentatives,
              resolution_prochaine_at: prochaine.toISOString(),
            })
            .eq("id", l.id);
        }
      } else {
        out.introuvables += 1;
        out.details.push({
          passageId: l.id,
          handle,
          issue: "introuvable",
          detail: "aucun post correspondant après toutes les tentatives",
        });
        if (!dryRun) {
          await supabase
            .from("passages")
            .update({
              resolution_statut: "introuvable",
              resolution_tentatives: tentatives,
              resolution_prochaine_at: null,
              resolution_detail: "aucun post correspondant sur le profil",
            })
            .eq("id", l.id);
        }
      }
    }
  }

  out.comptes = traites.length;
  return out;
}

// ---------------------------------------------------------------------------
// Rattrapage : ce qui est en ligne mais n'a jamais été déclaré
// ---------------------------------------------------------------------------

/** Post tel que le scrape de profil le rend (forme de `scrapeStats`). */
export interface PostScrape {
  postId: string;
  webVideoUrl: string;
  text: string;
  imageUrls: string[];
  musicTitle: string | null;
  createTime: number | null;
  stats: { vues: number; likes: number; commentaires: number; partages: number };
}

/**
 * Profondeur du rattrapage, en jours. Au-delà, le post est trop loin dans le
 * profil pour que le scrape le voie encore, et un créneau vieux d'une semaine
 * est déjà sorti de la fenêtre de classement.
 */
export const RATTRAPAGE_JOURS_DEFAUT = 7;

export interface RattrapageResultat {
  /** Créneaux échus, jamais déclarés, examinés. */
  candidats: number;
  /** Créneaux rattachés à un post réellement en ligne. */
  rattrapes: number;
  details: Array<{ passageId: string; url: string; signaux: string[] }>;
}

/** Jour calendaire Paris d'aujourd'hui, en YYYY-MM-DD. */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function jourMoins(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Rattache aux créneaux les posts vus sur le profil que le créateur n'a jamais
 * déclarés.
 *
 * La déclaration est la seule chose que le produit écoutait : un créateur qui
 * publie sans cocher était compté 0 posté et tombait en INACTIF, profil plein
 * de vues à l'appui. On lit donc le profil comme source de vérité — et comme le
 * relevé de vues du soir scrape déjà ce profil, `enLigne` est passé tel quel :
 * le rattrapage ne coûte aucun appel Apify de plus.
 *
 * Le créneau rattrapé est marqué `publication_non_declaree` : il compte comme
 * publié partout (classement, stats, file de review), et l'admin garde de quoi
 * dire au créateur de cocher.
 */
export async function rattraperCreneauxNonDeclares(
  supabase: Supabase,
  compteId: string,
  enLigne: PostScrape[],
  opts: { jours?: number; dryRun?: boolean } = {},
): Promise<RattrapageResultat> {
  const out: RattrapageResultat = { candidats: 0, rattrapes: 0, details: [] };
  const jours = Math.max(1, Math.round(opts.jours ?? RATTRAPAGE_JOURS_DEFAUT));
  const depuis = jourMoins(aujourdhuiParis(), jours);

  const { data, error } = await supabase
    .from("passages")
    .select(
      "id, post_id, date_publication_prevue, publie_at, publie_url, hashtags, slides, musique_titre",
    )
    .eq("compte_id", compteId)
    .eq("est_rappel", false)
    .neq("statut", "brouillon")
    .gte("date_publication_prevue", depuis);
  if (error) throw error;
  const lignes = (data ?? []) as Array<{
    id: string;
    post_id: string | null;
    date_publication_prevue: string | null;
    publie_at: string | null;
    publie_url: string | null;
    hashtags: string | null;
    slides: unknown;
    musique_titre: string | null;
  }>;

  // Un post déjà attaché à un créneau n'est jamais réattribué — même règle que
  // la résolution déclarée, et le seul garde-fou contre le double comptage.
  const pris = new Set<string>();
  for (const l of lignes) {
    const lu = analyserLienTiktok(l.publie_url);
    if (lu) pris.add(lu.id);
  }

  const creneaux = lignes
    .filter((l) => !l.publie_at && l.date_publication_prevue)
    .map((l) => ({
      id: l.id,
      jourPrevu: l.date_publication_prevue!,
      hashtags: l.hashtags,
      nbSlides: Array.isArray(l.slides) ? l.slides.length : null,
      musiqueTitre: l.musique_titre,
    }));
  out.candidats = creneaux.length;
  if (creneaux.length === 0) return out;

  const appariements = apparierCreneauxNonDeclares(
    creneaux,
    enLigne.map((p) => ({
      id: p.postId,
      url: p.webVideoUrl,
      createTimeMs: p.createTime == null ? null : p.createTime * 1000,
      texte: p.text,
      nbImages: p.imageUrls.length || null,
      musiqueTitre: p.musicTitle,
    })),
    { pris },
  );

  const parPostId = new Map(enLigne.map((p) => [p.postId, p]));
  const parPassage = new Map(lignes.map((l) => [l.id, l]));
  const maintenant = new Date().toISOString();

  for (const a of appariements) {
    const scrape = parPostId.get(a.post.id);
    const ligne = parPassage.get(a.passageId);
    if (!scrape || !ligne || a.post.createTimeMs == null) continue;
    const url = nettoyerUrlTiktok(a.post.url);
    const detail = a.signaux.length > 0
      ? `publié sans être déclaré — retrouvé sur le profil (${a.signaux.join(", ")})`
      : "publié sans être déclaré — retrouvé sur le profil (jour de publication)";

    out.rattrapes += 1;
    out.details.push({ passageId: a.passageId, url, signaux: a.signaux });
    if (opts.dryRun) continue;

    // `publie_at` = l'heure TikTok réelle, pas l'heure du rattrapage : c'est
    // elle qui fait foi partout (fenêtre de classement, file de review du jour).
    await supabase
      .from("passages")
      .update({
        statut: "publie",
        publie_at: new Date(a.post.createTimeMs).toISOString(),
        publie_url: url,
        publication_non_declaree: true,
        resolution_statut: "resolu",
        resolution_at: maintenant,
        resolution_prochaine_at: null,
        resolution_detail: detail,
        vues: scrape.stats.vues,
        likes: scrape.stats.likes,
        commentaires: scrape.stats.commentaires,
        partages: scrape.stats.partages,
        stats_maj_at: maintenant,
      })
      .eq("id", a.passageId);

    // Le post pont porte les mêmes valeurs : le calendrier du créateur et les
    // stats par compte (vue `stats_comptes`) lisent encore `posts`.
    if (ligne.post_id) {
      await supabase
        .from("posts")
        .update({
          statut: "publie",
          publie_at: new Date(a.post.createTimeMs).toISOString(),
          publie_url: url,
        })
        .eq("id", ligne.post_id);
    }
  }

  return out;
}
