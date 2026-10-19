/**
 * Fenêtre des calendriers HM et poster (ticket Aram, « change 1 ») : deux
 * semaines du lundi au dimanche, la passée et celle en cours, en jours de
 * Paris (le jour métier de l'OS). Elle bascule le dimanche à minuit, Paris.
 */
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";

export const NB_SEMAINES = 2;

/** Lundi (AAAA-MM-JJ) de la semaine d'un jour. */
export function lundiDe(jour: string): string {
  const isodow = ((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return ajouterJours(jour, 1 - isodow);
}

/** Début par défaut : le lundi de la semaine passée (Paris). */
export function debutParDefaut(maintenant: Date = new Date()): string {
  return ajouterJours(lundiDe(partiesParis(maintenant).date), -7);
}

/** Les jours de la fenêtre, du lundi `debut` au dimanche de la dernière semaine. */
export function joursFenetre(debut: string, nbSemaines: number = NB_SEMAINES): string[] {
  return Array.from({ length: nbSemaines * 7 }, (_, i) => ajouterJours(debut, i));
}

/** « 12 Oct – 25 Oct 2026 » dans la langue de l'interface. */
export function libelleFenetre(jours: string[], langue: string): string {
  const fmt = (j: string, annee: boolean) =>
    new Intl.DateTimeFormat(langue, {
      day: "numeric",
      month: "short",
      ...(annee ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }).format(new Date(`${j}T12:00:00Z`));
  return `${fmt(jours[0], false)} – ${fmt(jours[jours.length - 1], true)}`;
}
