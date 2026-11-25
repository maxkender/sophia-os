/**
 * whatsapp — WhatsApp (API Cloud de Meta), 22/11 (Max). Mode test d'abord (réglage whatsapp_mode) : seuls les numéros
 * autorisés reçoivent ; rien ne part aux posteurs avant l'OK de Max pour passer en live.
 *
 *   GET  /api/whatsapp/webhook   (Vercel → /functions/v1/whatsapp/webhook) : vérification Meta (WHATSAPP_VERIFY_TOKEN).
 *   POST /api/whatsapp/webhook   : signature X-Hub-Signature-256 (WHATSAPP_APP_SECRET) sinon 401 ; réponse 200 tout de
 *        suite, traitement en arrière-plan. Statuts → whatsapp_envois. Messages → whatsapp_recus (une fois par wamid),
 *        médias téléchargés (vocal transcrit), STOP, puis le support (demande source whatsapp, réponse du bot).
 *   POST { action } (admin ou x-cron-secret) :
 *        etat              les secrets présents (oui/non, jamais leur valeur), le numéro, le mode
 *        modeles_sync      les modèles et leur statut d'approbation chez Meta → whatsapp_modeles
 *        modele_ruul_setup soumet le modèle ruul_setup (Utility, anglais) s'il n'existe pas
 *        soumettre_modeles_v2  (23/11, Max) soumet à Meta les 5 modèles v2 (anglais) qui n'existent pas encore ;
 *                          ne change rien aux envois
 *        soumettre_traductions (25/11, Max) traduit les modèles anglais APPROVED (sauf hello_world) en es, pt_BR, it,
 *                          de, fr, pl, ro, hu, cs, el, tr et les soumet à Meta (même nom, même catégorie). Jamais deux
 *                          fois : ce qui existe chez Meta (quel que soit le statut) est sauté. { langues?, modeles?,
 *                          max? (50) } ; { simuler: true } : les textes traduits et leurs problèmes, rien n'est soumis.
 *                          Chaque soumission est gardée dans whatsapp_modeles_soumissions (0860). 25/11 : si Meta
 *                          associe déjà une autre catégorie au modèle (2388026), un nouvel essai dans celle-là.
 *        test_modeles      envoie chaque modèle approuvé aux numéros autorisés (mode test)
 *        envoyer           { e164, texte } ou { e164, modele, langue, variables } (règles du mode test)
 *        relances          (cron horaire whatsapp-relances, 0839) les relances automatiques, en plus des emails ;
 *                          { simuler: true } : la liste seulement (comptes par modèle dans `par_modele`), rien ne
 *                          part ; { simuler: true, comme_live: true } : comme si le mode était live. Mode test : numéros autorisés seuls ; live : seulement si whatsapp_relances.live est vrai.
 *                          25/11 : modèles v2 (repli sur l'ancien tant que le v2 n'est pas APPROVED), dans la langue
 *                          du posteur (celle de ses emails) si le modèle y est APPROVED, sinon en anglais.
 *
 * Les secrets ne sont jamais écrits dans la base ni dans les journaux.
 */
