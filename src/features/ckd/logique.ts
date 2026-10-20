import type { ActionCkd, PropositionCkd, ReglageCkd, SourceReglage } from "./api";

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
