/**
 * Banc d'essai de l'agent de relecture (/admin/banc-relecture) : l'agent relit
 * un lot de vrais posts sans rien envoyer, l'admin juge chaque résultat. Les
 * jugements vivent dans `relecture_avis` (migration 0293).
 *
 *   ✓ / ✗ sur chaque point relevé (ceux de la review ET ceux gardés pour plus tard) ;
 *   « raté » : un défaut que l'agent n'a pas vu, avec ce qui ne va pas ;
 *   « rien à signaler » : l'agent n'a rien relevé, et il a raison.
 */
import { postQuiMarche, type DefautRelecture, type RelectureAuto } from "./relectureAgent";

export type VerdictAvis = "juste" | "faux" | "rate";

export interface AvisRelecture {
  id: string;
  relecture_id: string;
  /** « code|slides » d'un point, `CLE_AUCUN`, ou « rate:… » pour un raté. */
  cle: string;
  code: string;
  verdict: VerdictAvis;
  commentaire: string | null;
  detail: string | null;
}

/** L'agent n'a rien relevé et l'admin est d'accord. */
export const CLE_AUCUN = "aucun";

/** Ce qu'un raté peut viser : les règles qui peuvent partir en review, plus « autre ». */
export const CODES_RATE = [
  "justification",
  "largeur",
  "taille",
  "hierarchie",
  "alignement",
  "couleur",
  "effet",
  "autre",
] as const;

/** Clé stable d'un point relevé : un jugement survit au rechargement de la page. */
export function cleDefaut(d: Pick<DefautRelecture, "code" | "slides">): string {
  return `${d.code}|${d.slides.join(",")}`;
}

export function nouvelleCleRate(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `rate:${id}`;
}

/** Les points à juger : tous ceux qui pourraient partir chez le créateur (pas les notes). */
export function pointsAJuger(r: Pick<RelectureAuto, "defauts">): DefautRelecture[] {
  return r.defauts.filter((d) => d.niveau === "remarque");
}

/** Seules les relectures terminées avec un verdict se jugent (pas les ignorées ni les échecs). */
export function estJugeable(r: Pick<RelectureAuto, "statut">): boolean {
  return r.statut === "fait";
}

/**
 * Le post est-il jugé ? Tous ses points ont un ✓ ou un ✗ ; sans point relevé,
 * l'admin a dit « rien à signaler » ou noté un raté.
 */
export function estJuge(r: Pick<RelectureAuto, "defauts" | "statut">, avis: AvisRelecture[]): boolean {
  if (!estJugeable(r)) return false;
  const points = pointsAJuger(r);
  if (points.length === 0) return avis.some((a) => a.cle === CLE_AUCUN || a.verdict === "rate");
  const juges = new Set(avis.filter((a) => a.verdict !== "rate").map((a) => a.cle));
  return points.every((p) => juges.has(cleDefaut(p)));
}

export interface CompteRegle {
  juste: number;
  faux: number;
  rate: number;
}

export interface StatsBanc {
  /** Relectures du jour, tous statuts. */
  total: number;
  /** Relectures avec un verdict de l'agent (statut « fait »). */
  jugeables: number;
  /** L'agent n'a pas pu relire (ignorée, échec). */
  horsBanc: number;
  /** Encore en cours chez l'agent. */
  enCours: number;
  juges: number;
  /** Relectures qui produiraient un message au créateur. */
  proposees: number;
  /** Sans message parce que le post marche (au-delà du seuil de vues). */
  quiMarchent: number;
  justes: number;
  faux: number;
  rates: number;
  /** Posts sans point où l'admin confirme qu'il n'y avait rien à dire. */
  aucunConfirme: number;
  /** Par règle, triée par nombre de jugements décroissant. */
  parRegle: { code: string; compte: CompteRegle }[];
}

export function statsBanc(
  relectures: (Pick<RelectureAuto, "statut" | "defauts" | "brouillon" | "vues"> & { id: string })[],
  avisParRelecture: Record<string, AvisRelecture[]>,
): StatsBanc {
  const s: StatsBanc = {
    total: relectures.length,
    jugeables: 0,
    horsBanc: 0,
    enCours: 0,
    juges: 0,
    proposees: 0,
    quiMarchent: 0,
    justes: 0,
    faux: 0,
    rates: 0,
    aucunConfirme: 0,
    parRegle: [],
  };
  const regles = new Map<string, CompteRegle>();
  const regle = (code: string) => {
    let c = regles.get(code);
    if (!c) {
      c = { juste: 0, faux: 0, rate: 0 };
      regles.set(code, c);
    }
    return c;
  };

  for (const r of relectures) {
    if (r.statut === "ignore" || r.statut === "echec") {
      s.horsBanc += 1;
      continue;
    }
    if (!estJugeable(r)) {
      s.enCours += 1;
      continue;
    }
    s.jugeables += 1;
    if (r.brouillon) s.proposees += 1;
    if (postQuiMarche(r)) s.quiMarchent += 1;
    const avis = avisParRelecture[r.id] ?? [];
    if (estJuge(r, avis)) s.juges += 1;
    // Seuls les points encore relevés comptent : un jugement d'un point disparu
    // (relecture rejugée depuis) ne dit plus rien de la règle actuelle.
    const actuels = new Set(pointsAJuger(r).map(cleDefaut));
    for (const a of avis) {
      if (a.verdict === "rate") {
        s.rates += 1;
        regle(a.code).rate += 1;
      } else if (a.cle === CLE_AUCUN) {
        s.aucunConfirme += 1;
      } else if (actuels.has(a.cle)) {
        if (a.verdict === "juste") s.justes += 1;
        else s.faux += 1;
        regle(a.code)[a.verdict] += 1;
      }
    }
  }

  s.parRegle = [...regles.entries()]
    .map(([code, compte]) => ({ code, compte }))
    .sort(
      (a, b) =>
        b.compte.juste + b.compte.faux + b.compte.rate - (a.compte.juste + a.compte.faux + a.compte.rate) ||
        a.code.localeCompare(b.code),
    );
  return s;
}

/** « 82 % » ; null tant qu'il n'y a rien à diviser. */
export function pourcentage(n: number, sur: number): number | null {
  return sur > 0 ? Math.round((100 * n) / sur) : null;
}

const VERDICTS: VerdictAvis[] = ["juste", "faux", "rate"];

/** Ligne brute de `relecture_avis` → avis propre (null si inutilisable). */
export function normaliserAvis(row: Record<string, unknown>): AvisRelecture | null {
  const verdict = VERDICTS.find((v) => v === row.verdict);
  if (typeof row.id !== "string" || typeof row.relecture_id !== "string" || !verdict) return null;
  if (typeof row.cle !== "string" || typeof row.code !== "string") return null;
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    id: row.id,
    relecture_id: row.relecture_id,
    cle: row.cle,
    code: row.code,
    verdict,
    commentaire: texte(row.commentaire),
    detail: texte(row.detail),
  };
}

/** `{ relecture_id → avis[] }`. */
export function grouperAvis(avis: AvisRelecture[]): Record<string, AvisRelecture[]> {
  const out: Record<string, AvisRelecture[]> = {};
  for (const a of avis) (out[a.relecture_id] ??= []).push(a);
  return out;
}
