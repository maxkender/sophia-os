/**
 * Onboarding posters : les nudges. Un message par situation (l'étape où la
 * recrue est bloquée), modifiable dans l'OS (réglage `onboarding_nudges`),
 * envoyé sur Slack (bot « Sophia OS ») ou sur Upwork (conversation du contrat).
 * Sur Upwork, une recrue pas encore sur Slack reçoit aussi le lien Slack.
 */
import { invoke } from "@/features/moteur/api";
import { envoyerSurUpwork } from "@/features/pipeline/api";
import { OS_URL } from "@/features/recrutements/constantes";

import { etapeCourante, type EtapeOnboarding, type RecrueOnboarding } from "./api";

export type Canal = "slack" | "upwork";

/** Le réglage qui garde les messages par situation. */
export const CLE_NUDGES = "onboarding_nudges";

export const NUDGES_DEFAUT: Record<EtapeOnboarding, string> = {
  slack: "Hi {prenom}, you're not on our Slack yet. Join now: {slack}\nUse your PERSONAL email and your FULL NAME (first and last name).",
  connexion: "Hi {prenom}, you haven't logged in to your dashboard yet: {url}\nLogin: {email} · Password: 12345678 (unless you already changed it). Please log in today.",
  tiktok: "Hi {prenom}, please create your TikTok account today: @{handle} (use exactly this name and your personal email). Then click Start warmup on your dashboard: {url}",
  warmup: "Hi {prenom}, your TikTok account @{handle} is ready? Click Start warmup on your dashboard ({url}), then warm it up: scroll a few minutes, like and follow accounts in the general knowledge niche.",
  pret: "Hi {prenom}, keep warming up @{handle}: scroll a few minutes, like and follow at least 5 accounts in the general knowledge niche, and don't post anything yet. You start posting on Monday {cohorte}.",
};

/** Les messages du réglage, complétés par ceux par défaut. */
export function lireNudges(valeur: unknown): Record<EtapeOnboarding, string> {
  const v = valeur && typeof valeur === "object" ? (valeur as Record<string, unknown>) : {};
  return Object.fromEntries(
    (Object.keys(NUDGES_DEFAUT) as EtapeOnboarding[]).map((e) => [e, typeof v[e] === "string" && (v[e] as string).trim() ? (v[e] as string) : NUDGES_DEFAUT[e]]),
  ) as Record<EtapeOnboarding, string>;
}

/** L'étape à relancer : celle où elle est bloquée ; finie, celle du warm-up. */
export function situation(r: RecrueOnboarding): EtapeOnboarding {
  const e = etapeCourante(r);
  return e === "fini" ? "pret" : e;
}

/**
 * Le message rempli. Sur Upwork, une recrue pas encore sur Slack reçoit aussi
 * le lien Slack (s'il n'est pas déjà dans le texte).
 */
export function composerNudge(
  modele: string,
  r: Pick<RecrueOnboarding, "nom" | "email" | "handle" | "slack" | "cohorte_lundi">,
  canal: Canal,
  lienSlack: string,
): string {
  const prenom = (r.nom ?? "").trim().split(/\s+/)[0] || "there";
  const cohorte = r.cohorte_lundi
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${r.cohorte_lundi}T12:00:00Z`))
    : "";
  const valeurs: Record<string, string> = { prenom, url: OS_URL, email: r.email ?? "", handle: r.handle ?? "", cohorte, slack: lienSlack };
  // Une variable inconnue reste telle quelle.
  let texte = modele.replace(/\{(\w+)\}/g, (m, cle: string) => (cle in valeurs ? valeurs[cle] : m));
  if (canal === "upwork" && !r.slack && lienSlack && !texte.includes(lienSlack)) {
    texte += `\n\nJoin our Slack: ${lienSlack} (personal email, full name).`;
  }
  return texte.trim();
}

/** Envoie le nudge : Slack (bot « Sophia OS ») ou Upwork (conversation du contrat). */
export async function envoyerNudge(posterId: string, canal: Canal, texte: string): Promise<void> {
  if (canal === "upwork") {
    await envoyerSurUpwork(posterId, texte, "onboarding_nudge");
    return;
  }
  const r = await invoke<{ ok: boolean; error?: string }>("nudges", { action: "onboarding_slack", poster_id: posterId, texte });
  if (!r.ok) throw new Error(r.error ?? "message Slack non envoyé");
}

/** Qui peut recevoir un nudge sur ce canal : sur Slack, ou avec un contrat Upwork ; pas une recrue finie. */
export function joignable(r: RecrueOnboarding, canal: Canal): boolean {
  return canal === "slack" ? r.slack : Boolean(r.contrat_id);
}
