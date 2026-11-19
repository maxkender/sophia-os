/**
 * Checklist avant le tout premier post d'un créateur (21/10).
 *
 * Un posteur qui n'a encore jamais publié répond, avant d'ouvrir son premier
 * post, à cinq questions sur le warm-up de son compte. Un seul « No » : écran
 * rouge, il le fait maintenant et revient. C'est un garde-fou de discipline,
 * pas un contrôle : rien n'est enregistré en base et personne ne voit les
 * réponses. Une fois tout à « Yes », le navigateur s'en souvient ; le premier
 * post publié l'éteint de toute façon partout.
 *
 * Seulement pour un posteur tout nouveau : jamais pour le 2e compte d'un
 * posteur qui a déjà publié, ni pour les comptes vidéo (pod 3), qui ne passent
 * pas par la page du post.
 *
 * EN ANGLAIS SEULEMENT, hors des fichiers de langue, comme le parcours
 * d'accueil (voir `contenu.ts`).
 */

export type CleQuestion = "warmup" | "follow" | "scroll" | "commentaires";
export type Reponse = "oui" | "non";
export type Reponses = Partial<Record<CleQuestion, Reponse>>;

export interface QuestionPremierPost {
  cle: CleQuestion;
  question: string;
  /** Ce qu'il reste à faire, sur l'écran rouge. */
  action: string;
}

export const QUESTIONS_PREMIER_POST: readonly QuestionPremierPost[] = [
  { cle: "warmup", question: "Did you warm up your account?", action: "Warm up your account" },
  {
    cle: "follow",
    question: "Did you follow at least 5 people on this account?",
    action: "Follow at least 5 people on this account",
  },
  { cle: "scroll", question: "Did you scroll for at least 3 minutes?", action: "Scroll for at least 3 minutes" },
  {
    cle: "commentaires",
    question: "Did you comment on at least 3 posts in the niche you're going to post in?",
    action: "Comment on at least 3 posts in the niche you're going to post in",
  },
];

/**
 * Les questions posées à CE posteur (19/11) : la niche du label de son compte
 * est nommée dans la question des commentaires. Inconnue : la liste standard,
 * telle quelle.
 */
export function questionsPremierPost(niche?: string | null): readonly QuestionPremierPost[] {
  const nommee = (niche ?? "").trim();
  if (!nommee) return QUESTIONS_PREMIER_POST;
  return QUESTIONS_PREMIER_POST.map((q) =>
    q.cle === "commentaires"
      ? { ...q, question: q.question.replace(/\?$/, ` (${nommee})?`), action: `${q.action} (${nommee})` }
      : q,
  );
}

export const TEXTES_PREMIER_POST = {
  titre: "⚠️ BEFORE YOUR FIRST POST",
  intro: "Answer honestly. Skipping this can get your account banned right away.",
  oui: "Yes",
  non: "No",
  continuer: "Continue",
  stopTitre: "🚫 STOP. DO IT NOW, THEN COME BACK.",
  stopRisque: "If you post without doing this, your account can be banned immediately.",
  stopRetour: "I've done it, check again",
  apercu: "Preview, nothing is saved",
} as const;

export function toutRepondu(reponses: Reponses): boolean {
  return QUESTIONS_PREMIER_POST.every((q) => reponses[q.cle] !== undefined);
}

/** Les questions répondues « No », dans l'ordre du pop-up (avec leur texte : celui de `questionsPremierPost`). */
export function manquants(
  reponses: Reponses,
  questions: readonly QuestionPremierPost[] = QUESTIONS_PREMIER_POST,
): QuestionPremierPost[] {
  return questions.filter((q) => reponses[q.cle] === "non");
}

/** Retour aux questions après l'écran rouge : les « No » sont à redonner. */
export function sansLesNon(reponses: Reponses): Reponses {
  const suite: Reponses = {};
  for (const q of QUESTIONS_PREMIER_POST) {
    if (reponses[q.cle] === "oui") suite[q.cle] = "oui";
  }
  return suite;
}

const cle = (uid: string) => `checklist-premier-post:${uid}`;

/** Stockage indisponible (navigation privée, données bloquées) : pas faite. */
export function checklistFaite(uid: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(cle(uid)));
  } catch {
    return false;
  }
}

/** Échec d'écriture sans gravité : le pop-up reviendrait, rien de plus. */
export function marquerChecklistFaite(uid: string): void {
  try {
    window.localStorage.setItem(cle(uid), new Date().toISOString());
  } catch {
    // Rien à faire.
  }
}
