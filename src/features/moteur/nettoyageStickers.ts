/**
 * Nettoyage stickers d'un label (page Slideshows), mené par le serveur
 * (migration 0317, fonction `nettoyer-stickers`) : la page lance la tâche, puis
 * ne fait que lire l'avancement — elle peut être fermée.
 *
 *   scan → a_confirmer : la liste des slideshows à sticker PUB attend l'admin,
 *   qui peut en repêcher un par un, puis « Tout jeter » → retrait (retrait +
 *   remplacement des posts du jour pas encore publiés) → termine. Après coup,
 *   chaque slideshow jeté se repêche encore (remis en valide).
 * Les stickers de contenu restent ; pods, tier A ou mieux et nos applis sont
 * écartés côté serveur.
 */

export type StatutNettoyage = "scan" | "a_confirmer" | "retrait" | "termine" | "annule";

export interface NettoyageStickers {
  id: string;
  label_id: string | null;
  label_nom: string;
  statut: StatutNettoyage;
  total: number;
  pods: number;
  proteges: number;
  sans_images: number;
  created_at: string;
  scan_fini_at: string | null;
  retrait_lance_at: string | null;
  fini_at: string | null;
}

export type StatutSlideshowNettoyage =
  | "a_analyser"
  | "analyse"
  | "propre"
  | "pub"
  | "erreur"
  | "repeche"
  | "retrait"
  | "retire"
  | "garde";

export interface SlideshowNettoyage {
  contenu_id: string;
  titre: string | null;
  tier: string | null;
  contenu_cree_at: string | null;
  slides: Array<{ position: number; url: string; sticker?: "pub" | "contenu" | null; erreur?: string }>;
  statut: StatutSlideshowNettoyage;
  erreur: string | null;
  raison: string | null;
  /** Rempli au retrait : le slideshow a été jeté au moins une fois. */
  avant: Record<string, unknown> | null;
}

export interface CompteursNettoyage {
  slideshows: Partial<Record<StatutSlideshowNettoyage, number>>;
  posts: Partial<Record<string, number>>;
}

export interface LigneJournalNettoyage {
  id: number;
  at: string;
  ligne: string;
}

/** Statuts des slideshows que la liste montre (jetés, à jeter, repêchés, laissés). */
export const STATUTS_LISTE: readonly StatutSlideshowNettoyage[] = ["pub", "repeche", "retrait", "retire", "garde"];

/** La tâche avance côté serveur : la page relit l'avancement. */
export function tourne(statut: StatutNettoyage | null | undefined): boolean {
  return statut === "scan" || statut === "retrait";
}

export interface Avancement {
  /** Slideshows à analyser au départ. */
  total: number;
  analyses: number;
  pubs: number;
  repeches: number;
  erreurs: number;
  retires: number;
  gardes: number;
  posts: { total: number; faits: number; remplaces: number; sansRemplacant: number; ignores: number; erreurs: number };
}

export function avancement(c: CompteursNettoyage | null | undefined): Avancement {
  const s = (k: StatutSlideshowNettoyage) => c?.slideshows?.[k] ?? 0;
  const p = (k: string) => c?.posts?.[k] ?? 0;
  const total = Object.values(c?.slideshows ?? {}).reduce((n, v) => n + (v ?? 0), 0);
  const faits = p("remplace") + p("sans_remplacant") + p("ignore") + p("erreur");
  return {
    total,
    analyses: total - s("a_analyser") - s("analyse"),
    pubs: s("pub") + s("retrait"),
    repeches: s("repeche"),
    erreurs: s("erreur"),
    retires: s("retire"),
    gardes: s("garde"),
    posts: {
      total: faits + p("a_remplacer") + p("remplacement"),
      faits,
      remplaces: p("remplace"),
      sansRemplacant: p("sans_remplacant"),
      ignores: p("ignore"),
      erreurs: p("erreur"),
    },
  };
}

/** Couleur d'une ligne du journal. */
export function tonLigne(ligne: string): "alerte" | "action" | "neutre" {
  if (ligne.includes("✗") || ligne.includes("⚠")) return "alerte";
  if (ligne.includes("↻") || ligne.includes("↩")) return "action";
  return "neutre";
}

/** Durée en m:ss (ou h:mm:ss au-delà d'une heure). */
export function formatDuree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Temps restant estimé au rythme moyen depuis le début, ou null tant qu'on n'a rien fini. */
export function tempsRestant(fait: number, total: number, ecouleMs: number): number | null {
  if (fait <= 0 || total <= fait) return fait >= total && total > 0 ? 0 : null;
  return (ecouleMs / fait) * (total - fait);
}
