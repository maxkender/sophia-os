/**
 * 23/11 (Max) : le plan de paie d'une semaine (Control > Paie, carte « Plan W47 »). Logique pure : quel jalon libérer
 * pour une ligne, et si le contrat peut être fermé. Rien ne part sans le clic de Max (fonction upwork, plan_paie_executer).
 */
import { ETATS_FINANCES } from "./upwork.ts";
import { type JalonUpwork, PAYEES } from "./paiement.ts";

export interface LignePlan {
  groupe: "liberer" | "liberer_fermer" | "grok" | "bloque" | "kill";
  jalon_id: string | null;
}

export type CiblePlan =
  | { ok: true; jalon: JalonUpwork }
  | { ok: false; etat: "deja_paye" | "pas_finance" | "a_voir" | "bloque"; raison: string };

/**
 * Le jalon à libérer : par son NUMÉRO quand il est donné (jamais par son nom) ; pour Grok (numéro inconnu), le SEUL
 * jalon financé non libéré du contrat. Jamais un jalon déjà payé, jamais un jalon non financé.
 */
export function ciblePlan(l: LignePlan, jalons: JalonUpwork[]): CiblePlan {
  if (l.groupe === "bloque") return { ok: false, etat: "bloque", raison: "bloqué : décision de Max" };
  if (l.groupe === "kill") return { ok: false, etat: "a_voir", raison: "kill : aucun jalon libéré ici" };
  if (l.jalon_id) {
    const j = jalons.find((x) => x.id === l.jalon_id);
    if (!j) return { ok: false, etat: "a_voir", raison: `jalon ${l.jalon_id} introuvable sur ce contrat` };
    if (PAYEES.includes(j.etat)) return { ok: false, etat: "deja_paye", raison: `jalon ${l.jalon_id} déjà payé (${j.etat})` };
    if (!ETATS_FINANCES.includes(j.etat)) return { ok: false, etat: "pas_finance", raison: `jalon ${l.jalon_id} pas financé (${j.etat})` };
    if (j.depot === null || !(j.depot > 0)) return { ok: false, etat: "a_voir", raison: `jalon ${l.jalon_id} : montant illisible` };
    return { ok: true, jalon: j };
  }
  const finances = jalons.filter((x) => ETATS_FINANCES.includes(x.etat) && !((x.paye ?? 0) > 0));
  if (finances.length === 0) return { ok: false, etat: "pas_finance", raison: "aucun jalon financé (Grok pas encore passé)" };
  if (finances.length > 1) {
    return { ok: false, etat: "a_voir", raison: `${finances.length} jalons financés (${finances.map((x) => `${x.nom || "?"} #${x.id}`).join(", ")}) : lequel ? à voir` };
  }
  const j = finances[0];
  if (j.depot === null || !(j.depot > 0)) return { ok: false, etat: "a_voir", raison: `jalon ${j.id} : montant illisible` };
  return { ok: true, jalon: j };
}

/** Le jalon relu après l'approbation est-il payé ? */
export const jalonPaye = (jalons: JalonUpwork[] | null, id: string) => (jalons ?? []).some((x) => x.id === id && PAYEES.includes(x.etat));

/** L'ordre d'exécution : on libère toujours AVANT de fermer ou de killer (un kill attend sa paie). */
export const ORDRE_GROUPES: LignePlan["groupe"][] = ["liberer", "liberer_fermer", "grok", "kill"];
