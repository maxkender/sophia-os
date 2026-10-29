/**
 * Prompt 25 MAJ, point 7a : relier un posteur à son compte Slack de façon sûre.
 *
 * 1. « Connect my Slack » (Sign in with Slack, OpenID Connect) : le posteur
 *    se connecte à Slack depuis son dashboard ; Slack nous dit qui il est.
 *    Secrets : SLACK_CLIENT_ID, SLACK_CLIENT_SECRET (l'appli Slack), et
 *    l'URL de retour `{dashboard}/lier-slack` déclarée dans l'appli. Sans eux,
 *    le bouton ne s'affiche pas.
 * 2. À l'arrivée dans le workspace (team_join), s'il n'est relié à personne :
 *    un DM du bot « Welcome! Click here to link your account: {lien} », avec
 *    un lien personnel (`slack_liens_jetons`, 0450). Interrupteur
 *    `slack_lien_dm_auto` (off par défaut).
 */
// deno-lint-ignore-file no-explicit-any

type Fetch = typeof fetch;

export const URL_AUTORISATION_SLACK = "https://slack.com/openid/connect/authorize";

/** L'URL « Sign in with Slack » (scope openid : on ne lit que l'identité). */
export function urlConnexionSlack(o: { clientId: string; redirectUri: string; state: string; nonce: string; team?: string | null }): string {
  const q = new URLSearchParams({
    response_type: "code",
    scope: "openid",
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    state: o.state,
    nonce: o.nonce,
  });
  if (o.team) q.set("team", o.team);
  return `${URL_AUTORISATION_SLACK}?${q.toString()}`;
}

/** Échange le code contre l'identité Slack (user_id, team_id). Ne lève jamais. */
export async function identiteSlack(
  o: { code: string; redirectUri: string; clientId: string; clientSecret: string },
  fetchFn: Fetch = fetch,
): Promise<{ slack_user_id: string | null; team_id: string | null; erreur: string | null }> {
  try {
    const r = await fetchFn("https://slack.com/api/openid.connect.token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, code: o.code, redirect_uri: o.redirectUri }),
    });
    const jeton: any = await r.json().catch(() => null);
    if (!jeton?.ok || !jeton.access_token) return { slack_user_id: null, team_id: null, erreur: `token : ${jeton?.error ?? r.status}` };
    const u = await fetchFn("https://slack.com/api/openid.connect.userInfo", {
      method: "POST",
      headers: { authorization: `Bearer ${jeton.access_token}` },
    });
    const info: any = await u.json().catch(() => null);
    if (!info?.ok) return { slack_user_id: null, team_id: null, erreur: `userInfo : ${info?.error ?? u.status}` };
    const id = info["https://slack.com/user_id"] ?? null;
    return { slack_user_id: typeof id === "string" ? id : null, team_id: info["https://slack.com/team_id"] ?? null, erreur: id ? null : "user_id absent" };
  } catch (e) {
    return { slack_user_id: null, team_id: null, erreur: e instanceof Error ? e.message : String(e) };
  }
}

export const TEXTE_LIEN_DM_DEFAUT = "Welcome! Click here to link your account: {lien}";

export function texteLienDm(modele: string | null | undefined, lien: string): string {
  const m = typeof modele === "string" && modele.trim() ? modele.trim() : TEXTE_LIEN_DM_DEFAUT;
  return m.includes("{lien}") ? m.replaceAll("{lien}", lien) : `${m} ${lien}`;
}

export function lienJeton(osUrl: string, jeton: string): string {
  return `${osUrl.replace(/\/$/, "")}/lier-slack?t=${encodeURIComponent(jeton)}`;
}

/** Le mode de l'interrupteur (`slack_lien_dm_auto`) : off par défaut. */
export function modeLienDm(v: unknown): "off" | "test" | "on" {
  return v === "on" || v === "test" ? v : "off";
}

/**
 * team_join, membre relié à personne : le lien personnel ; sur « on », le DM
 * part (bot Sophia OS). Sur « test », le lien est créé, rien ne part. Ne lève jamais.
 */
export async function proposerLienSlack(
  db: any,
  slackUserId: string,
  o: { osUrl: string; ecriture: string | null; fetchFn?: Fetch },
): Promise<{ statut: "off" | "test" | "envoye" | "erreur"; erreur?: string }> {
  try {
    const { data: regs } = await db.from("reglages").select("cle, valeur").in("cle", ["slack_lien_dm_auto", "slack_lien_dm_texte"]);
    const v = Object.fromEntries(((regs ?? []) as { cle: string; valeur: unknown }[]).map((x) => [x.cle, x.valeur]));
    const mode = modeLienDm(v.slack_lien_dm_auto);
    if (mode === "off") return { statut: "off" };
    const { data: jeton, error } = await db.rpc("slack_jeton_creer", { p_slack: slackUserId });
    if (error || typeof jeton !== "string") return { statut: "erreur", erreur: error?.message ?? "jeton" };
    if (mode === "test") {
      await db.from("slack_liens_jetons").update({ dm_erreur: "test : rien n'est parti" }).eq("jeton", jeton);
      return { statut: "test" };
    }
    if (!o.ecriture) return { statut: "erreur", erreur: "SLACK_HM_BOT_TOKEN manquant" };
    const texte = texteLienDm(v.slack_lien_dm_texte as string | null, lienJeton(o.osUrl, jeton));
    const r = await (o.fetchFn ?? fetch)("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${o.ecriture}` },
      body: JSON.stringify({ channel: slackUserId, text: texte }),
    });
    const corps: any = await r.json().catch(() => null);
    if (!corps?.ok) {
      await db.from("slack_liens_jetons").update({ dm_erreur: String(corps?.error ?? r.status) }).eq("jeton", jeton);
      return { statut: "erreur", erreur: String(corps?.error ?? r.status) };
    }
    await db.from("slack_liens_jetons").update({ dm_at: new Date().toISOString(), dm_erreur: null }).eq("jeton", jeton);
    return { statut: "envoye" };
  } catch (e) {
    return { statut: "erreur", erreur: e instanceof Error ? e.message : String(e) };
  }
}