import { assertRole, json, messageErreur, secretCron, serviceClient } from "../_shared/supabase.ts";
import { callWithFallback, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import {
  champsProfil, CORPS_RUUL_SETUP, e164, GRAPH, estStopWhatsApp, lireWebhook, type MessageRecu, modeLive, MODELES, numeroAutorise, signatureValide,
  type StatutRecu, texteFinWhatsApp,
} from "../_shared/whatsapp.ts";
import {
  envoyerWhatsApp, graph, lireModeWhatsApp, modelesApprouves, modelesApprouvesLangues, secretsWhatsApp, wabaId,
} from "../_shared/whatsapp_envoi.ts";
import { deciderRelance, type FaitsRelance, paysRelance } from "../_shared/whatsapp_relances.ts";
import { nicheOuNull } from "../_shared/niche_posteur.ts";
import { MODELES_V2, type ModeleV2, problemesModele, requeteModele } from "../_shared/whatsapp_modeles_v2.ts";
import {
  aSoumettre, categorieImposeeParMeta, choisirLangueEnvoi, cleModeleLangue, LANGUES_MODELES, langueMeta, limiteMeta, modeleDepuisComposants,
  traduireModele,
} from "../_shared/whatsapp_traductions.ts";

type Db = ReturnType<typeof serviceClient>;
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const LIEN_DASHBOARD = "https://sophia-marketing-orga.vercel.app";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "").endsWith("/webhook")) return webhook(request, url);

  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;
  if (request.method !== "POST") return json({ ok: false, error: "POST attendu" }, 405);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = serviceClient();
  try {
    switch (body.action) {
      case "etat": return json(await etat(db));
      case "modeles_sync": return json(await modelesSync(db));
      case "modele_ruul_setup": return json(await modeleRuulSetup(db));
      case "soumettre_modeles_v2": return json(await soumettreModelesV2(db));
      case "soumettre_traductions": return json(await soumettreTraductions(db, body));
      case "abonner": return json(await abonner(db));
      case "profil": return json(await profil(db, body));
      case "test_modeles": return json(await testModeles(db));
      case "relances": return json(await relances(db, body.simuler === true, body.simuler === true && body.comme_live === true));
      case "envoyer": {
        const numero = e164(String(body.e164 ?? ""));
        if (!numero) return json({ ok: false, error: "e164 invalide" }, 400);
        const r = typeof body.modele === "string"
          ? await envoyerWhatsApp(db, {
            e164: numero, motif: "manuel", langueCible: typeof body.langue_cible === "string" ? body.langue_cible : null,
            modele: { nom: body.modele, langue: String(body.langue ?? "en"), variables: Array.isArray(body.variables) ? body.variables.map(String) : [] },
          })
          : await envoyerWhatsApp(db, { e164: numero, motif: "manuel", texte: String(body.texte ?? ""), demandeId: typeof body.demande_id === "string" ? body.demande_id : null });
        return json(r);
      }
      default: return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (e) {
    console.error("whatsapp", messageErreur(e));
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ------------------------------------------------------------------------------------------------------------------
// Webhook
// ------------------------------------------------------------------------------------------------------------------

async function webhook(request: Request, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const attendu = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
    const ok = url.searchParams.get("hub.mode") === "subscribe" && attendu.length > 0 && url.searchParams.get("hub.verify_token") === attendu;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const brut = await request.text();
  if (!await signatureValide(brut, request.headers.get("x-hub-signature-256"), Deno.env.get("WHATSAPP_APP_SECRET"))) {
    return new Response("unauthorized", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(brut);
  } catch {
    return new Response("ok", { status: 200 });
  }
  const travail = traiter(payload).catch((e) => console.error("whatsapp webhook", messageErreur(e)));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(travail);
  else await travail;
  return new Response("ok", { status: 200 });
}

async function traiter(payload: unknown) {
  const db = serviceClient();
  const { messages, statuts } = lireWebhook(payload);
  for (const s of statuts) await noterStatut(db, s);
  for (const m of messages) await recevoir(db, m);
}

const RANG: Record<string, number> = { a_envoyer: 0, envoye: 1, livre: 2, lu: 3, echec: 4, bloque: 4 };

async function noterStatut(db: Db, s: StatutRecu) {
  const { data: e } = await db.from("whatsapp_envois").select("id, statut").eq("wamid", s.wamid).maybeSingle();
  if (!e) return;
  const maj: Record<string, unknown> = {};
  if (s.statut === "echec") Object.assign(maj, { statut: "echec", echec_at: s.at, erreur: s.erreur });
  else if ((RANG[s.statut] ?? 0) > (RANG[String(e.statut)] ?? 0) && e.statut !== "echec") maj.statut = s.statut;
  if (s.statut === "envoye") maj.envoye_at = s.at;
  if (s.statut === "livre") maj.livre_at = s.at;
  if (s.statut === "lu") maj.lu_at = s.at;
  if (s.categorie) maj.categorie_meta = s.categorie;
  if (Object.keys(maj).length) await db.from("whatsapp_envois").update(maj).eq("id", e.id);
}

async function recevoir(db: Db, m: MessageRecu) {
  // Une seule fois par wamid : Meta peut renvoyer le même message.
  const { data: inseree, error } = await db.from("whatsapp_recus")
    .upsert({ wamid: m.wamid, de: m.de, type: m.type, texte: m.texte, contexte_wamid: m.contexte, recu_at: m.at }, { onConflict: "wamid", ignoreDuplicates: true })
    .select("wamid");
  if (error) throw new Error(`whatsapp_recus : ${error.message}`);
  if (!inseree?.length) return;

  const { data: contact } = await db.from("posteur_contacts").select("poster_id, whatsapp_optout_at").eq("whatsapp_e164", m.de)
    .not("poster_id", "is", null).order("maj_at", { ascending: false }).limit(1).maybeSingle();
  const poster = (contact?.poster_id as string | null) ?? null;
  const maj: Record<string, unknown> = { poster_id: poster };

  // Médias : téléchargés et gardés dans l'espace privé « support » ; un vocal est transcrit si possible.
  let transcription: string | null = null;
  if (m.media) {
    const med = await telechargerMedia(db, m.wamid, m.media);
    maj.media = med;
    if (med.chemin && (m.media.type === "audio" || m.media.type === "voice") && med.base64) {
      transcription = await transcrire(med.base64, m.media.mime ?? "audio/ogg");
      maj.transcription = transcription;
    }
    delete (med as { base64?: string }).base64;
  }
  const texte = [m.texte, transcription ? `[voice] ${transcription}` : null].filter(Boolean).join("\n").trim();

  const mode = await lireModeWhatsApp(db);
  const autorise = numeroAutorise(mode, m.de);
  const enTest = (mode as { mode?: string })?.mode !== "live";
  // Mode test : un numéro non autorisé est seulement noté (ni bot, ni STOP, ni action) jusqu'au passage en live.
  if (enTest && !autorise) {
    await db.from("whatsapp_recus").update({ ...maj, resultat: "mode test : noté seulement (numéro non autorisé)", traite_at: new Date().toISOString() }).eq("wamid", m.wamid);
    return;
  }

  // STOP : le message entier, en réponse à un de nos messages (un envoi déjà fait vers ce numéro).
  const { data: envoiPrecedent } = await db.from("whatsapp_envois").select("id, motif, envoye_at").eq("e164", m.de)
    .in("statut", ["envoye", "livre", "lu"]).order("cree_at", { ascending: false }).limit(1).maybeSingle();
  if (estStopWhatsApp(m.texte) && envoiPrecedent) {
    const r = await stop(db, { de: m.de, poster, simule: enTest, wamid: m.wamid });
    await db.from("whatsapp_recus").update({ ...maj, stop_at: new Date().toISOString(), stop_simule: enTest, resultat: r, traite_at: new Date().toISOString() }).eq("wamid", m.wamid);
    return;
  }

  // Une réponse dans les 24 h après la confirmation de fin : « je voulais seulement arrêter WhatsApp ? » → Max.
  const apresFin = envoiPrecedent?.motif === "fin_stop" && envoiPrecedent.envoye_at &&
    Date.now() - new Date(envoiPrecedent.envoye_at as string).getTime() < 24 * 3600_000;

  const r = await versSupport({ de: m.de, wamid: m.wamid, texte: texte || `[${m.type}]`, poster, media: maj.media ?? null, apresFin: !!apresFin, autorise });
  await db.from("whatsapp_recus").update({ ...maj, demande_id: r.id ?? null, resultat: r.resultat, erreur: r.erreur ?? null, traite_at: new Date().toISOString() }).eq("wamid", m.wamid);
}

async function telechargerMedia(db: Db, wamid: string, media: { id: string; mime: string | null; type: string }) {
  const meta = await graph(media.id);
  const lien = typeof meta.data?.url === "string" ? meta.data.url : null;
  const mime = (typeof meta.data?.mime_type === "string" ? meta.data.mime_type : media.mime) ?? "application/octet-stream";
  if (!lien) return { type: media.type, mime, chemin: null as string | null, erreur: meta.erreur, base64: null as string | null };
  try {
    const r = await fetch(lien, { headers: { authorization: `Bearer ${secretsWhatsApp().token}` } });
    if (!r.ok) return { type: media.type, mime, chemin: null, erreur: `HTTP ${r.status}`, base64: null };
    const octets = new Uint8Array(await r.arrayBuffer());
    const ext = (mime.split("/")[1] ?? "bin").split(";")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    const chemin = `whatsapp/${wamid.replace(/[^A-Za-z0-9_.-]/g, "_")}.${ext}`;
    const { error } = await db.storage.from("support").upload(chemin, octets, { contentType: mime, upsert: true });
    let base64: string | null = null;
    if (octets.length < 4_000_000) {
      let s = "";
      for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      base64 = btoa(s);
    }
    return { type: media.type, mime, chemin: error ? null : chemin, erreur: error?.message ?? null, base64 };
  } catch (e) {
    return { type: media.type, mime, chemin: null, erreur: messageErreur(e), base64: null };
  }
}

async function transcrire(base64: string, mime: string): Promise<string | null> {
  try {
    const parts = await callWithFallback(TEXT_MODELS, [
      { inline_data: { mime_type: mime.split(";")[0], data: base64 } },
      { text: "Transcribe this voice message word for word, in its original language. Reply with the transcription only." },
    ]);
    return textOf(parts).trim().slice(0, 3000) || null;
  } catch {
    return null;
  }
}

/** Le message passe au support (même cerveau que Help, Slack, email) : demande source whatsapp, réponse du bot. */
async function versSupport(o: { de: string; wamid: string; texte: string; poster: string | null; media: unknown; apresFin: boolean; autorise: boolean }) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/support`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": (await secretCron()) ?? "" },
      body: JSON.stringify({ action: "whatsapp_message", e164: o.de, wamid: o.wamid, texte: o.texte, poster_id: o.poster, media: o.media, apres_fin: o.apresFin }),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; id?: string; niveau?: string; envoi?: string; error?: string } | null;
    return { id: j?.id ?? null, resultat: j?.ok ? `support : ${j?.niveau ?? "?"} ; réponse : ${j?.envoi ?? "?"}` : "support : échec", erreur: j?.ok ? null : (j?.error ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { id: null, resultat: "support : échec", erreur: messageErreur(e) };
  }
}

/**
 * STOP. Live : la procédure d'arrêt habituelle (arrets, source je_ne_veux_plus : désactivation, Ruul, Slack, contrat,
 * fin des relances), retrait du consentement, confirmation. Test : rien n'est arrêté (simulation notée), consentement
 * retiré si le numéro est connu, confirmation envoyée (numéro autorisé seulement).
 */
async function stop(db: Db, o: { de: string; poster: string | null; simule: boolean; wamid: string }): Promise<string> {
  const etapes: string[] = [];
  if (o.poster && !o.simule) {
    const { data: deja } = await db.from("arrets").select("id").eq("poster_id", o.poster).is("annule_at", null).in("statut", ["a_faire", "fait"]).limit(1);
    if (!deja?.length) {
      const { error } = await db.from("arrets").insert({ poster_id: o.poster, source: "je_ne_veux_plus", motif: "STOP sur WhatsApp" });
      etapes.push(error ? `arrêt : ${error.message}` : "arrêt lancé (procédure habituelle)");
    } else etapes.push("arrêt déjà fait");
  } else {
    etapes.push(o.poster ? "SIMULATION : l'arrêt du posteur serait lancé (mode test)" : "SIMULATION : numéro sans posteur (mode test), aucun arrêt");
  }
  await db.from("posteur_contacts").update({ whatsapp_optout_at: new Date().toISOString(), maj_at: new Date().toISOString() }).eq("whatsapp_e164", o.de);
  etapes.push("consentement WhatsApp retiré");
  const reste = o.poster ? await resteAPayer(db, o.poster) : false;
  const conf = await envoyerWhatsApp(db, { e164: o.de, posterId: o.poster, motif: "fin_stop", cle: `fin_stop:${o.wamid}`, texte: texteFinWhatsApp(reste) });
  etapes.push(conf.ok ? "confirmation envoyée" : `confirmation : ${conf.erreur ?? conf.statut}`);
  await db.from("journal_auto").insert({
    qui: "whatsapp", quoi: "stop", mode: o.simule ? "simulation" : "agir", poster_id: o.poster, canal: "whatsapp",
    resultat: etapes.join(" ; ").slice(0, 900),
  }).then(() => null, () => null);
  return etapes.join(" ; ");
}

/** Des posts publiés depuis le lundi de la semaine précédente (pas encore payés) : « your last week will be paid ». */
async function resteAPayer(db: Db, poster: string): Promise<boolean> {
  const d = new Date();
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7)).toISOString().slice(0, 10);
  const { data: comptes } = await db.from("comptes").select("id").eq("poster_id", poster);
  const ids = (comptes ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return false;
  const { count } = await db.from("passages").select("id", { count: "exact", head: true }).in("compte_id", ids)
    .not("publie_url", "is", null).gte("date_publication_prevue", lundi);
  return (count ?? 0) > 0;
}

// ------------------------------------------------------------------------------------------------------------------
// Administration
// ------------------------------------------------------------------------------------------------------------------

/**
 * Abonne l'application au compte WhatsApp Business (POST subscribed_apps) : sans cet abonnement, Meta n'envoie
 * aucun webhook (messages reçus, statuts). Rien n'est envoyé à personne.
 */
async function abonner(db: Db) {
  const waba = await wabaId(db);
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  const r = await graph(`${waba}/subscribed_apps`, { method: "POST", body: {} });
  const apres = await graph(`${waba}/subscribed_apps`);
  return { ok: r.ok, erreur: r.erreur, apps_abonnees: apres.ok ? apres.data?.data : apres.erreur };
}

const CHAMPS_PROFIL = "about,address,description,email,profile_picture_url,websites,vertical";

/**
 * Le profil WhatsApp Business du numéro. Sans champ : lecture seule. Avec des champs (about, description, email,
 * address, websites, vertical) et/ou photo_url (image JPG/PNG en https) : mise à jour, puis relecture.
 * La photo passe par l'envoi « resumable » de Meta (application abonnée au compte), jamais par la base.
 */
async function profil(db: Db, b: Record<string, unknown>) {
  const { phoneId, token } = secretsWhatsApp();
  if (!phoneId || !token) return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN absent" };
  const { champs, erreurs } = champsProfil(b);
  const photoUrl = typeof b.photo_url === "string" ? b.photo_url.trim() : "";
  if (photoUrl && !/^https:\/\/\S+$/i.test(photoUrl)) erreurs.push("photo_url : adresse https");
  if (erreurs.length) return { ok: false, erreurs };
  const avant = await graph(`${phoneId}/whatsapp_business_profile?fields=${CHAMPS_PROFIL}`);
  if (!Object.keys(champs).length && !photoUrl) {
    return { ok: avant.ok, erreur: avant.erreur, profil: (avant.data?.data as unknown[] | undefined)?.[0] ?? null };
  }

  const maj: Record<string, unknown> = { messaging_product: "whatsapp", ...champs };
  if (photoUrl) {
    const h = await envoyerPhotoProfil(db, photoUrl, token);
    if ("erreur" in h) return { ok: false, erreur: h.erreur };
    maj.profile_picture_handle = h.handle;
  }
  const r = await graph(`${phoneId}/whatsapp_business_profile`, { method: "POST", body: maj });
  const apres = await graph(`${phoneId}/whatsapp_business_profile?fields=${CHAMPS_PROFIL}`);
  return {
    ok: r.ok, erreur: r.erreur, modifie: Object.keys(maj).filter((k) => k !== "messaging_product"),
    profil: (apres.data?.data as unknown[] | undefined)?.[0] ?? null,
  };
}

/** Télécharge l'image (JPG/PNG, 5 Mo au plus) et l'envoie à Meta : renvoie le « handle » à mettre au profil. */
async function envoyerPhotoProfil(db: Db, url: string, token: string): Promise<{ handle: string } | { erreur: string }> {
  const img = await fetch(url).catch(() => null);
  if (!img?.ok) return { erreur: `photo illisible (${img?.status ?? "réseau"})` };
  const type = (img.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg" && type !== "image/png") return { erreur: `photo : JPG ou PNG attendu (reçu ${type || "?"})` };
  const octets = await img.arrayBuffer();
  if (!octets.byteLength || octets.byteLength > 5 * 1024 * 1024) return { erreur: "photo : 5 Mo au plus" };

  // L'application abonnée au compte WhatsApp Business porte l'envoi.
  const waba = await wabaId(db);
  const apps = await graph(`${waba}/subscribed_apps`);
  const appId = ((apps.data?.data as { whatsapp_business_api_data?: { id?: string } }[] | undefined)?.[0]?.whatsapp_business_api_data?.id) ?? "";
  if (!appId) return { erreur: "aucune application abonnée au compte (action abonner)" };

  const ext = type === "image/png" ? "png" : "jpg";
  const session = await graph(`${appId}/uploads?file_name=profil.${ext}&file_length=${octets.byteLength}&file_type=${encodeURIComponent(type)}`, { method: "POST" });
  const uploadId = session.data?.id as string | undefined;
  if (!session.ok || !uploadId) return { erreur: `ouverture de l'envoi : ${session.erreur ?? "pas d'identifiant"}` };
  const envoi = await fetch(`${GRAPH}/${uploadId}`, {
    method: "POST",
    headers: { authorization: `OAuth ${token}`, file_offset: "0" },
    body: octets,
  }).catch(() => null);
  const donnees = await envoi?.json().catch(() => null) as { h?: string; error?: { message?: string } } | null;
  if (!envoi?.ok || !donnees?.h) return { erreur: `envoi de la photo : ${donnees?.error?.message ?? envoi?.status ?? "réseau"}` };
  return { handle: donnees.h };
}

async function etat(db: Db) {
  const s = { ...secretsWhatsApp(), waba: await wabaId(db) };
  const presents = {
    WHATSAPP_TOKEN: !!s.token, WHATSAPP_PHONE_NUMBER_ID: !!s.phoneId, WHATSAPP_BUSINESS_ACCOUNT_ID: !!s.waba,
    WHATSAPP_APP_SECRET: !!Deno.env.get("WHATSAPP_APP_SECRET"), WHATSAPP_VERIFY_TOKEN: !!Deno.env.get("WHATSAPP_VERIFY_TOKEN"),
  };
  const numero = s.phoneId ? await graph(`${s.phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`) : null;
  const abonnements = s.waba ? await graph(`${s.waba}/subscribed_apps`) : null;
  // L'identifiant donné n'est pas un compte WhatsApp Business ? Peut-être celui du portefeuille Business : on cherche
  // les comptes WhatsApp qu'il possède (les identifiants seuls, jamais le jeton).
  let pistes: Record<string, unknown> | null = null;
  if (s.waba && !abonnements?.ok) {
    const [possedes, clients, moi] = await Promise.all([
      graph(`${s.waba}/owned_whatsapp_business_accounts?fields=id,name`),
      graph(`${s.waba}/client_whatsapp_business_accounts?fields=id,name`),
      graph("me?fields=id,name"),
    ]);
    pistes = {
      comptes_possedes: possedes.ok ? possedes.data?.data : possedes.erreur,
      comptes_clients: clients.ok ? clients.data?.data : clients.erreur,
      utilisateur_du_jeton: moi.ok ? moi.data : moi.erreur,
    };
  }
  // Les droits réels du jeton (portées, comptes WhatsApp accessibles), jamais sa valeur.
  const dbg = s.token ? await graph(`debug_token?input_token=${encodeURIComponent(s.token)}`) : null;
  const d = (dbg?.data?.data ?? null) as { scopes?: string[]; granular_scopes?: { scope: string; target_ids?: string[] }[]; expires_at?: number; is_valid?: boolean; type?: string } | null;
  const jeton = d
    ? { valide: d.is_valid, type: d.type, expire: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "jamais", portees: d.scopes, comptes: d.granular_scopes }
    : { erreur: dbg?.erreur ?? "lecture impossible" };
  return {
    ok: true, secrets: presents, mode: await lireModeWhatsApp(db), pistes_waba: pistes, jeton, waba_utilise: s.waba,
    numero: numero?.ok ? numero.data : { erreur: numero?.erreur ?? "pas d'identifiant" },
    apps_abonnees: abonnements?.ok ? abonnements.data : { erreur: abonnements?.erreur ?? "pas de WABA" },
  };
}

async function modelesSync(db: Db) {
  const waba = await wabaId(db);
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  // 25/11 : par pages de 100 (curseur after), les traductions font passer le compte au-delà d'une page.
  const lus: Record<string, unknown>[] = [];
  let apres = "";
  for (let page = 0; page < 30; page++) {
    const r = await graph(`${waba}/message_templates?fields=name,language,status,category,id,components,rejected_reason&limit=100${apres ? `&after=${encodeURIComponent(apres)}` : ""}`);
    if (!r.ok) return { ok: false, error: r.erreur };
    lus.push(...((r.data?.data ?? []) as Record<string, unknown>[]));
    const pages = r.data?.paging as { next?: string; cursors?: { after?: string } } | undefined;
    if (!pages?.next || !pages.cursors?.after) break;
    apres = pages.cursors.after;
  }
  const lignes = lus.map((t) => ({
    nom: String(t.name), langue: String(t.language), statut: String(t.status ?? ""), categorie: String(t.category ?? ""), meta_id: String(t.id ?? ""),
    composants: t.components ?? null, raison: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null, maj_at: new Date().toISOString(),
  }));
  if (lignes.length) {
    const { error } = await db.from("whatsapp_modeles").upsert(lignes, { onConflict: "nom,langue" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, modeles: lignes.map((l) => ({ nom: l.nom, langue: l.langue, statut: l.statut, categorie: l.categorie, raison: l.raison })) };
}

async function modeleRuulSetup(db: Db) {
  const waba = await wabaId(db);
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  const avant = await modelesSync(db);
  if (avant.ok && (avant.modeles ?? []).some((m) => m.nom === "ruul_setup" && m.langue === "en")) return { ok: true, deja: true };
  const r = await graph(`${waba}/message_templates`, {
    method: "POST",
    body: {
      name: "ruul_setup", language: "en", category: "UTILITY",
      components: [{ type: "BODY", text: CORPS_RUUL_SETUP, example: { body_text: [["Ana", `${LIEN_DASHBOARD}/ruul`]] } }],
    },
  });
  await modelesSync(db);
  return r.ok ? { ok: true, soumis: r.data } : { ok: false, error: r.erreur };
}

/** 23/11 (Max) : soumet à Meta les modèles v2 absents (anglais, Utility). Rien n'est envoyé à personne. */
async function soumettreModelesV2(db: Db) {
  const waba = await wabaId(db);
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  const avant = await modelesSync(db);
  const existants = new Set((avant.ok ? avant.modeles ?? [] : []).filter((m) => m.langue === "en").map((m) => m.nom));
  const resultats: Record<string, unknown>[] = [];
  for (const m of MODELES_V2) {
    const p = problemesModele(m);
    if (p.length) { resultats.push({ modele: m.nom, soumis: false, erreur: p.join(", ") }); continue; }
    if (existants.has(m.nom)) { resultats.push({ modele: m.nom, soumis: false, deja: true }); continue; }
    const r = await graph(`${waba}/message_templates`, { method: "POST", body: requeteModele(m) });
    resultats.push({ modele: m.nom, soumis: r.ok, statut: r.data?.status ?? null, categorie: r.data?.category ?? null, erreur: r.erreur });
  }
  await modelesSync(db);
  return { ok: true, resultats };
}

/** N à la fois, dans l'ordre. */
async function parLots<T, R>(liste: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const sortie: R[] = [];
  for (let i = 0; i < liste.length; i += n) sortie.push(...await Promise.all(liste.slice(i, i + n).map(f)));
  return sortie;
}

/**
 * 25/11 (Max) : les modèles anglais APPROVED (sauf hello_world, l'exemple de Meta) traduits dans les langues des
 * posteurs et soumis à Meta (même nom, même catégorie que l'anglais). Rien n'est envoyé à personne.
 * Meta limite les créations (~100 par heure et par compte) : `max` par appel (50 par défaut), arrêt à la première
 * erreur de limite, et reprise sans doublon (ce qui existe chez Meta, quel que soit son statut, est sauté).
 * `simuler` : les textes traduits et leurs problèmes, rien n'est soumis (les traductions sans problème sont gardées
 * en cache : la vraie soumission les reprend telles quelles).
 */
async function soumettreTraductions(db: Db, b: Record<string, unknown>) {
  const simuler = b.simuler === true;
  const waba = await wabaId(db);
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  const sync = await modelesSync(db);
  if (!sync.ok) return { ok: false, error: `modeles_sync : ${sync.error}` };
  const existants = new Set((sync.modeles ?? []).map((m) => cleModeleLangue(m.nom, m.langue)));

  const { data: lignes, error } = await db.from("whatsapp_modeles").select("nom, categorie, composants")
    .eq("langue", "en").eq("statut", "APPROVED").neq("nom", "hello_world").order("nom");
  if (error) return { ok: false, error: error.message };
  const voulus = Array.isArray(b.modeles) ? new Set(b.modeles.map(String)) : null;
  const sources = new Map<string, { modele: ModeleV2; categorie: string }>();
  const ignores: { modele: string; raison: string }[] = [];
  for (const l of (lignes ?? []) as { nom: string; categorie: string | null; composants: unknown }[]) {
    if (voulus && !voulus.has(l.nom)) continue;
    const { modele, probleme } = modeleDepuisComposants(l.nom, l.composants);
    if (!modele) ignores.push({ modele: l.nom, raison: probleme ?? "?" });
    else sources.set(l.nom, { modele, categorie: (l.categorie || "UTILITY").toUpperCase() });
  }
  const demandees = Array.isArray(b.langues) ? b.langues.map(String) : [...LANGUES_MODELES];
  const langues = [...new Set(demandees.map(langueMeta).filter((l) => l !== "en"))];
  const languesIgnorees = demandees.filter((l) => langueMeta(l) === "en");
  const max = Number(b.max) > 0 ? Math.min(Math.floor(Number(b.max)), 200) : 50;
  const noms = [...sources.keys()];
  const aFaire = aSoumettre(noms, langues, existants, Number.MAX_SAFE_INTEGER).length;
  const liste = aSoumettre(noms, langues, existants, max);

  // 1. Les traductions (cache d'abord), 6 à la fois.
  const traductions = await parLots(liste, 6, async (x) => ({ ...x, ...(await traduireModele(db, x.langue, sources.get(x.nom)!.modele)) }));
  const vue = (t: (typeof traductions)[number]) => ({
    modele: t.nom, langue: t.langue, categorie: sources.get(t.nom)!.categorie, depuis_cache: t.depuisCache,
    corps: (t.modele ?? t.essai)?.corps ?? null, boutons: (t.modele ?? t.essai)?.boutons.map((x) => x.texte) ?? null,
    problemes: t.problemes,
  });
  const base = {
    ok: true, simulation: simuler, langues, langues_ignorees: languesIgnorees, modeles: noms, ignores,
    deja_chez_meta: noms.length * langues.length - aFaire, a_faire_avant: aFaire,
  };
  if (simuler) return { ...base, traitees: traductions.length, resultats: traductions.map(vue) };

  // 2. La soumission à Meta, 3 à la fois ; arrêt dès que Meta dit que la limite est atteinte.
  let limite = false;
  const resultats = await parLots(traductions, 3, async (t) => {
    if (!t.modele) return { ...vue(t), soumis: false, erreur: "traduction refusée par les règles" };
    if (limite) return { ...vue(t), soumis: false, erreur: "pas tenté : limite Meta atteinte (à relancer plus tard)" };
    const soumettre = async (categorie: string) => {
      const requete = requeteModele(t.modele!, t.langue, categorie);
      const r = await graph(`${waba}/message_templates`, { method: "POST", body: requete });
      if (limiteMeta(r.erreur)) limite = true;
      await db.from("whatsapp_modeles_soumissions").insert({
        nom: t.nom, langue: t.langue, categorie, requete, ok: r.ok, meta_id: r.data?.id ?? null,
        statut: r.data?.status ?? null, erreur: r.erreur,
      }).then(() => null, () => null);
      return r;
    };
    let categorie = sources.get(t.nom)!.categorie;
    let r = await soumettre(categorie);
    // 25/11 : Meta associe déjà une autre catégorie à ce modèle (il a reclassé d'autres langues) : une langue de
    // plus doit avoir la même ; un seul nouvel essai, avec la catégorie que Meta nomme.
    const imposee = !r.ok && !limite ? categorieImposeeParMeta(r.erreur, categorie) : null;
    if (imposee) {
      categorie = imposee;
      r = await soumettre(categorie);
    }
    return { ...vue(t), categorie, soumis: r.ok, statut: r.data?.status ?? null, erreur: r.erreur };
  });
  const apres = await modelesSync(db);
  const existantsApres = apres.ok ? new Set((apres.modeles ?? []).map((m) => cleModeleLangue(m.nom, m.langue))) : existants;
  return {
    ...base,
    soumises: resultats.filter((r) => r.soumis).length,
    refusees_par_les_regles: resultats.filter((r) => !r.soumis && r.problemes.length).length,
    erreurs_meta: resultats.filter((r) => !r.soumis && !r.problemes.length).length,
    limite_atteinte: limite,
    reste_a_soumettre: aSoumettre(noms, langues, existantsApres, Number.MAX_SAFE_INTEGER).length,
    resultats,
  };
}

/** Mode test : chaque modèle approuvé (anglais) part une fois vers chaque numéro autorisé, avec des valeurs d'exemple. */
async function testModeles(db: Db) {
  const mode = await lireModeWhatsApp(db) as { mode?: string; numeros_autorises?: string[] };
  if (mode?.mode === "live") return { ok: false, error: "réservé au mode test" };
  await modelesSync(db);
  const { data: modeles } = await db.from("whatsapp_modeles").select("nom, langue, statut").in("nom", Object.keys(MODELES)).eq("langue", "en");
  const exemples: Record<string, string[]> = {
    contract_to_sign: ["Max", "https://vik-studios-creators.com"],
    account_ready: ["Max", LIEN_DASHBOARD],
    warmup_reminder: ["Max", LIEN_DASHBOARD],
    no_posts_this_week: ["Max", LIEN_DASHBOARD],
    ruul_setup: ["Max", `${LIEN_DASHBOARD}/ruul`],
  };
  const resultats: Record<string, unknown>[] = [];
  const jour = new Date().toISOString().slice(0, 13);
  for (const numero of mode.numeros_autorises ?? []) {
    for (const nom of Object.keys(MODELES)) {
      const m = (modeles ?? []).find((x: { nom: string }) => x.nom === nom);
      if (!m || m.statut !== "APPROVED") { resultats.push({ modele: nom, statut: m?.statut ?? "absent", envoye: false }); continue; }
      const r = await envoyerWhatsApp(db, { e164: numero, motif: "test_modeles", cle: `test:${nom}:${numero}:${jour}`, modele: { nom, langue: "en", variables: exemples[nom] } });
      resultats.push({ modele: nom, statut: m.statut, envoye: r.ok, erreur: r.erreur ?? null });
    }
  }
  return { ok: true, resultats };
}

// ------------------------------------------------------------------------------------------------------------------
// Relances automatiques (0839), en plus des emails
// ------------------------------------------------------------------------------------------------------------------

/**
 * 25/11 : la langue d'un posteur telle que l'OS la connaît, comme pour ses emails Ruul : email_langue_poster (pays de
 * son compte actif, sinon de sa candidature) ; sans posteur, email_langue_pays du pays retenu (fiche, sinon
 * indicatif). Une lecture par posteur ou par pays et par passage.
 */
function langueDuPosteur(db: Db) {
  const parPosteur = new Map<string, string | null>();
  const parPays = new Map<string, string | null>();
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return async (f: FaitsRelance): Promise<string | null> => {
    if (f.poster_id) {
      if (!parPosteur.has(f.poster_id)) {
        const { data } = await db.rpc("email_langue_poster", { p_poster: f.poster_id });
        parPosteur.set(f.poster_id, texte(data));
      }
      const l = parPosteur.get(f.poster_id);
      if (l) return l;
    }
    const pays = paysRelance(f);
    if (!pays) return null;
    if (!parPays.has(pays)) {
      const { data } = await db.rpc("email_langue_pays", { p_pays: pays });
      parPays.set(pays, texte(data));
    }
    return parPays.get(pays) ?? null;
  };
}

/** Complète les faits : le @ du 1er compte perso actif et la fin de son warm-up (lecture par paquets de 150). */
async function completerComptes(db: Db, faits: FaitsRelance[]) {
  const ids = [...new Set(faits.map((f) => f.poster_id).filter((x): x is string => !!x))];
  const parPosteur = new Map<string, { handle: string | null; warmup_ends_at: string | null }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("comptes").select("poster_id, handle_tiktok, warmup_ends_at, created_at")
      .in("poster_id", ids.slice(i, i + 150)).eq("type_compte", "perso").eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1000);
    if (error) throw new Error(`comptes : ${error.message}`);
    for (const c of data ?? []) {
      if (!parPosteur.has(c.poster_id as string)) {
        parPosteur.set(c.poster_id as string, { handle: (c.handle_tiktok as string | null) ?? null, warmup_ends_at: c.warmup_ends_at as string | null });
      }
    }
  }
  const t = Date.now();
  for (const f of faits) {
    const c = f.poster_id ? parPosteur.get(f.poster_id) : undefined;
    f.handle = c?.handle?.replace(/^@/, "") || null;
    f.warmup_fini = !!c?.warmup_ends_at && Date.parse(c.warmup_ends_at) <= t;
  }
}

/**
 * Chaque numéro connu : la relance due aujourd'hui (une seule), ses garde-fous, puis l'envoi du modèle. Le mode test
 * est vérifié deux fois : ici (un numéro non autorisé n'est même pas tenté) et dans envoyerWhatsApp.
 */
async function relances(db: Db, simuler: boolean, commeLive = false) {
  const mode = await lireModeWhatsApp(db);
  const { data: reglage } = await db.from("reglages").select("valeur").eq("cle", "whatsapp_relances").maybeSingle();
  // Deuxième verrou : en live, rien ne part aux posteurs tant que whatsapp_relances.live n'est pas vrai.
  const liveAutorise = (reglage?.valeur as { live?: unknown } | null)?.live === true;
  if (modeLive(mode) && !liveAutorise && !simuler) return { ok: true, envoyees: 0, raison: "live : réglage whatsapp_relances.live éteint" };

  const { data, error } = await db.rpc("whatsapp_relances_faits");
  if (error) return { ok: false, error: error.message };
  const bilan = {
    ok: true, simulation: simuler, comme_live: commeLive, numeros: 0, dues: 0, envoyees: 0, refusees: 0, erreurs: 0,
    /** Par modèle : dues, refusées (et pourquoi), qui partiraient (simulation) ou parties. */
    par_modele: {} as Record<string, { dues: number; partiraient: number; envoyees: number; refus: Record<string, number>; langues: Record<string, number> }>,
    detail: [] as Record<string, unknown>[],
  };
  const maintenant = new Date();
  const faits = (data ?? []) as FaitsRelance[];
  await completerComptes(db, faits);
  const approuves = await modelesApprouves(db);
  // 25/11 : la langue du posteur (celle de ses emails) et les modèles APPROVED dans chaque langue.
  const approuvesLangues = await modelesApprouvesLangues(db);
  const langueDe = langueDuPosteur(db);
  for (const f of faits) {
    bilan.numeros++;
    const modeAutorise = commeLive || numeroAutorise(mode, f.e164);
    let d = deciderRelance(f, { modeAutorise, maintenant, approuves });
    if (!d) continue;
    if (d.type === "warmup_start" && !d.refus && d.modele?.nom === "warmup_start" && f.poster_id) {
      // La niche du compte (null : texte générique « your topic »), lue seulement quand elle sert.
      f.niche = await nicheOuNull(db, f.poster_id);
      d = deciderRelance(f, { modeAutorise, maintenant, approuves }) ?? d;
    }
    bilan.dues++;
    const cle = d.modele?.nom ?? d.type;
    const pm = bilan.par_modele[cle] ??= { dues: 0, partiraient: 0, envoyees: 0, refus: {}, langues: {} };
    pm.dues++;
    const ligne: Record<string, unknown> = { poster_id: f.poster_id, site_id: f.site_id, type: d.type, modele: d.modele?.nom ?? null };
    if (d.refus || !d.modele) {
      const raison = d.refus ?? "pas de modèle";
      bilan.refusees++;
      pm.refus[raison] = (pm.refus[raison] ?? 0) + 1;
      bilan.detail.push({ ...ligne, refus: raison });
      continue;
    }
    const modele = d.modele;
    f.langue = await langueDe(f);
    const langueCible = f.langue ?? null;
    // La langue qui partira : celle du posteur si le modèle y est APPROVED, sinon l'anglais (revérifié à l'envoi).
    const langue = choisirLangueEnvoi(modele.nom, langueCible, approuvesLangues);
    pm.langues[langue] = (pm.langues[langue] ?? 0) + 1;
    Object.assign(ligne, { langue_posteur: langueCible, langue });
    if (simuler) {
      pm.partiraient++;
      bilan.detail.push({ ...ligne, simule: true, variables: modele.variables });
      continue;
    }
    const r = await envoyerWhatsApp(db, { e164: f.e164, posterId: f.poster_id, motif: d.motif, cle: d.cle, modele, langueCible });
    if (r.ok) pm.envoyees++;
    if (r.ok) bilan.envoyees++;
    else bilan.erreurs++;
    bilan.detail.push({ ...ligne, statut: r.statut, erreur: r.erreur ?? null });
  }
  return bilan;
}
