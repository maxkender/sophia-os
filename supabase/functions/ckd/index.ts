import {
  ajouterJours,
  COLONNES_PROPOSITION,
  consigneNudge,
  DECISIONS_ENVOYEES,
  maintenantParis,
  type PropositionSlack,
  slackApi,
  texteRappel,
  texteRecapMax,
  zonesDe,
} from "../_shared/ckd.ts";
import { hmDuPays, type Recruteur } from "../_shared/hub_posteurs.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { identiteSlack, urlConnexionSlack } from "../_shared/slack_connect.ts";
import { estLabelFileSlideshow } from "../_shared/labels_file.ts";
import { lireProfilTiktokFiable as lireProfilTiktok, lireProfilTiktokFiable } from "../_shared/profil_tiktok.ts";
import { lireProfilApify } from "../_shared/apify.ts";
import { lireTextesHandle, normaliserHandle, texteHandle, verifierHandlePropose } from "../_shared/handle_tiktok.ts";
import { filtrerPoolParApplication } from "../_shared/labels_repli.ts";
import { chargerReglagesChoixLabel, statsChoixLabel } from "../_shared/fermeture_labels.ts";
import { choisirLabel } from "../_shared/choix_label_equilibre.ts";
import { CANAL_QUESTIONS_DEFAUT, epinglerQuestions, TEXTE_QUESTIONS_DEFAUT } from "../_shared/slack_questions.ts";
import { canauxDuBot, historiqueCanal } from "../_shared/slack_messages.ts";
import { lireTout } from "../_shared/lots.ts";
import { estLienCourt, handleDuLien, handleMajoritaire, handlesProches, resoudreLienCourt } from "../_shared/handle_liens.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * Check, Kill or Double (0326 à 0328) : ce qui ne peut pas se faire en SQL.
 *
 *   { action: "decider", id, decision: "recreer" | "doubler", note? }   admin
 *       Réserve la proposition (`ckd_decider`). Recréer : crée le compte par
 *       manage-users (`ajouter_compte`, même application), puis le relie
 *       (`ckd_compte_cree`) ; répartition habituelle ; l'ancien compte
 *       s'arrête, ses posts à venir sont retirés (0368), et le posteur reçoit
 *       une pop-up « Got it » et le même texte sur Slack (0383, pas la HM). Doubler (v3, 0382) : ne crée plus rien,
 *       propose le 2ᵉ compte au posteur (pop-up à partir du dimanche,
 *       `double_offrir`).
 *       Échec : la proposition redevient libre, avec l'erreur.
 *   { action: "double_repondre", message_id, reponse: "oui" | "non" } posteur
 *       La réponse du posteur connecté à son offre. Oui : le 2ᵉ compte est
 *       créé (choix équilibré de la répartition, sans les labels du 1ᵉʳ
 *       compte) et démarre le lundi J+9 (0369). Un échec de création est noté,
 *       la réponse reste : l'admin relance par `double_creer`.
 *   { action: "nudges_slack", controle_id? , id? }                      admin
 *       Arrêté au prompt 17 (0391) : plus de message Slack de régularité le
 *       jeudi (le pop-up reste). Les relances passent par `recrues-check`.
 *   { action: "double_creer", id }                                     admin
 *       Recrée le 2ᵉ compte d'une offre acceptée restée sans compte.
 *   { action: "recreer_shadowban", compte_id }                        admin
 *       Page Shadowban (0362) : « Nouveau compte » pour un compte signalé, même
 *       création que Recréer (manage-users `ajouter_compte`, même application,
 *       langue et pays), puis `ckd_recreations` et arrêt de l'ancien compte.
 *   { action: "recrutement", controle_id, pays, nombre }               admin
 *       « À recruter » du samedi (0364) : la HM du pays (même règle que le
 *       routage du site), la cohorte (samedi + 9 jours). 0 retire la ligne.
 *   { action: "envoyer", controle_id }                                 admin
 *       Marque envoyées les décisions prêtes (la HM les voit sur son
 *       accueil) et envoie à Max un récap en message privé. Plus rien dans
 *       #managers-hq (prompt 15, point 3).
 *   { action: "envoi_auto" }      cron, dimanche 12 h (heure de Paris)
 *       Pareil pour le contrôle du samedi. Prompt 25 v4 : plus de message de
 *       Kill le dimanche (le Kill du samedi part à Validate, sans message) ;
 *       0463 : plus aucun message au Kill (l'action messages_kill est retirée).
 *   { action: "rappel_lundi" }    cron, lundi 9 h (heure de Paris)
 *       Dans le fil du samedi : qui ne pas financer, qui passe à 2 comptes.
 *       Cron `ckd-rappel-lundi` en pause depuis le prompt 15 (les HMs ne
 *       financent plus) ; l'action reste.
 *   { action: "verifier_slack" }                                       admin
 *       Le jeton marche-t-il, et le bot est-il dans le canal ? N'écrit rien.
 *   { action: "apercu_hm", id }                                        admin
 *       La consigne par défaut d'un nudge pour le HM (ce qu'il vérifie avec
 *       le posteur), que la page pré-remplit et laisse modifier (0339).
 *   { action: "releve_warmup" }                                        admin
 *       Lit le profil TikTok public de chaque compte de la cohorte en warm-up
 *       (existe ?, abonnements, likes) et l'enregistre (0356). Sans Apify.
 *   { action: "releve_warmup_planifie" }   cron, 8 h et 20 h (heure de Paris)
 *       Pareil.
 *   { action: "handle_proposer", handle, compte_id? }                 posteur
 *       0444 : « My account has a different name » ; le @ est lu tout de suite
 *       sur TikTok (trouvé : il remplace celui du compte).
 *   { action: "questions_epingler" }                                    admin
 *       Prompt 13 : poste et épingle dans #questions « Questions: post them in #questions… ».
 *   { action: "slack_connect_url", redirect_uri, state, nonce }        posteur
 *       Prompt 25 MAJ, 7a : l'URL « Sign in with Slack » ({ disponible: false } sans SLACK_CLIENT_ID).
 *   { action: "slack_connect", code, redirect_uri }                    posteur
 *       relie le posteur au compte Slack qui vient de se connecter.
 *   { action: "lire_handle", handle }                                 admin
 *       0444 : lit un @ sur TikTok sans rien enregistrer (test).
 *
 * Le bouton Done des messages arrive dans `slack-interactions`.
 * Secrets : SLACK_HM_BOT_TOKEN (le bot « Sophia OS »), CRON_SECRET.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    // deno-lint-ignore no-explicit-any
    const body: any = await request.clone().json().catch(() => ({}));
    // La réponse à l'offre Double et le @ TikTok exact (0444) viennent du posteur lui-même ; tout le reste est admin.
    const posteur = ["double_repondre", "handle_proposer", "slack_connect_url", "slack_connect"].includes(body.action);
    const acces = await assertRole(request, posteur ? ["poster"] : ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    const supabase = serviceClient();
    const cron = acces.userId === "cron";
    if (posteur) {
      if (cron) return json({ ok: false, error: "réservé au posteur" }, 403);
      if (body.action === "handle_proposer") return json(await handleProposer(supabase, body, acces.userId));
      if (body.action === "slack_connect_url") return json(slackConnectUrl(body));
      if (body.action === "slack_connect") return json(await slackConnect(supabase, body, acces.userId));
      return await doubleRepondre(supabase, body, acces.userId);
    }

    switch (body.action) {
      case "decider":
        return await decider(supabase, body, cron ? null : acces.userId);
      case "recreer_shadowban":
        return await recreerShadowban(supabase, String(body.compte_id ?? ""), cron ? null : acces.userId);
      case "envoyer":
        return json(await envoyer(supabase, String(body.controle_id ?? "")));
      case "envoi_auto": {
        const p = maintenantParis();
        if (!body.force && (p.isoJour !== 7 || p.heure !== 12)) return json({ ok: true, ignore: "pas dimanche 12 h" });
        const c = await controleSamedi(supabase, ajouterJours(p.jour, -1));
        if (!c) return json({ ok: true, ignore: "pas de contrôle samedi" });
        // Avant l'envoi, qui ne part qu'avec ce qui est décidé : l'alarme (0364).
        const alarme = await alarmeNonValidees(supabase, c.id).catch((e) => ({ erreur: messageErreur(e) }));
        const envoi = await envoyer(supabase, c.id).catch((e) => ({ ok: false, error: messageErreur(e) }));
        // Prompt 25 v4 : le message de Kill du dimanche est retiré du parcours.
        return json({ ...envoi, alarme });
      }
      case "nudges_slack":
        return json({ ok: true, ignore: "prompt 17 : plus de nudge Slack le jeudi" });
      case "double_creer":
        return json(await doubleCreer(supabase, String(body.id ?? "")));
      case "recrutement":
        return json(await enregistrerRecrutement(supabase, body));
      case "rappel_lundi": {
        const p = maintenantParis();
        if (!body.force && (p.isoJour !== 1 || p.heure !== 9)) return json({ ok: true, ignore: "pas lundi 9 h" });
        const c = await controleSamedi(supabase, ajouterJours(p.jour, -2));
        if (!c) return json({ ok: true, ignore: "pas de contrôle samedi" });
        return json(await rappel(supabase, c.id));
      }
      case "verifier_slack":
        return json(await verifierSlack(supabase));
      case "apercu_hm":
        return json(await apercuHm(supabase, String(body.id ?? "")));
      case "releve_warmup":
        return json(await releverWarmup(supabase));
      case "releve_compte":
        return json(await releverCompte(supabase, String(body.compte_id ?? "")));
      case "lire_handle": {
        // 0444 : une lecture TikTok d'un @ quelconque, sans rien enregistrer (test).
        const h = normaliserHandle(String(body.handle ?? ""));
        if (!h) return json({ ok: false, error: "@ invalide" }, 400);
        return json({ ok: true, handle: h, ...(await lireProfilTiktok(h)) });
      }
      case "handles_depuis_liens":
        // Le @ lu dans les liens postés : corrigé s'il est proche, sinon signalé (compte perso ?).
        return json(await handlesDepuisLiens(supabase, typeof body.compte_id === "string" ? body.compte_id : null));
      case "handle_utiliser": {
        // « Use @x » (admin) : le @ des liens devient celui du compte, une fois vu sur TikTok.
        if (cron) return json({ ok: false, error: "réservé à l'admin" }, 403);
        const h = normaliserHandle(String(body.handle ?? ""));
        if (!h || !body.compte_id) return json({ ok: false, error: "compte_id et handle requis" }, 400);
        const profil = await lireProfilTiktok(h);
        if (profil.existe !== true) return json({ ok: false, error: profil.existe === false ? `@${h} introuvable sur TikTok` : "TikTok illisible, réessayer" });
        const { error } = await supabase.rpc("handle_corriger", { p_compte: String(body.compte_id), p_nouveau: h, p_source: "admin" });
        if (error) return json({ ok: false, error: error.message });
        return json({ ok: true, handle: h });
      }
      case "slack_messages_reprendre":
        // Prompt 27 : les 30 derniers jours des canaux où est l'appli (lecture seule), pour la colonne Context.
        return json(await reprendreMessagesSlack(supabase, Number(body.jours) || 30));
      case "questions_epingler":
        // Prompt 13 : le message épinglé de #questions, sur le bouton de l'admin seulement.
        if (cron || acces.role !== "admin") return json({ ok: false, error: "réservé à l'admin" }, 403);
        return json(await epinglerMessageQuestions(supabase, acces.userId));
      case "needs_you_alerte":
        return json(await alerteNeedsYou(supabase));
      case "releve_cohorte": {
        // 31/10 : dimanche 18:00 (Paris), avant le check du warm-up : toutes les recrues de la cohorte du lendemain.
        const p = maintenantParis();
        // Toutes les 5 min de 18:00 à 19:55 (Paris) : chaque passage relève ce qui ne l'a pas été depuis 1 h.
        if (cron && !body.force && !(p.isoJour === 7 && (p.heure === 18 || p.heure === 19))) return json({ ok: true, ignore: "pas dimanche 18-20 h" });
        return json(await releverCohorte(supabase, typeof body.lundi === "string" ? body.lundi : null));
      }
      case "releve_warmup_planifie": {
        const p = maintenantParis();
        if (!body.force && p.heure !== 8 && p.heure !== 20) return json({ ok: true, ignore: "pas 8 h ni 20 h" });
        return json(await releverWarmup(supabase));
      }
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

/**
 * Le @ lu dans les liens postés (21 derniers jours ; liens courts résolus, 8 au
 * plus par compte et par passage). Proche du @ du compte (chiffres de la fin) :
 * le compte existe sur TikTok → le @ est remplacé partout (handle_corriger),
 * les liens et les vues sont relus. Complètement différent : signalé
 * (handles_autres), jamais corrigé tout seul.
 */
async function handlesDepuisLiens(supabase: Supabase, compteId: string | null) {
  const depuis = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  // deno-lint-ignore no-explicit-any
  const data = await lireTout<any>("Liens postés (21 jours)", (curseur, taille) => {
    let q = supabase.from("passages").select("id, compte_id, publie_url, comptes!inner(handle_tiktok, is_active, type_compte)")
      .not("publie_url", "is", null).gte("date_publication_prevue", depuis).eq("comptes.is_active", true).eq("comptes.type_compte", "perso");
    if (compteId) q = q.eq("compte_id", compteId);
    if (curseur) q = q.gt("id", curseur.id);
    return q.order("id", { ascending: true }).limit(taille);
  }, { ancre: (l) => String(l.id) });
  const parCompte = new Map<string, { handle: string; urls: string[] }>();
  // deno-lint-ignore no-explicit-any
  for (const p of data as any[]) {
    const c = parCompte.get(p.compte_id) ?? { handle: String(p.comptes?.handle_tiktok ?? "").toLowerCase(), urls: [] };
    c.urls.push(String(p.publie_url));
    parCompte.set(p.compte_id, c);
  }
  const bilan = { comptes: parCompte.size, corriges: [] as string[], autres: [] as string[], introuvables: [] as string[] };
  for (const [id, c] of parCompte) {
    const handles: (string | null)[] = c.urls.map(handleDuLien);
    const courts = c.urls.filter((u) => !handleDuLien(u) && estLienCourt(u)).slice(0, 8);
    // Les liens courts ne sont résolus que s'il n'y a pas assez de liens complets.
    if (handles.filter(Boolean).length < 3) for (const u of courts) handles.push(await resoudreLienCourt(u));
    const maj = handleMajoritaire(handles);
    if (!maj || !c.handle || maj.handle === c.handle) continue;
    if (handlesProches(c.handle, maj.handle)) {
      const profil = await lireProfilTiktok(maj.handle);
      if (profil.existe !== true) {
        bilan.introuvables.push(`@${c.handle} → @${maj.handle}`);
        continue;
      }
      const { error: errC } = await supabase.rpc("handle_corriger", { p_compte: id, p_nouveau: maj.handle, p_source: "lien" });
      if (errC) bilan.introuvables.push(`@${c.handle} → @${maj.handle} : ${errC.message}`);
      else bilan.corriges.push(`@${c.handle} → @${maj.handle}`);
    } else {
      const { data: deja } = await supabase.from("handles_autres").select("handle_lien, regle_at").eq("compte_id", id).maybeSingle();
      const nouveau = !deja || deja.handle_lien !== maj.handle;
      await supabase.from("handles_autres").upsert({
        compte_id: id, handle_lien: maj.handle, liens: maj.liens, vu_at: new Date().toISOString(),
        ...(nouveau ? { regle_at: null } : {}),
      }, { onConflict: "compte_id" });
      bilan.autres.push(`@${c.handle} : liens de @${maj.handle}`);
    }
  }
  return { ok: true, ...bilan };
}

/** Prompt 27 : l'historique des canaux Slack (messages humains), gardé dans slack_messages. */
async function reprendreMessagesSlack(supabase: Supabase, jours: number) {
  const jeton = jetonSlack();
  const depuis = Math.floor(Date.now() / 1000) - Math.min(Math.max(jours, 1), 90) * 86_400;
  // Sans le scope de liste des canaux : #questions, #poster-pause, les canaux du bot FAQ et ceux où des posteurs ont déjà écrit.
  const canaux = await canauxDuBot(jeton).catch(async () => {
    const [{ data: regl }, { data: reactions }] = await Promise.all([
      supabase.from("reglages").select("cle, valeur").in("cle", ["faq_automatique", "slack_questions_canal", "slack_canal_pause"]),
      supabase.from("posteur_reactions").select("slack_canal").not("slack_canal", "is", null).limit(5000),
    ]);
    const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
    const faq = (v.faq_automatique as { canaux_slack?: string[] } | undefined)?.canaux_slack ?? [];
    const questions = typeof v.slack_questions_canal === "string" ? [v.slack_questions_canal] : [CANAL_QUESTIONS_DEFAUT];
    const pause = typeof v.slack_canal_pause === "string" ? [v.slack_canal_pause] : [];
    return [...new Set([...questions, ...pause, ...faq, ...(reactions ?? []).map((r) => String(r.slack_canal))])].filter((c) => /^[CG]/.test(c));
  });
  let gardes = 0;
  const erreurs: string[] = [];
  for (const canal of canaux) {
    try {
      const lignes = await historiqueCanal(jeton, canal, depuis);
      for (let i = 0; i < lignes.length; i += 500) {
        const { error } = await supabase.from("slack_messages").upsert(lignes.slice(i, i + 500), { onConflict: "canal,ts" });
        if (error) throw error;
      }
      gardes += lignes.length;
    } catch (e) {
      erreurs.push(messageErreur(e));
    }
  }
  return { ok: erreurs.length === 0, canaux: canaux.length, gardes, erreurs: erreurs.slice(0, 10) };
}

/** Prompt 13 : poste et épingle dans #questions le texte du réglage `slack_questions_texte`. */
async function epinglerMessageQuestions(supabase: Supabase, par: string) {
  const { data } = await supabase.from("reglages").select("cle, valeur").in("cle", ["slack_questions_texte", "slack_questions_canal"]);
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = typeof v.slack_questions_texte === "string" && v.slack_questions_texte.trim() ? v.slack_questions_texte.trim() : TEXTE_QUESTIONS_DEFAUT;
  const canal = typeof v.slack_questions_canal === "string" && v.slack_questions_canal.trim() ? v.slack_questions_canal.trim() : CANAL_QUESTIONS_DEFAUT;
  const r = await epinglerQuestions(jetonSlack(), canal, texte);
  if (r.ts) {
    await supabase.from("reglages").upsert({
      cle: "slack_questions_epingle", valeur: { canal, ts: r.ts, epingle: r.ok, at: new Date().toISOString() },
      updated_by: par, updated_at: new Date().toISOString(),
    }, { onConflict: "cle" });
  }
  return { ok: r.ok, canal, ts: r.ts, error: r.erreur ?? undefined };
}

function jetonSlack(): string {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) throw new Error("SLACK_HM_BOT_TOKEN manquant");
  return jeton;
}

async function canalSlack(supabase: Supabase): Promise<string> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "ckd_slack").maybeSingle();
  if (error) throw error;
  const canal = String((data?.valeur as { canal?: string } | null)?.canal ?? "").trim();
  if (!/^[CG][A-Z0-9]{6,}$/.test(canal)) throw new Error("canal Slack absent ou invalide (réglage ckd_slack)");
  return canal;
}

