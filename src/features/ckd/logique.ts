import type {
  ActionCkd,
  ArretCkd,
  ChiffresCkd,
  DecisionCkd,
  HistoriqueCkd,
  PropositionCkd,
  RegleCkd,
  ReglageCkd,
  SourceReglage,
  TypeControle,
} from "./api";

/** Les réglages de 0326, dans l'ordre de la page. */
export type TypeReglage = "nombre" | "part" | "oui_non";

export interface DefReglage {
  cle: string;
  type: TypeReglage;
  /** `seuil_bon_post` : vide = celui des comment masters du pays. */
  videAutorise?: boolean;
  /** Réglé une fois pour toute la flotte (pas par pays ni par label). */
  global?: boolean;
}

export const REGLAGES: readonly DefReglage[] = [
  { cle: "seuil_bon_post", type: "nombre", videAutorise: true },
  { cle: "vues_min_j2", type: "nombre" },
  { cle: "seuil_mort", type: "nombre" },
  { cle: "morts_premiere_semaine", type: "nombre" },
  { cle: "age_min_heures", type: "nombre" },
  { cle: "part_mediane_pays", type: "part" },
  { cle: "anciennete_semaines", type: "nombre" },
  { cle: "posts_min_anciens", type: "nombre" },
  { cle: "bons_posts_doubler", type: "nombre" },
  { cle: "manques_max_doubler", type: "nombre" },
  { cle: "manques_absent", type: "nombre" },
  { cle: "doublement_autorise", type: "oui_non" },
  { cle: "comptes_min_mediane", type: "nombre", global: true },
];

export function defReglage(cle: string): DefReglage | undefined {
  return REGLAGES.find((r) => r.cle === cle);
}

/**
 * La valeur qui s'applique et d'où elle vient, comme `ckd_reglage` en SQL :
 * pays + label, puis label, puis pays, puis défaut.
 */
export function valeurEffective(
  reglages: ReglageCkd[],
  cle: string,
  pays: string | null,
  labelId: string | null,
): { valeur: unknown; source: SourceReglage } | null {
  const candidats = reglages.filter(
    (r) =>
      r.cle === cle &&
      (r.pays === null || r.pays === pays) &&
      (r.label_id === null || r.label_id === labelId),
  );
  const rang = (r: ReglageCkd) => (r.pays !== null && r.label_id !== null ? 3 : r.label_id !== null ? 2 : r.pays !== null ? 1 : 0);
  const meilleur = [...candidats].sort((a, b) => rang(b) - rang(a))[0];
  if (!meilleur) return null;
  const source: SourceReglage =
    meilleur.pays !== null && meilleur.label_id !== null
      ? "pays_label"
      : meilleur.label_id !== null
        ? "label"
        : meilleur.pays !== null
          ? "pays"
          : "defaut";
  return { valeur: meilleur.valeur, source };
}

/** Le réglage exact d'un niveau (pas d'héritage), ou undefined s'il n'existe pas. */
export function reglageDuNiveau(
  reglages: ReglageCkd[],
  cle: string,
  pays: string | null,
  labelId: string | null,
): ReglageCkd | undefined {
  return reglages.find((r) => r.cle === cle && r.pays === pays && r.label_id === labelId);
}

/** Les exceptions par label (avec ou sans pays), triées pour la liste. */
export function exceptionsLabel(reglages: ReglageCkd[]): ReglageCkd[] {
  return reglages
    .filter((r) => r.label_id !== null)
    .sort(
      (a, b) =>
        (a.label_id ?? "").localeCompare(b.label_id ?? "") ||
        (a.pays ?? "").localeCompare(b.pays ?? "") ||
        a.cle.localeCompare(b.cle),
    );
}

/** Pour l'affichage : 0.6 → « 60 % », true → « oui », null → « — ». */
export function formaterValeur(def: DefReglage | undefined, valeur: unknown, oui = "oui", non = "non"): string {
  if (valeur === null || valeur === undefined) return "—";
  if (def?.type === "oui_non") return valeur === true ? oui : non;
  const n = Number(valeur);
  if (!Number.isFinite(n)) return String(valeur);
  if (def?.type === "part") return `${Math.round(n * 100)} %`;
  return n.toLocaleString("fr-FR");
}

/**
 * Ce que l'admin a tapé, en valeur à enregistrer. Vide = retirer (ou « comment
 * masters » pour le seuil d'un bon post au niveau défaut). Une part se tape en
 * pourcentage (60 → 0.6). Renvoie `{ erreur }` si la saisie n'a pas de sens.
 */
