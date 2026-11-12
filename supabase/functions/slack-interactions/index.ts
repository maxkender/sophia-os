import { blocsSlack, signatureSlackValide } from "../_shared/comment_masters.ts";
import {
  ACTION_DONE,
  blocsZone,
  COLONNES_PROPOSITION,
  majRecap,
  type PropositionSlack,
  zonesDe,
} from "../_shared/ckd.ts";
import {
  AIDE_CALLBACK,
  BOUTONS,
  libelleBouton,
  lireDemandeAide,
  lireLibellesBoutons,
  vueAide,
} from "../_shared/reponses.ts";
import { depuisAideSlack } from "../_shared/support.ts";
import { lienMessageSlack, RACCOURCI_ENVOYER_OS } from "../_shared/slack_questions.ts";
import { lirePhraseBonus, personneSure, raisonBonus, type PersonneProche } from "../_shared/bonus.ts";
import { json, messageErreur, secretCron, serviceClient } from "../_shared/supabase.ts";

/**
 * Point d'entrée « Interactivity » des deux applis Slack de l'OS :
 *   * comment masters (SLACK_SIGNING_SECRET) : le bouton « ✅ Done » sous
 *     chaque post à commenter ;
 *   * « Sophia OS » (SLACK_HM_SIGNING_SECRET) : le bouton « ✅ Done » sous
 *     chaque décision Check, Kill or Double (samedi) et chaque posteur à
 *     relancer (jeudi), dans le fil de la zone du HM ; et, sous chaque message
 *     de l'OS à un posteur (partie E, 0406), « Done » / « I need help » /
 *     « I want to stop » → `posteur_reponses` (canal bouton) ; et le raccourci
 *     de message « Send to OS » (prompt 13) → To read.
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
    // 0564 : la commande /bonus (Max, Adrien) : un bonus en une phrase, à valider sur la carte « Bonus de lundi ».
    const formulaire = new URLSearchParams(corps);
    if (formulaire.get("command") === "/bonus") return await commandeBonus(formulaire);
    const payload = JSON.parse(formulaire.get("payload") ?? "{}");
    const action = payload?.actions?.[0];
    // Prompt 13 : le raccourci de message « Send to OS » (une HM, sur le DM d'un posteur).
    if (payload?.type === "message_action" && payload?.callback_id === RACCOURCI_ENVOYER_OS) {
      const travail = envoyerVersOs(payload).catch((e) => console.error("slack-interactions send_to_os", messageErreur(e)));
      // deno-lint-ignore no-explicit-any
      const edge = (globalThis as any).EdgeRuntime;
      if (edge?.waitUntil) edge.waitUntil(travail);
      else await travail;
      return new Response("", { status: 200 });
    }
    // 6/11 : la fenêtre « I need help » envoyée (un choix, la question, une capture facultative).
    if (payload?.type === "view_submission" && payload?.view?.callback_id === AIDE_CALLBACK) {
      return await envoyerAide(payload);
    }
    if (payload?.type !== "block_actions") return new Response("", { status: 200 });
    if (action?.action_id === "comment_fait") await commentFait(payload, action);
    else if (action?.action_id === "envoi_main_fait") await envoiMainFait(payload, action);
    // 6/11 : « I need help » ouvre la fenêtre (plus de carte vide) ; sans fenêtre possible, l'ancien clic.
    else if (action?.action_id === "posteur_aide" && (await ouvrirAide(payload))) return new Response("", { status: 200 });
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
 * Prompt 13 : « Send to OS » (raccourci de message, callback_id send_to_os).
 * Une HM (ou un admin relié dans hm_slack) le lance sur un message d'un
 * posteur : le message entre dans To read (posteur_reponses, liste a_lire,
 * sans réponse automatique), avec le nom du posteur et le lien du message.
 * La HM voit la réponse en message éphémère.
 */
