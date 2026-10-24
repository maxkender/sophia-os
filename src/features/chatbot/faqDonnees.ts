import { useQuery } from "@tanstack/react-query";

import { listerFaqATraiter, listerFaqJournal, type QuestionFaq } from "./api";

/** Les clés de requête de la FAQ : la page et ses cartes partagent les mêmes lectures. */
export const CLE_FAQ = ["faq"] as const;

export function auteur(q: QuestionFaq): string {
  const p = q.profiles;
  return [p?.prenom, p?.nom].filter(Boolean).join(" ") || q.slack_nom || p?.email || q.slack_user_id || "—";
}

/** Les deux listes de la FAQ, lues une fois pour la page entière. */
export function useQuestionsFaq() {
  const aTraiter = useQuery({ queryKey: [...CLE_FAQ, "a-traiter"], queryFn: listerFaqATraiter });
  const journal = useQuery({ queryKey: [...CLE_FAQ, "journal"], queryFn: listerFaqJournal });
  return { aTraiter, journal };
}
