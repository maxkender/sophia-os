/**
 * 19/11 (Max) : les relances Ruul partaient à l'adresse de connexion (@sophia.com), qui n'est pas une vraie boîte
 * (refus 550 5.4.1 Access denied, puis « blocked » par Brevo). Une adresse de connexion n'est jamais un destinataire.
 * Un DM Slack en pause (interrupteur slack_dm_posteurs) n'est pas une erreur d'envoi.
 */
import { DM_SLACK_PAUSE } from "./slack_posteur.ts";

export const ADRESSE_CONNEXION = "adresse de connexion @sophia.com (pas une vraie boîte)";

export function adresseDeConnexion(email: string | null | undefined): boolean {
  return /@sophia\.com\s*$/i.test(email ?? "");
}

export function slackEnPause(r: { statut: string; erreur?: unknown } | { statut: string }): boolean {
  return "erreur" in r && r.erreur === DM_SLACK_PAUSE;
}