async function controleSamedi(supabase: Supabase, jour: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("ckd_controles")
    .select("id")
    .eq("type", "samedi")
    .eq("jour", jour)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Recréer et Doubler
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function decider(supabase: Supabase, body: any, par: string | null): Promise<Response> {
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  if (!id || !["recreer", "doubler"].includes(decision)) {
    return json({ ok: false, error: "id et decision (recreer ou doubler) requis" }, 400);
  }

  // 1. Réserver : deux clics ne créent pas deux comptes.
  const { error: errReserve } = await supabase.rpc("ckd_decider", {
    p_id: id,
    p_decision: decision,
    p_note: typeof body.note === "string" ? body.note : null,
    p_par: par,
  });
  if (errReserve) return json({ ok: false, error: messageErreur(errReserve) }, 409);

  const liberer = async (erreur: string, statut: number) => {
    await supabase.rpc("ckd_liberer", { p_id: id, p_erreur: erreur });
    return json({ ok: false, error: erreur }, statut);
  };

  // Doubler (v3, 0382) : l'offre au posteur, pas encore de compte.
  if (decision === "doubler") {
    const { data: offre, error: errOffre } = await supabase.rpc("double_offrir", { p_id: id });
    if (errOffre) return await liberer(messageErreur(errOffre), 500);
    return json({ ok: true, offre });
  }

  try {
    const { data: p, error } = await supabase
      .from("ckd_propositions")
      .select("id, compte_id, poster_id, application")
      .eq("id", id)
      .single();
    if (error) throw error;
    const { data: ancien, error: errCompte } = await supabase
      .from("comptes")
      .select("id, langue, pays, posts_par_jour")
      .eq("id", p.compte_id)
      .single();
    if (errCompte) throw errCompte;
    const slug = String(p.application ?? "sophia");

    const cree = await appelerManageUsers({
      action: "ajouter_compte",
      userId: p.poster_id,
      type_compte: "perso",
      langue: ancien.langue,
      ...(ancien.pays ? { pays: ancien.pays } : {}),
      ...(ancien.posts_par_jour ? { posts_par_jour: ancien.posts_par_jour } : {}),
      parts_applications: { [slug]: 100 },
    });
    if (!cree.ok) {
      if (cree.incertain) {
        // Le compte a peut-être été créé : on garde la réservation, pour ne pas
        // en créer un second en réessayant.
        await supabase.from("ckd_propositions").update({
          erreur: `création incertaine (${cree.error}) : vérifier les comptes du poster avant de recommencer`,
        }).eq("id", id);
        return json({ ok: false, error: cree.error, incertain: true }, 502);
      }
      return await liberer(cree.error, 409);
    }

    const { error: errLien } = await supabase.rpc("ckd_compte_cree", { p_id: id, p_compte: cree.compteId });
    if (errLien) throw errLien;
    const { data: nouveau } = await supabase
      .from("comptes")
      .select("id, handle_tiktok")
      .eq("id", cree.compteId)
      .maybeSingle();
    const slack = await prevenirRecreation(supabase, cree.compteId);
    return json({ ok: true, compte: nouveau ?? { id: cree.compteId }, slack });
  } catch (error) {
    return await liberer(messageErreur(error), 500);
  }
}

// ---------------------------------------------------------------------------
// Double : la réponse du posteur et le 2ᵉ compte (v3, 0382)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function doubleRepondre(supabase: Supabase, body: any, posteurId: string): Promise<Response> {
  const messageId = String(body.message_id ?? "");
  const reponse = String(body.reponse ?? "");
  if (!messageId || !["oui", "non"].includes(reponse)) {
    return json({ ok: false, error: "message_id et reponse (oui ou non) requis" }, 400);
  }
  const { data: propositionId, error } = await supabase.rpc("double_repondre", {
    p_message: messageId,
    p_reponse: reponse,
    p_poster: posteurId,
  });
  if (error) return json({ ok: false, error: messageErreur(error) }, 409);
  if (reponse === "non") return json({ ok: true, reponse });
  // Oui : la réponse est gardée même si la création échoue (l'admin relance).
  const cree = await creerDeuxieme(supabase, String(propositionId));
  if (!cree.ok) {
    await supabase.from("posteur_messages").update({ erreur: cree.error }).eq("id", messageId);
  }
  return json({ ok: true, reponse, compte: cree.ok ? cree.compteId : null });
}

