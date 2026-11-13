/**
 * 13/11 (Max) : page « Entraîner le bot ». Le regroupement de l'historique en questions types
 * (chatbot_questions + support_demandes) et le statut de chacune. Rien ici ne touche la base ni le réseau.
 */

export const TEXTE_ATTENTE = "We're checking, you'll get an answer today.";

/** Une question de l'historique, telle que la fonction support la lit. */
export interface QuestionLue {
  /** « c:<id> » (chatbot_questions) ou « s:<id> » (support_demandes). */
  ref: string;
  texte: string;
  reponse: string | null;
  /** Le bot a répondu seul (sinon : pas de réponse, ou passée à l'équipe). */
  repondu: boolean;
  plateforme: "upwork" | "ruul" | null;
  source: string;
  qui: string | null;
  at: string;
  /** La règle du catalogue (ou l'info) utilisée, si connue. */
  regle: string | null;
}

export interface TypeExistant {
  id: string;
  question: string;
}

/** Le groupe rendu par le modèle : la question type (anglais) et les numéros des questions qui en font partie. */
export interface Groupe {
  existant: string | null;
  question: string;
  categorie: string | null;
  membres: number[];
}

export function promptRegroupement(questions: readonly QuestionLue[], existants: readonly TypeExistant[]): string {
  return [
    "Tu regroupes les questions de posteurs TikTok (des freelances payés via Upwork ou Ruul) en QUESTIONS TYPES.",
    "Une question type = la même demande, quelle que soit la formulation ou la langue. Ignore les messages qui ne sont pas des questions (merci, bonjour, liens de posts).",
    "Réutilise une question type existante quand le sens est le même (mets son id dans « existant »). Sinon crée-la : une phrase courte en anglais, comme un posteur la poserait.",
    `Catégories possibles : posting, tiktok, warmup, login, slack, paie, parrainage, arret, ruul, upwork, bug, statut, autre.`,
    "",
    "QUESTIONS TYPES EXISTANTES :",
    ...existants.map((e) => `- ${e.id} : ${e.question}`),
    "",
    "QUESTIONS (numéro : texte) :",
    ...questions.map((q, i) => `${i} : ${q.texte.replace(/\s+/g, " ").slice(0, 220)}`),
    "",
    'Réponds UNIQUEMENT en JSON : {"groupes":[{"existant":"id ou null","question":"...","categorie":"...","membres":[0,5,9]}]}',
    "Chaque numéro dans un seul groupe au plus. Les numéros qui ne sont pas des questions : dans aucun groupe.",
  ].join("\n");
}

/** Lit la réponse du modèle (tolère du texte autour du JSON). Rend [] si illisible. */
export function lireGroupes(texte: string, nb: number, existants: readonly TypeExistant[]): Groupe[] {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return [];
  }
  const groupes = (brut as { groupes?: unknown })?.groupes;
  if (!Array.isArray(groupes)) return [];
  const ids = new Set(existants.map((e) => e.id));
  const vus = new Set<number>();
  const out: Groupe[] = [];
  for (const g of groupes as Record<string, unknown>[]) {
    const question = typeof g.question === "string" ? g.question.trim().slice(0, 300) : "";
    const existant = typeof g.existant === "string" && ids.has(g.existant) ? g.existant : null;
    const membres = (Array.isArray(g.membres) ? g.membres : [])
      .map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x < nb && !vus.has(x));
    membres.forEach((x) => vus.add(x));
    if ((!existant && question.length < 3) || membres.length === 0) continue;
    out.push({ existant, question, categorie: typeof g.categorie === "string" ? g.categorie.slice(0, 30) : null, membres });
  }
  return out;
}

/** sur : le bot répond seul (≥ 80 %) ; pas_sur : parfois ; sans_reponse : jamais. */
export function statutAuto(membres: readonly QuestionLue[]): "sur" | "pas_sur" | "sans_reponse" {
  const n = membres.length;
  const ok = membres.filter((m) => m.repondu).length;
  if (n === 0 || ok === 0) return "sans_reponse";
  return ok / n >= 0.8 ? "sur" : "pas_sur";
}

/** Ce que la base garde d'un groupe : compteur, plateformes, 3 exemples récents, réponse actuelle, règles utilisées. */
export function resumerGroupe(membres: readonly QuestionLue[]) {
  const tries = [...membres].sort((a, b) => b.at.localeCompare(a.at));
  const derniere = tries.find((m) => m.reponse && m.reponse.trim() !== TEXTE_ATTENTE) ?? tries.find((m) => m.reponse);
  return {
    nb: membres.length,
    upwork: membres.some((m) => m.plateforme === "upwork"),
    ruul: membres.some((m) => m.plateforme === "ruul"),
    exemples: tries.slice(0, 3).map((m) => ({ qui: m.qui, at: m.at, source: m.source, texte: m.texte.slice(0, 500) })),
    sources: tries.slice(0, 200).map((m) => m.ref),
    regles: [...new Set(membres.map((m) => m.regle).filter((x): x is string => !!x))].slice(0, 20),
    reponse_actuelle: derniere?.reponse?.slice(0, 2000) ?? null,
    statut_auto: statutAuto(membres),
  };
}

/** 13/11 (Max) : une action désactivée n'est plus faite ; le bot répond et la demande passe à l'équipe. */
export function actionActive(reglage: unknown, action: string | null | undefined): boolean {
  if (!action) return true;
  if (!reglage || typeof reglage !== "object") return true;
  return (reglage as Record<string, unknown>)[action] !== false;
}
