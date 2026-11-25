/**
 * 25/11 (Max) : les modèles WhatsApp dans la langue du posteur. Les modèles anglais APPROVED sont traduits en es,
 * pt_BR, it, de, fr, pl, ro, hu, cs, el, tr (même nom chez Meta, même catégorie) par l'action soumettre_traductions
 * de la fonction whatsapp ; à l'envoi, la langue du posteur est prise si son modèle y est APPROVED, sinon l'anglais.
 *
 * La traduction reprend le traducteur des emails (traduction_email.ts : proteger / consigne / restaurer, cache
 * traductions_emails) avec des règles en plus pour WhatsApp : les {{n}}, les noms de boutons du dashboard entre
 * guillemets et STOP ne partent jamais au traducteur ; les boutons font 25 caractères au plus ; aucun mot interdit
 * (problemesTraduction). Une traduction qui ne passe pas les règles n'est ni gardée ni soumise.
 */
import { generateTextFast } from "./gemini.ts";
import { consigne, empreinte, lireJson, proteger, restaurer, type Traducteur, traductionValide } from "./traduction_email.ts";
import { type BoutonUrl, MODELES_V2, type ModeleV2, problemesTraduction } from "./whatsapp_modeles_v2.ts";

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

/** Les langues des modèles traduits, en codes Meta (demande de Max du 25/11). */
export const LANGUES_MODELES = ["es", "pt_BR", "it", "de", "fr", "pl", "ro", "hu", "cs", "el", "tr"] as const;
export type LangueModele = (typeof LANGUES_MODELES)[number];

/** Le code de l'OS (traduction_email.ts) de chaque langue Meta : la langue donnée au traducteur. */
const LANGUE_OS: Record<LangueModele, string> = {
  es: "es", pt_BR: "pt-BR", it: "it", de: "de", fr: "fr", pl: "pl", ro: "ro", hu: "hu", cs: "cs", el: "el", tr: "tr",
};

/**
 * La langue Meta d'un code de l'OS ou de Join (fr, de, pt, pt-BR, es, es-419, el-GR, pt_BR…) : une de
 * LANGUES_MODELES, sinon « en » (pas de modèle traduit dans cette langue). Le portugais (Portugal comme Brésil)
 * prend pt_BR, l'espagnol d'Amérique latine es : ce sont les seuls modèles soumis.
 */
export function langueMeta(code: string | null | undefined): string {
  const brut = String(code ?? "").trim().toLowerCase().replace(/_/g, "-");
  const base = brut.split("-")[0];
  if (base === "pt") return "pt_BR";
  return (LANGUES_MODELES as readonly string[]).includes(base) ? base : "en";
}

/** La clé d'un modèle dans une langue (« warmup_start:de »), pour les ensembles de modèles APPROVED. */
export const cleModeleLangue = (nom: string, langue: string) => `${nom}:${langue}`;

/**
 * La langue d'envoi d'un modèle : celle du posteur (langueCible, code OS ou Join) si le modèle y est APPROVED chez
 * Meta, sinon l'anglais. `approuves` : les clés cleModeleLangue des modèles APPROVED.
 */
export function choisirLangueEnvoi(nom: string, langueCible: string | null | undefined, approuves: ReadonlySet<string>): string {
  const l = langueMeta(langueCible);
  return l !== "en" && approuves.has(cleModeleLangue(nom, l)) ? l : "en";
}

/**
 * Un modèle anglais tel que Meta le renvoie (whatsapp_modeles.composants) en ModeleV2 : corps et ses exemples,
 * boutons lien. Un en-tête, un pied ou un autre type de bouton n'est pas pris en charge (null + la raison).
 */