/** Admin : recréer le 2ᵉ compte d'une offre acceptée restée sans compte. */
async function doubleCreer(supabase: Supabase, propositionId: string) {
  if (!propositionId) throw new Error("id requis");
  const { data: m, error } = await supabase
    .from("posteur_messages")
    .select("id, reponse")
    .eq("proposition_id", propositionId)
    .eq("type", "double")
    .maybeSingle();
  if (error) throw error;
  if (m?.reponse !== "oui") return { ok: false, error: "le posteur n'a pas accepté l'offre" };
  const cree = await creerDeuxieme(supabase, propositionId);
  await supabase.from("posteur_messages").update({ erreur: cree.ok ? null : cree.error }).eq("id", m.id);
  return cree;
}

/**
 * Le 2ᵉ compte d'un Double : même langue, pays et application que le 1ᵉʳ, un
 * label choisi sans ceux du 1ᵉʳ compte, relié par `ckd_compte_cree` (qui pose
 * le lundi de démarrage J+9). Une erreur est notée sur la proposition.
 */
async function creerDeuxieme(
  supabase: Supabase,
  propositionId: string,
): Promise<{ ok: true; compteId: string } | { ok: false; error: string }> {
  const noter = async (erreur: string) => {
    await supabase.from("ckd_propositions").update({ erreur: erreur.slice(0, 500) }).eq("id", propositionId);
    return { ok: false as const, error: erreur };
  };
  try {
    const { data: p, error } = await supabase
      .from("ckd_propositions")
      .select("id, compte_id, poster_id, application, decision, nouveau_compte_id")
      .eq("id", propositionId)
      .single();
    if (error) throw error;
    if (p.decision !== "doubler") return await noter("la proposition n'est plus en Doubler");
    if (p.nouveau_compte_id) return { ok: true, compteId: String(p.nouveau_compte_id) };
    const { data: ancien, error: errCompte } = await supabase
      .from("comptes")
      .select("id, langue, pays, posts_par_jour")
      .eq("id", p.compte_id)
      .single();
    if (errCompte) throw errCompte;
    const slug = String(p.application ?? "sophia");
    const labelId = await labelDuDeuxieme(supabase, p.poster_id, slug, ancien.langue, ancien.pays);
    if (!labelId) return await noter("aucun autre label de cette application pour le 2ᵉ compte");
    const cree = await appelerManageUsers({
      action: "ajouter_compte",
      userId: p.poster_id,
      type_compte: "perso",
      langue: ancien.langue,
      ...(ancien.pays ? { pays: ancien.pays } : {}),
      ...(ancien.posts_par_jour ? { posts_par_jour: ancien.posts_par_jour } : {}),
      parts_applications: { [slug]: 100 },
      label_id: labelId,
    });
    if (!cree.ok) {
      return await noter(
        cree.incertain
          ? `création incertaine (${cree.error}) : vérifier les comptes du poster avant de recommencer`
          : cree.error,
      );
    }
    const { error: errLien } = await supabase.rpc("ckd_compte_cree", { p_id: propositionId, p_compte: cree.compteId });
    if (errLien) throw errLien;
    return { ok: true, compteId: cree.compteId };
  } catch (e) {
    return await noter(messageErreur(e));
  }
}

