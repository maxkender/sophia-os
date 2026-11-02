/**
 * Les périodes de 4 semaines des bonus (prompt 11) : la première finit la
 * veille de `premier_lundi`, puis toutes les 28 jours, dans les deux sens.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

export interface Periode {
  cle: string;
  debut: string;
  fin: string;
  type: "aujourdhui" | "sept_jours" | "en_cours" | "precedente";
}

function ecart(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** La période de 4 semaines qui contient `jour`. */
export function periodeDe(jour: string, premierLundi: string): { debut: string; fin: string } {
  const k = Math.floor(ecart(premierLundi, jour) / 28);
  const debut = ajouterJours(premierLundi, 28 * k);
  return { debut, fin: ajouterJours(debut, 27) };
}

/** Le lundi bonus qui paie la période (le lendemain de sa fin). */
export function lundiBonus(p: { fin: string }): string {
  return ajouterJours(p.fin, 1);
}

/** Aujourd'hui, 7 jours, la période en cours, puis `precedentes` périodes d'avant. */
export function periodesChoix(aujourdhui: string, premierLundi: string, precedentes = 6): Periode[] {
  const enCours = periodeDe(aujourdhui, premierLundi);
  return [
    { cle: "aujourdhui", debut: aujourdhui, fin: aujourdhui, type: "aujourdhui" },
    { cle: "sept_jours", debut: ajouterJours(aujourdhui, -6), fin: aujourdhui, type: "sept_jours" },
    { cle: `p-${enCours.debut}`, ...enCours, type: "en_cours" },
    ...Array.from({ length: precedentes }, (_, i) => {
      const debut = ajouterJours(enCours.debut, -28 * (i + 1));
      return { cle: `p-${debut}`, debut, fin: ajouterJours(debut, 27), type: "precedente" as const };
    }),
  ];
}
