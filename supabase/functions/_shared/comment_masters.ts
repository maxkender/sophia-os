/**
 * Comment masters (TICKET 002) : la partie pure, testable sans réseau.
 *
 * Langues et pays des régions, prompt du commentaire (modèle éditable),
 * contrôle minimal, rythme des relevés, recalibrage des seuils, message et
 * signature Slack, rapprochement du commentaire réellement posté.
 */

/**
 * Les langues des régions de comment masters (migration 0321) : le nom donné
 * au modèle, au plus près de la variante écrite, et un drapeau pour les
 * messages. Une langue absente d'ici tombe sur son code brut dans le prompt :
 * à compléter AVANT d'ouvrir une région dans une nouvelle langue.
 */
export const LANGUE_REGION: Record<string, { nom: string; drapeau: string }> = {
  de: { nom: "German", drapeau: "🇩🇪" },
  it: { nom: "Italian", drapeau: "🇮🇹" },
  tr: { nom: "Turkish", drapeau: "🇹🇷" },
  fr: { nom: "French", drapeau: "🇫🇷" },
  es: { nom: "Spanish (Spain)", drapeau: "🇪🇸" },
  "es-419": { nom: "Latin American Spanish", drapeau: "🌎" },
  pt: { nom: "European Portuguese", drapeau: "🇵🇹" },
  "pt-BR": { nom: "Brazilian Portuguese", drapeau: "🇧🇷" },
  hu: { nom: "Hungarian", drapeau: "🇭🇺" },
  pl: { nom: "Polish", drapeau: "🇵🇱" },
  ro: { nom: "Romanian", drapeau: "🇷🇴" },
  el: { nom: "Greek", drapeau: "🇬🇷" },
  hr: { nom: "Croatian", drapeau: "🇭🇷" },
  // Sur TikTok, le serbe s'écrit surtout en alphabet latin.
  sr: { nom: "Serbian (Latin script)", drapeau: "🇷🇸" },
  sl: { nom: "Slovenian", drapeau: "🇸🇮" },
  cs: { nom: "Czech", drapeau: "🇨🇿" },
  sk: { nom: "Slovak", drapeau: "🇸🇰" },
  nl: { nom: "Dutch", drapeau: "🇳🇱" },
  sv: { nom: "Swedish", drapeau: "🇸🇪" },
  no: { nom: "Norwegian (Bokmål)", drapeau: "🇳🇴" },
  fi: { nom: "Finnish", drapeau: "🇫🇮" },
  et: { nom: "Estonian", drapeau: "🇪🇪" },
  bg: { nom: "Bulgarian", drapeau: "🇧🇬" },
  en: { nom: "English", drapeau: "🇬🇧" },
  ru: { nom: "Russian", drapeau: "🇰🇿" },
  ar: { nom: "Arabic", drapeau: "🇦🇪" },
};

export function nomLangue(langue: string): string {
  return LANGUE_REGION[langue]?.nom ?? langue;
}