export function lireSaisie(def: DefReglage, texte: string): { valeur: unknown } | { erreur: string } {
  const t = texte.trim().replace(/\s/g, "").replace(",", ".").replace("%", "");
  if (t === "") return { valeur: null };
  if (def.type === "oui_non") {
    if (["oui", "true", "1", "yes"].includes(t.toLowerCase())) return { valeur: true };
    if (["non", "false", "0", "no"].includes(t.toLowerCase())) return { valeur: false };
    return { erreur: "oui_non" };
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { erreur: "nombre" };
  if (def.type === "part") {
    if (n > 100) return { erreur: "part" };
    return { valeur: Math.round(n * 10) / 1000 };
  }
  return { valeur: n };
}

/** La saisie pré-remplie d'un réglage (0.6 → « 60 »). */
export function valeurEnSaisie(def: DefReglage, valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  if (def.type === "oui_non") return valeur === true ? "oui" : "non";
  if (def.type === "part") return String(Math.round(Number(valeur) * 100));
  return String(valeur);
}

/** L'ordre des actions sur la page : ce qui coûte le plus d'abord. */
export const ORDRE_ACTIONS: readonly ActionCkd[] = ["ne_pas_renouveler", "recreer", "doubler", "nudge"];

export function compterActions(propositions: PropositionCkd[]): Record<ActionCkd, number> {
  const n = Object.fromEntries(ORDRE_ACTIONS.map((a) => [a, 0])) as Record<ActionCkd, number>;
  for (const p of propositions) n[p.action] = (n[p.action] ?? 0) + 1;
  return n;
}

export interface GroupeHm {
  hmId: string | null;
  propositions: PropositionCkd[];
}

/**
 * Les propositions groupées par HM (le manager du poster), les HMs les plus
 * chargés d'abord, sans HM en dernier. Dans un groupe : par action, puis par
 * handle.
 */
export function grouperParHm(propositions: PropositionCkd[]): GroupeHm[] {
  const groupes = new Map<string | null, PropositionCkd[]>();
  for (const p of propositions) {
    const liste = groupes.get(p.hm_id) ?? [];
    liste.push(p);
    groupes.set(p.hm_id, liste);
  }
  return [...groupes.entries()]
    .map(([hmId, liste]) => ({
      hmId,
      propositions: [...liste].sort(
        (a, b) =>
          ORDRE_ACTIONS.indexOf(a.action) - ORDRE_ACTIONS.indexOf(b.action) ||
          (a.donnees.handle ?? "").localeCompare(b.donnees.handle ?? ""),
      ),
    }))
    .sort((a, b) => {
      if (a.hmId === null) return 1;
      if (b.hmId === null) return -1;
      return b.propositions.length - a.propositions.length;
    });
}

/**
 * Les décisions possibles pour chaque règle, la proposée d'abord. « Kill » =
 * ne pas renouveler : le compte s'arrête à la fin de la semaine payée, sans
 * nouveau compte.
 */
export const BOUTONS_PAR_REGLE: Record<RegleCkd, readonly string[]> = {
  jeudi: ["envoyerNudge", "recreer", "rien"],
  absent: ["nePasRenouveler", "garder"],
  premiere_semaine: ["nePasRenouveler", "garder"],
  anciens: ["recreer", "nePasRenouveler", "garder"],
  doubler: ["doubler", "pasMaintenant"],
};

/**
 * Les boutons d'une proposition, selon le jour du contrôle : le jeudi ne fait
 * aucun arrêt (0368), le samedi ne recrée plus (0369) — Kill ou Double.
 */
export function boutonsPour(regle: RegleCkd, type: TypeControle): readonly string[] {
  const boutons = BOUTONS_PAR_REGLE[regle];
  return type === "jeudi"
    ? boutons.filter((b) => b !== "nePasRenouveler")
    : boutons.filter((b) => b !== "recreer");
}

/** Le bouton choisi d'avance : « Recréer » quand le jeudi le propose. */
export function boutonPropose(p: Pick<PropositionCkd, "action" | "type">): string | null {
  return p.type === "jeudi" && p.action === "recreer" ? "recreer" : null;
}

/** La décision enregistrée pour chaque bouton (même liste que `ckd_decisions_permises`). */
export const DECISION_DU_BOUTON: Record<string, DecisionCkd> = {
  envoyerNudge: "nudge",
  rien: "rien",
  nePasRenouveler: "ne_pas_renouveler",
  recreer: "recreer",
  doubler: "doubler",
  garder: "garder",
  pasMaintenant: "pas_maintenant",
};

/** Le bouton d'une décision (pour son libellé). */
export function boutonDeLaDecision(decision: DecisionCkd): string {
  return Object.keys(DECISION_DU_BOUTON).find((b) => DECISION_DU_BOUTON[b] === decision) ?? decision;
}

/** Ces décisions créent un compte : confirmation, et pas d'annulation. */
export function creeUnCompte(decision: DecisionCkd): boolean {
  return decision === "recreer" || decision === "doubler";
}

/** Les décisions qui partent aux HMs (les autres sont seulement notées). */
export const DECISIONS_ENVOYEES: readonly DecisionCkd[] = ["ne_pas_renouveler", "recreer", "doubler", "nudge"];

/** Décidée, pas encore partie au HM, et prête à partir (compte créé pour Recréer / Doubler). */
export function aEnvoyer(p: PropositionCkd): boolean {
  if (!p.decision || p.envoye_at || !DECISIONS_ENVOYEES.includes(p.decision)) return false;
  // Suivi du HM désactivé (0339) : rien ne part dans #managers-hq.
  if (p.hm_suivi === false) return false;
  // Recréation du jeudi : la HM n'est pas notifiée, le posteur l'est (0368).
  if (p.type === "jeudi" && p.decision === "recreer") return false;
  return !creeUnCompte(p.decision) || Boolean(p.nouveau_compte_id);
}

/** Comme `ckd_annuler` : rien de parti, aucun compte créé ni arrêté. */
export function annulable(p: PropositionCkd, arret?: ArretCkd): boolean {
  if (!p.decision || p.envoye_at) return false;
  if (!["garder", "pas_maintenant", "rien", "ne_pas_renouveler"].includes(p.decision)) return false;
  return !(p.decision === "ne_pas_renouveler" && arret?.fait_at);
}

/**
 * Sans décision après le dimanche 12 h (heure de Paris) qui suit le contrôle du
 * samedi : un Recréer ou un Doubler décidé plus tard ne démarrerait que le
 * lundi d'après.
 */
export function enRetard(p: PropositionCkd, type: TypeControle, maintenant: Date = new Date()): boolean {
  if (p.decision || type !== "samedi") return false;
  const jourParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(maintenant);
  const heureParis = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(maintenant),
  );
  const dimanche = new Date(`${p.jour}T12:00:00Z`);
  dimanche.setUTCDate(dimanche.getUTCDate() + 1);
  const jourDimanche = dimanche.toISOString().slice(0, 10);
  return jourParis > jourDimanche || (jourParis === jourDimanche && heureParis >= 12);
}

