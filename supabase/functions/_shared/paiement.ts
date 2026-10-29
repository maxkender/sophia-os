/**
 * Prompt 14, point 3 : payer depuis la liste de paie. Ce qui ne dépend ni du
 * réseau ni de la base : lire les milestones d'un contrat, décider ce qu'on
 * approuve et ce qu'on finance pour une ligne, et refuser au moindre doute.
 *
 * Règles (prompt 14) :
 * - approuver la 1re milestone financée et non payée (F1, 28 oct.), avec le
 *   montant de la liste (moins, avec la raison, si retenue) ;
 * - financer la semaine suivante : la milestone « Week NN » si elle existe
 *   (les HMs en créent 4 à l'embauche), sinon la créer ; jamais de doublon ;
 *   Double : « Week NN (2 acc) » au tarif × 2 ;
 * - Kill : approuver, ne rien financer, fermer le contrat à la main ;
 *   Annuler : rien, rembourser à la main ; Rien à payer : rien ;
 * - refuser : montant au-dessus du plafond, milestone au montant inattendu,
 *   deux milestones possibles, déjà payée à la main.
 */
import { ajouterJours, semaineIso } from "./ckd.ts";
import { ETATS_FINANCES } from "./upwork.ts";

export interface JalonUpwork {
  id: string;
  nom: string;
  etat: string;
  sequence: number;
  /** En dollars. */
  depot: number | null;
  paye: number | null;
  /** dueDateTime (ISO), si Upwork le donne. */
  echeance?: string | null;
}

