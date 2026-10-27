/**
 * Comment Masters · suivi (0373) : le Done vu sur Slack.
 *
 * Une demande est Done si le bouton a été cliqué (déjà noté en base par
 * `slack-interactions`), OU si une réponse de son fil contient « done » ou ✅,
 * OU si le message porte une réaction ✅. La synchro de 7 h ne lit que les
 * demandes encore ouvertes et ne remplit `fait_at` que s'il est vide : une
 * demande faite n'est jamais réécrite, rien n'est compté deux fois.
 */

type Fetch = typeof fetch;

export interface MessageSlack {
  ts: string;
  user?: string;
  bot_id?: string;
  text?: string;
  reactions?: { name: string; users?: string[] }[];
}

export interface DoneSlack {
  mode: "fil" | "reaction";
  /** L'ID Slack de qui a fait Done (null si Slack ne le dit pas). */
  user: string | null;
  /** Quand : l'heure de la réponse ; pour une réaction, Slack ne la donne pas. */
  at: string | null;
}

/** « done », « Done ! », « done ✅ »… mais pas « undone » ni « abandoned ». */
export function texteDone(texte: string | undefined): boolean {
  if (!texte) return false;
  return /(^|[^\p{L}])done([^\p{L}]|$)/iu.test(texte) || texte.includes("✅") || texte.includes(":white_check_mark:");
}

function heureDuTs(ts: string): string {
  return new Date(Math.round(Number(ts) * 1000)).toISOString();
}

/**
 * Le Done d'un message, d'après son fil (`conversations.replies` : le message
 * d'abord, puis les réponses). La première réponse humaine qui dit « done » ou
 * ✅ l'emporte ; sinon une réaction ✅ sur le message.
 */
export function detecterDone(fil: MessageSlack[]): DoneSlack | null {
  const [parent, ...reponses] = fil;
  if (!parent) return null;
  const reponse = reponses
    .filter((r) => !r.bot_id && texteDone(r.text))
    .sort((a, b) => Number(a.ts) - Number(b.ts))[0];
  if (reponse) return { mode: "fil", user: reponse.user ?? null, at: heureDuTs(reponse.ts) };
  const coche = (parent.reactions ?? []).find((r) => r.name === "white_check_mark");
  if (coche) return { mode: "reaction", user: coche.users?.[0] ?? null, at: null };
  return null;
}

async function appel(
  token: string,
  methode: string,
  params: Record<string, string>,
  fetchFn: Fetch,
): Promise<Record<string, unknown> & { ok: boolean; error?: string }> {
  const reponse = await fetchFn(`https://slack.com/api/${methode}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!reponse.ok) return { ok: false, error: `http_${reponse.status}` };
  return await reponse.json();
}

/** Le fil d'un message (le message, puis ses réponses). */
export async function lireFil(
  token: string,
  canal: string,
  ts: string,
  fetchFn: Fetch = fetch,
): Promise<{ ok: true; fil: MessageSlack[] } | { ok: false; erreur: string }> {
  const r = await appel(token, "conversations.replies", { channel: canal, ts, limit: "200" }, fetchFn);
  if (!r.ok) return { ok: false, erreur: String(r.error ?? "inconnue") };
  return { ok: true, fil: (r.messages ?? []) as MessageSlack[] };
}

/** Le nom d'utilisateur Slack (celui que note le bouton Done), null si illisible. */
export async function nomSlack(token: string, userId: string, fetchFn: Fetch = fetch): Promise<string | null> {
  const r = await appel(token, "users.info", { user: userId }, fetchFn);
  const u = r.ok ? (r.user as { name?: string } | undefined) : undefined;
  return u?.name ?? null;
}

/** Le lien d'un message Slack. */
export function lienMessage(canal: string, ts: string): string {
  return `https://slack.com/archives/${canal}/p${ts.replace(".", "")}`;
}