/** Drapeau d'un code ISO alpha-2 (deux « regional indicators »), vide sinon. */
export function drapeauPays(pays: string | null | undefined): string {
  if (!pays || !/^[A-Z]{2}$/.test(pays)) return "";
  return String.fromCodePoint(...[...pays].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Nom anglais d'un pays ISO alpha-2 (« United States »), le code si inconnu. */
export function nomPays(pays: string | null | undefined): string {
  if (!pays) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(pays) ?? pays;
  } catch {
    return pays;
  }
}

// Nom d'appli tel qu'il doit apparaître dans le commentaire. La table
// `applications` écrit « Unswipe » et « micabo » ; sur TikTok c'est UnSwipe et Micabo.
const NOM_APPLI: Record<string, string> = { sophia: "Sophia", unswipe: "UnSwipe", micabo: "Micabo" };

export function nomAppli(brut: string | null): string {
  return NOM_APPLI[(brut ?? "").toLowerCase()] ?? brut ?? "Sophia";
}

/** Clé du prompt dans la table `prompts`, éditable depuis Admin → Prompts. */
export const CLE_PROMPT = "comment_master";

/**
 * Prompt par défaut, utilisé tant que la clé `comment_master` est vide. Les
 * règles et les exemples sont ceux du ticket de Max. Variables remplacées à
 * chaque post : {{langue}}, {{pays}}, {{appli}}, {{slides}}, {{hashtags}}.
 */
export const PROMPT_DEFAUT = `You write ONE TikTok comment, as a regular viewer, under the post below.

Write it in {{langue}}, the way a young person from {{pays}} really types on TikTok: casual, lowercase is fine, light slang is fine, never formal, never sounding like an ad.

The comment MUST mention the app {{appli}} (write the name exactly like that), as someone who uses it and loves it.

Rules:
- Tie the comment to ONE specific detail of the post: a fact, a number, a name or the hook. Do not copy a sentence from the post.
- One or two short sentences, between 60 and 150 characters.
- At most 1 emoji. No hashtags. No quotation marks.
- No sales pitch, no "download now", no links, no promo codes.

Examples of the tone (in English; yours must be in {{langue}}):
- the app unswipe is so good ! thanks for sharing that
- I've learned so much stuff with sophia, thanks so much
- it's crazy how great Sophia is ! I don't know why it's not famous
- I didn't know you get delete reels from instagram, unswipe is so good !
- how did I not hear about UnSwipe before ??, it's so good thanks
- bro you've just gave me the solution to my phone addiction, thanks for unswipe so much
- Micabo is so good for flashcards, thanks bro
- i have tried so many general knowledge app but Sophia is really amazing
- who invented UnSwipe ? it's so good

The post (slide texts, in order):
{{slides}}

Hashtags: {{hashtags}}`;

// Ajouté par le code, jamais éditable : c'est ce que `lireReponse` sait lire.
const CONSIGNE_JSON =
  `\n\nAnswer with JSON only, no code fence: {"comment": "...", "translation_en": "..."}`;

export interface EntreeCommentaire {
  langue: string;
  /** Pays ISO du compte. Sans pays, {{pays}} retombe sur la langue. */
  pays?: string | null;
  appli: string;
  slides: string[];
  hashtags: string | null;
}

export function promptCommentaire(input: EntreeCommentaire, modele: string = PROMPT_DEFAUT): string {
  const langue = nomLangue(input.langue);
  const slides = input.slides
    .map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const valeurs: Record<string, string> = {
    langue,
    pays: input.pays ? nomPays(input.pays) : `a country where people speak ${langue}`,
    appli: input.appli,
    slides: slides || "(no text)",
    hashtags: input.hashtags?.trim() || "(none)",
  };
  return modele.replace(/\{\{\s*(langue|pays|appli|slides|hashtags)\s*\}\}/g, (_, k: string) => valeurs[k]) +
    CONSIGNE_JSON;
}

export function lireReponse(brut: string): { comment: string; translation_en: string } | null {
  const json = brut.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const r = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1));
    if (typeof r?.comment !== "string") return null;
    return { comment: r.comment.trim(), translation_en: String(r.translation_en ?? "").trim() };
  } catch {
    return null;
  }
}

const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * Le minimum non négociable, vérifié quel que soit le prompt : l'appli citée,
 * aucun lien. Le reste (longueur, emojis, ton) vit dans le prompt éditable,
 * pour qu'un changement de règle n'ait pas à passer par le code.
 */
export function problemesCommentaire(texte: string, appli: string): string[] {
  const p: string[] = [];
  if (!texte.trim()) p.push("vide");
  if (/https?:\/\/|www\.|\.com\b/i.test(texte)) p.push("lien");
  if (!texte.toLowerCase().includes(appli.toLowerCase())) p.push(`ne cite pas ${appli}`);
  return p;
}

