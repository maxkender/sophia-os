import type { PosterProfil } from "@/features/moteur/types";

/** invite : choisi · actif : validé · pause · retire. */
export const STATUTS_RELECTEUR = ["invite", "actif", "pause", "retire"] as const;
export type StatutRelecteur = (typeof STATUTS_RELECTEUR)[number];

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
