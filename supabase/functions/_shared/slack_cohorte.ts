/**
 * Ajout d'un poster de la cohorte Ruul dans le salon privé de la cohorte
 * (fonction `hub-slack-cohorte`, docs/hub-posteurs.md).
 *
 * Le lien d'invitation fait entrer dans le workspace, jamais dans un salon
 * privé : le bot retrouve le poster par l'email donné sur le formulaire du
 * site, puis l'invite dans le salon. Il faut au bot les scopes `users:read`,
 * `users:read.email` et `groups:write`, et être lui-même membre du salon.
 */

export type IssueSlack =
  | { cas: "ajoute"; userId: string }
  | { cas: "deja_dedans"; userId: string }
  // Pas (encore) dans le workspace, ou inscrit avec une autre adresse.
  | { cas: "absent" }
  | { cas: "erreur"; erreur: string };

type Fetch = typeof fetch;

async function appelSlack(
  token: string,
  methode: string,
  corps: Record<string, string>,
  fetchFn: Fetch,
): Promise<{ ok: boolean; error?: string; user?: { id?: string } }> {
  const reponse = await fetchFn(`https://slack.com/api/${methode}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corps),
  });
  if (!reponse.ok) return { ok: false, error: `http_${reponse.status}` };
  return await reponse.json();
}

export async function ajouterAuSalon(
  token: string,
  salon: string,
  email: string,
  fetchFn: Fetch = fetch,
): Promise<IssueSlack> {
  const trouve = await appelSlack(token, "users.lookupByEmail", { email }, fetchFn);
  if (!trouve.ok) return trouve.error === "users_not_found" ? { cas: "absent" } : { cas: "erreur", erreur: `lookup: ${trouve.error}` };
  const userId = trouve.user?.id;
  if (!userId) return { cas: "erreur", erreur: "lookup: user sans id" };

  const invite = await appelSlack(token, "conversations.invite", { channel: salon, users: userId }, fetchFn);
  if (invite.ok) return { cas: "ajoute", userId };
  if (invite.error === "already_in_channel") return { cas: "deja_dedans", userId };
  // `not_in_channel` : le bot n'est pas membre du salon (`/invite @bot`).
  return { cas: "erreur", erreur: `invite: ${invite.error}` };
}
