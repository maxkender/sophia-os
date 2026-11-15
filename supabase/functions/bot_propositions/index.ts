import { estSecretCron, json, messageErreur, secretCron, secretCronConnu, serviceClient } from "../_shared/supabase.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { type Bot, BOTS_PROBLEMES, botDuJeton, etatSecrets, lireCorps, SECRETS_BOTS } from "../_shared/bot_propositions.ts";
import { journaliser, lireControle, type Mode, modeAgent } from "../_shared/controle.ts";

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
 *
 * 13/11 (escalations, 0706) : « lire » rend aussi la file « À traiter » du bot (demandes Help, Slack,
 * email dont il est responsable) ; « regler » (réponse au posteur → chat Help + email) et « remonter »
 * (pourquoi → chez Max). Ruul Bot (BOT_TOKEN_RUUL) n'a que cette file. Un bot ne paie jamais.
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
      // Ruul Bot : pas de cartes Problèmes (et lire sa file compterait un passage) : le jeton seulement.
      if (!BOTS_PROBLEMES.includes(b)) {
        resultats[b] = { jeton_ok: true };
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

  // 13/11 (refonte, Pay BOT) : la liste « à financer », « finance » (milestone financée), « attente » (OK de Max).
  if (bot === "pay_bot" && ["a_financer", "finance", "attente"].includes(String(corps?.action ?? ""))) {
    try {
      const supabase = serviceClient();
      if (modeAgent(await lireControle(supabase), bot) === "eteint") return json({ ok: false, error: "Paused by the admin: do nothing for now and try again later." });
      const id = String(corps?.id ?? "");
      if (corps?.action !== "a_financer" && !/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "id (uuid) obligatoire" }, 400);
      const { data, error } = corps?.action === "a_financer"
        ? await supabase.rpc("pay_bot_liste")
        : corps?.action === "finance"
        ? await supabase.rpc("pay_bot_finance", { p_id: id })
        : await supabase.rpc("pay_bot_attente", { p_id: id, p_raison: String(corps?.raison ?? "").slice(0, 300) });
      if (error) return json({ ok: false, error: error.message }, 500);
      await supabase.from("bot_appels").insert({ bot, action: `pay_${corps?.action}`, ok: (data as { ok?: boolean })?.ok !== false, args: { id: id || null } });
      return json(data);
    } catch (e) {
      return json({ ok: false, error: messageErreur(e) }, 500);
    }
  }

  const lu = lireCorps(corps);
  if ("erreur" in lu) return json({ ok: false, error: lu.erreur }, 400);

  try {
    const supabase = serviceClient();
    // 13/11 (page Contrôle) : éteint = le bot ne fait rien ; proposer = ses gestes deviennent des propositions pour Max.
    const mode: Mode = modeAgent(await lireControle(supabase), bot);
    if (mode === "eteint") return json({ ok: false, error: "Paused by the admin: do nothing for now and try again later." });
    if (mode === "proposer" && lu.action === "regler") return json(await reglerEnProposition(supabase, bot, lu.args));
    if (mode === "proposer" && lu.action === "faire") return json(await faireEnProposition(supabase, bot, lu.args));
    if (lu.action === "regler" || lu.action === "remonter") return json(await fileSupport(supabase, bot, lu.action, lu.args));
    if (lu.action === "lire") {
      // La file Support du bot (demandes dont il est responsable), plus ses cartes Problèmes s'il en a.
      const { data: f, error: ef } = await supabase.rpc("support_bot", { p_bot: bot, p_action: "lire", p_args: {} });
      if (ef) return json({ ok: false, error: ef.message }, 500);
      const file = f as { ok: boolean; error?: string; demandes?: unknown[]; remontees_chez_max?: number; consigne?: string };
      if (!BOTS_PROBLEMES.includes(bot)) return json(file, file.ok ? 200 : file.error?.startsWith("quota") ? 429 : 400);
      const { data, error } = await supabase.rpc("probleme_bot", { p_bot: bot, p_action: "lire", p_args: lu.args });
      if (error) return json({ ok: false, error: error.message }, 500);
      const r = data as Record<string, unknown> & { ok: boolean; error?: string };
      return json({ ...r, demandes: file.ok ? file.demandes ?? [] : [], demandes_remontees_chez_max: file.remontees_chez_max ?? 0, consigne_demandes: file.consigne },
        r.ok ? 200 : r.error?.startsWith("quota") ? 429 : 400);
    }
    if (!BOTS_PROBLEMES.includes(bot)) return json({ ok: false, error: "Ruul Bot : lire, regler ou remonter seulement" }, 400);
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

/** 13/11 (Contrôle, « proposer ») : « regler » devient une remontée chez Max avec la réponse en brouillon. */
async function reglerEnProposition(supabase: ReturnType<typeof serviceClient>, bot: Bot, args: Record<string, unknown>) {
  const reponse = String(args.reponse ?? "").trim();
  if (reponse.length < 5) return { ok: false, error: "reponse (au posteur) obligatoire" };
  const { data, error } = await supabase.rpc("support_bot", {
    p_bot: bot, p_action: "remonter", p_args: { demande_id: args.demande_id, pourquoi: `Proposé par ${bot} (mode proposer) : réponse en brouillon.` },
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; demande_id?: string };
  if (!r.ok) return r;
  const { data: d } = await supabase.from("support_demandes").update({ brouillon: reponse.slice(0, 4000) }).eq("id", r.demande_id!).select("poster_id").maybeSingle();
  await journaliser(supabase, {
    qui: bot, quoi: "reponse", mode: "proposer", poster_id: (d?.poster_id as string | null) ?? null, demande_id: r.demande_id ?? null,
    resultat: reponse.slice(0, 200), details: { fait: args.fait ?? null },
  });
  return { ok: true, demande_id: r.demande_id, proposition: true };
}

/** 13/11 (Contrôle, « proposer ») : « faire » devient une proposition sur la carte Problèmes (rien ne part). */
async function faireEnProposition(supabase: ReturnType<typeof serviceClient>, bot: Bot, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("probleme_bot", {
    p_bot: bot, p_action: "proposer",
    p_args: { probleme_id: args.probleme_id, action: args.action, reponse: args.reponse, canal: args.canal, diagnostic: args.diagnostic },
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string };
  const { data: p } = await supabase.from("problemes").select("poster_id").eq("id", String(args.probleme_id ?? "")).maybeSingle();
  await journaliser(supabase, {
    qui: bot, quoi: String(args.action ?? "faire"), mode: "proposer", poster_id: (p?.poster_id as string | null) ?? null,
    resultat: r.ok ? `proposé (confiance ${args.confiance ?? "?"})` : `refusé : ${r.error}`, details: { probleme_id: args.probleme_id },
  });
  return { ...r, proposition: true };
}

/**
 * 0706 : régler ou remonter une demande de sa file. Régler : la base note « Réglé par [bot] », puis la
 * réponse part au posteur comme une réponse de l'équipe (chat Help + email « You have a new answer »).
 */
async function fileSupport(supabase: ReturnType<typeof serviceClient>, bot: Bot, action: "regler" | "remonter", args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("support_bot", { p_bot: bot, p_action: action, p_args: args });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; demande_id?: string; reponse?: string };
  if (!r.ok || action !== "regler") return r;
  try {
    const envoi = await appelFonction("support", { action: "repondre", id: r.demande_id, texte: r.reponse });
    await journaliser(supabase, { qui: bot, quoi: "reponse", demande_id: r.demande_id ?? null, resultat: String(r.reponse ?? "").slice(0, 200) });
    return { ok: true, demande_id: r.demande_id, envoi };
  } catch (e) {
    return { ok: false, demande_id: r.demande_id, error: `réglée mais réponse non envoyée : ${messageErreur(e)}` };
  }
}

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