async function recreerShadowban(supabase: Supabase, compteId: string, par: string | null): Promise<Response> {
  if (!compteId) return json({ ok: false, error: "compte_id requis" }, 400);

  // 1. Réserver : deux clics ne créent pas deux comptes.
  const { data: ligne, error: errReserve } = await supabase.rpc("ckd_shadowban_reserver", {
    p_compte: compteId,
    p_par: par,
  });
  if (errReserve) return json({ ok: false, error: messageErreur(errReserve) }, 409);

  const liberer = async (erreur: string, statut: number) => {
    await supabase.rpc("ckd_shadowban_liberer", { p_compte: compteId, p_erreur: erreur });
    return json({ ok: false, error: erreur }, statut);
  };

  try {
    const { data: ancien, error: errCompte } = await supabase
      .from("comptes")
      .select("id, poster_id, langue, pays, posts_par_jour")
      .eq("id", compteId)
      .single();
    if (errCompte) throw errCompte;
    const slug = String((ligne as { application?: string | null } | null)?.application ?? "sophia");

    const cree = await appelerManageUsers({
      action: "ajouter_compte",
      userId: ancien.poster_id,
      type_compte: "perso",
      langue: ancien.langue,
      ...(ancien.pays ? { pays: ancien.pays } : {}),
      ...(ancien.posts_par_jour ? { posts_par_jour: ancien.posts_par_jour } : {}),
      parts_applications: { [slug]: 100 },
    });
    if (!cree.ok) {
      if (cree.incertain) {
        // Le compte a peut-être été créé : la réservation reste, pour ne pas en
        // créer un second en réessayant.
        await supabase.from("ckd_shadowban").update({
          erreur: `création incertaine (${cree.error}) : vérifier les comptes du poster avant de recommencer`,
        }).eq("compte_id", compteId);
        return json({ ok: false, error: cree.error, incertain: true }, 502);
      }
      return await liberer(cree.error, 409);
    }

    const { error: errLien } = await supabase.rpc("ckd_shadowban_compte_cree", {
      p_compte: compteId,
      p_nouveau: cree.compteId,
    });
    if (errLien) throw errLien;
    const { data: nouveau } = await supabase
      .from("comptes")
      .select("id, handle_tiktok")
      .eq("id", cree.compteId)
      .maybeSingle();
    const slack = await prevenirRecreation(supabase, cree.compteId);
    return json({ ok: true, compte: nouveau ?? { id: cree.compteId }, slack });
  } catch (error) {
    return await liberer(messageErreur(error), 500);
  }
}

