import { blocsSlack, signatureSlackValide } from "../_shared/comment_masters.ts";
import {
  ACTION_DONE,
  blocsZone,
  COLONNES_PROPOSITION,
  majRecap,
  type PropositionSlack,
  zonesDe,
} from "../_shared/ckd.ts";
import { BOUTONS, libelleBouton, lireLibellesBoutons } from "../_shared/reponses.ts";
import { json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Point d'entrée « Interactivity » des deux applis Slack de l'OS :
 *   * comment masters (SLACK_SIGNING_SECRET) : le bouton « ✅ Done » sous
 *     chaque post à commenter ;
 *   * « Sophia OS » (SLACK_HM_SIGNING_SECRET) : le bouton « ✅ Done » sous
 *     chaque décision Check, Kill or Double (samedi) et chaque posteur à
 *     relancer (jeudi), dans le fil de la zone du HM ; et, sous chaque message
 *     de l'OS à un posteur (partie E, 0406), « Done » / « I need help » /
 *     « I want to stop » → `posteur_reponses` (canal bouton).
 *
 * Appelée par Slack, pas par un cron ni par l'OS : pas de x-cron-secret ni de
 * JWT, c'est la signature Slack qui authentifie (l'un ou l'autre secret).
 * Slack exige une réponse en moins de 3 s ; le message est mis à jour via
 * `response_url`, sans jeton bot.
 */
Deno.serve(async (request) => {
  // Pas de signature, pas de Slack : 401 comme toute fonction appelée sans
  // preuve (c'est aussi ce que vérifie le workflow de déploiement).
  const signature = request.headers.get("x-slack-signature");
  if (!signature) return json({ error: "unauthorized" }, 401);

  const secrets = [Deno.env.get("SLACK_SIGNING_SECRET"), Deno.env.get("SLACK_HM_SIGNING_SECRET")].filter(Boolean) as string[];
  if (secrets.length === 0) return json({ error: "SLACK_SIGNING_SECRET manquant" }, 500);

  const corps = await request.text();
  const horodatage = request.headers.get("x-slack-request-timestamp");
  let valide = false;
  for (const secret of secrets) {
    if (await signatureSlackValide(secret, horodatage, corps, signature)) {
      valide = true;
      break;
    }
  }
  if (!valide) return json({ error: "signature Slack invalide" }, 401);

  try {
    const payload = JSON.parse(new URLSearchParams(corps).get("payload") ?? "{}");
    const action = payload?.actions?.[0];
    if (payload?.type !== "block_actions") return new Response("", { status: 200 });
    if (action?.action_id === "comment_fait") await commentFait(payload, action);
    else if (action?.action_id === "envoi_main_fait") await envoiMainFait(payload, action);
    else if (action?.action_id && action.action_id in BOUTONS) await boutonPosteur(payload, action);
    else if (action?.action_id === ACTION_DONE) {
      // Plusieurs lectures et deux écritures Slack : on répond d'abord à Slack
      // (3 s max), la suite tourne derrière.
      const travail = ckdFait(payload, action).catch((e) => console.error("slack-interactions ckd", messageErreur(e)));
      // deno-lint-ignore no-explicit-any
      const edge = (globalThis as any).EdgeRuntime;
      if (edge?.waitUntil) edge.waitUntil(travail);
      else await travail;
    }
    return new Response("", { status: 200 });
  } catch (error) {
    // 200 quand même : sinon Slack affiche une erreur à celui qui a cliqué, qui
    // n'y peut rien. L'échec reste visible dans les logs de la fonction.
    console.error("slack-interactions", messageErreur(error));
    return new Response("", { status: 200 });
  }
});

/**
 * Un bouton sous un message de l'OS : une ligne `posteur_reponses` (canal
 * bouton, un clic par message et par bouton), classée sans IA par
 * recrues-check. Le message garde son texte, les boutons laissent place à
 * « Thanks, noted. » (libellés du réglage `slack_boutons`).
 */
// deno-lint-ignore no-explicit-any
async function boutonPosteur(payload: any, action: any) {
  const supabase = serviceClient();
  const userId = String(payload?.user?.id ?? "");
  const ts = String(payload?.message?.ts ?? payload?.container?.message_ts ?? "");
  const { data: profil } = await supabase.from("profiles").select("id").eq("slack_user_id", userId).maybeSingle();
  if (!profil?.id || !ts) return;
  const { error } = await supabase.from("posteur_reponses").insert({
    poster_id: profil.id,
    canal: "bouton",
    source_id: `${ts}:${action.action_id}`,
    texte: BOUTONS[action.action_id]!.texte,
  });
  if (error && error.code !== "23505") throw error;
  if (payload.response_url) {
    // Les libellés du réglage `slack_boutons` (0411).
    const { data: regl } = await supabase.from("reglages").select("valeur").eq("cle", "slack_boutons").maybeSingle();
    const l = lireLibellesBoutons(regl?.valeur);
    // deno-lint-ignore no-explicit-any
    const section = (payload.message?.blocks ?? []).filter((b: any) => b?.type === "section");
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replace_original: true,
        text: payload.message?.text ?? "",
        blocks: [...section, { type: "context", elements: [{ type: "mrkdwn", text: `✅ ${libelleBouton(action.action_id, l)} · ${l.merci}` }] }],
      }),
    }).catch(() => undefined);
  }
}

