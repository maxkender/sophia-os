/**
 * Prompt 13 : les questions des posteurs passent par #questions.
 *
 *   * le message épinglé de #questions (bouton de l'OS, Settings → FAQ bot) ;
 *   * le raccourci de message Slack « Send to OS » : une HM le lance sur le DM
 *     d'un posteur, le message arrive dans To read avec son nom et le lien.
 */

type Fetch = typeof fetch;

/** #questions (lu le 29/10) ; le réglage `slack_questions_canal` le remplace. */
export const CANAL_QUESTIONS_DEFAUT = "C0BL56RJH7T";
export const TEXTE_QUESTIONS_DEFAUT = "Questions: post them in #questions. Please don't DM the team.";
/** Le callback_id du raccourci de message, à déclarer dans l'appli Slack « Sophia OS ». */
export const RACCOURCI_ENVOYER_OS = "send_to_os";

/** Le lien permanent d'un message Slack : https://{domaine}.slack.com/archives/{canal}/p{ts sans point}. */
export function lienMessageSlack(domaine: string | null | undefined, canal: string, ts: string): string {
  return `https://${(domaine ?? "").trim() || "sophia-system"}.slack.com/archives/${canal}/p${ts.replace(".", "")}`;
}

async function appel(jeton: string, methode: string, corps: Record<string, unknown>, fetchFn: Fetch) {
  try {
    const r = await fetchFn(`https://slack.com/api/${methode}`, {
      method: "POST",
      headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(corps),
    });
    if (!r.ok) return { ok: false, error: `http_${r.status}` } as { ok: boolean; error?: string; ts?: string };
    return (await r.json()) as { ok: boolean; error?: string; ts?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Poste le texte dans #questions et l'épingle (scopes chat:write et pins:write ; le bot doit être dans le canal). */
export async function epinglerQuestions(
  jeton: string,
  canal: string,
  texte: string,
  fetchFn: Fetch = fetch,
): Promise<{ ok: boolean; ts: string | null; erreur: string | null }> {
  const poste = await appel(jeton, "chat.postMessage", { channel: canal, text: texte, unfurl_links: false }, fetchFn);
  if (!poste.ok || !poste.ts) return { ok: false, ts: null, erreur: `chat.postMessage : ${poste.error ?? "réponse vide"}` };
  const pin = await appel(jeton, "pins.add", { channel: canal, timestamp: poste.ts }, fetchFn);
  if (!pin.ok) return { ok: false, ts: poste.ts, erreur: `pins.add : ${pin.error ?? "réponse vide"} (message posté, pas épinglé)` };
  return { ok: true, ts: poste.ts, erreur: null };
}