/**
 * Recréation (0368) : message Slack direct au posteur, en anglais, avec ses
 * deux @, la date et le lundi de reprise. Retrouvé par email perso puis email ;
 * l'issue (envoyé / introuvable / erreur) est notée sur `ckd_recreations` et
 * montrée sur la page. Ne fait jamais échouer la recréation, qui est faite.
 */
async function prevenirRecreation(
  supabase: Supabase,
  nouveauCompteId: string,
): Promise<{ statut: string; erreur?: string }> {
  try {
    const { data: r, error } = await supabase
      .from("ckd_recreations")
      .select("id, poster_id, ancien_compte_id, created_at")
      .eq("nouveau_compte_id", nouveauCompteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    const { data: nouveau } = await supabase.from("comptes").select("handle_tiktok").eq("id", nouveauCompteId).single();
    const jourParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(r.created_at));
    const iso = new Date(`${jourParis}T12:00:00Z`).getUTCDay() || 7;
    const lundi = ajouterJours(jourParis, 8 - iso);
    const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(`${lundi}T12:00:00Z`));
    // v3 (0383) : le texte est un réglage ; le même part en pop-up et sur Slack.
    const { data: message, error: errMessage } = await supabase.rpc("recreer_message_creer", {
      p_recreation: r.id,
      p_nouveau: nouveau?.handle_tiktok ?? "?",
      p_date: date,
    });
    if (errMessage) throw errMessage;
    const issue = await ecrireAuPosteur(supabase, r.poster_id, message.texte);
    const maintenant = new Date().toISOString();
    await supabase.from("ckd_recreations").update({ slack_statut: issue.statut, slack_at: maintenant }).eq("id", r.id);
    await supabase.from("posteur_messages").update({
      slack_statut: issue.statut,
      slack_at: maintenant,
      slack_erreur: issue.statut === "erreur" ? issue.erreur : null,
    }).eq("id", message.id);
    return issue.statut === "erreur" ? { statut: "erreur", erreur: issue.erreur } : { statut: issue.statut };
  } catch (e) {
    return { statut: "erreur", erreur: messageErreur(e) };
  }
}

/**
 * Le label du 2ᵉ compte : le choix équilibré de la répartition (labels
 * slideshow de l'application, performance × réserve, langue et pays), sans les
 * labels des comptes actifs du posteur. La File des créateurs n'est pas lue :
 * elle pourrait imposer le label du 1ᵉʳ compte.
 */
async function labelDuDeuxieme(
  supabase: Supabase,
  posterId: string,
  slug: string,
  langue: string,
  pays: string | null,
): Promise<string | null> {
  const { data: app, error: errApp } = await supabase.from("applications").select("id").eq("slug", slug).single();
  if (errApp) throw errApp;

  const { data: comptes, error: errComptes } = await supabase
    .from("comptes")
    .select("id")
    .eq("poster_id", posterId)
    .eq("is_active", true);
  if (errComptes) throw errComptes;
  const { data: liens, error: errLiens } = await supabase
    .from("compte_labels")
    .select("label_id")
    .in("compte_id", (comptes ?? []).map((c) => c.id));
  if (errLiens) throw errLiens;
  const exclus = new Set((liens ?? []).map((l) => l.label_id as string));

  const { data: labels, error: errLabels } = await supabase.from("labels").select("id, slug, nom, ugc_ai_video");
  if (errLabels) throw errLabels;
  const slideshow = (labels ?? []).filter((l) => estLabelFileSlideshow(l)).map((l) => l.id as string);
  const pool = (await filtrerPoolParApplication(supabase, slideshow, app.id)).filter((l) => !exclus.has(l));
  if (pool.length === 0) return null;

  const [stats, reglages] = await Promise.all([
    statsChoixLabel(supabase, {
      labels: pool,
      application: app.id,
      langue: langue?.toLowerCase() || null,
      pays: pays?.toUpperCase() || null,
      recents: 3,
    }),
    chargerReglagesChoixLabel(supabase),
  ]);
  return choisirLabel(stats.filter((s) => pool.includes(s.label_id)), reglages, {
    applicationId: app.id,
    jamaisSansLabel: true,
  }) ?? pool[0];
}

