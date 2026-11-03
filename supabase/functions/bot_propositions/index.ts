import { json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { type Bot, botDuJeton, etatSecrets, lireCorps, SECRETS_BOTS } from "../_shared/bot_propositions.ts";

/**
 * Bloc C, C8 (2/11) : l'entrée des 3 bots (new_cohort_bot, control_bot,
 * pay_bot) sur la page Problèmes. Un jeton par bot (secrets Supabase
 * BOT_TOKEN_NEW_COHORT, BOT_TOKEN_CONTROL, BOT_TOKEN_PAY), jamais renvoyé.
 *
 * Un bot peut UNIQUEMENT proposer (réponse + action) sur un problème ouvert,
 * ou créer un problème pour un posteur existant. Il ne valide, n'envoie, ne
 * kill, ne paie ni ne modifie rien d'autre. 200 appels par jour et par bot,
 * chacun noté dans `bot_appels` (probleme_bot(), 0517).
 */
Deno.serve(async (request) => {
  const secrets = Object.fromEntries(
    (Object.keys(SECRETS_BOTS) as Bot[]).map((b) => [b, Deno.env.get(SECRETS_BOTS[b])]),
  ) as Partial<Record<Bot, string | undefined>>;
  // 3/11 : GET ?etat : quels secrets sont posés (oui / non), jamais leur valeur.
  if (request.method === "GET" && new URL(request.url).searchParams.has("etat")) return json({ ok: true, secrets: etatSecrets(secrets) });
  if (request.method !== "POST") return json({ ok: false, error: "POST attendu" }, 405);
  const bot = botDuJeton(request.headers.get("authorization"), secrets);
  if (!bot) return json({ ok: false, error: "jeton refusé" }, 401);

  const lu = lireCorps(await request.json().catch(() => null));
  if ("erreur" in lu) return json({ ok: false, error: lu.erreur }, 400);

  try {
    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("probleme_bot", { p_bot: bot, p_action: lu.action, p_args: lu.args });
    if (error) return json({ ok: false, error: error.message }, 500);
    const r = data as { ok: boolean; error?: string; probleme_id?: string };
    return json(r, r.ok ? 200 : r.error?.startsWith("quota") ? 429 : 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});
