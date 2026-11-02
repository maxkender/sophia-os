/**
 * Prompt 27 : les messages des posteurs dans les canaux Slack (#questions, les
 * canaux de zone…), gardés pour la colonne Context de la masterlist. Le bot
 * FAQ ne garde que ce qu'il traite ; ici, tout message humain des canaux où
 * est l'appli, sans rien classer ni répondre.
 */
type Fetch = typeof fetch;

export interface MessageSlack {
  canal: string;
  ts: string;
  slack_user: string;
  texte: string;
  at: string;
  fil_ts: string | null;
}

// deno-lint-ignore no-explicit-any
export function messageAGarder(canal: string | null | undefined, m: any): MessageSlack | null {
  if (!canal || !m?.user || !m?.ts || m.bot_id) return null;
  if (m.subtype && m.subtype !== "thread_broadcast" && m.subtype !== "file_share") return null;
  const texte = String(m.text ?? "").trim();
  if (!texte) return null;
  const at = new Date(Number(m.ts) * 1000);
  if (Number.isNaN(at.getTime())) return null;
  return {
    canal, ts: String(m.ts), slack_user: String(m.user), texte: texte.slice(0, 4000), at: at.toISOString(),
    fil_ts: m.thread_ts && m.thread_ts !== m.ts ? String(m.thread_ts) : null,
  };
}

async function get(jeton: string, methode: string, params: Record<string, string>, fetchFn: Fetch) {
  const url = `https://slack.com/api/${methode}?${new URLSearchParams(params)}`;
  const r = await fetchFn(url, { headers: { authorization: `Bearer ${jeton}` } });
  if (!r.ok) return { ok: false, error: `http_${r.status}` };
  // deno-lint-ignore no-explicit-any
  return (await r.json()) as any;
}

/** Les canaux (publics et privés) où est l'appli. */
export async function canauxDuBot(jeton: string, fetchFn: Fetch = fetch): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const r = await get(jeton, "users.conversations", { types: "public_channel,private_channel", exclude_archived: "true", limit: "200", ...(cursor ? { cursor } : {}) }, fetchFn);
    if (!r.ok) throw new Error(`users.conversations : ${r.error ?? "erreur"}`);
    // deno-lint-ignore no-explicit-any
    for (const c of r.channels ?? []) ids.push(String((c as any).id));
    cursor = r.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return ids;
}

/** L'historique d'un canal depuis `depuis` (secondes), fils compris. */
export async function historiqueCanal(jeton: string, canal: string, depuis: number, fetchFn: Fetch = fetch): Promise<MessageSlack[]> {
  const lignes: MessageSlack[] = [];
  const fils: string[] = [];
  let cursor = "";
  for (let page = 0; page < 30; page++) {
    const r = await get(jeton, "conversations.history", { channel: canal, oldest: String(depuis), limit: "200", ...(cursor ? { cursor } : {}) }, fetchFn);
    if (!r.ok) throw new Error(`conversations.history ${canal} : ${r.error ?? "erreur"}`);
    for (const m of r.messages ?? []) {
      const l = messageAGarder(canal, m);
      if (l) lignes.push(l);
      if (Number(m.reply_count ?? 0) > 0 && m.ts) fils.push(String(m.ts));
    }
    cursor = r.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  for (const ts of fils) {
    const r = await get(jeton, "conversations.replies", { channel: canal, ts, limit: "200" }, fetchFn);
    if (!r.ok) continue;
    for (const m of r.messages ?? []) {
      if (m.ts === ts) continue;
      const l = messageAGarder(canal, m);
      if (l) lignes.push(l);
    }
  }
  // Un message « also sent to channel » revient dans le canal et dans son fil : une seule ligne.
  const vus = new Map<string, MessageSlack>();
  for (const l of lignes) if (!vus.has(l.ts)) vus.set(l.ts, l);
  return [...vus.values()];
}