async function appelerManageUsers(
  corps: Record<string, unknown>,
): Promise<{ ok: true; compteId: string } | { ok: false; incertain: boolean; error: string }> {
  const url = Deno.env.get("SUPABASE_URL");
  const cron = Deno.env.get("CRON_SECRET");
  if (!url || !cron) return { ok: false, incertain: false, error: "SUPABASE_URL ou CRON_SECRET manquant" };
  let reponse: Response;
  try {
    reponse = await fetch(`${url}/functions/v1/manage-users`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": cron },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return { ok: false, incertain: true, error: messageErreur(e) };
  }
  // deno-lint-ignore no-explicit-any
  const charge: any = await reponse.json().catch(() => null);
  if (reponse.ok && charge?.ok && charge.compte?.id) return { ok: true, compteId: String(charge.compte.id) };
  const erreur = String(charge?.error ?? `HTTP ${reponse.status}`).slice(0, 300);
  return { ok: false, incertain: reponse.status >= 500 || !charge, error: erreur };
}

// ---------------------------------------------------------------------------
// Recrutement et alarme du dimanche (0364)
// ---------------------------------------------------------------------------

/** Max, sur Slack : prévenu quand les propositions du samedi ne sont pas validées à temps. */
const SLACK_MAX = "U0BL5FRLBEU";
/** L'OS (liens dans les DM Slack). */
const OS_URL = "https://sophia-marketing-orga.vercel.app";

/** HMs (et Head of Ops) actifs qui ont une zone, comme le routage du site (hub-posteurs). */
async function lireRecruteurs(supabase: Supabase): Promise<Recruteur[]> {
  const { data: roles, error: errRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["hiring_manager", "head_of_ops"]);
  if (errRoles) throw errRoles;
  const ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
  if (ids.length === 0) return [];
  const { data: profils, error } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email, zone_recrutement, langues")
    .in("id", ids)
    .eq("is_active", true)
    .not("zone_recrutement", "is", null);
  if (error) throw error;
  return await Promise.all((profils ?? []).map(async (p) => {
    const { count, error: errCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("manager_id", p.id)
      .eq("is_active", true);
    if (errCount) throw errCount;
    return { ...(p as Omit<Recruteur, "posters_actifs">), posters_actifs: count ?? 0 };
  }));
}

// deno-lint-ignore no-explicit-any
async function enregistrerRecrutement(supabase: Supabase, body: any) {
  const controleId = String(body.controle_id ?? "");
  const pays = String(body.pays ?? "").trim().toUpperCase();
  const nombre = Number(body.nombre ?? 0);
  if (!controleId || !/^[A-Z]{2}$/.test(pays) || !Number.isInteger(nombre) || nombre < 0 || nombre > 500) {
    throw new Error("controle_id, pays (ISO) et nombre (0 à 500) requis");
  }
  const { data: c, error } = await supabase.from("ckd_controles").select("id, type, jour").eq("id", controleId).single();
  if (error) throw error;
  if (c.type !== "samedi") throw new Error("« À recruter » se note sur le contrôle du samedi");

  if (nombre === 0) {
    const { error: errDel } = await supabase.from("ckd_recrutement").delete().eq("controle_id", controleId).eq("pays", pays);
    if (errDel) throw errDel;
    return { ok: true, pays, nombre: 0 };
  }
  const hmId = hmDuPays(pays, await lireRecruteurs(supabase));
  const { data: ligne, error: errUp } = await supabase
    .from("ckd_recrutement")
    .upsert({
      controle_id: controleId,
      pays,
      hm_id: hmId,
      nombre,
      cohorte: ajouterJours(c.jour, 9),
      maj_at: new Date().toISOString(),
    }, { onConflict: "controle_id,pays" })
    .select("id, pays, hm_id, nombre, cohorte, envoye_at")
    .single();
  if (errUp) throw errUp;
  return { ok: true, ...ligne };
}

/** Dimanche 12 h : des propositions du samedi sans décision ? Un message à Max. */
async function alarmeNonValidees(supabase: Supabase, controleId: string) {
  const { count, error } = await supabase
    .from("ckd_propositions")
    .select("id", { count: "exact", head: true })
    .eq("controle_id", controleId)
    .is("decision", null);
  if (error) throw error;
  if (!count) return { envoyee: false, non_validees: 0 };
  const r = await slackApi(jetonSlack(), "chat.postMessage", {
    channel: SLACK_MAX,
    text: `:rotating_light: Check, Kill or Double: ${count} Saturday proposal${count > 1 ? "s are" : " is"} still not validated ` +
      "(Sunday 12:00). Only the validated decisions were sent to the HMs. Validate the rest in the OS, then send again.",
  });
  return { envoyee: r.ok, non_validees: count, ...(r.ok ? {} : { erreur: r.error }) };
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

async function envoyer(supabase: Supabase, controleId: string) {
  if (!controleId) throw new Error("controle_id requis");
  const jeton = jetonSlack();
  const { data: c, error } = await supabase
    .from("ckd_controles")
    .select("id, type, jour, slack_canal, slack_ts")
    .eq("id", controleId)
    .single();
  if (error) throw error;
  // Prompt 17 : plus de nudge Slack le jeudi (0383) ; le pop-up de régularité reste.

  const { data: brutes, error: errProps } = await supabase
    .from("ckd_propositions")
    .select(COLONNES_PROPOSITION)
    .eq("controle_id", controleId)
    .in("decision", DECISIONS_ENVOYEES as unknown as string[])
    .is("envoye_at", null)
    // Suivi du HM désactivé sur la page (0339) : rien dans #managers-hq.
    .eq("hm_suivi", true);
  if (errProps) throw errProps;
  // La liste de recrutement du contrôle apparaît chez les HMs à l'envoi (0364).
  const { error: errRecrues } = await supabase
    .from("ckd_recrutement")
    .update({ envoye_at: new Date().toISOString() })
    .eq("controle_id", controleId)
    .is("envoye_at", null);
  if (errRecrues) throw errRecrues;
  // Recréer ne part qu'avec son nouveau compte ; Doubler part tout de suite
  // (l'offre au posteur, 0382). Une recréation du jeudi ne part pas : la HM
  // n'est pas notifiée (0368), le posteur l'est.
  const props = ((brutes ?? []) as PropositionSlack[]).filter(
    (p) =>
      (p.decision !== "recreer" || p.nouveau_compte_id) &&
      !(c.type === "jeudi" && p.decision === "recreer"),
  );
  if (props.length === 0) return { ok: true, envoyees: 0 };

  // Prompt 15, point 3 : plus de fil par zone dans #managers-hq. Les décisions
  // sont marquées envoyées (la HM voit Kill / Double / Nouveau compte sur son
  // accueil, 0364) et Max reçoit un récap en message privé.
  const ids = props.map((p) => p.id);
  const { error: errMaj } = await supabase
    .from("ckd_propositions")
    .update({ envoye_at: new Date().toISOString() })
    .in("id", ids);
  if (errMaj) throw errMaj;
  const texte = texteRecapMax(c.type, c.jour, await zonesDe(supabase, props));
  let erreurRecap: string | null = null;
  if (texte) {
    const r = await slackApi(jeton, "chat.postMessage", { channel: SLACK_MAX, text: texte, unfurl_links: false });
    if (!r.ok) erreurRecap = `récap à Max : ${r.error ?? "erreur"}`;
  }
  await supabase.from("ckd_controles").update({ slack_erreur: erreurRecap }).eq("id", controleId);
  return {
    ok: erreurRecap === null,
    envoyees: ids.length,
    ...(erreurRecap ? { erreurs: [erreurRecap] } : {}),
  };
}

async function rappel(supabase: Supabase, controleId: string) {
  const jeton = jetonSlack();
  const { data: c, error } = await supabase
    .from("ckd_controles")
    .select("id, jour, slack_canal, slack_ts, rappel_at")
    .eq("id", controleId)
    .single();
  if (error) throw error;
  if (c.rappel_at) return { ok: true, ignore: "rappel déjà envoyé" };
  if (!c.slack_ts || !c.slack_canal) return { ok: true, ignore: "rien n'a été envoyé aux HMs" };

  const { data: props, error: errProps } = await supabase
    .from("ckd_propositions")
    .select(COLONNES_PROPOSITION)
    .eq("controle_id", controleId)
    .in("decision", ["ne_pas_renouveler", "doubler"])
    .not("envoye_at", "is", null);
  if (errProps) throw errProps;
  // Un Double ne compte que si le posteur a dit oui et que le compte existe (0382).
  const retenues = ((props ?? []) as PropositionSlack[]).filter(
    (p) => p.decision !== "doubler" || p.nouveau_compte_id,
  );
  const texte = texteRappel(c.jour, await zonesDe(supabase, retenues));
  if (!texte) return { ok: true, ignore: "aucun jalon à changer" };

  const r = await slackApi(jeton, "chat.postMessage", { channel: c.slack_canal, thread_ts: c.slack_ts, text: texte });
  if (!r.ok) throw new Error(`Slack : ${r.error}`);
  await supabase.from("ckd_controles").update({ rappel_at: new Date().toISOString() }).eq("id", controleId);
  return { ok: true, rappel: true };
}

async function apercuHm(supabase: Supabase, id: string) {
  if (!id) throw new Error("id requis");
  const { data, error } = await supabase.from("ckd_propositions").select(COLONNES_PROPOSITION).eq("id", id).single();
  if (error) throw error;
  const [zone] = await zonesDe(supabase, [{ ...(data as PropositionSlack), hm_texte: null }]);
  return { ok: true, texte: consigneNudge(zone.decisions[0]) };
}

// ---------------------------------------------------------------------------
// Warm-up : le profil TikTok public des comptes de la cohorte (0356)
// ---------------------------------------------------------------------------

/** Quelques pages à la fois : assez pour finir vite, assez peu pour ne pas se faire bloquer. */
const PAGES_EN_PARALLELE = 4;

async function releverWarmup(supabase: Supabase) {
  const { data, error } = await supabase.rpc("ckd_warmup_a_relever");
  if (error) throw error;
  const comptes = (data ?? []) as { compte_id: string; handle: string }[];

  const lignes: Record<string, unknown>[] = [];
  for (let i = 0; i < comptes.length; i += PAGES_EN_PARALLELE) {
    const lot = comptes.slice(i, i + PAGES_EN_PARALLELE);
    const profils = await Promise.all(lot.map((c) => lireProfilTiktok(c.handle)));
    lot.forEach((c, k) => {
      const p = profils[k]!;
      lignes.push({
        compte_id: c.compte_id,
        handle: c.handle,
        existe: p.existe,
        cree_tiktok_at: p.creeLe,
        abonnements: p.abonnements,
        likes: p.likes,
        abonnes: p.abonnes,
        videos: p.videos,
        erreur: p.erreur,
      });
    });
  }
  if (lignes.length > 0) {
    const { error: errIns } = await supabase.from("ckd_warmup_releves").insert(lignes);
    if (errIns) throw errIns;
  }
  return {
    ok: true,
    comptes: lignes.length,
    existent: lignes.filter((l) => l.existe === true).length,
    introuvables: lignes.filter((l) => l.existe === false).length,
    illisibles: lignes.filter((l) => l.existe === null).length,
  };
}

/**
 * 31/10 : le relevé du dimanche 18:00 : chaque recrue de la cohorte du
 * lendemain qui a cliqué Start warmup. 1re méthode : la page TikTok (lue deux
 * fois) ; si elle est illisible ou dit « introuvable » : 2e méthode, Apify.
 * Introuvable seulement si la page le dit ET qu'Apify ne rend rien.
 */
async function releverCohorte(supabase: Supabase, lundiDemande: string | null) {
  const p = maintenantParis();
  const lundi = lundiDemande ?? ajouterJours(p.jour, 8 - p.isoJour);
  const { data: profils, error } = await supabase.from("profiles").select("id").eq("is_active", true).eq("cohorte_lundi", lundi);
  if (error) throw error;
  const ids = (profils ?? []).map((x) => String(x.id));
  if (ids.length === 0) return { ok: true, lundi, comptes: 0 };
  const { data: comptes, error: errC } = await supabase.from("comptes").select("id, handle_tiktok")
    .in("poster_id", ids).eq("is_active", true).not("warmup_started_at", "is", null).not("handle_tiktok", "is", null);
  if (errC) throw errC;
  // Relevés en plusieurs passages (cron toutes les 10 min pendant l'heure) : un compte relevé il y a moins d'1 h est sauté,
  // et un passage s'arrête avant la limite de 150 s des fonctions.
  const tous = (comptes ?? []) as { id: string; handle_tiktok: string }[];
  const { data: recents } = tous.length
    ? await supabase.from("ckd_warmup_releves").select("compte_id").in("compte_id", tous.map((c) => c.id))
      .gte("releve_at", new Date(Date.now() - 60 * 60_000).toISOString())
    : { data: [] };
  const deja = new Set((recents ?? []).map((r) => String(r.compte_id)));
  const liste = tous.filter((c) => !deja.has(c.id));
  const debut = Date.now();
  const bilan = { ok: true, lundi, comptes: 0, page: 0, apify: 0, introuvables: 0, illisibles: 0, deja: deja.size, restants: 0 };
  for (let i = 0; i < liste.length; i += PAGES_EN_PARALLELE) {
    if (Date.now() - debut > 90_000) {
      bilan.restants = liste.length - i;
      break;
    }
    const lot = liste.slice(i, i + PAGES_EN_PARALLELE);
    const lignes = await Promise.all(lot.map(async (c) => {
      const page = await lireProfilTiktokFiable(c.handle_tiktok);
      if (page.existe === true) {
        bilan.page++;
        return { compte_id: c.id, handle: c.handle_tiktok, existe: true, cree_tiktok_at: page.creeLe, abonnements: page.abonnements, likes: page.likes, abonnes: page.abonnes, videos: page.videos, erreur: null };
      }
      const apify = await lireProfilApify(c.handle_tiktok);
      if (apify.existe === true) {
        bilan.apify++;
        return { compte_id: c.id, handle: c.handle_tiktok, existe: true, cree_tiktok_at: null, abonnements: apify.abonnements, likes: null, abonnes: apify.abonnes, videos: apify.videos, erreur: "méthode 2 (Apify)" };
      }
      const introuvable = page.existe === false;
      if (introuvable) bilan.introuvables++;
      else bilan.illisibles++;
      return {
        compte_id: c.id, handle: c.handle_tiktok, existe: introuvable ? false : null, cree_tiktok_at: null, abonnements: null, likes: null, abonnes: null, videos: null,
        erreur: `page : ${introuvable ? "introuvable" : page.erreur ?? "illisible"} · Apify : ${apify.erreur ?? "rien"}`.slice(0, 300),
      };
    }));
    bilan.comptes += lignes.length;
    const { error: errIns } = await supabase.from("ckd_warmup_releves").insert(lignes);
    if (errIns) throw errIns;
  }
  return bilan;
}

/**
 * Prompt 21, U4 : un handle corrigé dans « Needs you » est relevé tout de
 * suite (le relevé suivant fait avancer la recrue à l'étape d'après).
 */
async function releverCompte(supabase: Supabase, compteId: string) {
  if (!compteId) return { ok: false, error: "compte_id requis" };
  const { data: c, error } = await supabase.from("comptes").select("id, handle_tiktok").eq("id", compteId).maybeSingle();
  if (error) throw error;
  if (!c?.handle_tiktok) return { ok: false, error: "compte sans handle" };
  const p = await lireProfilTiktok(c.handle_tiktok as string);
  const { error: errIns } = await supabase.from("ckd_warmup_releves").insert({
    compte_id: c.id, handle: c.handle_tiktok, existe: p.existe, cree_tiktok_at: p.creeLe,
    abonnements: p.abonnements, likes: p.likes, abonnes: p.abonnes, videos: p.videos, erreur: p.erreur,
  });
  if (errIns) throw errIns;
  return { ok: true, existe: p.existe, abonnements: p.abonnements };
}

/**
 * 0444 : « My account has a different name » (dashboard). Le posteur donne son
 * @ exact ; l'OS le lit tout de suite sur TikTok. Trouvé : le @ du compte est
 * remplacé (les dates du warm-up restent) ; introuvable : « please check the
 * spelling » ; page illisible : relu au passage suivant (dans l'heure).
 */
async function handleProposer(supabase: Supabase, body: { handle?: unknown; compte_id?: unknown }, posteurId: string) {
  const handle = normaliserHandle(String(body.handle ?? ""));
  if (!handle) return { ok: false, error: "handle_invalide" };
  let requete = supabase.from("comptes").select("id, poster_id, handle_tiktok").eq("poster_id", posteurId).eq("is_active", true);
  requete = body.compte_id ? requete.eq("id", String(body.compte_id)) : requete.eq("type_compte", "perso");
  const { data: comptes, error } = await requete.order("created_at").limit(1);
  if (error) throw error;
  const c = comptes?.[0];
  if (!c) return { ok: false, error: "compte_introuvable" };
  const textes = await lireTextesHandle(supabase);
  const { data: ligne, error: errIns } = await supabase.from("handles_proposes").insert({
    poster_id: posteurId, compte_id: c.id, handle_attendu: c.handle_tiktok, handle_propose: handle, source: "dashboard",
  }).select("id").single();
  if (errIns) throw errIns;
  const issue = await verifierHandlePropose(supabase, lireProfilTiktok, {
    id: ligne.id, poster_id: posteurId, compte_id: c.id, handle_propose: handle, handle_attendu: c.handle_tiktok,
  });
  // Le @ remplacé : liens relus, « Ask for @ » répondu, carte « à valider » si le @ ne ressemble pas au nôtre.
  if (issue === "trouve") {
    const { error: errSuite } = await supabase.rpc("handle_corrige_suite", { p_proposition: ligne.id });
    if (errSuite) console.error("[ckd] handle_corrige_suite", errSuite.message);
  }
  const message = issue === "trouve"
    ? texteHandle(textes.trouve, { handle })
    : issue === "introuvable"
    ? texteHandle(textes.pas_trouve, { handle })
    : null;
  return { ok: true, statut: issue, handle, message };
}

/** Prompt 21, U6 : à 18 h (Paris), un DM Slack à Max s'il reste de l'urgent dans « Needs you ». */
async function alerteNeedsYou(supabase: Supabase) {
  const p = maintenantParis();
  if (p.heure !== 18) return { ok: true, ignore: "pas 18 h (Paris)" };
  const { data, error } = await supabase.rpc("needs_you");
  if (error) throw error;
  const urgents = ((data ?? []) as { urgence: string }[]).filter((c) => c.urgence !== "rien");
  if (urgents.length === 0) return { ok: true, urgents: 0 };
  const n = (u: string) => urgents.filter((c) => c.urgence === u).length;
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return { ok: false, error: "SLACK_HM_BOT_TOKEN manquant" };
  const texte = `:raising_hand: Needs you : ${urgents.length} cas urgent(s) — ${n("lundi")} bloquent lundi, ${n("paie")} la paie, ${n("kill")} un Kill.\n${OS_URL}/admin/auto/needs-you`;
  const r = await slackApi(jeton, "chat.postMessage", { channel: SLACK_MAX, text: texte, unfurl_links: false });
  return { ok: r.ok, urgents: urgents.length, ...(r.ok ? {} : { error: r.error }) };
}

async function verifierSlack(supabase: Supabase) {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return { ok: false, error: "SLACK_HM_BOT_TOKEN manquant" };
  const qui = await slackApi(jeton, "auth.test", {});
  if (!qui.ok) return { ok: false, error: `jeton refusé : ${qui.error}` };
  // Prompt 21, T : les droits du bot (en-tête x-oauth-scopes) et la désactivation par SCIM.
  const droits = await droitsSlack(jeton);
  const canal = await canalSlack(supabase);
  // Lecture : en GET, comme verifierCanal des comment masters.
  const info = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(canal)}`, {
    headers: { authorization: `Bearer ${jeton}` },
  }).then((r) => r.json() as Promise<{ ok: boolean; error?: string; channel?: unknown }>);
  if (!info.ok) return { ok: false, bot: qui.user, canal, error: `canal illisible : ${info.error}`, droits };
  // deno-lint-ignore no-explicit-any
  const ch: any = info.channel ?? {};
  return { ok: Boolean(ch.is_member), bot: qui.user, canal, nom: ch.name ?? null, membre: Boolean(ch.is_member), droits };
}

/**
 * Prompt 21, T : ce que le bot peut faire pour retirer quelqu'un de Slack.
 * conversations.kick demande channels:manage (canaux publics) et groups:write
 * (privés) ; la désactivation d'un compte passe par SCIM (plan Business+ ou
 * Enterprise, jeton d'un admin), jamais par un jeton de bot.
 */
async function droitsSlack(jeton: string) {
  const r = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${jeton}` } });
  const scopes = (r.headers.get("x-oauth-scopes") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const voulus = ["channels:manage", "groups:write", "channels:read", "groups:read", "users:read"];
  const scim = await fetch("https://api.slack.com/scim/v2/ServiceProviderConfigs", { headers: { authorization: `Bearer ${jeton}` } })
    .then(async (x) => ({ statut: x.status, corps: (await x.text()).slice(0, 200) }))
    .catch((e) => ({ statut: null, corps: messageErreur(e) }));
  return { scopes, manquent: voulus.filter((v) => !scopes.includes(v)), scim };
}