/** Le lien TikTok d'un handle. */
export function lienTiktok(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return `https://www.tiktok.com/@${handle.replace(/^@/, "")}`;
}

/** Part en pourcentage, arrondie à 0,1 (0 si rien). */
export function pourcentage(partie: number, total: number): number {
  if (!total) return 0;
  return Math.round((partie / total) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Historique : ce que les décisions sont devenues
// ---------------------------------------------------------------------------

export type Tendance = "hausse" | "baisse" | "stable";

/** Part des posts publiés, ou null sans post attendu. */
export function partPubliee(c: ChiffresCkd | null | undefined): number | null {
  if (!c?.attendus) return null;
  return (c.publies ?? 0) / c.attendus;
}

/**
 * Avant → après : la médiane des vues (±20 %) si on l'a des deux côtés, sinon
 * la part des posts publiés (±20 points, pour un absent qui ne postait pas).
 * null tant qu'il n'y a rien à comparer.
 */
export function tendance(avant: ChiffresCkd | null | undefined, apres: ChiffresCkd | null | undefined): Tendance | null {
  if (!avant || !apres) return null;
  const ma = avant.mediane ?? null;
  const mp = apres.mediane ?? null;
  if (ma !== null && mp !== null && ma > 0) {
    const r = mp / ma;
    return r >= 1.2 ? "hausse" : r <= 0.8 ? "baisse" : "stable";
  }
  const pa = partPubliee(avant);
  const pp = partPubliee(apres);
  if (pa === null || pp === null) return null;
  const e = pp - pa;
  return e >= 0.2 ? "hausse" : e <= -0.2 ? "baisse" : "stable";
}

/**
 * La tendance d'une décision : Recréer compare le nouveau compte à l'ancien ;
 * les autres comparent le compte à lui-même. Kill : rien (compte arrêté).
 */
export function tendanceDecision(h: HistoriqueCkd): Tendance | null {
  if (h.decision === "recreer") return tendance(h.avant, h.apres_nouveau);
  if (h.decision === "ne_pas_renouveler") return null;
  return tendance(h.avant, h.apres);
}

export interface ResumeDecision {
  decision: DecisionCkd;
  total: number;
  /** Suivis jusqu'au bout (2 semaines complètes). */
  complets: number;
  hausse: number;
  stable: number;
  baisse: number;
}

/** Par décision : combien, combien suivies jusqu'au bout, et dans quel sens. */
export function resumerHistorique(lignes: HistoriqueCkd[]): ResumeDecision[] {
  const parDecision = new Map<DecisionCkd, ResumeDecision>();
  for (const h of lignes) {
    const r = parDecision.get(h.decision) ??
      { decision: h.decision, total: 0, complets: 0, hausse: 0, stable: 0, baisse: 0 };
    r.total += 1;
    if (h.complet) {
      r.complets += 1;
      const t = tendanceDecision(h);
      if (t) r[t] += 1;
    }
    parDecision.set(h.decision, r);
  }
  const ordre: DecisionCkd[] = ["garder", "pas_maintenant", "doubler", "recreer", "ne_pas_renouveler", "nudge", "rien"];
  return [...parDecision.values()].sort((a, b) => ordre.indexOf(a.decision) - ordre.indexOf(b.decision));
}