// deno-lint-ignore no-explicit-any
async function envoyerVersOs(payload: any) {
  const supabase = serviceClient();
  const dire = async (texte: string) => {
    if (!payload.response_url) return;
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text: texte }),
    }).catch(() => undefined);
  };
  const { data: hm } = await supabase.from("hm_slack").select("profile_id").eq("slack_user_id", String(payload?.user?.id ?? "")).maybeSingle();
  if (!hm?.profile_id) return await dire("Only a hiring manager linked in the OS can send a message to the OS.");
  const auteur = String(payload?.message?.user ?? "");
  const ts = String(payload?.message?.ts ?? "");
  const canal = String(payload?.channel?.id ?? "");
  if (!auteur || !ts || !canal) return await dire("This message has no author: nothing was sent.");
  const { data: posteur } = await supabase.from("profiles").select("id, prenom, nom").eq("slack_user_id", auteur).maybeSingle();
  if (!posteur?.id) return await dire("This message isn't from a poster linked to Slack in the OS: nothing was sent.");
  const nom = [posteur.prenom, posteur.nom].filter(Boolean).join(" ") || "poster";
  const { error } = await supabase.from("posteur_reponses").insert({
    poster_id: posteur.id,
    canal: "slack",
    source_id: `os:${canal}:${ts}`,
    texte: String(payload?.message?.text ?? ""),
    statut: "classe",
    cas: "a_lire",
    liste: "a_lire",
    traite_at: new Date().toISOString(),
    lien: lienMessageSlack(payload?.team?.domain, canal, ts),
    transmis_par: hm.profile_id,
  });
  if (error && error.code === "23505") return await dire(`Already in the OS (To read) for ${nom}.`);
  if (error) throw error;
  await dire(`Sent to the OS: To read, ${nom}.`);
}

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
 * 6/11 : « I need help » ouvre une fenêtre Slack : [My post / my images]
 * [My link] [TikTok] [Login] [Pay] [Other], la question (obligatoire) et une
 * capture (facultative). Le trigger_id ne vit que 3 s : on l'ouvre avant de
 * répondre à Slack. false si la fenêtre n'a pas pu s'ouvrir.
 */
// deno-lint-ignore no-explicit-any
async function ouvrirAide(payload: any): Promise<boolean> {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  const trigger = String(payload?.trigger_id ?? "");
  if (!jeton || !trigger) return false;
  const vue = vueAide({
    ts: String(payload?.message?.ts ?? payload?.container?.message_ts ?? ""),
    canal: payload?.channel?.id ?? payload?.container?.channel_id ?? null,
    response_url: payload?.response_url ?? null,
  });
  try {
    const r = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ trigger_id: trigger, view: vue }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) console.error("slack-interactions views.open", j?.error ?? r.status);
    return Boolean(j?.ok);
  } catch (e) {
    console.error("slack-interactions views.open", messageErreur(e));
    return false;
  }
}

/**
 * La fenêtre envoyée : une demande dans Support (0671, page admin « Support »),
 * question ou problème selon le sujet, avec sa question et le lien de la capture.
 * La réponse de l'équipe lui revient en message privé et sur Help.
 */
