/** File du jour : posts marqués publiés (jour Paris). */

/** Jour calendaire Paris d'un timestamptz ISO (ou null). */
export function jourParisDepuisIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

/** Ajoute des jours à une date calendaire YYYY-MM-DD (sans fuseau). */
export function ajouterJourCalendaire(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Instant UTC du minuit Paris pour un jour calendaire.
 * L'offset est lu à midi UTC de ce jour (hors bascule DST 2h du matin).
 */
export function isoDebutJourParis(yyyyMmDd: string): string {
  const noonUtc = new Date(`${yyyyMmDd}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const offsetMin = hour * 60 + minute - 12 * 60;
  return new Date(Date.parse(`${yyyyMmDd}T00:00:00.000Z`) - offsetMin * 60_000).toISOString();
}

/** [debut, fin) du jour Paris — `fin` = minuit du lendemain (gère 23h/25h DST). */
export function isoBornesJourParis(yyyyMmDd: string): { debut: string; fin: string } {
  return {
    debut: isoDebutJourParis(yyyyMmDd),
    fin: isoDebutJourParis(ajouterJourCalendaire(yyyyMmDd, 1)),
  };
}

export function estCompteSlideshowAssigne(compte: {
  type_compte?: string | null;
  ugc_ai_video?: boolean | null;
}): boolean {
  if (compte.type_compte === "cm") return false;
  if (compte.ugc_ai_video) return false;
  return true;
}

/** Ajoute le corps d'une remarque générique au brouillon (saut de ligne si déjà du texte). */
export function insererRemarqueDansBrouillon(actuel: string, corps: string): string {
  const ajout = corps.trim();
  if (!ajout) return actuel;
  const base = actuel.trim();
  return base ? `${base}\n\n${ajout}` : ajout;
}
