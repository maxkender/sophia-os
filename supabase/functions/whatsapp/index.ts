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
 *        test_modeles      envoie chaque modèle approuvé aux numéros autorisés (mode test)
 *        envoyer           { e164, texte } ou { e164, modele, langue, variables } (règles du mode test)
 *
 * Les secrets ne sont jamais écrits dans la base ni dans les journaux.
 */
import { assertRole, json, messageErreur, secretCron, serviceClient } from "../_shared/supabase.ts";
import { callWithFallback, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import {
  CORPS_RUUL_SETUP, e164, estStopWhatsApp, lireWebhook, type MessageRecu, MODELES, numeroAutorise, signatureValide, type StatutRecu,
  texteFinWhatsApp,
} from "../_shared/whatsapp.ts";
import { envoyerWhatsApp, graph, lireModeWhatsApp, secretsWhatsApp } from "../_shared/whatsapp_envoi.ts";

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
      case "test_modeles": return json(await testModeles(db));
      case "envoyer": {
        const numero = e164(String(body.e164 ?? ""));
        if (!numero) return json({ ok: false, error: "e164 invalide" }, 400);
        const r = typeof body.modele === "string"
          ? await envoyerWhatsApp(db, { e164: numero, motif: "manuel", modele: { nom: body.modele, langue: String(body.langue ?? "en"), variables: Array.isArray(body.variables) ? body.variables.map(String) : [] } })
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

async function etat(db: Db) {
  const s = secretsWhatsApp();
  const presents = {
    WHATSAPP_TOKEN: !!s.token, WHATSAPP_PHONE_NUMBER_ID: !!s.phoneId, WHATSAPP_BUSINESS_ACCOUNT_ID: !!s.waba,
    WHATSAPP_APP_SECRET: !!Deno.env.get("WHATSAPP_APP_SECRET"), WHATSAPP_VERIFY_TOKEN: !!Deno.env.get("WHATSAPP_VERIFY_TOKEN"),
  };
  const numero = s.phoneId ? await graph(`${s.phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput`) : null;
  const abonnements = s.waba ? await graph(`${s.waba}/subscribed_apps`) : null;
  return {
    ok: true, secrets: presents, mode: await lireModeWhatsApp(db),
    numero: numero?.ok ? numero.data : { erreur: numero?.erreur ?? "pas d'identifiant" },
    apps_abonnees: abonnements?.ok ? abonnements.data : { erreur: abonnements?.erreur ?? "pas de WABA" },
  };
}

async function modelesSync(db: Db) {
  const { waba } = secretsWhatsApp();
  if (!waba) return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID absent" };
  const r = await graph(`${waba}/message_templates?fields=name,language,status,category,id,components,rejected_reason&limit=200`);
  if (!r.ok) return { ok: false, error: r.erreur };
  const lignes = ((r.data?.data ?? []) as Record<string, unknown>[]).map((t) => ({
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
  const { waba } = secretsWhatsApp();
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
