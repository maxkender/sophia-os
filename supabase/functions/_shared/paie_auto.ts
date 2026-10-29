/**
 * Prompt 21, parties B et P : la paie automatique du lundi. Ce qui ne dépend
 * ni du réseau ni de la base : quand payer, quelle ligne sert de canari, la
 * fusion des lignes d'un même contrat, le classement des erreurs Upwork et
 * la relecture qui dit si un paiement s'est bien passé.
 */
import { ajouterJours, maintenantParis, semaineIso } from "./ckd.ts";
import { type JalonUpwork, type LignePaieApi, PAYEES, type PlanPaiement, semaineDuNom } from "./paiement.ts";
import { ETATS_FINANCES } from "./upwork.ts";

/** Les actions de la liste qui paient une semaine. */
export const ACTIONS_PAYEES = ["payer", "payer_moins", "modifier", "kill"];

/** Une ligne de paie, après fusion par contrat (B8). */
export interface LigneAuto extends LignePaieApi {
  /** Les lignes de paie fusionnées (une seule le plus souvent). */
  ids: string[];
  posteurs: string[];
  nb_comptes: number;
  /** Les comptes sous les 6 posts (0415). */
  moins6: number;
  /** Fusion impossible ou incohérente : rien ne part, la raison va dans To do. */
  refus: string | null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const FINANCER = ["financer", "financer_normal", "financer_double"];

/**
 * B8 : deux profils (deux comptes d'un même posteur) sur un même contrat
 * Upwork → une seule ligne : montants additionnés, une seule milestone payée,
 * une seule financée. Au moindre mélange incohérent, `refus`.
 */
export function fusionnerParContrat(lignes: (LignePaieApi & { nb_comptes?: number; moins6?: number })[]): LigneAuto[] {
  const groupes = new Map<string, (LignePaieApi & { nb_comptes?: number; moins6?: number })[]>();
  const seules: LigneAuto[] = [];
  for (const l of lignes) {
    if (!l.contrat_id || !l.id) {
      seules.push(versAuto(l));
      continue;
    }
    const g = groupes.get(l.contrat_id) ?? [];
    g.push(l);
    groupes.set(l.contrat_id, g);
  }
  const fusions: LigneAuto[] = [];
  for (const g of groupes.values()) {
    if (g.length === 1) {
      fusions.push(versAuto(g[0]));
      continue;
    }
    // Toujours le même ordre : le verrou porte sur la 1re ligne.
    g.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const actions = new Set(g.map((l) => l.action));
    const payees = g.filter((l) => ACTIONS_PAYEES.includes(l.action));
    let action: string;
    let refus: string | null = null;
    if ([...actions].some((a) => a === "a_verifier")) action = "a_verifier";
    else if ([...actions].some((a) => a === "legacy")) action = "legacy";
    else if (payees.length === 0) action = actions.size === 1 ? g[0].action : "rien";
    else if (payees.every((l) => l.action === "kill")) action = "kill";
    else action = "payer";
    if (actions.has("annuler") && payees.length > 0) refus = "deux profils sur ce contrat : l'un à rembourser, l'autre à payer";
    const nbPayes = g.filter((l) => l.paye_at).length;
    if (nbPayes > 0 && nbPayes < g.length) refus = "deux profils sur ce contrat : un seul coché « Payé »";

    // La semaine suivante : celle des profils qui continuent.
    const continuent = payees.filter((l) => l.action !== "kill");
    const suivantes = new Set(continuent.map((l) => l.suivante_action ?? "rien"));
    let suivante_action: string | null = null;
    let suivante_montant: number | null = null;
    let suivante_comptes: number | null = null;
    if (suivantes.has("a_voir")) suivante_action = "a_voir";
    else if ([...suivantes].some((s) => FINANCER.includes(s))) {
      if (suivantes.has("deja_financee")) refus = "deux profils sur ce contrat : semaine suivante en partie déjà financée";
      const aFinancer = continuent.filter((l) => FINANCER.includes(l.suivante_action ?? ""));
      suivante_montant = arrondi(aFinancer.reduce((s, l) => s + Number(l.suivante_montant ?? 0), 0));
      suivante_comptes = aFinancer.reduce((s, l) => s + Number(l.suivante_comptes ?? 1), 0);
      suivante_action = suivante_comptes >= 2 ? "financer_double" : "financer";
    } else if (suivantes.has("deja_financee")) suivante_action = "deja_financee";
    else if (continuent.length > 0 || payees.length > 0) suivante_action = "ne_pas_financer";

    const somme = (f: (l: LignePaieApi) => number) => arrondi(g.reduce((s, l) => s + f(l), 0));
    fusions.push({
      ...g[0],
      action,
      faits: somme((l) => l.faits),
      tarif: g.find((l) => l.tarif !== null)?.tarif ?? null,
      montant: somme((l) => l.montant),
      montant_calcule: somme((l) => l.montant_calcule),
      retenue: somme((l) => l.retenue),
      raison_correction: g.map((l) => l.raison_correction).filter(Boolean).join(" · ") || null,
      exclu: g.some((l) => l.exclu),
      paye_at: nbPayes === g.length ? g[0].paye_at : null,
      semaine_suivante_faite_at: g.every((l) => l.semaine_suivante_faite_at) ? g[0].semaine_suivante_faite_at : null,
      suivante_action,
      suivante_montant,
      suivante_comptes,
      ids: g.map((l) => l.id!),
      posteurs: g.map((l) => l.poster_id),
      nb_comptes: g.reduce((s, l) => s + Number(l.nb_comptes ?? 1), 0),
      moins6: g.reduce((s, l) => s + Number(l.moins6 ?? 0), 0),
      refus,
    });
  }
  return [...fusions, ...seules];
}

function versAuto(l: LignePaieApi & { nb_comptes?: number; moins6?: number }): LigneAuto {
  return {
    ...l,
    ids: l.id ? [l.id] : [],
    posteurs: [l.poster_id],
    nb_comptes: Number(l.nb_comptes ?? 1),
    moins6: Number(l.moins6 ?? 0),
    refus: null,
  };
}

/**
 * B4 : le canari. Un contrat simple : 1 compte, tarif plein (sans bonus ni
 * correction), semaine suivante à financer au même tarif. Toujours le même
 * pour une liste donnée (ordre des noms).
 */
export function choisirCanari(lignes: LigneAuto[]): LigneAuto | null {
  const ok = lignes.filter((l) =>
    l.action === "payer" && !l.refus && !l.exclu && !l.paye_at && l.contrat_id && l.ids.length === 1 &&
    l.nb_comptes === 1 && l.tarif !== null && l.tarif > 0 && Math.abs(l.montant - l.tarif) < 0.005 &&
    Math.abs(l.montant_calcule - l.montant) < 0.005 && !l.raison_correction &&
    (l.suivante_action === "financer" || l.suivante_action === "financer_normal") &&
    l.suivante_montant !== null && Math.abs(l.suivante_montant - l.tarif) < 0.005
  );
  ok.sort((a, b) => String(a.poster_nom ?? "").localeCompare(String(b.poster_nom ?? "")) || String(a.id).localeCompare(String(b.id)));
  return ok[0] ?? null;
}

/**
 * B4 : relire le canari sur Upwork. Vide : tout correspond (montant payé,
 * milestone payée, semaine suivante créée au bon montant et financée).
 */
export function ecartsCanari(plan: PlanPaiement, jalonFinance: string | null, jalons: JalonUpwork[]): string[] {
  const ecarts: string[] = [];
  const a = plan.approuver;
  if (!a) return ["rien à approuver"];
  const paye = jalons.find((j) => j.id === a.jalon_id);
  if (!paye) ecarts.push(`${a.nom || a.jalon_id} introuvable à la relecture`);
  else {
    if (!PAYEES.includes(paye.etat)) ecarts.push(`${paye.nom || paye.id} : état ${paye.etat || "inconnu"}, attendu Paid`);
    if (paye.paye === null) ecarts.push(`${paye.nom || paye.id} : montant payé illisible`);
    else if (Math.abs(paye.paye - a.montant) > 0.009) ecarts.push(`${paye.nom || paye.id} : ${paye.paye} $ payés, attendu ${a.montant} $`);
  }
  const f = plan.financer;
  if (f) {
    const suiv = jalonFinance ? jalons.find((j) => j.id === jalonFinance) : null;
    if (!suiv) ecarts.push(`${f.nom} introuvable à la relecture`);
    else {
      if (suiv.depot === null || Math.abs(suiv.depot - f.montant) > 0.009) {
        ecarts.push(`${f.nom} : ${suiv.depot ?? "?"} $, attendu ${f.montant} $`);
      }
      if (!ETATS_FINANCES.includes(suiv.etat)) ecarts.push(`${f.nom} : état ${suiv.etat || "inconnu"}, attendu Active (financée)`);
    }
  }
  return ecarts;
}

export type TypeErreur = "soumission" | "carte" | "pause_contrat" | "technique" | "autre";

/**
 * P1 : la nature d'une erreur Upwork. « soumission » : milestone pas soumise
 * (B10) ; « carte » et « pause_contrat » : DM Slack immédiat ; « technique » :
 * réseau, 429, 5xx, état inattendu. Tout le reste : « autre ».
 */
export function classerErreur(erreur: string | null): TypeErreur {
  const e = String(erreur ?? "");
  if (/submit/i.test(e)) return "soumission";
  if (/card|payment method|billing|declin|insufficient|funds/i.test(e)) return "carte";
  if (/paus|suspend|on hold|hold/i.test(e)) return "pause_contrat";
  if (/HTTP 5\d\d|HTTP 429|réseau|network|timeout|timed out|ECONN|internal|unavailable|temporar|état|state|réponse vide|rate limit/i.test(e)) {
    return "technique";
  }
  return "autre";
}

/** P1 : réessayée toutes les heures le lundi et le mardi (pas les refus des garde-fous). */
export function aReessayer(type: TypeErreur): boolean {
  return type !== "autre";
}

/** La semaine que la paie du jour règle : le lundi précédent (heure de Paris). */
export function semaineAPayer(d = new Date()): string {
  const p = maintenantParis(d);
  return ajouterJours(p.jour, -(p.isoJour - 1) - 7);
}

/**
 * B3 : la paie automatique part le lundi à partir de `heure` (Paris), ou plus
 * tôt sur « Pay now » ; le mardi, elle continue (réessais, retardataires).
 * Jamais un autre jour.
 */
export function peutPayer(d: Date, heure: number, lanceAt: string | null): { ok: boolean; raison: string | null } {
  const p = maintenantParis(d);
  if (p.isoJour === 2) return { ok: true, raison: null };
  if (p.isoJour !== 1) return { ok: false, raison: "la paie automatique ne tourne que le lundi et le mardi" };
  if (lanceAt) return { ok: true, raison: null };
  if (p.heure < heure) return { ok: false, raison: `pas avant ${heure} h (Paris) : « Pay now » pour lancer plus tôt` };
  return { ok: true, raison: null };
}

/** B10, P1 : les réessais s'arrêtent le mardi à 20 h (Paris) ; la ligne passe dans To do. */
export function reessaisFinis(d: Date, semaine: string): boolean {
  const p = maintenantParis(d);
  const mardi = ajouterJours(semaine, 8);
  return p.jour > mardi || (p.jour === mardi && p.heure >= 20);
}

/** « Week 44 » de la semaine payée, pour les messages aux posteurs. */
export function numeroSemaine(semaine: string): number {
  return semaineIso(semaine);
}

/** Les {variables} d'un texte modifiable dans l'OS. Une variable inconnue reste telle quelle. */
export function remplirTexte(texte: string, valeurs: Record<string, string | number | null | undefined>): string {
  return texte.replace(/\{(\w+)\}/g, (tout, cle) => {
    const v = valeurs[cle];
    return v === null || v === undefined || v === "" ? tout : String(v);
  });
}

/** B10 : le texte par défaut si le réglage `paie_soumettre_texte` est vide. */
export const SOUMETTRE_DEFAUT = "Hi {prenom}, please click Submit on your milestone for week {NN} so we can pay you.";

/** B5 : la milestone relue vaut-elle exactement le montant attendu (au cent près) ? */
export function montantConforme(jalon: JalonUpwork | undefined, attendu: number): boolean {
  return Boolean(jalon && jalon.depot !== null && Math.round(jalon.depot * 100) === Math.round(attendu * 100));
}

/**
 * P2 : une ligne déjà payée, relue chez Upwork. Vide : tout correspond (la
 * semaine finie payée, la suivante financée au bon montant si elle est due).
 */
export function ecartsReconciliation(
  l: LigneAuto,
  v: { jalon_approuve: string | null } | null,
  jalons: JalonUpwork[],
  semaine: string,
): string[] {
  const ecarts: string[] = [];
  const w = semaineIso(semaine);
  const n = semaineIso(ajouterJours(semaine, 7));
  if (v?.jalon_approuve) {
    const j = jalons.find((x) => x.id === v.jalon_approuve);
    if (!j) ecarts.push(`milestone payée introuvable chez Upwork`);
    else if (!PAYEES.includes(j.etat)) ecarts.push(`${j.nom || j.id} : payée dans l'OS, état ${j.etat} chez Upwork`);
  } else {
    const encore = jalons.find((x) => semaineDuNom(x.nom) === w && ETATS_FINANCES.includes(x.etat));
    if (encore) ecarts.push(`${encore.nom} cochée « Payé » mais encore financée et pas payée chez Upwork`);
  }
  if (l.action !== "kill" && FINANCER.includes(l.suivante_action ?? "") && l.suivante_montant !== null) {
    const finances = jalons.filter((x) => ETATS_FINANCES.includes(x.etat) && semaineDuNom(x.nom) === n);
    if (finances.length === 0) ecarts.push(`Week ${n} pas financée`);
    else if (!finances.some((x) => montantConforme(x, l.suivante_montant!))) {
      ecarts.push(`Week ${n} financée à ${finances.map((x) => `${x.depot ?? "?"} $`).join(", ")}, attendu ${l.suivante_montant} $`);
    }
  }
  return ecarts;
}