/** Le TikTok en clair dans Slack : 9200 → « 9.2k ». */
export function formatVues(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

export function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h}h${String(minutes % 60).padStart(2, "0")}`;
}

/** ID numérique d'un post TikTok, stable entre /photo/ et /video/. */
export function idDuLien(url: string): string {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
}

// ---------------------------------------------------------------------------
// Rythme des relevés (0321)
//
// Chaque relevé est un post facturé par Apify (~0,0023 $). Sur tous les pays,
// relever chaque heure tous les posts de moins de 12 h coûterait 300 à 450 $
// par mois. D'où : un relevé toutes les 2 h, dès 2 h d'âge ; un post qui fait
// moins de 20 % du seuil de son pays à 6 h n'est plus suivi ; les liens partent
// en runs asynchrones de 50 au plus (un run synchrone de plusieurs centaines de
// liens dépasse le délai de la fonction).
// ---------------------------------------------------------------------------

export const CADENCE_RELEVE_MIN = 120;
export const AGE_ABANDON_MIN = 360;
export const PART_SEUIL_ABANDON = 0.2;
export const LIENS_PAR_LOT = 50;
/** Un passage du cron (15 min) de grâce : le relevé « de 12 h » part à 12 h–12 h 15. */
export const TOLERANCE_FENETRE_MIN = 15;
/** Prix Apify d'un post relevé (clockworks~tiktok-scraper, palier SILVER). */
export const PRIX_RELEVE_USD = 0.0023;
/** Prix Apify d'un commentaire relu à 48 h (clockworks~tiktok-comments-scraper, SILVER). */
export const PRIX_COMMENTAIRE_USD = 0.00075;

/** Un post est-il à relever maintenant ? `dernierReleveMs` null : jamais relevé. */
export function releveDu(
  publieMs: number,
  dernierReleveMs: number | null,
  fenetreHeures: number,
  maintenant = Date.now(),
): boolean {
  const ageMin = (maintenant - publieMs) / 60_000;
  if (ageMin < CADENCE_RELEVE_MIN) return false;
  if (ageMin > fenetreHeures * 60 + TOLERANCE_FENETRE_MIN) return false;
  if (dernierReleveMs === null) return true;
  // 5 min de marge : le passage suivant du cron tombe à 2 h pile, à quelques
  // secondes près ; sans marge, chaque relevé glisserait d'un quart d'heure.
  return (maintenant - dernierReleveMs) / 60_000 >= CADENCE_RELEVE_MIN - 5;
}

export type DecisionReleve = "declencher" | "abandonner" | "terminer" | "continuer";

/**
 * Après un relevé fait à `ageMin` de la publication : déclencher le
 * commentaire, abandonner le post (trop faible à 6 h), le terminer (plus de
 * relevé possible dans la fenêtre) ou continuer à le suivre.
 */
export function decisionReleve(input: {
  ageMin: number;
  vues: number | null;
  seuil: number;
  fenetreHeures: number;
}): DecisionReleve {
  const fin = input.fenetreHeures * 60 + TOLERANCE_FENETRE_MIN;
  const vues = input.vues ?? 0;
  if (input.vues !== null && vues >= input.seuil && input.ageMin <= fin) return "declencher";
  if (input.ageMin >= AGE_ABANDON_MIN && vues < input.seuil * PART_SEUIL_ABANDON) return "abandonner";
  if (input.ageMin + CADENCE_RELEVE_MIN > fin) return "terminer";
  return "continuer";
}

export function enLots<T>(elements: T[], taille = LIENS_PAR_LOT): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

/** Clé d'un seuil : un pays peut parler deux langues (la Suisse, la Belgique…). */
export function cleSeuil(langue: string, pays: string | null | undefined): string {
  return `${langue}|${pays ?? ""}`;
}

export interface RegionActive {
  langue: string;
  slack_channel_id: string;
  fenetre_heures: number;
}

export interface SeuilPays {
  langue: string;
  pays: string;
  seuil_vues: number;
}

/** Seuil et région de chaque couple (langue, pays) suivi : seulement les régions actives. */
export function indexerSeuils(
  regions: RegionActive[],
  pays: SeuilPays[],
): Map<string, { region: RegionActive; seuil: number }> {
  const parLangue = new Map(regions.map((r) => [r.langue, r]));
  const index = new Map<string, { region: RegionActive; seuil: number }>();
  for (const p of pays) {
    const region = parLangue.get(p.langue);
    if (region) index.set(cleSeuil(p.langue, p.pays), { region, seuil: p.seuil_vues });
  }
  return index;
}

// ---------------------------------------------------------------------------
// Recalibrage du lundi : vers ~1 post sur 20 qui déclenche, comme l'Allemagne
// au départ. Les pays sous cadenas n'y passent pas (filtré par l'appelant).
// ---------------------------------------------------------------------------

export const CIBLE_DECLENCHEMENT = 0.05;
/** Posts suivis jusqu'au bout sur la fenêtre de mesure, sous lesquels on ne touche à rien. */
export const ECHANTILLON_MIN_RECALIBRAGE = 60;
export const JOURS_RECALIBRAGE = 28;
export const SEUIL_PLANCHER = 3000;
const PAS_SEUIL = 500;
// Un pas à la fois : au plus −20 % / +25 % par semaine, pour ne jamais
// sur-corriger sur une semaine atypique.
const FACTEUR_MIN = 0.8;
const FACTEUR_MAX = 1.25;

export interface Recalibrage {
  seuil: number;
  raison: "echantillon" | "inchange" | "ajuste";
  taux: number | null;
  facteur: number | null;
}

export function seuilRecalibre(seuil: number, conclus: number, declenches: number): Recalibrage {
  if (conclus < ECHANTILLON_MIN_RECALIBRAGE) return { seuil, raison: "echantillon", taux: null, facteur: null };
  const taux = declenches / conclus;
  // Racine : la moitié de l'écart à la cible, en multiplicatif.
  const brut = declenches === 0 ? FACTEUR_MIN : Math.sqrt(taux / CIBLE_DECLENCHEMENT);
  const facteur = Math.min(FACTEUR_MAX, Math.max(FACTEUR_MIN, brut));
  const nouveau = Math.max(SEUIL_PLANCHER, Math.round((seuil * facteur) / PAS_SEUIL) * PAS_SEUIL);
  if (nouveau === seuil) return { seuil, raison: "inchange", taux, facteur };
  return { seuil: nouveau, raison: "ajuste", taux, facteur };
}

/** Le jour (AAAA-MM-JJ, heure de Paris) est-il un lundi ? */
export function estLundi(jour: string): boolean {
  return new Date(`${jour}T12:00:00Z`).getUTCDay() === 1;
}

// ---------------------------------------------------------------------------
// Canal Slack
// ---------------------------------------------------------------------------

/**
 * Le bot peut-il poster dans le canal ? Lu sur la réponse de `conversations.info`.
 * Un canal PRIVÉ dont le bot n'est pas membre lui est invisible :
 * `channel_not_found`. Les codes d'erreur sont traduits par la page.
 */
export function verdictCanal(r: {
  ok: boolean;
  error?: string;
  needed?: string;
  channel?: { name?: string; is_member?: boolean; is_archived?: boolean };
}): { ok: true; nom: string | null } | { ok: false; code: string } {
  if (!r.ok) {
    if (r.error === "missing_scope" && r.needed) return { ok: false, code: `missing_scope:${r.needed}` };
    return { ok: false, code: r.error ?? "inconnue" };
  }
  if (r.channel?.is_archived) return { ok: false, code: "is_archived" };
  if (r.channel?.is_member === false) return { ok: false, code: "not_in_channel" };
  return { ok: true, nom: r.channel?.name ?? null };
}

/** Erreurs d'envoi qui disent que le canal est inutilisable : affichées sur la région. */
export const ERREURS_CANAL = new Set(["not_in_channel", "channel_not_found", "is_archived", "missing_scope"]);

/**
 * Le bot ne peut PAS poster dans ce canal : la vérification tombe, et une
 * région active s'éteint. Un droit manquant (`missing_scope:…`) n'en fait pas
 * partie : il empêche de LIRE le canal (conversations.info), pas d'y poster
 * (chat:write) — éteindre de ou it pour ça couperait des envois qui marchent.
 */
export function canalInutilisable(code: string): boolean {
  return ["not_in_channel", "channel_not_found", "is_archived"].includes(code);
}

export interface DemandeSlack {
  id: string;
  langue: string;
  /** Pays du compte : son drapeau ouvre le message (les demandes d'avant 0321 n'en ont pas). */
  pays?: string | null;
  handle: string | null;
  application: string;
  publie_url: string;
  vues_declenchement: number;
  age_minutes: number;
  commentaire: string;
  traduction_en: string | null;
}

// deno-lint-ignore no-explicit-any
type Bloc = Record<string, any>;

/** Le message du comment master. `fait` remplace le bouton une fois cliqué. */
export function blocsSlack(d: DemandeSlack, fait?: { par: string; heure: string }): Bloc[] {
  const drapeau = drapeauPays(d.pays) || (LANGUE_REGION[d.langue]?.drapeau ?? "");
  const blocs: Bloc[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${drapeau} *New post to comment* · ${d.handle ? `@${d.handle}` : "account"} · ${d.application}\n` +
          `*${formatVues(d.vues_declenchement)} views* in ${formatAge(d.age_minutes)} · <${d.publie_url}|Open on TikTok>`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Comment to write:*\n\`\`\`${d.commentaire}\`\`\`` },
    },
  ];
  if (d.traduction_en) {
    blocs.push({ type: "context", elements: [{ type: "mrkdwn", text: `🇬🇧 ${d.traduction_en}` }] });
  }
  blocs.push(
    fait
      ? { type: "context", elements: [{ type: "mrkdwn", text: `✅ Done by <@${fait.par}> at ${fait.heure}` }] }
      : {
        type: "actions",
        elements: [{
          type: "button",
          style: "primary",
          action_id: "comment_fait",
          value: d.id,
          text: { type: "plain_text", text: "✅ Done" },
        }],
      },
  );
  return blocs;
}

