/**
 * « Semaine prochaine » en étapes : où en est chaque compte avant ses premiers
 * posts du lundi, et la phrase à envoyer au posteur s'il est en retard. Rien
 * ici ne touche la base.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

import { FOLLOWS_WARMUP } from "../cohorte/dashboardHm";
import { ecartJours, JOURS_AVANT_RELANCE, jourParis } from "../cohorte/logique";
import type { CompteSemaine } from "./api";

export const ETAPES = ["compteOs", "tiktok", "start", "warmup", "exigences", "pret"] as const;
export type CleEtape = (typeof ETAPES)[number];
export type StatutEtape = "fait" | "a_faire" | "en_retard";

/** Les reposts demandés pendant le warm-up (consigne de l'accueil). */
export const REPOSTS_WARMUP = 2;

export interface Etape {
  cle: CleEtape;
  statut: StatutEtape;
  /** Le jour où l'étape a été faite (AAAA-MM-JJ, heure de Paris). */
  le: string | null;
}

export interface EtatSemaine {
  etapes: Etape[];
  /** Les follows et likes les plus hauts relevés, null s'ils n'ont jamais été lus. */
  follows: number | null;
  likes: number | null;
  /** La première étape en retard : c'est elle que la phrase au posteur demande. */
  retard: CleEtape | null;
  pret: boolean;
}

function max(valeurs: (number | null)[]): number | null {
  const lus = valeurs.filter((n): n is number => n !== null);
  return lus.length > 0 ? Math.max(...lus) : null;
}

/**
 * Les 6 étapes d'un compte. En retard :
 *   - compte TikTok et Start warmup : 2 jours après la création dans l'OS
 *     (comme la relance de l'accueil) ;
 *   - warm-up commencé, 5 follows + 2 reposts : à partir du samedi ;
 *   - prêt pour lundi : jamais en retard avant dimanche minuit (la date limite).
 */
export function etatSemaine(c: CompteSemaine, lundi: string, aujourdhui: string): EtatSemaine {
  const lus = c.releves.filter((r) => r.existe !== null);
  const existants = lus.filter((r) => r.existe === true);
  const dernier = lus[lus.length - 1];
  const tiktokFait = dernier?.existe === true;
  const follows = max(existants.map((r) => r.abonnements));
  const likes = max(existants.map((r) => r.likes));
  const actif = existants.find((r) => (r.abonnements ?? 0) + (r.likes ?? 0) > 0);
  const assez = existants.find((r) => (r.abonnements ?? 0) >= FOLLOWS_WARMUP);

  const creeOs = jourParis(c.cree_le);
  const relance = ecartJours(creeOs, aujourdhui) >= JOURS_AVANT_RELANCE;
  const samedi = aujourdhui >= ajouterJours(lundi, -2);

  const statut = (fait: boolean, retard: boolean): StatutEtape => (fait ? "fait" : retard ? "en_retard" : "a_faire");
  const creeTiktok = existants.find((r) => r.cree_tiktok_at)?.cree_tiktok_at ?? existants[0]?.at ?? null;
  const exigencesFaites = Boolean(assez) && Boolean(c.reposts_le);
  const finExigences = [assez?.at, c.reposts_le].filter((x): x is string => Boolean(x)).sort();

  const etapes: Etape[] = [
    { cle: "compteOs", statut: "fait", le: creeOs },
    { cle: "tiktok", statut: statut(tiktokFait, relance), le: tiktokFait && creeTiktok ? jourParis(creeTiktok) : null },
    {
      cle: "start",
      statut: statut(Boolean(c.warmup_lance_le), relance),
      le: c.warmup_lance_le ? jourParis(c.warmup_lance_le) : null,
    },
    { cle: "warmup", statut: statut(Boolean(actif), samedi), le: actif ? jourParis(actif.at) : null },
    {
      cle: "exigences",
      statut: statut(exigencesFaites, samedi),
      le: exigencesFaites ? jourParis(finExigences[finExigences.length - 1]!) : null,
    },
  ];
  const pret = etapes.every((e) => e.statut === "fait");
  etapes.push({ cle: "pret", statut: pret ? "fait" : "a_faire", le: null });
  return { etapes, follows, likes, retard: etapes.find((e) => e.statut === "en_retard")?.cle ?? null, pret };
}

/**
 * La phrase à envoyer au posteur sur Slack, en anglais comme tous les messages
 * aux posteurs, pour la première étape en retard.
 */
export function phrasePosteur(
  e: EtatSemaine,
  o: { prenom: string; handle: string | null; reposts: boolean },
): string | null {
  if (!e.retard) return null;
  const compte = o.handle ? `@${o.handle}` : "your TikTok account";
  const fin = "Deadline: Sunday midnight, otherwise your start moves to the following week.";
  const bonjour = `Hi ${o.prenom}!`;
  switch (e.retard) {
    case "tiktok":
      return `${bonjour} ${compte} isn't created on TikTok yet. Please create it today, then press "Start warmup" in the OS. ${fin}`;
    case "start":
      return `${bonjour} Please press "Start warmup" in the OS for ${compte} today, then warm it up: scroll at least 10 minutes a day, like and follow accounts in your niche. ${fin}`;
    case "warmup":
      return `${bonjour} The warm-up on ${compte} hasn't started yet: scroll at least 10 minutes a day, like and follow accounts in your niche. No warm-up = no pay. ${fin}`;
    case "exigences": {
      const manque = [
        (e.follows ?? 0) < FOLLOWS_WARMUP ? `follow at least ${FOLLOWS_WARMUP} accounts (you have ${e.follows ?? 0})` : null,
        !o.reposts ? `repost ${REPOSTS_WARMUP} videos and tick "I did 2 reposts" in the OS` : null,
      ].filter(Boolean);
      return `${bonjour} Before Monday, on ${compte}: ${manque.join(", and ")}. ${fin}`;
    }
    default:
      return null;
  }
}

/** Le prénom, pour la phrase : le premier mot du nom. */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] || "there";
}