// ---------------------------------------------------------------------------
// Prompt 25 MAJ, 7a : « Connect my Slack » (Sign in with Slack)
// ---------------------------------------------------------------------------

/** L'URL de retour doit être le dashboard (jamais une autre adresse). */
function retourSlackValide(uri: unknown): uri is string {
  return uri === `${OS_URL}/lier-slack`;
}

function slackConnectUrl(body: { redirect_uri?: unknown; state?: unknown; nonce?: unknown }) {
  const clientId = Deno.env.get("SLACK_CLIENT_ID");
  if (!clientId || !Deno.env.get("SLACK_CLIENT_SECRET")) return { ok: true, disponible: false };
  if (!retourSlackValide(body.redirect_uri)) return { ok: false, error: "redirect_uri" };
  return {
    ok: true,
    disponible: true,
    url: urlConnexionSlack({
      clientId, redirectUri: body.redirect_uri, state: String(body.state ?? ""), nonce: String(body.nonce ?? ""),
      team: Deno.env.get("SLACK_TEAM_ID") ?? null,
    }),
  };
}

async function slackConnect(supabase: Supabase, body: { code?: unknown; redirect_uri?: unknown }, posterId: string) {
  const clientId = Deno.env.get("SLACK_CLIENT_ID");
  const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { ok: false, error: "indisponible" };
  if (!retourSlackValide(body.redirect_uri) || typeof body.code !== "string" || !body.code) return { ok: false, error: "parametres" };
  const id = await identiteSlack({ code: body.code, redirectUri: body.redirect_uri, clientId, clientSecret });
  if (!id.slack_user_id) return { ok: false, error: id.erreur ?? "slack" };
  const equipe = Deno.env.get("SLACK_TEAM_ID");
  if (equipe && id.team_id && id.team_id !== equipe) return { ok: false, error: "autre_workspace" };
  const { data, error } = await supabase.rpc("slack_lier_profil", { p_profile: posterId, p_slack: id.slack_user_id, p_par: "slack_connect" });
  if (error) return { ok: false, error: error.message };
  return data === "lie" || data === "deja" ? { ok: true, statut: data } : { ok: false, error: String(data) };
}
