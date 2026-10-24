import { nomApplication } from "@/features/moteur/applications";

/**
 * L'identité d'une application dans les graphes, sans React : sa couleur, son
 * nom tel qu'en base, et sa place fixe. Les composants qui l'affichent sont
 * dans `LogoApplication.tsx`.
 */

const COULEURS = new Set(["sophia", "micabo", "unswipe"]);

/** Les noms tels qu'en base (`applications.nom`) : le slug seul écrirait « unswipe ». */
const NOMS: Record<string, string> = { sophia: "Sophia", micabo: "micabo", unswipe: "Unswipe" };

/**
 * Un ordre FIXE pour les graphes : une application garde sa place (et sa
 * couleur) d'un graphe à l'autre, quel que soit son poids sur le marché.
 */
const ORDRE = ["sophia", "micabo", "unswipe"];

/** La couleur de l'application, en variable CSS (claire et sombre). Une inconnue prend le gris « autre ». */
export function couleurApplication(slug: string): string {
  return COULEURS.has(slug) ? `var(--app-${slug})` : "var(--app-autre)";
}

export function nomAffiche(slug: string): string {
  return NOMS[slug] ?? nomApplication({ slug });
}

export function trierApplications<T>(liste: readonly T[], slug: (x: T) => string): T[] {
  const rang = (x: T) => {
    const i = ORDRE.indexOf(slug(x));
    return i === -1 ? ORDRE.length : i;
  };
  return [...liste].sort((a, b) => rang(a) - rang(b) || slug(a).localeCompare(slug(b)));
}
