/**
 * 20/11 (Max) : les emails de l'OS aux posteurs partent dans la langue de leur pays (email_langue_poster, 0787).
 * Le texte anglais reste la source ; il est traduit au moment de l'envoi, une seule fois par langue et par texte
 * (table traductions_emails), puis réutilisé.
 * Avant la traduction, tout ce qui est propre au posteur ou doit rester exact (nom, mot de passe, liens, emails,
 * @ TikTok, montants, noms de boutons entre « ») est remplacé par [[1]], [[2]]… : ces valeurs ne partent jamais au
 * traducteur et ne sont jamais gardées. Une traduction qui perd un repère ou change la structure est refusée :
 * l'email part alors en anglais, comme avant.
 */
import { generateTextFast } from "./gemini.ts";

export type Traducteur = (prompt: string) => Promise<string>;

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

/** Les noms de langue donnés au traducteur (codes de email_langue_pays). */
const NOMS: Record<string, string> = {
  hu: "Hungarian", sr: "Serbian (Latin script)", bs: "Bosnian (Latin script)", hr: "Croatian", sl: "Slovenian", mk: "Macedonian",
  sq: "Albanian", tr: "Turkish", el: "Greek", cs: "Czech", sk: "Slovak", ro: "Romanian", pl: "Polish", it: "Italian", de: "German",
  fr: "French", es: "Spanish (Spain)", "es-419": "Latin American Spanish", pt: "European Portuguese", "pt-BR": "Brazilian Portuguese",
  sv: "Swedish", fi: "Finnish", no: "Norwegian (Bokmål)", da: "Danish", nl: "Dutch", lt: "Lithuanian", lv: "Latvian", et: "Estonian",
  bg: "Bulgarian", uk: "Ukrainian", ru: "Russian", he: "Hebrew", ar: "Arabic", ja: "Japanese", id: "Indonesian",
};

/** Le code de langue tel qu'on le garde (« pt-BR », « es-419 », sinon en minuscules) ; « en » par défaut. */
export function normaliserLangue(langue: string | null | undefined): string {
  const l = String(langue ?? "").trim();
  if (!l) return "en";
  const [base, region] = l.split(/[-_]/);
  const b = base.toLowerCase();
  if (b === "pt" && region?.toUpperCase() === "BR") return "pt-BR";
  if (b === "es" && region === "419") return "es-419";
  return b;
}

/** Une langue que l'on sait traduire (sinon l'email part en anglais). */
export function langueTraduite(langue: string | null | undefined): boolean {
  const l = normaliserLangue(langue);
  return l !== "en" && l in NOMS;
}

