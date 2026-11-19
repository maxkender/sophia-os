/**
 * Les applications qui peuvent recevoir un NOUVEAU compte.
 *
 * Recruter et publier sont deux choses (migration 0770) :
 *  - une application ACTIVE publie, et reçoit des comptes ;
 *  - une application EN PRÉPARATION (inactive, mais déjà servie par au moins
 *    un label slideshow) ne publie rien, mais peut recevoir des comptes : ils
 *    font leur warm-up pendant que le contenu se prépare, puis attendent
 *    l'activation. C'est le cas d'Atala au 19/11.
 *
 * Une application en préparation ne reçoit rien tant que la cible ne lui donne
 * pas de part : la montrer dans « Répartition entre applis » ne change rien
 * par soi-même, c'est y saisir un pourcentage qui décide.
 *
 * Qui est en préparation se lit en base (`applications_en_preparation`), la
 * même fonction que le moteur : cette page ne refait pas la règle.
 */
import type { ApplicationCandidate } from "./scoreApplication";

export interface ApplicationConnue {
  id: string;
  slug: string;
  /** Langues servies ; `null` = toutes. */
  langues: string[] | null;
  actif: boolean;
}

export interface CandidatesRepartition {
  /** Les applications candidates, dans l'ordre reçu. */
  candidates: ApplicationCandidate[];
  /** Slugs des candidates INACTIVES : leurs comptes ne publient rien avant l'activation. */
  enPreparation: Set<string>;
}

export function candidatesRepartition(
  applications: readonly ApplicationConnue[],
  idsEnPreparation: readonly string[],
): CandidatesRepartition {
  const ids = new Set(idsEnPreparation);
  const candidates: ApplicationCandidate[] = [];
  const enPreparation = new Set<string>();
  for (const a of applications) {
    // Une application active n'est jamais « en préparation », quoi que dise
    // une liste lue un instant plus tôt : c'est `actif` qui fait foi.
    if (!a.actif && !ids.has(a.id)) continue;
    candidates.push({ id: a.id, slug: a.slug, langues: a.langues });
    if (!a.actif) enPreparation.add(a.slug);
  }
  return { candidates, enPreparation };
}
