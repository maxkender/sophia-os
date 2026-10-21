/**
 * Alertes Slack, par webhook entrant.
 *
 * Un webhook entrant plutôt qu'un jeton de bot : c'est une seule URL, sans
 * expiration et sans OAuth à renouveler, liée à un seul salon. Pour prévenir
 * qu'un chiffre est faux, c'est tout ce qu'il faut, et c'est une pièce de
 * moins qui peut casser à 3 h du matin.
 *
 * Secret attendu : `SLACK_WEBHOOK_TARGET_UPDATES`, posé côté Supabase.
 */

export function webhookTargetUpdates(): string | null {
  return Deno.env.get("SLACK_WEBHOOK_TARGET_UPDATES") ?? null;
}

/**
 * Poste un message, et ne fait JAMAIS échouer l'appelant.
 *
 * Une alerte est un service rendu, pas une étape du travail : si Slack est
 * indisponible ou si le secret n'est pas posé, le job doit quand même écrire
 * ses chiffres. On rend ce qui s'est passé pour que l'appelant puisse le dire
 * dans sa réponse, plutôt que de lever.
 */
export async function alerterSlack(
  texte: string,
): Promise<{ envoye: boolean; raison?: string }> {
  const url = webhookTargetUpdates();
  if (!url) return { envoye: false, raison: "SLACK_WEBHOOK_TARGET_UPDATES absent" };

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: texte }),
    });
    if (!reponse.ok) {
      return { envoye: false, raison: `Slack ${reponse.status} ${(await reponse.text()).slice(0, 200)}` };
    }
    return { envoye: true };
  } catch (erreur) {
    return { envoye: false, raison: String(erreur).slice(0, 200) };
  }
}