// Dans l'ordre : les liens d'abord (ils peuvent contenir @), puis les emails, app.ruul.io, les @ TikTok, les montants,
// et les noms de boutons ou d'étapes entre « ».
const MOTIFS: RegExp[] = [
  /https?:\/\/[^\s<>"')\]]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\bapp\.ruul\.io(?:\/[\w/-]*)?/g,
  /@[A-Za-z0-9._]{2,}/g,
  /\$\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?\$/g,
  /«[^»\n]{1,60}»/g,
  // 20/11 : les variables des textes d'écran ({date}, {n}…).
  /\{[a-z_]{1,20}\}/g,
];

const REPERE = /\[\[(\d+)\]\]/g;

/**
 * Remplace les valeurs à garder par [[n]] (la même valeur garde le même n d'un champ à l'autre).
 * `valeurs` est complété au fur et à mesure ; `secrets` : les valeurs propres au posteur (nom, mot de passe…).
 */
export function proteger(texte: string, secrets: string[], valeurs: string[]): string {
  const repere = (v: string) => {
    let i = valeurs.indexOf(v);
    if (i < 0) i = valeurs.push(v) - 1;
    return `[[${i + 1}]]`;
  };
  let t = texte;
  for (const s of [...new Set(secrets.map((x) => (x ?? "").trim()).filter((x) => x.length >= 2))].sort((a, b) => b.length - a.length)) {
    // Le mot entier seulement (« Ana » ne touche pas « Analytics »).
    const echappe = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echappe}(?![\\p{L}\\p{N}])`, "gu"), () => repere(s));
  }
  for (const motif of MOTIFS) {
    // Jamais à l'intérieur d'un repère déjà posé.
    t = t.split(/(\[\[\d+\]\])/).map((morceau) => (/^\[\[\d+\]\]$/.test(morceau) ? morceau : morceau.replace(motif, (m) => repere(m)))).join("");
  }
  return t;
}

/** Remet les valeurs à la place des repères. */
export function restaurer(texte: string, valeurs: string[]): string {
  return texte.replace(REPERE, (m, n) => valeurs[Number(n) - 1] ?? m);
}

function reperes(t: string): string[] {
  return [...t.matchAll(REPERE)].map((m) => m[0]).sort();
}

function paragraphes(t: string): number {
  return t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).length;
}

/** Une traduction est gardée seulement si chaque champ garde ses repères (autant de fois) et ses paragraphes. */
export function traductionValide(source: Record<string, string>, sortie: unknown): sortie is Record<string, string> {
  if (!sortie || typeof sortie !== "object") return false;
  const s = sortie as Record<string, unknown>;
  for (const [cle, texte] of Object.entries(source)) {
    const t = s[cle];
    if (typeof t !== "string" || !t.trim()) return false;
    if (reperes(t).join() !== reperes(texte).join()) return false;
    if (paragraphes(t) !== paragraphes(texte)) return false;
    if (t.length > texte.length * 3 + 80) return false;
  }
  return true;
}

export function consigne(langue: string, champs: Record<string, string>): string {
  const l = normaliserLangue(langue);
  return [
    `Translate the values of this JSON object from English into ${NOMS[l] ?? l} (language code "${l}").`,
    "Rules:",
    "- Reply with the JSON object only, with the same keys. No comment, no code fence.",
    "- Keep every marker like [[1]] exactly as it is, the same number of times, at the natural place in the sentence.",
    "- Keep the same paragraphs (blank lines) and the same list lines (1., 2., -).",
    '- Keep "Vik Studios", "Ruul", "TikTok", "Slack", "Sophia OS" and the button name "Help" as they are.',
    "- Use the informal you (like tu / du / ti). Simple, short and friendly, the same meaning: nothing added, nothing removed.",
    "- Never use the words bot, AI, artificial intelligence, automatic or automated.",
    "",
    JSON.stringify(champs),
  ].join("\n");
}

function lireJson(texte: string): unknown {
  const t = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const debut = t.indexOf("{");
    const fin = t.lastIndexOf("}");
    if (debut < 0 || fin <= debut) return null;
    try {
      return JSON.parse(t.slice(debut, fin + 1));
    } catch {
      return null;
    }
  }
}

async function empreinte(v: unknown): Promise<string> {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(v)));
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Traduit des champs de texte (objet, corps, bouton…) dans la langue donnée. Les champs vides ou absents
 * restent tels quels. Renvoie les champs anglais d'origine si la langue est l'anglais, inconnue, ou si la
 * traduction échoue ou n'est pas valide.
 */
export async function traduireChamps<T extends Record<string, string | null | undefined>>(
  db: Db,
  langue: string | null | undefined,
  champs: T,
  secrets: string[] = [],
  traduire: Traducteur = generateTextFast,
): Promise<{ champs: T; traduit: boolean }> {
  const l = normaliserLangue(langue);
  if (!langueTraduite(l)) return { champs, traduit: false };
  const valeurs: string[] = [];
  const source: Record<string, string> = {};
  for (const [cle, v] of Object.entries(champs)) {
    if (typeof v === "string" && v.trim()) source[cle] = proteger(v, secrets, valeurs);
  }
  if (!Object.keys(source).length) return { champs, traduit: false };
  const cle = await empreinte(source);
  let sortie: Record<string, string> | null = null;
  try {
    const { data } = await db.from("traductions_emails").select("traduction").eq("langue", l).eq("cle", cle).maybeSingle();
    if (data && traductionValide(source, data.traduction)) sortie = data.traduction as Record<string, string>;
  } catch { /* on traduit */ }
  if (!sortie) {
    for (let essai = 0; essai < 2 && !sortie; essai++) {
      try {
        const lu = lireJson(await traduire(consigne(l, source)));
        if (traductionValide(source, lu)) sortie = lu;
      } catch { /* essai suivant, sinon l'anglais */ }
    }
    if (!sortie) return { champs, traduit: false };
    try {
      await db.from("traductions_emails").upsert({ langue: l, cle, source, traduction: sortie }, { onConflict: "langue,cle" });
    } catch { /* gardée la prochaine fois */ }
  }
  const resultat: Record<string, string | null | undefined> = { ...champs };
  for (const k of Object.keys(source)) resultat[k] = restaurer(sortie[k], valeurs);
  return { champs: resultat as T, traduit: true };
}
