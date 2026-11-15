import type { PersonneSlack } from "./api";

const jourMois = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

/** « 08/11 », ou « — » sans date d'arrêt. */
export function dateArret(p: Pick<PersonneSlack, "arret_at">): string {
  return p.arret_at ? jourMois(p.arret_at) : "—";
}

/** Où en est le retrait des canaux, en une phrase. */
export function etatCanaux(p: Pick<PersonneSlack, "canaux_retires_at" | "canaux_bilan" | "erreur">): { texte: string; ton: "ok" | "erreur" | "rien" } {
  if (p.canaux_retires_at) {
    const n = p.canaux_bilan?.retires?.length ?? 0;
    return { texte: `Retirée de ${n} ${n > 1 ? "canaux" : "canal"} le ${jourMois(p.canaux_retires_at)} · reste #general`, ton: "ok" };
  }
  if (p.erreur) return { texte: p.erreur, ton: "erreur" };
  return { texte: "Encore dans ses canaux", ton: "rien" };
}

/** Le résumé en haut de la page. */
export function resume(n: number): string {
  if (n === 0) return "Personne : toutes les personnes désactivées dans l'OS sont sorties de Slack.";
  return `${n} personne${n > 1 ? "s" : ""} désactivée${n > 1 ? "s" : ""} dans l'OS ${n > 1 ? "sont" : "est"} encore membre${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""} de Slack.`;
}
