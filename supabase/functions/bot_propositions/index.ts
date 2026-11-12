import { estSecretCron, json, messageErreur, secretCron, secretCronConnu, serviceClient } from "../_shared/supabase.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { type Bot, botDuJeton, etatSecrets, lireCorps, SECRETS_BOTS } from "../_shared/bot_propositions.ts";

/**
 * Bloc C, C8 (2/11) : l'entrée des 3 bots (new_cohort_bot, control_bot,
 * pay_bot) sur la page Problèmes. Un jeton par bot (secrets Supabase
 * BOT_TOKEN_NEW_COHORT, BOT_TOKEN_CONTROL, BOT_TOKEN_PAY), jamais renvoyé.
 *
 * Un bot peut UNIQUEMENT lire (ses problèmes et leur contexte, 0525), proposer
 * (réponse + action) sur un problème ouvert, ou créer un problème pour un
 * posteur existant. Il ne valide, n'envoie, ne
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
  const corps = await request.json().catch(() => null) as Record<string, unknown> | null;

  // 3/11 : auto-test (secret des crons seulement) : chacun des 3 vrais jetons passe par le même
  // contrôle Bearer puis « lire ». Rend des nombres, jamais un jeton. Chaque lecture est notée dans bot_appels.
  if (corps?.action === "test_jetons" && await estSecretCron(request.headers.get("x-cron-secret"))) {
    const resultats: Record<string, unknown> = {};
    for (const b of Object.keys(SECRETS_BOTS) as Bot[]) {
      const jeton = secrets[b];
      const reconnu = jeton ? botDuJeton(`Bearer ${jeton}`, secrets) : null;
      if (reconnu !== b) {
        resultats[b] = { jeton_ok: false };
        continue;
      }
      const { data, error } = await serviceClient().rpc("probleme_bot", { p_bot: b, p_action: "lire", p_args: {} });
      const r = data as { ok?: boolean; problemes?: unknown[]; posteurs?: unknown[]; regles?: unknown[]; feedbacks?: unknown[]; error?: string } | null;
      resultats[b] = error || !r?.ok ? { jeton_ok: true, erreur: error?.message ?? r?.error } : {
        jeton_ok: true, problemes: r.problemes?.length ?? 0, posteurs: r.posteurs?.length ?? 0,
        regles: r.regles?.length ?? 0, feedbacks: r.feedbacks?.length ?? 0,
      };
    }
    return json({ ok: true, resultats });
  }

  const bot = botDuJeton(request.headers.get("authorization"), secrets);
  if (!bot) return json({ ok: false, error: "jeton refusé" }, 401);

  const lu = lireCorps(corps);
  if ("erreur" in lu) return json({ ok: false, error: lu.erreur }, 400);

  try {
    const supabase = serviceClient();
    if (lu.action === "faire") return json(await faire(supabase, bot, lu.args));
    const { data, error } = await supabase.rpc("probleme_bot", { p_bot: bot, p_action: lu.action, p_args: lu.args });
    if (error) return json({ ok: false, error: error.message }, 500);
    const r = data as { ok: boolean; error?: string; probleme_id?: string };
    return json(r, r.ok ? 200 : r.error?.startsWith("quota") ? 429 : 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

const LIGNE_STOP = "If you don't wish to continue, just reply STOP here.";

/** Appelle une autre fonction de l'OS avec le secret des crons. */
async function appelFonction(nom: string, corps: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  await secretCron();
  const secret = secretCronConnu();
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${nom}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) },
    body: JSON.stringify(corps),
  });
  const data = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error ?? `${nom} : HTTP ${r.status}`);
  return data;
}

/**
 * 0535 : le bot agit seul. Les garde-fous sont dans probleme_bot_faire
 * (autonomie_bots sur on, confiance ≥ 0,8, jamais d'argent, 1 message par
 * personne et par 24 h, 8 h - 22 h chez le posteur, STOP sûr seulement) ; puis
 * l'action et le message (Upwork depuis le compte de Max, ou DM Slack) ; tout
 * est noté dans bot_actions.
 */
async function faire(supabase: ReturnType<typeof serviceClient>, bot: Bot, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("probleme_bot_faire", { p_bot: bot, p_args: args });
  if (error) return { ok: false, error: error.message };
  const plan = data as {
    ok: boolean; error?: string; bot_action_id?: string; action?: string; poster_id?: string | null; hm_id?: string | null;
    compte_id?: string | null; canal?: string; message?: string | null;
  };
  if (!plan.ok) return plan;
  let erreur: string | null = null;
  try {
    if (plan.action === "resend_password_link" && plan.poster_id) {
      await appelFonction("recrues-check", { action: "lien_mot_de_passe_envoyer", poster_id: plan.poster_id });
    }
    if (plan.action === "reread_tiktok" && plan.compte_id) {
      await appelFonction("ckd", { action: "releve_compte", compte_id: plan.compte_id });
    }
    const message = plan.message?.trim();
    if (message) {
      if (plan.action === "message_hm") {
        if (!plan.hm_id) throw new Error("pas d'HM reliée");
        const issue = await ecrireAuPosteur(supabase, plan.hm_id, message);
        if (issue.statut !== "envoye") throw new Error("erreur" in issue ? issue.erreur : issue.statut);
      } else if (plan.poster_id && plan.canal === "slack") {
        // 0684 : après un STOP, seule la confirmation d'arrêt part.
        const issue = await ecrireAuPosteur(supabase, plan.poster_id, message, fetch, undefined, plan.action === "stop" ? { malgreStop: "confirmation_arret" } : {});
        if (issue.statut !== "envoye") throw new Error("erreur" in issue ? issue.erreur : issue.statut);
      } else if (plan.poster_id) {
        const texte = plan.action === "stop" ? message : `${message}\n\n${LIGNE_STOP}`;
        await appelFonction("upwork", { action: "message_posteur", poster_id: plan.poster_id, texte, type: `bot_${plan.action}` });
      }
    }
  } catch (e) {
    erreur = messageErreur(e);
  }
  await supabase.rpc("probleme_bot_fait", { p_id: plan.bot_action_id, p_ok: erreur === null, p_erreur: erreur });
  return erreur === null ? { ok: true, bot_action_id: plan.bot_action_id } : { ok: false, error: erreur, bot_action_id: plan.bot_action_id };
}