export function modeleDepuisComposants(nom: string, composants: unknown): { modele: ModeleV2 | null; probleme: string | null } {
  if (!Array.isArray(composants)) return { modele: null, probleme: "composants illisibles" };
  let corps = "";
  let exemples: string[] = [];
  const boutons: BoutonUrl[] = [];
  for (const c of composants as Record<string, unknown>[]) {
    const type = String(c?.type ?? "").toUpperCase();
    if (type === "BODY") {
      corps = String(c.text ?? "");
      const ex = (c.example as { body_text?: unknown[][] } | undefined)?.body_text?.[0];
      exemples = Array.isArray(ex) ? ex.map(String) : [];
    } else if (type === "BUTTONS") {
      for (const b of (c.buttons ?? []) as Record<string, unknown>[]) {
        if (String(b?.type ?? "").toUpperCase() !== "URL" || typeof b.url !== "string" || /\{\{/.test(b.url)) {
          return { modele: null, probleme: `bouton ${String(b?.type ?? "?")} non pris en charge` };
        }
        boutons.push({ texte: String(b.text ?? ""), url: b.url });
      }
    } else {
      return { modele: null, probleme: `composant ${type || "?"} non pris en charge` };
    }
  }
  if (!corps) return { modele: null, probleme: "pas de corps" };
  const v2 = MODELES_V2.find((m) => m.nom === nom);
  const variables = v2 && v2.variables.length === exemples.length ? v2.variables : exemples.map((_, i) => `{{${i + 1}}}`);
  return { modele: { nom, variables, corps, exemples, boutons }, probleme: null };
}

/** Les règles WhatsApp ajoutées à la consigne des emails. */
export const REGLES_WHATSAPP = [
  "- This is a WhatsApp message template from Vik Studios to a freelancer who is paid to post slideshows on TikTok. Warm, clear and natural, like a friendly team member writing on WhatsApp.",
  "- Keys starting with bouton_ are WhatsApp button labels: at most 25 characters each (count them), short and natural.",
  "- Keep the emojis, the line breaks and the numbered lines exactly where they are.",
  "- Never start or end the text with a marker like [[1]], and never put two markers next to each other.",
  "- Never use the words bot, AI, artificial intelligence, automatic or automated, nor their translations (KI, IA, automatique, automatisch, automático, automatico, automatyczny, automat, automatikus, automatický, αυτόματα, otomatik).",
];

/** Version des règles : une autre version donne d'autres clés de cache (traductions_emails). */
const VERSION = "whatsapp-1";

/** Les valeurs qui ne partent jamais au traducteur : {{n}}, STOP, noms de boutons du dashboard entre guillemets. */
export function valeursProtegees(m: ModeleV2): string[] {
  const textes = [m.corps, ...m.boutons.map((b) => b.texte)].join("\n");
  return [
    ...new Set([
      ...textes.matchAll(/\{\{\d+\}\}/g),
      ...textes.matchAll(/"[^"\n]{1,40}"/g),
      ...textes.matchAll(/(?<![\p{L}\p{N}])STOP(?![\p{L}\p{N}])/gu),
    ].map((x) => x[0])),
  ];
}

/** Les champs envoyés au traducteur : le corps et les boutons (les liens ne sont jamais traduits). */
function champsModele(m: ModeleV2): Record<string, string> {
  const champs: Record<string, string> = { corps: m.corps };
  m.boutons.forEach((b, i) => (champs[`bouton_${i + 1}`] = b.texte));
  return champs;
}

/** Le modèle traduit à partir des champs traduits (déjà restaurés) : mêmes liens, mêmes exemples. */
export function modeleTraduit(source: ModeleV2, champs: Record<string, string>): ModeleV2 {
  return {
    ...source,
    corps: String(champs.corps ?? "").trim(),
    boutons: source.boutons.map((b, i) => ({ texte: String(champs[`bouton_${i + 1}`] ?? "").trim(), url: b.url })),
  };
}

export interface ResultatTraduction {
  /** La traduction sans problème (null : rien à soumettre). */
  modele: ModeleV2 | null;
  problemes: string[];
  depuisCache: boolean;
  /** Le dernier essai, même refusé (pour relire ce qui n'a pas passé les règles). */
  essai: ModeleV2 | null;
}

/**
 * Le modèle anglais traduit dans une langue Meta (LANGUES_MODELES). Le cache (traductions_emails) d'abord ; sinon
 * le traducteur, jusqu'à 3 essais (les problèmes de l'essai précédent sont redits au traducteur). Seule une
 * traduction sans problème est gardée et rendue ; sinon modele: null et les problèmes du dernier essai.
 */
export async function traduireModele(
  db: Db, langue: string, source: ModeleV2, traduire: Traducteur = generateTextFast,
): Promise<ResultatTraduction> {
  const os = LANGUE_OS[langue as LangueModele];
  if (!os) return { modele: null, problemes: [`langue non prise en charge : ${langue}`], depuisCache: false, essai: null };
  const valeurs: string[] = [];
  const secrets = valeursProtegees(source);
  const protege: Record<string, string> = {};
  for (const [k, v] of Object.entries(champsModele(source))) protege[k] = proteger(v, secrets, valeurs);
  const cle = await empreinte({ v: VERSION, source: protege });
  type Essai = { modele: ModeleV2 | null; problemes: string[]; essai: ModeleV2 | null };
  const verifier = (sortie: unknown): Essai => {
    if (!traductionValide(protege, sortie)) {
      return { modele: null, problemes: ["traduction invalide (repères ou paragraphes perdus)"], essai: null };
    }
    const champs: Record<string, string> = {};
    for (const k of Object.keys(protege)) champs[k] = restaurer((sortie as Record<string, string>)[k], valeurs);
    const t = modeleTraduit(source, champs);
    const problemes = problemesTraduction(source, t);
    return { modele: problemes.length ? null : t, problemes, essai: t };
  };

  try {
    const { data } = await db.from("traductions_emails").select("traduction").eq("langue", os).eq("cle", cle).maybeSingle();
    if (data?.traduction) {
      const r = verifier(data.traduction);
      if (r.modele) return { ...r, depuisCache: true };
    }
  } catch { /* on traduit */ }

  let dernier: Essai = { modele: null, problemes: ["traduction impossible"], essai: null };
  for (let essai = 0; essai < 3; essai++) {
    const regles = [...REGLES_WHATSAPP];
    if (essai > 0 && dernier.problemes.length) {
      regles.push(`- Your previous answer was refused for these reasons, fix them: ${dernier.problemes.join(" ; ")}.`);
    }
    try {
      const sortie = lireJson(await traduire(consigne(os, protege, regles)));
      dernier = verifier(sortie);
      if (dernier.modele) {
        try {
          await db.from("traductions_emails").upsert({ langue: os, cle, source: protege, traduction: sortie }, { onConflict: "langue,cle" });
        } catch { /* gardée la prochaine fois */ }
        return { ...dernier, depuisCache: false };
      }
    } catch (e) {
      dernier = { modele: null, problemes: [`traducteur : ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`], essai: dernier.essai };
    }
  }
  return { ...dernier, depuisCache: false };
}

/**
 * Les modèles à soumettre : chaque modèle anglais × chaque langue demandée, sauf ce qui existe déjà chez Meta (quel
 * que soit son statut), dans l'ordre des langues puis des modèles, `max` au plus.
 */
export function aSoumettre(
  modeles: string[], langues: readonly string[], existants: ReadonlySet<string>, max: number,
): { nom: string; langue: string }[] {
  const l: { nom: string; langue: string }[] = [];
  for (const langue of langues) {
    for (const nom of modeles) {
      if (existants.has(cleModeleLangue(nom, langue))) continue;
      l.push({ nom, langue });
    }
  }
  return l.slice(0, Math.max(0, max));
}

/** Une erreur de Meta qui dit que la limite de création (ou d'appels) est atteinte : on s'arrête là. */
export function limiteMeta(erreur: string | null | undefined): boolean {
  if (!erreur) return false;
  return /^(4|17|32|613|80007|80008)\b/.test(erreur.trim()) || /rate limit|limit (?:reached|exceeded)|too many|reached the (?:maximum|limit)/i.test(erreur);
}

const CATEGORIES_META = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

/**
 * 25/11 : Meta refuse une langue d'un modèle dont la catégorie ne correspond pas à celle qu'il associe déjà au modèle
 * (sous-code 2388026, « Template category mismatch » : Meta a reclassé d'autres langues, p. ex. en MARKETING). La
 * catégorie attendue est la dernière nommée dans l'explication de Meta (graph() la renvoie avec le sous-code) ; null
 * si l'erreur est autre ou si elle ne nomme pas une autre catégorie que celle soumise.
 */
export function categorieImposeeParMeta(erreur: string | null | undefined, soumise: string): string | null {
  if (!erreur || !/^100\/2388026\b/.test(erreur.trim())) return null;
  const nommees = [...erreur.toUpperCase().matchAll(/\b(MARKETING|UTILITY|AUTHENTICATION)\b/g)].map((m) => m[1]);
  const attendue = nommees.reverse().find((c) => c !== soumise.toUpperCase());
  return attendue && (CATEGORIES_META as readonly string[]).includes(attendue) ? attendue : null;
}
