/**
 * Prompt 21, partie T : à chaque arrêt complet, le posteur est retiré de tous
 * les canaux Slack où il est (conversations.kick ; droits channels:manage et
 * groups:write). #general ne se quitte pas ainsi : il reste, et le compte est
 * à désactiver à la main (liste « To remove from Slack », le lundi 8 h).
 */

export interface CanalSlack {
  id: string;
  name: string | null;
  is_general: boolean;
  is_private: boolean;
  is_archived: boolean;
}

/** Les canaux dont on retire le posteur : tous sauf #general et les archivés. */
export function canauxARetirer(canaux: CanalSlack[]): CanalSlack[] {
  return canaux.filter((c) => !c.is_general && !c.is_archived);
}

type Appel = (methode: string, params: Record<string, string>) => Promise<{ ok: boolean; error?: string; [cle: string]: unknown }>;

/** Un appel à l'API Slack (formulaire), avec le jeton du bot. */
export function appelSlack(jeton: string): Appel {
  return async (methode, params) => {
    const r = await fetch(`https://slack.com/api/${methode}`, {
      method: "POST",
      headers: { authorization: `Bearer ${jeton}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    return (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as { ok: boolean; error?: string };
  };
}

/** Les canaux (publics et privés) où est le posteur, vus par le bot. */
export async function canauxDuPosteur(appel: Appel, slackUser: string): Promise<{ canaux: CanalSlack[]; erreur: string | null }> {
  const canaux: CanalSlack[] = [];
  let curseur = "";
  for (let page = 0; page < 10; page++) {
    const r = await appel("users.conversations", {
      user: slackUser, types: "public_channel,private_channel", exclude_archived: "true", limit: "200",
      ...(curseur ? { cursor: curseur } : {}),
    });
    if (!r.ok) return { canaux, erreur: r.error ?? "users.conversations refusé" };
    // deno-lint-ignore no-explicit-any
    for (const c of ((r.channels ?? []) as any[])) {
      canaux.push({
        id: String(c.id), name: c.name ?? null, is_general: Boolean(c.is_general),
        is_private: Boolean(c.is_private), is_archived: Boolean(c.is_archived),
      });
    }
    // deno-lint-ignore no-explicit-any
    curseur = String((r.response_metadata as any)?.next_cursor ?? "");
    if (!curseur) break;
  }
  return { canaux, erreur: null };
}

export interface BilanRetrait {
  retires: string[];
  echecs: string[];
  /** Simulation (arret_auto = test) : ce qui serait retiré. */
  simules: string[];
}

/**
 * Retire le posteur de chaque canal (sauf #general). Le bot rejoint d'abord un
 * canal public où il n'est pas (« not_in_channel ») ; un canal privé où il
 * n'est pas reste un échec, noté. `reel` = false : rien n'est fait.
 */
export async function retirerDesCanaux(appel: Appel, slackUser: string, reel: boolean): Promise<BilanRetrait & { erreur: string | null }> {
  const { canaux, erreur } = await canauxDuPosteur(appel, slackUser);
  const bilan: BilanRetrait & { erreur: string | null } = { retires: [], echecs: [], simules: [], erreur };
  for (const c of canauxARetirer(canaux)) {
    const nom = `#${c.name ?? c.id}`;
    if (!reel) {
      bilan.simules.push(nom);
      continue;
    }
    let r = await appel("conversations.kick", { channel: c.id, user: slackUser });
    if (!r.ok && r.error === "not_in_channel" && !c.is_private) {
      const rejoint = await appel("conversations.join", { channel: c.id });
      if (rejoint.ok) r = await appel("conversations.kick", { channel: c.id, user: slackUser });
    }
    if (r.ok) bilan.retires.push(nom);
    else bilan.echecs.push(`${nom} : ${r.error ?? "refusé"}`);
  }
  return bilan;
}

/** Une phrase pour l'étape « slack » de l'arrêt. */
export function decrireRetrait(b: BilanRetrait & { erreur: string | null }): string {
  const parts: string[] = [];
  if (b.erreur) parts.push(`canaux illisibles (${b.erreur})`);
  if (b.simules.length) parts.push(`test : serait retiré de ${b.simules.join(", ")}`);
  if (b.retires.length) parts.push(`retiré de ${b.retires.join(", ")}`);
  if (b.echecs.length) parts.push(`échecs : ${b.echecs.join(" ; ")}`);
  if (!parts.length) parts.push("dans aucun canal (hors #general)");
  parts.push("compte à désactiver (To remove from Slack)");
  return parts.join(" · ");
}
