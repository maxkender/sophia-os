import type { PosterProfil } from "@/features/moteur/types";

import { clesQuestionnaire, MOTS_ANGLAIS, cleMot } from "./questionnaire";

/** invite : choisi, il remplit son questionnaire · actif : validé · pause · retire. */
export const STATUTS_RELECTEUR = ["invite", "actif", "pause", "retire"] as const;
export type StatutRelecteur = (typeof STATUTS_RELECTEUR)[number];

/** Les trois réponses possibles pour un mot de la Part 2. */
export const CHOIX_MOT = ["anglais", "notre_mot", "personne"] as const;
export type ChoixMot = (typeof CHOIX_MOT)[number];

export interface ReponseQuestionnaire {
  question_cle: string;
  choix: ChoixMot | null;
  reponse: string;
  updated_at?: string;
}

const CLES_MOTS = new Set<string>(MOTS_ANGLAIS.map(cleMot));

/** Un mot est répondu quand un choix est fait (et le mot local écrit, s'il en faut un). */
export function reponseRemplie(r: Pick<ReponseQuestionnaire, "question_cle" | "choix" | "reponse"> | undefined): boolean {
  if (!r) return false;
  if (CLES_MOTS.has(r.question_cle)) {
    if (!r.choix) return false;
    return r.choix !== "notre_mot" || r.reponse.trim().length > 0;
  }
  return r.reponse.trim().length > 0;
}

/** Avancement : seules les clés du questionnaire actuel comptent (une ancienne clé ne fausse rien). */
export function progressionQuestionnaire(reponses: ReadonlyArray<ReponseQuestionnaire>): {
  repondues: number;
  total: number;
} {
  const cles = clesQuestionnaire();
  const parCle = new Map(reponses.map((r) => [r.question_cle, r]));
  const repondues = cles.filter((c) => reponseRemplie(parCle.get(c))).length;
  return { repondues, total: cles.length };
}

/** L'espace relecteur ne s'ouvre qu'aux relecteurs invités ou actifs, et quand l'admin l'a ouvert. */
export function relecteursAvecEspace<T extends { statut: string }>(relecteurs: ReadonlyArray<T>, espaceOuvert: boolean): T[] {
  if (!espaceOuvert) return [];
  return relecteurs.filter((r) => r.statut === "invite" || r.statut === "actif");
}

/** Modèle proposé quand la fiche d'une appli est encore vide. */
export function modeleFicheAppli(nom: string): string {
  return [
    `# ${nom}`,
    "",
    "## Ce que fait l'appli",
    "En deux ou trois phrases : ce que l'utilisateur y fait, chaque jour.",
    "",
    "## À qui elle s'adresse",
    "- ",
    "",
    "## Ce qu'on a le droit d'affirmer",
    "- ",
    "",
    "## Ce qu'on ne dit jamais",
    "- Promesses de résultats, chiffres non vérifiés…",
    "",
    "## Les fonctionnalités qu'on peut citer",
    "- ",
    "",
    "## Comment la nommer",
    `- Nom exact : ${nom}, jamais traduit.`,
    "- Le mot « appli » se dit dans la langue du post (la fiche langue le précise).",
    "",
    "## Les captures disponibles",
    "- ",
    "",
    "## Ses concurrents",
    "- Les applis qu'on ne cite jamais, ou qu'on remplace.",
    "",
  ].join("\n");
}

/** Langues dans lesquelles le posteur publie, d'abord celles de ses comptes. */
export function languesDuPoster(p: Pick<PosterProfil, "comptes" | "langues">): string[] {
  const vues = new Set<string>();
  for (const c of p.comptes ?? []) if (c.langue) vues.add(c.langue);
  for (const l of p.langues ?? []) if (l) vues.add(l);
  return [...vues];
}
