/**
 * Le parcours du relecteur, un bloc après l'autre : un bloc d'accueil (les
 * consignes et le pays), une partie du questionnaire par bloc (la liste de
 * mots en plusieurs blocs, pour ne jamais faire défiler 38 mots d'un coup),
 * puis le bloc d'envoi.
 */
import { reponseRemplie, type ReponseQuestionnaire } from "./logique";
import {
  cleMot,
  MOTS_ANGLAIS,
  PARTIES_QUESTIONNAIRE,
  QUESTION_INTRO,
  type QuestionRelecteur,
} from "./questionnaire";

/** Combien de mots par bloc dans la partie « mots ». */
export const MOTS_PAR_BLOC = 13;

export type BlocQuestionnaire =
  | { cle: "avant"; type: "avant" }
  | { cle: string; type: "questions"; titre: string; questions: QuestionRelecteur[] }
  | { cle: string; type: "mots"; titre: string; mots: string[]; morceau: number; morceaux: number }
  | { cle: "envoi"; type: "envoi" };

export function blocsQuestionnaire(motsParBloc = MOTS_PAR_BLOC): BlocQuestionnaire[] {
  const blocs: BlocQuestionnaire[] = [{ cle: "avant", type: "avant" }];
  for (const partie of PARTIES_QUESTIONNAIRE) {
    if (partie.mots) {
      const morceaux = Math.ceil(MOTS_ANGLAIS.length / motsParBloc);
      for (let i = 0; i < morceaux; i++) {
        blocs.push({
          cle: `${partie.cle}.${i + 1}`,
          type: "mots",
          titre: partie.titre,
          mots: MOTS_ANGLAIS.slice(i * motsParBloc, (i + 1) * motsParBloc),
          morceau: i + 1,
          morceaux,
        });
      }
    } else {
      blocs.push({ cle: partie.cle, type: "questions", titre: partie.titre, questions: partie.questions });
    }
  }
  blocs.push({ cle: "envoi", type: "envoi" });
  return blocs;
}

/** Les clés de réponse d'un bloc (aucune pour le bloc d'envoi). */
export function clesDuBloc(bloc: BlocQuestionnaire): string[] {
  switch (bloc.type) {
    case "avant":
      return [QUESTION_INTRO.cle];
    case "questions":
      return bloc.questions.map((q) => q.cle);
    case "mots":
      return bloc.mots.map(cleMot);
    case "envoi":
      return [];
  }
}

/** Combien de questions d'un bloc ont une réponse. */
export function avancementBloc(
  bloc: BlocQuestionnaire,
  reponses: ReadonlyArray<ReponseQuestionnaire>,
): { repondues: number; total: number } {
  const parCle = new Map(reponses.map((r) => [r.question_cle, r]));
  const cles = clesDuBloc(bloc);
  return { repondues: cles.filter((c) => reponseRemplie(parCle.get(c))).length, total: cles.length };
}

/** Où reprendre : le premier bloc qui a encore une question sans réponse, sinon l'envoi. */
export function premierBlocAFaire(
  blocs: ReadonlyArray<BlocQuestionnaire>,
  reponses: ReadonlyArray<ReponseQuestionnaire>,
): number {
  if (reponses.length === 0) return 0;
  const i = blocs.findIndex((b) => {
    const a = avancementBloc(b, reponses);
    return a.total > 0 && a.repondues < a.total;
  });
  return i === -1 ? blocs.length - 1 : i;
}
