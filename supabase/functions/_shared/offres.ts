/**
 * 7/11 : une offre HM incomplète est corrigée par l'OS, sans rien financer.
 * Attendu : 4 milestones « Week NN » (la semaine de la cohorte et les 3
 * suivantes), au tarif de la zone, seul le 1er financé.
 *   - un milestone sans numéro de semaine (« Trial week », le titre de l'offre)
 *     en 1re position devient « Week NN » (la semaine de la cohorte) ;
 *   - « week 46 - TikTok slideshows posting » devient « Week 46 » ;
 *   - un milestone financé ne se renomme pas (Upwork le refuse) : sans numéro,
 *     l'OS le compte pour la semaine de la cohorte ; avec un numéro, il reste ;
 *   - les semaines manquantes sont créées (jamais financées).
 * Rien n'est fait si un montant n'est pas celui de la zone (la carte reste).
 */
import { type JalonUpwork, semaineDuNom } from "./paiement.ts";

export type ActionOffre =
  | { type: "renommer"; jalon_id: string; de: string; vers: string }
  /** Financé : Upwork refuse de le renommer ; l'OS le compte pour cette semaine (paie_jalons_semaine). */
  | { type: "compter"; jalon_id: string; nom: string; semaine: number }
  | { type: "creer"; nom: string; montant: number };

export interface PlanOffre {
  actions: ActionOffre[];
  /** Pourquoi l'OS ne touche à rien (montant différent, plusieurs milestones sans semaine…). */
  refus: string | null;
}

const nomSemaine = (n: number) => `Week ${n}`;
/** Financé (ou payé) : Upwork n'accepte plus de le renommer. */
const finance = (j: JalonUpwork) => !/^NotFunded$/i.test(j.etat);

/** Les numéros ISO des `n` semaines à partir du lundi donné (« 2026-11-09 » → [46, 47, 48, 49]). */
export function semainesDepuis(lundi: string, n = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(`${lundi}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    out.push(semaineIsoUtc(d));
  }
  return out;
}

function semaineIsoUtc(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - debut.getTime()) / 86400000 + 1) / 7);
}

export function planCompleterOffre(jalons: JalonUpwork[], semaines: number[], tarif: number | null): PlanOffre {
  if (!semaines.length) return { actions: [], refus: "semaines inconnues" };
  if (tarif === null || !(tarif > 0) || tarif > 100) return { actions: [], refus: "tarif de la zone inconnu" };
  const actifs = jalons.filter((j) => !/^(Cancelled|Canceled|Deleted)$/i.test(j.etat));
  const differents = actifs.filter((j) => j.depot !== null && j.depot !== tarif);
  if (differents.length) return { actions: [], refus: `montant ${differents.map((j) => j.depot).join(", ")} $ au lieu de ${tarif} $ (zone)` };
  const sansSemaine = actifs.filter((j) => semaineDuNom(j.nom) === null);
  if (sansSemaine.length > 1) return { actions: [], refus: `${sansSemaine.length} milestones sans numéro de semaine` };

  const actions: ActionOffre[] = [];
  const presentes = new Set<number>();
  const nomsExacts = new Set(actifs.map((j) => j.nom.trim()));
  for (const j of actifs) {
    const n = semaineDuNom(j.nom);
    if (n === null) continue;
    presentes.add(n);
    const vers = nomSemaine(n);
    if (j.nom.trim() !== vers && !nomsExacts.has(vers) && !finance(j)) actions.push({ type: "renommer", jalon_id: j.id, de: j.nom, vers });
  }
  if (sansSemaine.length === 1) {
    const j = sansSemaine[0];
    const premier = [...actifs].sort((a, b) => a.sequence - b.sequence)[0];
    if (premier?.id !== j.id) return { actions: [], refus: `« ${j.nom} » sans numéro de semaine n'est pas le 1er milestone` };
    if (presentes.has(semaines[0])) return { actions: [], refus: `« ${j.nom} » sans semaine alors que ${nomSemaine(semaines[0])} existe` };
    actions.push(finance(j)
      ? { type: "compter", jalon_id: j.id, nom: j.nom, semaine: semaines[0] }
      : { type: "renommer", jalon_id: j.id, de: j.nom, vers: nomSemaine(semaines[0]) });
    presentes.add(semaines[0]);
  }
  for (const s of semaines) {
    if (!presentes.has(s)) actions.push({ type: "creer", nom: nomSemaine(s), montant: tarif });
  }
  return { actions, refus: null };
}