// deno-lint-ignore no-explicit-any
async function envoyerAide(payload: any): Promise<Response> {
  const demande = lireDemandeAide(payload?.view?.state?.values);
  if (!demande) {
    return json({ response_action: "errors", errors: { texte: "Please write your question." } });
  }
  const supabase = serviceClient();
  const userId = String(payload?.user?.id ?? "");
  const { data: profil } = await supabase.from("profiles").select("id").eq("slack_user_id", userId).maybeSingle();
  let meta: { ts?: string; canal?: string | null; response_url?: string | null } = {};
  try {
    meta = JSON.parse(String(payload?.view?.private_metadata ?? "{}"));
  } catch {
    meta = {};
  }
  if (!profil?.id) {
    return json({ response_action: "errors", errors: { texte: "We couldn't find your account. Please write in #questions." } });
  }
  // 11/11 (0671) : la demande arrive dans Support (page admin), plus dans Problèmes.
  const { type, categorie } = depuisAideSlack(demande.categorie);
  const { data: ajout, error } = await supabase.rpc("support_ajouter", {
    p: {
      poster_id: profil.id, type, categorie, texte: demande.texte, source: "slack_aide", escalader: true,
      capture: demande.captures.join(" ") || null,
    },
  });
  if (!error && categorie === "paiement" && (ajout as { fusion?: boolean } | null)?.fusion === false) {
    // Paiement : alerte à Max tout de suite (la tâche support-alertes rattrape un échec).
    const alerte = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/support`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": (await secretCron()) ?? "" },
      body: JSON.stringify({ action: "alertes" }),
    }).catch(() => undefined);
    // deno-lint-ignore no-explicit-any
    const edgeA = (globalThis as any).EdgeRuntime;
    if (edgeA?.waitUntil) edgeA.waitUntil(alerte);
  }
  if (error) {
    console.error("slack-interactions aide", messageErreur(error));
    return json({ response_action: "errors", errors: { texte: "Not sent, please try again." } });
  }
  if (meta.response_url) {
    const marque = fetch(meta.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replace_original: false,
        response_type: "ephemeral",
        text: "✅ Thanks, your request was sent to the team. You'll get an answer here and on Help in your dashboard.",
      }),
    }).catch(() => undefined);
    // deno-lint-ignore no-explicit-any
    const edge = (globalThis as any).EdgeRuntime;
    if (edge?.waitUntil) edge.waitUntil(marque);
    else await marque;
  }
  return new Response("", { status: 200 });
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

/**
 * 0564 : « /bonus donne 2 $ de bonus à Martin Befeld lundi, raison test ».
 * Seulement les comptes Slack de `reglages.bonus_slack_autorises` (Max,
 * Adrien). La ligne est « à valider » sur la carte « Bonus de lundi » : rien ne
 * part sans « Tout envoyer ». Réponse visible de l'auteur seul.
 */
async function commandeBonus(f: URLSearchParams): Promise<Response> {
  const repondre = (text: string) => json({ response_type: "ephemeral", text });
  const supabase = serviceClient();
  const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", "bonus_slack_autorises").maybeSingle();
  const autorises = Array.isArray(reglage?.valeur) ? (reglage.valeur as unknown[]).map(String) : [];
  if (!autorises.includes(String(f.get("user_id") ?? ""))) return repondre("Sorry, /bonus is reserved to Max and Adrien.");
  const texte = String(f.get("text") ?? "").trim();
  if (!texte) return repondre("Exemple : /bonus donne 2 $ de bonus à Martin Befeld lundi, raison test");
  const lu = lirePhraseBonus(texte, new Date().getUTCFullYear());
  if ("erreur" in lu) return repondre(`Pas compris : ${lu.erreur}.`);
  // 0571 : la personne par ressemblance ; un seul nom exact, sinon on propose les plus proches.
  const { data: proches, error: errProches } = await supabase.rpc("bonus_personnes_proches", { p_texte: lu.texteNom, p_limite: 5 });
  if (errProches) return repondre(`Erreur : ${errProches.message}`);
  const liste = (proches ?? []) as PersonneProche[];
  const personne = personneSure(liste);
  if (!personne) {
    if (liste.length === 0) return repondre(`Personne ne ressemble à « ${lu.nom || lu.texteNom} ». Écris le prénom et le nom.`);
    return repondre(`Pas de nom exact. Tu voulais dire : ${liste.map((x) => x.nom).join(", ")} ? Renvoie /bonus avec le nom exact.`);
  }
  const raison = raisonBonus(lu, personne.nom);
  const { data, error } = await supabase.rpc("bonus_donner_a", { p_poster: personne.id, p_montant: lu.montant, p_lundi: lu.lundi, p_raison: raison, p_par: null });
  if (error) return repondre(`Erreur : ${error.message}`);
  const r = data as { ok: boolean; erreur?: string; nom?: string; montant?: number; lundi?: string };
  if (!r.ok) return repondre(`Pas ajouté : ${r.erreur}.`);
  return repondre(`✅ ${r.montant} $ à ${r.nom} (lundi ${r.lundi}, raison : ${raison}). À valider sur la page Bonus.`);
}
