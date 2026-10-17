/**
 * Comment masters (TICKET 002) : la partie pure, testable sans réseau.
 *
 * Prompt du commentaire (modèle éditable), contrôle minimal, message Slack,
 * signature Slack et rapprochement du commentaire réellement posté.
 */

export const LANGUE_REGION: Record<string, { nom: string; drapeau: string }> = {
  de: { nom: "German", drapeau: "🇩🇪" },
  it: { nom: "Italian", drapeau: "🇮🇹" },
};

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
 * chaque post : {{langue}}, {{appli}}, {{slides}}, {{hashtags}}.
 */
export const PROMPT_DEFAUT = `You write ONE TikTok comment, as a regular viewer, under the post below.

Write it in {{langue}}, the way a young {{langue}}-speaking person really types on TikTok: casual, lowercase is fine, light slang is fine, never formal, never sounding like an ad.

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

export function promptCommentaire(
  input: { langue: string; appli: string; slides: string[]; hashtags: string | null },
  modele: string = PROMPT_DEFAUT,
): string {
  const langue = LANGUE_REGION[input.langue]?.nom ?? input.langue;
  const slides = input.slides
    .map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const valeurs: Record<string, string> = {
    langue,
    appli: input.appli,
    slides: slides || "(no text)",
    hashtags: input.hashtags?.trim() || "(none)",
  };
  return modele.replace(/\{\{\s*(langue|appli|slides|hashtags)\s*\}\}/g, (_, k: string) => valeurs[k]) +
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

export interface DemandeSlack {
  id: string;
  langue: string;
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
  const drapeau = LANGUE_REGION[d.langue]?.drapeau ?? "";
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
