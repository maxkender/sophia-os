/**
 * Dashboard de cohorte de la HM (sa page d'accueil) : les données du Cohort
 * tracking de Check, Kill or Double, limitées à ses posteurs (0360), dites en
 * mots simples. Rien ici ne touche la base.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { EtatEtape } from "@/features/moteur/etapes";

import type { CompteCohorte } from "./api";
import { bilanCompte, etatWarmup, JOURS_AVANT_RELANCE, type EtatWarmup } from "./logique";

/** Une raison de relancer, en une ligne (clé i18n + valeurs). */
export interface Raison {
  cle:
    | "zeroPostHier"
    | "postsHier"
    | "tiktokPasCree"
    | "startPasClique"
    | "warmupPasCommence"
    | "compteIntrouvable"
    | "sansWarmup"
    | "warmupFaible"
    | "aucunPostPublie"
    | "postsManquants";
  valeurs?: Record<string, number>;
}

export interface AFaire {
  compte: CompteCohorte;
  /** Cohorte qui poste cette semaine, ou en warm-up pour la suivante. */
  cohorte: "poste" | "warmup";
  raisons: Raison[];
}

/** Ce qui cloche hier pour un compte qui poste (rien le lundi : pas de posts le dimanche). */
export function raisonsPoste(c: CompteCohorte, aujourdhui: string): Raison[] {
  const hier = ajouterJours(aujourdhui, -1);
  const posts = c.posts.filter((p) => p.jour === hier);
  if (posts.length === 0) return [];
  const publies = posts.filter((p) => p.url).length;
  if (publies === 0) return [{ cle: "zeroPostHier" }];
  if (publies < posts.length) return [{ cle: "postsHier", valeurs: { publies, prevus: posts.length } }];
  return [];
}

/** Ce qui manque à un compte en warm-up, une fois le délai de relance passé. */
export function raisonsWarmup(e: EtatWarmup): Raison[] {
  if (e.ageJours < JOURS_AVANT_RELANCE) return [];
  const raisons: Raison[] = [];
  if (e.tiktok !== "cree") raisons.push({ cle: "tiktokPasCree" });
  else if (!e.warmup) raisons.push({ cle: "warmupPasCommence" });
  if (!e.start) raisons.push({ cle: "startPasClique" });
  return raisons;
}

/** « À faire aujourd'hui » : les posteurs actifs à relancer, ceux qui postent d'abord. */
export function aFaireAujourdhui(poste: CompteCohorte[], warmup: CompteCohorte[], aujourdhui: string): AFaire[] {
  const lignes: AFaire[] = [
    ...poste.filter((c) => c.is_active).map((compte) => ({
      compte,
      cohorte: "poste" as const,
      raisons: raisonsPoste(compte, aujourdhui),
    })),
    ...warmup.filter((c) => c.is_active).map((compte) => ({
      compte,
      cohorte: "warmup" as const,
      raisons: raisonsWarmup(etatWarmup(compte, aujourdhui)),
    })),
  ];
  return lignes.filter((l) => l.raisons.length > 0);
}

export interface LigneSemaine {
  compte: CompteCohorte;
  jour: { publies: number; prevus: number };
  semaine: { publies: number; prevus: number };
  statut: "ok" | "a_relancer";
}

/**
 * « Cette semaine » : le problème du compte, dit en clair. Le compte TikTok
 * introuvable d'abord (rien d'autre ne compte tant qu'il n'existe pas), puis
 * le warm-up (0 follow : pas de warm-up ; moins de 5 : warm-up insuffisant),
 * puis les posts : aucun publié, ou combien manquent.
 */
export function problemesSemaine(c: CompteCohorte, etat: EtatEtape, aujourdhui: string): Raison[] {
  if (etat.etape === "not_created") return [{ cle: "compteIntrouvable" }];
  const raisons: Raison[] = [];
  const follows = followsWarmup(c);
  if (follows === 0) raisons.push({ cle: "sansWarmup" });
  else if (follows !== null && follows < FOLLOWS_WARMUP) {
    raisons.push({ cle: "warmupFaible", valeurs: { n: follows, min: FOLLOWS_WARMUP } });
  }
  const bilan = bilanCompte(c, aujourdhui);
  if (bilan.manques > 0) {
    raisons.push(
      bilan.publies === 0 ? { cle: "aucunPostPublie" } : { cle: "postsManquants", valeurs: { n: bilan.manques } },
    );
  }
  return raisons;
}

/** « Cette semaine » : posts du jour x/2, posts de la semaine, OK ou À relancer. */
export function ligneSemaine(c: CompteCohorte, aujourdhui: string): LigneSemaine {
  const duJour = c.posts.filter((p) => p.jour === aujourdhui);
  const semaine = c.posts.filter((p) => p.jour <= aujourdhui);
  const bilan = bilanCompte(c, aujourdhui);
  return {
    compte: c,
    jour: { publies: duJour.filter((p) => p.url).length, prevus: duJour.length },
    semaine: { publies: semaine.filter((p) => p.url).length, prevus: semaine.length },
    statut: bilan.manques > 0 ? "a_relancer" : "ok",
  };
}

export interface LigneWarmup {
  compte: CompteCohorte;
  etat: EtatWarmup;
  statut: "pret" | "en_cours" | "a_relancer";
  raisons: Raison[];
}

/** « Semaine prochaine » : prêt, en cours, ou à relancer (avec ce qui manque). */
export function ligneWarmup(c: CompteCohorte, aujourdhui: string): LigneWarmup {
  const etat = etatWarmup(c, aujourdhui);
  const raisons = raisonsWarmup(etat);
  const statut = etat.statut === "pret" ? "pret" : raisons.length > 0 ? "a_relancer" : "en_cours";
  return { compte: c, etat, statut, raisons };
}

/** Le minimum de follows d'un warm-up (consigne de l'accueil). */
export const FOLLOWS_WARMUP = 5;

/**
 * Les follows du compte relevés pendant le warm-up (le plus haut relevé), null
 * s'ils n'ont jamais été lus : un relevé raté ne prouve rien, on n'accuse pas.
 */
export function followsWarmup(c: CompteCohorte): number | null {
  const lus = c.releves.map((r) => r.abonnements).filter((n): n is number => n !== null);
  return lus.length > 0 ? Math.max(...lus) : null;
}

/** Le compte a déjà publié au moins un post (le report de cohorte est alors refusé). */
export function aPublie(c: CompteCohorte): boolean {
  return c.posts.some((p) => p.url);
}
