/** 0797 (Max, 20/11) : les inactifs arrêtés automatiquement le samedi, dans le rapport des kills. */
export interface Inactifs {
  arretes: number;
  jamais_connectes: number;
  jamais_postes: number;
  en_cours: number;
  alertes: number;
  liste: { nom: string; categorie: "A" | "B" | "alerte"; canal: string | null; statut: string; erreur: string | null; message_fin: boolean | null }[];
}

/** « Inactifs arrêtés automatiquement : 12 (8 jamais connectés, 4 jamais postés) · 2 alertes bug d'assignation » (le même que sur Slack). */
export function ligneInactifs(r: Omit<Inactifs, "liste">): string {
  const s = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  let l = `Inactifs arrêtés automatiquement : ${r.arretes} (${s(r.jamais_connectes, "jamais connecté")}, ${s(r.jamais_postes, "jamais posté")})`;
  if (r.en_cours > 0) l += ` · ${r.en_cours} en cours (reprise demain)`;
  return `${l} · ${s(r.alertes, "alerte")} bug d'assignation`;
}
