/**
 * 1/11 : « Start Tuesday » (Weekly decisions → Sunday: warm-up). Une recrue pas
 * prête dimanche : Keep (lundi), Start Tuesday (posts à partir de mardi, même
 * cohorte), Postpone (lundi suivant). Sans choix : Start Tuesday au passage de
 * dimanche 22:45 (Paris), juste avant l'assignation des posts du lundi (23:00).
 * Lundi 23:59 : Start warmup pas cliqué avant lundi 12:00 → report.
 * Rien ici ne touche la base ni le réseau.
 */
import { dateAnglaise, type EtatAccueil, FOLLOWS_MIN, type RecrueAccueil } from "./etapes.ts";
import { ajouterJours } from "./ckd.ts";
import { instantLocal } from "./relances.ts";
import { type ElementRelance, type TextesRelance, texteRelance } from "./relance_jour.ts";

export type ChoixDebut = "keep" | "mardi" | "reporter";

export const TEXTE_DEBUT_MARDI =
  "Hi {prenom}, your setup isn't finished yet: {ce_qui_manque}. Finish it by Monday noon and you'll start posting on Tuesday {date}. If it's not done by Monday night, you'll start the following Monday.";

/** Tout ce qui manque encore (pas seulement l'étape due) : la connexion, puis le compte, Start warmup ou les abonnements. */
export function elementsManquants(
  x: Pick<RecrueAccueil, "abonnements" | "warmup_started_at" | "tiktok_existe">,
  etats: readonly EtatAccueil[],
): ElementRelance[] {
  const fait = (e: string) => etats.find((s) => s.etape === e)?.fait ?? true;
  const els: ElementRelance[] = [];
  if (!fait("connexion")) els.push("connexion");
  if (!fait("tiktok") && !x.warmup_started_at) els.push("tiktok");
  else if (!fait("warmup_lance")) els.push("warmup");
  else if ((x.abonnements ?? 0) < FOLLOWS_MIN) els.push("follows");
  return els;
}

/** Le message (et le pop-up du dashboard). Vide : rien ne manque. */
export function texteDebutMardi(
  textes: TextesRelance,
  x: Pick<RecrueAccueil, "prenom" | "handle" | "cohorte_lundi" | "email" | "abonnements" | "warmup_started_at" | "tiktok_existe">,
  etats: readonly EtatAccueil[],
  o: { url: string; lien_etapes: string },
  modele = TEXTE_DEBUT_MARDI,
): string {
  const elements = elementsManquants(x, etats);
  if (!elements.length) return "";
  const follows = Math.max(0, FOLLOWS_MIN - (x.abonnements ?? 0));
  const ceQuiManque = texteRelance({ ...textes, cadre: "{ce_qui_manque}" }, { element: elements[0], elements, needsYou: false, follows }, {
    prenom: x.prenom, handle: x.handle, url: o.url, lien_etapes: o.lien_etapes, cohorte_lundi: x.cohorte_lundi,
    email: x.email,
  });
  return modele
    .replace(/\{prenom\}/g, (x.prenom ?? "").trim() || "there")
    .replace(/\{ce_qui_manque\}/g, ceQuiManque)
    .replace(/\{date\}/g, dateAnglaise(ajouterJours(x.cohorte_lundi, 1)));
}

/** Dimanche 22:45 → lundi 00:00 (Paris) : le choix automatique « Start Tuesday », avant l'assignation de 23:00. */
export function momentChoixAuto(maintenant: Date, lundi: string): boolean {
  const debut = instantLocal(ajouterJours(lundi, -1), 22, "Europe/Paris").getTime() + 45 * 60_000;
  return maintenant.getTime() >= debut && maintenant.getTime() < instantLocal(lundi, 0, "Europe/Paris").getTime();
}

/** Lundi 23:59 → mardi 23:59 (Paris) : le report des « Start Tuesday » sans Start warmup avant lundi 12:00. */
export function momentReportLundi(maintenant: Date, lundi: string): boolean {
  const debut = instantLocal(ajouterJours(lundi, 1), 0, "Europe/Paris").getTime() - 60_000;
  return maintenant.getTime() >= debut && maintenant.getTime() < debut + 24 * 3_600_000;
}
