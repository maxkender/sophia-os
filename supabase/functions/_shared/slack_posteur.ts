/**
 * Message Slack direct au posteur quand son compte est recréé (0368).
 *
 * Le posteur est retrouvé par son email perso, puis par son email de connexion
 * (`users.lookupByEmail`). Le bot qui écrit est « Sophia OS »
 * (SLACK_HM_BOT_TOKEN, `chat:write`). Si ce bot n'a pas le droit de lire les
 * emails (`missing_scope`), la recherche passe par un second jeton qui l'a
 * (SLACK_BOT_TOKEN2, celui du salon de la cohorte Ruul) : l'ID d'un membre est
 * le même pour tous les bots du workspace.
 */

type Fetch = typeof fetch;

export type IssueMessagePosteur =
  | { statut: "envoye"; userId: string }
  | { statut: "introuvable" }
  | { statut: "erreur"; erreur: string };

async function appel(
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

/** L'ID Slack du posteur, `null` s'il n'est dans le workspace sous aucune de ses adresses. */
export async function trouverPosteur(
  jetons: { ecriture: string; lecture?: string | null },
  emails: (string | null | undefined)[],
  fetchFn: Fetch = fetch,
): Promise<{ userId: string } | { userId: null; erreur?: string }> {
  const adresses = [...new Set(emails.map((e) => e?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))];
  for (const email of adresses) {
    let r = await appel(jetons.ecriture, "users.lookupByEmail", { email }, fetchFn);
    if (!r.ok && r.error === "missing_scope" && jetons.lecture) {
      r = await appel(jetons.lecture, "users.lookupByEmail", { email }, fetchFn);
    }
    if (r.ok && r.user?.id) return { userId: r.user.id };
    if (r.error && r.error !== "users_not_found") return { userId: null, erreur: `lookup: ${r.error}` };
  }
  return { userId: null };
}

/** Le texte (en anglais) : même information que le bandeau de son espace. */
export function texteRecreation(o: { ancien: string; nouveau: string; le: string; lundi: string }): string {
  return (
    `Your TikTok account @${o.ancien} has been replaced by @${o.nouveau} on ${o.le}. ` +
    `Please create @${o.nouveau} on TikTok and press "Start warmup" in the OS before Sunday midnight. ` +
    `Your posts resume on Monday ${o.lundi}.`
  );
}

/** Retrouve le posteur et lui écrit. Ne lève jamais : l'issue est rendue. */
export async function prevenirPosteur(
  jetons: { ecriture: string; lecture?: string | null },
  emails: (string | null | undefined)[],
  texte: string,
  fetchFn: Fetch = fetch,
): Promise<IssueMessagePosteur> {
  try {
    const trouve = await trouverPosteur(jetons, emails, fetchFn);
    if (!trouve.userId) return "erreur" in trouve && trouve.erreur ? { statut: "erreur", erreur: trouve.erreur } : { statut: "introuvable" };
    const envoi = await appel(jetons.ecriture, "chat.postMessage", { channel: trouve.userId, text: texte }, fetchFn);
    if (!envoi.ok) return { statut: "erreur", erreur: `postMessage: ${envoi.error}` };
    return { statut: "envoye", userId: trouve.userId };
  } catch (e) {
    return { statut: "erreur", erreur: e instanceof Error ? e.message : String(e) };
  }
}
