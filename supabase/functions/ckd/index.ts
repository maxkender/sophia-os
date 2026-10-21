import {
  ajouterJours,
  blocsRecap,
  blocsZone,
  COLONNES_PROPOSITION,
  DECISIONS_ENVOYEES,
  maintenantParis,
  majRecap,
  type PropositionSlack,
  slackApi,
  texteRappel,
  texteRecap,
  zonesDe,
} from "../_shared/ckd.ts";
import { estLabelFileSlideshow } from "../_shared/labels_file.ts";
import { filtrerPoolParApplication } from "../_shared/labels_repli.ts";
import { chargerReglagesChoixLabel, statsChoixLabel } from "../_shared/fermeture_labels.ts";
import { choisirLabel } from "../_shared/choix_label_equilibre.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * Check, Kill or Double (0326 à 0328) : ce qui ne peut pas se faire en SQL.
 *
 *   { action: "decider", id, decision: "recreer" | "doubler", note? }   admin
 *       Réserve la proposition (`ckd_decider`), crée le compte par
 *       manage-users (`ajouter_compte`, même application), puis le relie
 *       (`ckd_compte_cree`). Recréer : répartition habituelle. Doubler : le
 *       choix équilibré de la répartition, sans les labels du 1ᵉʳ compte.
 *       Échec : la proposition redevient libre, avec l'erreur.
 *   { action: "envoyer", controle_id }                                 admin
 *       Poste dans #managers-hq les décisions pas encore envoyées : le récap
 *       (une fois), puis un message par zone dans son fil.
 *   { action: "envoi_auto" }      cron, dimanche 12 h (heure de Paris)
 *       Pareil pour le contrôle du samedi.
 *   { action: "rappel_lundi" }    cron, lundi 9 h (heure de Paris)
 *       Dans le fil du samedi : qui ne pas financer, qui passe à 2 comptes.
 *   { action: "verifier_slack" }                                       admin
 *       Le jeton marche-t-il, et le bot est-il dans le canal ? N'écrit rien.
 *
 * Le bouton Done des messages arrive dans `slack-interactions`.
 * Secrets : SLACK_HM_BOT_TOKEN (le bot « Sophia OS »), CRON_SECRET.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const supabase = serviceClient();
    const cron = acces.userId === "cron";

    switch (body.action) {
      case "decider":
        return await decider(supabase, body, cron ? null : acces.userId);
      case "envoyer":
        return json(await envoyer(supabase, String(body.controle_id ?? "")));
      case "envoi_auto": {
        const p = maintenantParis();
        if (!body.force && (p.isoJour !== 7 || p.heure !== 12)) return json({ ok: true, ignore: "pas dimanche 12 h" });
        const c = await controleSamedi(supabase, ajouterJours(p.jour, -1));
        if (!c) return json({ ok: true, ignore: "pas de contrôle samedi" });
        return json(await envoyer(supabase, c.id));
      }
      case "rappel_lundi": {
        const p = maintenantParis();
        if (!body.force && (p.isoJour !== 1 || p.heure !== 9)) return json({ ok: true, ignore: "pas lundi 9 h" });
        const c = await controleSamedi(supabase, ajouterJours(p.jour, -2));
        if (!c) return json({ ok: true, ignore: "pas de contrôle samedi" });
        return json(await rappel(supabase, c.id));
      }
      case "verifier_slack":
        return json(await verifierSlack(supabase));
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

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

    let labelId: string | null = null;
    if (decision === "doubler") {
      labelId = await labelDuDeuxieme(supabase, p.poster_id, slug, ancien.langue, ancien.pays);
      if (!labelId) return await liberer("aucun autre label de cette application pour le 2ᵉ compte", 409);
    }

    const cree = await appelerManageUsers({
      action: "ajouter_compte",
      userId: p.poster_id,
      type_compte: "perso",
      langue: ancien.langue,
      ...(ancien.pays ? { pays: ancien.pays } : {}),
      ...(ancien.posts_par_jour ? { posts_par_jour: ancien.posts_par_jour } : {}),
      parts_applications: { [slug]: 100 },
      ...(labelId ? { label_id: labelId } : {}),
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
    return json({ ok: true, compte: nouveau ?? { id: cree.compteId } });
  } catch (error) {
    return await liberer(messageErreur(error), 500);
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

  const { data: brutes, error: errProps } = await supabase
    .from("ckd_propositions")
    .select(COLONNES_PROPOSITION)
    .eq("controle_id", controleId)
    .in("decision", DECISIONS_ENVOYEES as unknown as string[])
    .is("envoye_at", null);
  if (errProps) throw errProps;
  // Recréer et Doubler ne partent qu'avec leur nouveau compte.
  const props = ((brutes ?? []) as PropositionSlack[]).filter(
    (p) => !["recreer", "doubler"].includes(p.decision ?? "") || p.nouveau_compte_id,
  );
  if (props.length === 0) return { ok: true, envoyees: 0 };

  const canal = c.slack_canal ?? await canalSlack(supabase);
  const noterErreur = async (e: string) => {
    await supabase.from("ckd_controles").update({ slack_erreur: e }).eq("id", controleId);
    throw new Error(`Slack : ${e}`);
  };

  // Le récap : posté une fois, réécrit ensuite.
  let fil = c.slack_ts as string | null;
  if (!fil) {
    const r = await slackApi(jeton, "chat.postMessage", {
      channel: canal,
      text: texteRecap(c.type, c.jour),
      blocks: blocsRecap(c.type, c.jour, []),
      unfurl_links: false,
    });
    if (!r.ok || !r.ts) return await noterErreur(r.error ?? "pas de ts");
    fil = r.ts;
    await supabase.from("ckd_controles").update({ slack_canal: canal, slack_ts: fil, slack_erreur: null }).eq("id", controleId);
  }

  let envoyees = 0;
  const erreurs: string[] = [];
  for (const z of await zonesDe(supabase, props)) {
    const r = await slackApi(jeton, "chat.postMessage", {
      channel: canal,
      thread_ts: fil,
      text: `Check, Kill or Double: ${z.decisions.length} decision${z.decisions.length > 1 ? "s" : ""} for ${z.zone ?? z.hmNom}`,
      blocks: blocsZone(c.type, z, c.jour),
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!r.ok) {
      erreurs.push(`${z.zone ?? z.hmNom} : ${r.error}`);
      continue;
    }
    const ids = z.decisions.map((d) => d.id);
    const { error: errMaj } = await supabase
      .from("ckd_propositions")
      .update({ envoye_at: new Date().toISOString(), slack_ts: r.ts })
      .in("id", ids);
    if (errMaj) throw errMaj;
    envoyees += ids.length;
  }

  await majRecap(supabase, jeton, controleId);
  await supabase.from("ckd_controles").update({ slack_erreur: erreurs.length ? erreurs.join(" · ") : null }).eq("id", controleId);
  return { ok: erreurs.length === 0, envoyees, ...(erreurs.length ? { erreurs } : {}) };
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
  const texte = texteRappel(c.jour, await zonesDe(supabase, (props ?? []) as PropositionSlack[]));
  if (!texte) return { ok: true, ignore: "aucun jalon à changer" };

  const r = await slackApi(jeton, "chat.postMessage", { channel: c.slack_canal, thread_ts: c.slack_ts, text: texte });
  if (!r.ok) throw new Error(`Slack : ${r.error}`);
  await supabase.from("ckd_controles").update({ rappel_at: new Date().toISOString() }).eq("id", controleId);
  return { ok: true, rappel: true };
}

async function verifierSlack(supabase: Supabase) {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return { ok: false, error: "SLACK_HM_BOT_TOKEN manquant" };
  const qui = await slackApi(jeton, "auth.test", {});
  if (!qui.ok) return { ok: false, error: `jeton refusé : ${qui.error}` };
  const canal = await canalSlack(supabase);
  // Lecture : en GET, comme verifierCanal des comment masters.
  const info = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(canal)}`, {
    headers: { authorization: `Bearer ${jeton}` },
  }).then((r) => r.json() as Promise<{ ok: boolean; error?: string; channel?: unknown }>);
  if (!info.ok) return { ok: false, bot: qui.user, canal, error: `canal illisible : ${info.error}` };
  // deno-lint-ignore no-explicit-any
  const ch: any = info.channel ?? {};
  return { ok: Boolean(ch.is_member), bot: qui.user, canal, nom: ch.name ?? null, membre: Boolean(ch.is_member) };
}