/** Un montant Upwork : displayValue en dollars, sinon rawValue en centimes (vérifié le 28/10). */
// deno-lint-ignore no-explicit-any
export function dollarsUpwork(m: any): number | null {
  if (m?.displayValue !== undefined && m?.displayValue !== null) {
    const n = Number(String(m.displayValue).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (m?.rawValue !== undefined && m?.rawValue !== null) {
    const n = Number(m.rawValue) / 100;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Les milestones d'un contrat (contractDetails → terms.fixedPriceTerms.milestones), par ordre. */
// deno-lint-ignore no-explicit-any
export function lireJalonsContrat(contractDetails: any): JalonUpwork[] {
  // deno-lint-ignore no-explicit-any
  // Une liste (vu le 28/10) ; un objet seul est lu aussi, au lieu de planter.
  const termes = contractDetails?.terms?.fixedPriceTerms;
  // deno-lint-ignore no-explicit-any
  const brut: any[] = (Array.isArray(termes) ? termes : termes ? [termes] : []).flatMap((t: any) => t?.milestones ?? []);
  return brut
    .filter((m) => m?.id)
    .map((m) => ({
      id: String(m.id),
      nom: String(m.description ?? "").trim(),
      etat: String(m.state ?? ""),
      sequence: Number(m.sequenceId ?? 0),
      depot: dollarsUpwork(m.depositAmount),
      paye: dollarsUpwork(m.paid),
      echeance: m.dueDateTime ? String(m.dueDateTime) : null,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

/** En cents, comme l'API les attend (« 1000 » = 10 $). */
export function centimes(dollars: number): string {
  return String(Math.round(dollars * 100));
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** « Week 45 », « Week 45 (2 acc) », « week45 » : le numéro de semaine du nom, ou null. */
export function semaineDuNom(nom: string): number | null {
  const m = nom.match(/week\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

export interface ReglagesPaieApi {
  mode: "off" | "test" | "on";
  contrats_test: string[];
  /** AAAA-MM-JJ : pas de paiement « test » avant ce jour, ni « on » avant tous_des. */
  test_des: string;
  tous_des: string;
  plafond_ligne: number;
  plafond_jour: number;
}

// deno-lint-ignore no-explicit-any
export function lireReglagesPaieApi(v: Record<string, any>): ReglagesPaieApi {
  const api = v.paie_api && typeof v.paie_api === "object" ? v.paie_api : {};
  const mode = api.mode === "test" || api.mode === "on" ? api.mode : "off";
  const nombre = (x: unknown, d: number) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);
  return {
    mode,
    contrats_test: Array.isArray(api.contrats_test) ? api.contrats_test.map((c: unknown) => String(c).trim()).filter(Boolean) : [],
    test_des: typeof api.test_des === "string" ? api.test_des : "2026-11-02",
    tous_des: typeof api.tous_des === "string" ? api.tous_des : "2026-11-09",
    plafond_ligne: nombre(v.paie_plafond_ligne, 30),
    plafond_jour: nombre(v.paie_plafond_jour, 5000),
  };
}

/** Le paiement par l'API est-il ouvert pour ce contrat aujourd'hui ? null : oui ; sinon la raison. */
export function refusMode(r: ReglagesPaieApi, contratId: string, aujourdhui: string): string | null {
  if (r.mode === "off") return "paiement par l'API désactivé (Payroll → Réglages)";
  if (r.mode === "test") {
    if (aujourdhui < r.test_des) return `mode test : pas avant le ${r.test_des}`;
    if (!r.contrats_test.includes(contratId)) return "mode test : ce contrat n'est pas dans la liste de test";
    return null;
  }
  if (aujourdhui < r.tous_des) return `pas avant le ${r.tous_des}`;
  return null;
}

/** Une ligne de la liste de paie, telle que paie_liste_v2 la rend, plus son contrat. */
export interface LignePaieApi {
  id: string | null;
  poster_id: string;
  poster_nom: string | null;
  action: string;
  faits: number;
  tarif: number | null;
  montant: number;
  montant_calcule: number;
  retenue: number;
  raison_correction: string | null;
  exclu: boolean;
  paye_at: string | null;
  semaine_suivante_faite_at: string | null;
  suivante_action: string | null;
  suivante_comptes: number | null;
  suivante_montant: number | null;
  contrat_id: string | null;
  /** Comptes payés cette semaine (Double : 2). */
  nb_comptes?: number;
}

export interface PlanPaiement {
  /**
   * pret : approuver (et financer) ; rien : rien à faire ; lien : à faire à la
   * main sur Upwork (fermer, rembourser) ; deja_payee : payée à la main ;
   * refuse : à vérifier, rien ne part.
   */
  statut: "pret" | "rien" | "lien" | "deja_payee" | "refuse";
  raison: string | null;
  approuver: { jalon_id: string; nom: string; montant: number; depot: number; sous_paiement: string | null } | null;
  financer: { mode: "existant" | "creer"; jalon_id: string | null; nom: string; montant: number; editer: boolean } | null;
  lien: "fermer" | "rembourser" | null;
  /**
   * Prompt 21, B9 : 1re semaine du 2e compte d'un Double. La milestone de la
   * semaine a été financée pour un compte ; le reste est payé par une
   * milestone de complément, créée, financée puis approuvée.
   */
  complement?: { nom: string; montant: number } | null;
  /** Le montant engagé (approbation + financement), compté dans le plafond du jour. */
  total: number;
  /** Déjà payée à la main : le montant trouvé sur Upwork. */
  montant_trouve: number | null;
}

const vide = (statut: PlanPaiement["statut"], raison: string | null, extra: Partial<PlanPaiement> = {}): PlanPaiement => ({
  statut, raison, approuver: null, financer: null, lien: null, total: 0, montant_trouve: null, ...extra,
});

/** Payée : par nous, par Upwork (libérée seule après 14 jours) ou par le système (prompt 21, B7). */
export const PAYEES = ["Paid", "PaidByUpwork", "PaidBySystem"];

/**
 * Le plan d'une ligne. `semaine` : le lundi de la semaine payée. Au moindre
 * doute, « refuse » avec la raison : rien ne part pour cette ligne.
 */
export function planPaiement(l: LignePaieApi, jalons: JalonUpwork[], semaine: string, r: ReglagesPaieApi): PlanPaiement {
  const w = semaineIso(semaine);
  const n = semaineIso(ajouterJours(semaine, 7));
  if (l.exclu) return vide("rien", "retirée de la liste");
  if (l.paye_at) return vide("rien", "déjà cochée « Payé »");
  if (l.faits > 0 && l.tarif === null) return vide("refuse", "tarif manquant : à vérifier");
  if (l.action === "rien") return vide("rien", "rien à payer");
  if (l.action === "annuler") return vide("lien", "à rembourser sur Upwork", { lien: "rembourser" });
  // Prompt 21, S (0415) : tarif du contrat impossible à déduire, ou contrat Legacy (payé à la fin de sa période).
  if (l.action === "a_verifier") return vide("refuse", "tarif du contrat à vérifier (Payroll → Contract rate)");
  if (l.action === "legacy") return vide("rien", "contrat Legacy : payé à la fin de sa période");
  if (!["payer", "payer_moins", "modifier", "kill"].includes(l.action)) return vide("refuse", `action « ${l.action} » inconnue`);
  if (!l.contrat_id) return vide("refuse", "contrat Upwork non relié");
  if (l.montant <= 0) return vide("rien", "montant nul");

  const finances = jalons.filter((j) => ETATS_FINANCES.includes(j.etat));
  if (finances.length === 0) {
    const payee = [...jalons].reverse().find((j) => PAYEES.includes(j.etat) && semaineDuNom(j.nom) === w);
    if (payee) {
      return vide("deja_payee", `${payee.nom} déjà payée sur Upwork`, { montant_trouve: payee.paye ?? payee.depot });
    }
    return vide("refuse", "aucune milestone financée sur Upwork");
  }
  // Semaine suivante déjà financée : 2 milestones financées attendues, sinon une seule.
  const permises = l.suivante_action === "deja_financee" ? 2 : 1;
  if (finances.length > permises) {
    return vide("refuse", `${finances.length} milestones financées et non payées : laquelle approuver ? à vérifier`);
  }
  const a = finances[0];
  if (a.depot === null) return vide("refuse", `${a.nom || "milestone"} : montant illisible`);
  const attendu = arrondi(l.montant_calcule + l.retenue);
  // B9 : le 2e compte d'un Double a commencé cette semaine, la milestone n'était
  // financée que pour un compte. Le reste (au plus un tarif + le bonus) part
  // dans une milestone de complément, jamais plus que le calcul de l'OS.
  const reste = arrondi(attendu - a.depot);
  const complement = reste > 0.009 && (l.nb_comptes ?? 1) >= 2 && l.tarif !== null && reste <= l.tarif + 1.009 &&
      Math.abs(l.montant - attendu) < 0.009
    ? { nom: `Week ${w} (2nd acc)`, montant: reste }
    : null;
  if (!complement && Math.abs(a.depot - attendu) > 0.009) {
    return vide("refuse", `${a.nom || "milestone"} vaut ${a.depot} $, attendu ${attendu} $ : à vérifier`);
  }
  if (!complement && l.montant > a.depot + 0.009) return vide("refuse", `montant ${l.montant} $ au-dessus de la milestone (${a.depot} $)`);
  if (l.montant > r.plafond_ligne) return vide("refuse", `montant ${l.montant} $ au-dessus du plafond par ligne (${r.plafond_ligne} $)`);
  const sous = !complement && l.montant < a.depot - 0.009
    ? (l.raison_correction?.trim() || `Missed posts: ${arrondi(a.depot - l.montant)} $ deducted`)
    : null;
  const approuver = {
    jalon_id: a.id, nom: a.nom, montant: complement ? a.depot : arrondi(l.montant), depot: a.depot, sous_paiement: sous,
  };

  if (l.action === "kill") {
    return {
      ...vide("pret", null), approuver, complement, lien: "fermer",
      total: arrondi(approuver.montant + (complement?.montant ?? 0)),
    };
  }

  let financer: PlanPaiement["financer"] = null;
  switch (l.suivante_action) {
    case "financer":
    case "financer_normal":
    case "financer_double": {
      const double = l.suivante_action === "financer_double";
      const montant = l.suivante_montant;
      if (montant === null || !(montant > 0)) return vide("refuse", `Week ${n} : tarif manquant, à vérifier`);
      if (montant > r.plafond_ligne) {
        return vide("refuse", `Week ${n} : ${montant} $ au-dessus du plafond par ligne (${r.plafond_ligne} $)`);
      }
      const nom = double ? `Week ${n} (${l.suivante_comptes ?? 2} acc)` : `Week ${n}`;
      const candidates = jalons.filter((j) => j.etat === "NotFunded" && j.sequence > a.sequence && semaineDuNom(j.nom) === n);
      if (candidates.length > 1) return vide("refuse", `${candidates.length} milestones « Week ${n} » non financées : à vérifier`);
      const existante = candidates[0];
      financer = existante
        ? {
          mode: "existant",
          jalon_id: existante.id,
          nom,
          montant: arrondi(montant),
          editer: existante.depot === null || Math.abs(existante.depot - montant) > 0.009 || existante.nom !== nom,
        }
        : { mode: "creer", jalon_id: null, nom, montant: arrondi(montant), editer: false };
      break;
    }
    case "a_voir":
      return vide("refuse", `Week ${n} : à vérifier avant de financer`);
    default:
      // deja_financee, ne_pas_financer, ou rien : on n'en crée pas.
      financer = null;
  }
  return {
    ...vide("pret", null),
    approuver,
    complement,
    financer,
    total: arrondi(approuver.montant + (complement?.montant ?? 0) + (financer?.montant ?? 0)),
  };
}

