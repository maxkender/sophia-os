import type { RegionCommentMaster, StatsCommentMasters } from "./api";

/*
 * Copies des réglages de `supabase/functions/_shared/comment_masters.ts`,
 * affichées dans la page. Un test lit le source Deno pour vérifier qu'elles
 * n'ont pas divergé.
 */
export const CADENCE_RELEVE_MIN = 120;
export const AGE_ABANDON_MIN = 360;
export const PART_SEUIL_ABANDON = 0.2;
export const LIENS_PAR_LOT = 50;
export const PRIX_RELEVE_USD = 0.0023;
export const PRIX_COMMENTAIRE_USD = 0.00075;
export const CIBLE_DECLENCHEMENT = 0.05;
export const SEUIL_PLANCHER = 3000;

/** Bonus des comment masters : 10 $ par tranche de 20 commentaires (Done) dans le mois. */
export const COMMENTAIRES_PAR_BONUS = 20;
export const BONUS_USD = 10;

/** Premier jour du mois en cours à Paris, AAAA-MM-01. */
export function moisParis(date: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
  return `${jour.slice(0, 7)}-01`;
}

export function decalerMois(mois: string, delta: number): string {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function bonus(faits: number): { dollars: number; resteAvantProchain: number } {
  return {
    dollars: Math.floor(faits / COMMENTAIRES_PAR_BONUS) * BONUS_USD,
    resteAvantProchain: COMMENTAIRES_PAR_BONUS - (faits % COMMENTAIRES_PAR_BONUS),
  };
}

/** Coût Apify estimé : posts relevés, et commentaires relus à 48 h. */
export function coutEstime(releves: number, commentaires: number): number {
  return releves * PRIX_RELEVE_USD + commentaires * PRIX_COMMENTAIRE_USD;
}

/** Part des posts suivis jusqu'au bout qui ont déclenché un commentaire. */
export function tauxDeclenchement(declenches: number, conclus: number): number | null {
  return conclus > 0 ? declenches / conclus : null;
}

/** Le canal en place est-il celui que la fonction a vérifié (bot membre) ? */
export function canalVerifie(r: Pick<RegionCommentMaster, "slack_channel_id" | "slack_verifie_canal">): boolean {
  return Boolean(r.slack_channel_id) && r.slack_channel_id === r.slack_verifie_canal;
}

export type Manque = "comment_master" | "canal" | "verification";

/**
 * Où en est la région : active, prête à allumer, ou incomplète — avec ce qui
 * manque. La base refuse d'allumer une région incomplète (migration 0321).
 */
export function etatRegion(r: RegionCommentMaster): { etat: "active" | "prete" | "incomplete"; manques: Manque[] } {
  const manques: Manque[] = [];
  if (!r.comment_master_id) manques.push("comment_master");
  if (!r.slack_channel_id) manques.push("canal");
  else if (!canalVerifie(r)) manques.push("verification");
  if (r.actif) return { etat: "active", manques };
  return { etat: manques.length === 0 ? "prete" : "incomplete", manques };
}

const ERREURS_CONNUES = new Set([
  "not_in_channel",
  "channel_not_found",
  "is_archived",
  "missing_scope",
  "canal_absent",
  "comment_master_absent",
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "ratelimited",
]);

/**
 * Code d'erreur Slack (ou de l'OS) → clé de traduction `commentMasters.erreurs.*`.
 * `missing_scope:groups:read` porte le droit manquant.
 */
export function erreurSlack(code: string | null | undefined): { cle: string; droit?: string } | null {
  if (!code) return null;
  const [base, ...reste] = code.split(":");
  const cle = ERREURS_CONNUES.has(base) ? base : "inconnue";
  return reste.length ? { cle, droit: reste.join(":") } : { cle };
}

/** Le bot n'est pas dans le canal (ou ne le voit pas) : il faut l'y inviter. */
export function fautInviterBot(code: string | null | undefined): boolean {
  const base = code?.split(":")[0];
  return base === "not_in_channel" || base === "channel_not_found";
}

export function seuilValide(valeur: number): boolean {
  return Number.isInteger(valeur) && valeur >= SEUIL_PLANCHER;
}

/** Les régions actives d'abord, puis par nom de langue. */
export function regionsTriees<T extends Pick<RegionCommentMaster, "langue" | "actif">>(
  regions: T[],
  nomLangue: (code: string) => string,
): T[] {
  return [...regions].sort(
    (a, b) => Number(b.actif) - Number(a.actif) || nomLangue(a.langue).localeCompare(nomLangue(b.langue)),
  );
}

/** Commentaires faits dans le mois par personne pour une région, du plus actif au moins actif. */
export function faitsDeRegion(stats: StatsCommentMasters | undefined, langue: string) {
  return (stats?.faits ?? [])
    .filter((f) => f.langue === langue)
    .sort((a, b) => b.faits - a.faits);
}