/**
 * Prompt 25 v4 (0442) : « Sent » sous un message à envoyer à la main (DM à la
 * HM, Upwork plein) : le message est noté parti (Upwork, par la HM) ; la ligne
 * du DM devient « ✅ Sent ».
 */
// deno-lint-ignore no-explicit-any
async function envoiMainFait(payload: any, action: any) {
  const supabase = serviceClient();
  const v = JSON.parse(String(action.value ?? "{}")) as { p?: string; t?: string; d?: string };
  const { data: hm } = await supabase.from("hm_slack").select("profile_id").eq("slack_user_id", String(payload?.user?.id ?? "")).maybeSingle();
  const { error } = await supabase.rpc("envoi_main_fait", { p_poster: v.p, p_type: v.t, p_periode: v.d, p_par: hm?.profile_id ?? null });
  if (!payload.response_url) return;
  const note = error ? `⚠️ Not logged: ${error.message}` : "✅ Sent, logged in the OS";
  // deno-lint-ignore no-explicit-any
  const blocks = (payload.message?.blocks ?? []).map((b: any) =>
    b?.block_id === action.block_id ? { type: "context", elements: [{ type: "mrkdwn", text: note }] } : b
  );
  await fetch(payload.response_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replace_original: true, text: payload.message?.text ?? "", blocks }),
  }).catch(() => undefined);
}

// deno-lint-ignore no-explicit-any
async function commentFait(payload: any, action: any) {
  const supabase = serviceClient();
  const utilisateur = payload.user ?? {};
  // `is fait_at null` : un double clic ne réécrit pas l'heure du premier.
  await supabase
    .from("comment_master_demandes")
    .update({
      fait_at: new Date().toISOString(),
      fait_par: utilisateur.username ?? utilisateur.name ?? utilisateur.id,
      // Comment Masters · suivi (0373) : d'où vient le Done, et qui l'a fait.
      fait_slack_id: utilisateur.id ?? null,
      fait_source: "bouton",
      fait_mode: "bouton",
    })
    .eq("id", action.value)
    .is("fait_at", null);

  const { data: d, error } = await supabase
    .from("comment_master_demandes")
    .select("id, langue, pays, application, publie_url, vues_declenchement, age_minutes, commentaire, traduction_en, fait_at, comptes(handle_tiktok)")
    .eq("id", action.value)
    .single();
  if (error) throw error;

  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d.fait_at!));
  const demande = {
    ...d,
    application: d.application ?? "",
    age_minutes: d.age_minutes ?? 0,
    handle: (d.comptes as unknown as { handle_tiktok: string | null } | null)?.handle_tiktok ?? null,
  };
  await fetch(payload.response_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replace_original: true,
      text: `Done: ${d.commentaire}`,
      blocks: blocsSlack(demande, { par: utilisateur.id, heure }),
    }),
  });
}

/**
 * Done sur une décision Check, Kill or Double : noté sur la proposition (la
 * page le montre), le message de la zone et le récap sont réécrits. Pour un
 * Kill, la case « demandé au HM » de la page Surveillance est cochée.
 */
// deno-lint-ignore no-explicit-any
async function ckdFait(payload: any, action: any) {
  const supabase = serviceClient();
  const utilisateur = payload.user ?? {};
  await supabase
    .from("ckd_propositions")
    .update({ fait_at: new Date().toISOString(), fait_par: utilisateur.id ?? null })
    .eq("id", action.value)
    .is("fait_at", null);

  const { data: p, error } = await supabase
    .from("ckd_propositions")
    .select("id, controle_id, compte_id, decision, slack_ts")
    .eq("id", action.value)
    .single();
  if (error) throw error;
  if (p.decision === "ne_pas_renouveler") {
    await supabase
      .from("comptes")
      .update({ non_renouveler_hm_demande: true, non_renouveler_hm_demande_at: new Date().toISOString() })
      .eq("id", p.compte_id)
      .eq("non_renouveler_hm_demande", false);
  }

  const [{ data: controle, error: errC }, { data: memes, error: errM }] = await Promise.all([
    supabase.from("ckd_controles").select("type, jour").eq("id", p.controle_id).single(),
    supabase.from("ckd_propositions").select(COLONNES_PROPOSITION).eq("controle_id", p.controle_id).eq("slack_ts", p.slack_ts),
  ]);
  if (errC) throw errC;
  if (errM) throw errM;
  const [zone] = await zonesDe(supabase, (memes ?? []) as PropositionSlack[]);
  if (zone) {
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replace_original: true,
        text: `Check, Kill or Double: ${zone.zone ?? zone.hmNom}`,
        blocks: blocsZone(controle.type, zone, controle.jour),
      }),
    });
  }

  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (jeton) await majRecap(supabase, jeton, p.controle_id);
}
