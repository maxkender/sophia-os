import { nomApplication } from "@/features/moteur/applications";
import { ficheApplication, SLUGS_APPLICATIONS } from "@/features/moteur/catalogueApplications";

/**
 * L'identité d'une application dans les graphes, sans React : sa couleur, son
 * nom tel qu'en base, et sa place fixe. Tout vient du catalogue
 * (`catalogueApplications.ts`) : une application s'y déclare une fois. Les
 * composants qui l'affichent sont dans `LogoApplication.tsx`.
 */

/**
 * Un ordre FIXE pour les graphes, celui du catalogue : une application garde
 * sa place (et sa couleur) d'un graphe à l'autre, quel que soit son poids sur
 * le marché.
 */
const ORDRE = SLUGS_APPLICATIONS;

/** La couleur de l'application, en variable CSS (claire et sombre). Une inconnue prend le gris « autre ». */
export function couleurApplication(slug: string): string {
  return ficheApplication(slug) ? `var(--app-${slug})` : "var(--app-autre)";
}

/** Le nom tel qu'en base (`applications.nom`) : le slug seul écrirait « unswipe ». */
export function nomAffiche(slug: string): string {
  return ficheApplication(slug)?.nom ?? nomApplication({ slug });
}

export function trierApplications<T>(liste: readonly T[], slug: (x: T) => string): T[] {
  const rang = (x: T) => {
    const i = ORDRE.indexOf(slug(x));
    return i === -1 ? ORDRE.length : i;
  };
  return [...liste].sort((a, b) => rang(a) - rang(b) || slug(a).localeCompare(slug(b)));
}