export function texteNotification(d: DemandeSlack): string {
  return `New post to comment: ${d.handle ? `@${d.handle}` : ""} (${formatVues(d.vues_declenchement)} views)`;
}

/**
 * Signature Slack (v0) : HMAC-SHA256 de `v0:{timestamp}:{corps}` avec le signing
 * secret. Refuse aussi une requête de plus de 5 min (rejeu).
 */
export async function signatureSlackValide(
  secret: string,
  timestamp: string | null,
  corps: string,
  signature: string | null,
  maintenant = Date.now(),
): Promise<boolean> {
  if (!timestamp || !signature) return false;
  if (Math.abs(maintenant / 1000 - Number(timestamp)) > 300) return false;
  const cle = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`v0:${timestamp}:${corps}`));
  const attendu = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (attendu.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function normaliser(t: string): string {
  return t.toLowerCase().replace(EMOJI, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Similarité de Dice sur les bigrammes de caractères, de 0 à 1. */
export function similarite(a: string, b: string): number {
  const bigrammes = (t: string) => {
    const s = normaliser(t);
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const x = bigrammes(a);
  const y = bigrammes(b);
  let commun = 0;
  let total = 0;
  for (const [k, n] of x) {
    commun += Math.min(n, y.get(k) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total === 0 ? 0 : (2 * commun) / total;
}

/**
 * Le commentaire du comment master parmi ceux du post : le plus proche du texte
 * généré, posté après l'envoi Slack. Il le retouche souvent un peu, d'où un seuil
 * à 0,6 plutôt qu'une égalité stricte.
 */
export function retrouverCommentaire<T extends { texte: string; creeAt: string | null }>(
  commentaires: T[],
  genere: string,
  envoyeAt: string,
  seuil = 0.6,
): T | null {
  const depuis = new Date(envoyeAt).getTime() - 5 * 60_000;
  let meilleur: T | null = null;
  let score = seuil;
  for (const c of commentaires) {
    if (c.creeAt && new Date(c.creeAt).getTime() < depuis) continue;
    const s = similarite(c.texte, genere);
    if (s >= score) {
      meilleur = c;
      score = s;
    }
  }
  return meilleur;
}
