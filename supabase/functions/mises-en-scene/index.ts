/**
 * Mises en scène — banque des captures d'applis, de leurs intégrateurs et de
 * leurs mises en scène (migration 0344, Admin → Bibliothèque).
 *
 * Trois étages, tous rangés par support (iphone, tablette, ordinateur) :
 *   1. captures      : les vrais écrans de nos applis, par application et support ;
 *   2. intégrateurs  : des photos de la bibliothèque (`media_library`) choisies
 *                      pour recevoir l'écran d'un support. On n'invente jamais
 *                      la scène ;
 *   3. mises en scène : chaque capture validée croisée avec chaque intégrateur
 *                      validé du même support, par Nano Banana Pro (Fal,
 *                      `fal-ai/nano-banana-pro/edit`), dans un ordre varié.
 * La clé Fal ne sort jamais du serveur. Seules les images validées par un
 * humain servent aux podz. Phase test en français (décision d'Adrien, 23/10).
 *
 * Langues (0346) : une mise en scène = une photo × un écran ; les langues en
 * sont des VERSIONS (`version_de`). La version part de la mise en scène
 * française validée et Nano Banana Pro n'y remplace que l'écran, par la
 * capture traduite et relue à plat : même photo, même main, même lumière.
 *
 * Accès :
 *   - admin (JWT) : tout ;
 *   - agent « Mises en scène » (en-tête `x-agent-jeton`, empreinte dans
 *     reglages.mises_en_scene.jeton_hash) : importe, propose des intégrateurs,
 *     met en scène, lit tout ; ne valide ni ne rejette jamais ;
 *   - podz (en-tête `x-pod-jeton` + `pod`) : lecture des images validées et
 *     compteur d'usage.
 *
 * Lecture :
 *   { action: "captures", application?, ecran?, langue?, support?, nature?, statut? }
 *   { action: "integrateurs", support?, statut? }
 *   { action: "mises_en_scene", application?, support?, ecran?, langue?, statut?, limite? }
 *       Podz : validées et à jour seulement, les moins utilisées d'abord.
 *   { action: "couples_manquants", application, support?, langue? (fr) }
 *       Captures validées × intégrateurs validés du même support sans mise en
 *       scène vivante, dans un ordre varié. Le lot se lance couple par couple
 *       (`mettre_en_scene`), une image Fal par appel.
 *   { action: "utiliser", id }   — podz : une mise en scène de plus dans un post.
 *   { action: "budget" }
 *
 * Écriture (admin / agent) :
 *   { action: "importer_capture", application, ecran, support, langue, image_base64, remplace_id? }
 *   { action: "traduire_capture", id, langue, forcer? }
 *   { action: "ajouter_integrateur", media_id, support, note? }
 *       Admin : validé d'emblée. Agent : à valider.
 *   { action: "mettre_en_scene", capture_id, integrateur_id, relance_de? }
 *       Capture originale seulement. `relance_de` : la seule relance permise
 *       d'un essai raté (rejeté alors).
 *   { action: "traduire_mise_en_scene", id, langue, relance_de? }
 *       Version `langue` de la mise en scène `id` (originale validée), en deux
 *       temps : sans capture traduite, la traduit à plat (à valider) et
 *       s'arrête là ; avec la capture traduite validée, remplace l'écran.
 *   { action: "versions_manquantes", application, langue, support? }
 *       Pour un lot de versions `langue` : les mises en scène d'origine
 *       validées prêtes (capture traduite validée, pas encore de version), et
 *       les écrans dont la capture reste à traduire ou à valider.
 *   { action: "renettoyer" }   — reprend les images déjà stockées : plus
 *       aucune métadonnée (XMP « IA », EXIF, C2PA), pixels inchangés.
 *   { action: "decider", objet: "capture"|"integrateur"|"mise_en_scene", id,
 *     statut: "validee"|"rejetee", motif? }   — admin seulement.
 *
 * Toute image rangée sort sans métadonnées (`sansMetadonnees`) : Nano Banana
 * laisse, en plus du C2PA, un XMP « trainedAlgorithmicMedia / Google AI ».
 *
 * Chaque appel Fal passe par le budget de la semaine (reglages.mises_en_scene,
 * journal `depenses_fal`). Au-delà : refus, sauf `hors_budget: true` d'un admin.
 */

import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import { editerNanoBananaPro } from "../_shared/fal_nano_banana.ts";
import {
  aRefaire,
  promptVersion,
  cheminCapture,
  cheminMiseEnScene,
  couplesManquants,
  ecranValide,
  etatBudget,
  extensionImage,
  langueValide,
  lireReglagesMisesEnScene,
  promptIncrustation,
  promptTraduction,
  relancePermise,
  sansMetadonnees,
  supportValide,
  tailleImage,
} from "../_shared/mises_en_scene.ts";
import { sha256Hex } from "../_shared/pods.ts";
import { assertRole, chargerPrompt, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";
const COLONNES_CAPTURE =
  "id, application_id, ecran, support, langue, nature, originale_id, url, largeur, hauteur, statut, motif_rejet, remplace_id, remplacee_par, created_at";
const COLONNES_INTEGRATEUR = "id, media_id, support, note, statut, motif_rejet, created_at, media:media_library (url, caption)";
const COLONNES_MES =
  "id, capture_id, integrateur_id, scene_id, application_id, ecran, langue, support, url, largeur, hauteur, statut, motif_rejet, essai, relance_de, version_de, used_count, created_at";

// deno-lint-ignore no-explicit-any
type Supabase = any;
type Appelant =
  | { role: "admin"; userId: string | null }
  | { role: "agent" }
  | { role: "pod"; slug: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "access-control-allow-headers": `${corsHeaders["access-control-allow-headers"]}, x-pod-jeton, x-agent-jeton`,
      },
    });
  }
  if (
    !request.headers.get("x-pod-jeton") && !request.headers.get("x-agent-jeton") &&
    !request.headers.get("Authorization") && !request.headers.get("x-cron-secret")
  ) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }

  const supabase = serviceClient();
  try {
    const appelant = await identifier(request, supabase, body);
    if (appelant instanceof Response) return appelant;

    switch (body?.action) {
      case "captures":
        return await listerCaptures(supabase, appelant, body);
      case "integrateurs":
        return await listerIntegrateurs(supabase, appelant, body);
      case "mises_en_scene":
        return await listerMisesEnScene(supabase, appelant, body);
      case "utiliser":
        return await utiliser(supabase, String(body.id ?? ""));
      case "budget":
        return json({ ok: true, budget: await budget(supabase) });
    }

    if (appelant.role === "pod") return json({ ok: false, error: "forbidden" }, 403);
    const par = appelant.role === "admin" ? `admin:${appelant.userId ?? "cron"}` : "agent:mises-en-scene";
    const horsBudget = appelant.role === "admin" && body?.hors_budget === true;

    switch (body?.action) {
      case "couples_manquants":
        return await listerCouplesManquants(supabase, body);
      case "importer_capture":
        return await importerCapture(supabase, body);
      case "traduire_capture":
        return await traduireCapture(supabase, body, par, horsBudget);
      case "ajouter_integrateur":
        return await ajouterIntegrateur(supabase, body, appelant);
      case "mettre_en_scene":
        return await mettreEnScene(supabase, body, par, horsBudget);
      case "traduire_mise_en_scene":
        return await traduireMiseEnScene(supabase, body, par, horsBudget);
      case "versions_manquantes":
        return await versionsManquantes(supabase, body);
      case "renettoyer":
        return await renettoyer(supabase);
      case "decider":
        if (appelant.role !== "admin") return json({ ok: false, error: "seul un humain valide ou rejette" }, 403);
        return await decider(supabase, body, appelant.userId);
    }
    return json({
      ok: false,
      error:
        "action inconnue (captures | integrateurs | mises_en_scene | couples_manquants | utiliser | budget | importer_capture | traduire_capture | ajouter_integrateur | mettre_en_scene | traduire_mise_en_scene | versions_manquantes | renettoyer | decider)",
    }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

async function identifier(request: Request, supabase: Supabase, body: Record<string, unknown>): Promise<Appelant | Response> {
  const jetonPod = request.headers.get("x-pod-jeton");
  if (jetonPod) {
    const slug = String(body.pod ?? "");
    const { data: pod } = await supabase.from("pods").select("slug, actif, jeton_hash").eq("slug", slug).maybeSingle();
    if (!pod?.actif || !pod.jeton_hash || (await sha256Hex(jetonPod)) !== pod.jeton_hash) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    return { role: "pod", slug };
  }
  const jetonAgent = request.headers.get("x-agent-jeton");
  if (jetonAgent) {
    const { data } = await supabase.from("reglages").select("valeur").eq("cle", "mises_en_scene").maybeSingle();
    const empreinte = (data?.valeur as { jeton_hash?: string } | null)?.jeton_hash;
    if (!empreinte || (await sha256Hex(jetonAgent)) !== empreinte) return json({ ok: false, error: "unauthorized" }, 401);
    return { role: "agent" };
  }
  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;
  return { role: "admin", userId: acces.userId === "cron" ? null : acces.userId };
}

async function applications(supabase: Supabase): Promise<{ id: string; slug: string; nom: string }[]> {
  const { data, error } = await supabase.from("applications").select("id, slug, nom");
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

async function listerCaptures(supabase: Supabase, appelant: Appelant, body: Record<string, unknown>) {
  const apps = await applications(supabase);
  let q = supabase.from("captures_app").select(COLONNES_CAPTURE);
  if (body.application) {
    const app = apps.find((a) => a.slug === body.application);
    if (!app) return json({ ok: false, error: "application inconnue" }, 400);
    q = q.eq("application_id", app.id);
  }
  if (body.ecran) q = q.eq("ecran", String(body.ecran));
  if (body.langue) q = q.eq("langue", String(body.langue));
  if (body.support) q = q.eq("support", String(body.support));
  if (body.nature) q = q.eq("nature", String(body.nature));
  if (appelant.role === "pod") q = q.eq("statut", "validee").is("remplacee_par", null);
  else if (body.statut) q = q.eq("statut", String(body.statut));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const slugDe = new Map(apps.map((a) => [a.id, a.slug]));
  // deno-lint-ignore no-explicit-any
  const captures = (data ?? []).map((c: any) => ({ ...c, application: slugDe.get(c.application_id) ?? null }));
  return json({ ok: true, captures });
}

async function listerIntegrateurs(supabase: Supabase, appelant: Appelant, body: Record<string, unknown>) {
  let q = supabase.from("integrateurs").select(COLONNES_INTEGRATEUR);
  if (body.support) q = q.eq("support", String(body.support));
  if (appelant.role === "pod") q = q.eq("statut", "validee");
  else if (body.statut) q = q.eq("statut", String(body.statut));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  const integrateurs = (data ?? []).map(({ media, ...i }: any) => ({ ...i, url: media?.url ?? null, caption: media?.caption ?? null }));
  return json({ ok: true, integrateurs });
}

async function listerMisesEnScene(supabase: Supabase, appelant: Appelant, body: Record<string, unknown>) {
  const apps = await applications(supabase);
  let q = supabase.from("mises_en_scene").select(COLONNES_MES);
  if (body.application) {
    const app = apps.find((a) => a.slug === body.application);
    if (!app) return json({ ok: false, error: "application inconnue" }, 400);
    q = q.eq("application_id", app.id);
  }
  if (body.support) q = q.eq("support", String(body.support));
  if (body.ecran) q = q.eq("ecran", String(body.ecran));
  if (body.langue) q = q.eq("langue", String(body.langue));
  if (appelant.role === "pod") q = q.eq("statut", "validee");
  else if (body.statut) q = q.eq("statut", String(body.statut));
  const limite = Math.min(Math.max(Number(body.limite) || 100, 1), 500);
  const { data, error } = await q
    .order(appelant.role === "pod" ? "used_count" : "created_at", { ascending: appelant.role === "pod" })
    .limit(limite);
  if (error) throw error;
  const slugDe = new Map(apps.map((a) => [a.id, a.slug]));
  // deno-lint-ignore no-explicit-any
  const refaire = await capturesARefaire(supabase, (data ?? []).map((m: any) => m.capture_id));
  // deno-lint-ignore no-explicit-any
  let lignes = (data ?? []).map((m: any) => ({
    ...m,
    application: slugDe.get(m.application_id) ?? null,
    a_refaire: refaire.has(m.capture_id),
  }));
  // deno-lint-ignore no-explicit-any
  if (appelant.role === "pod") lignes = lignes.filter((m: any) => !m.a_refaire);
  return json({ ok: true, mises_en_scene: lignes });
}

async function listerCouplesManquants(supabase: Supabase, body: Record<string, unknown>) {
  const app = (await applications(supabase)).find((a) => a.slug === body.application);
  if (!app) return json({ ok: false, error: "application : sophia | micabo | unswipe" }, 400);
  const langue = body.langue ? String(body.langue) : "fr";
  // Originales seulement : une langue traduite passe par les versions.
  let qc = supabase.from("captures_app").select("id, support, ecran").eq("application_id", app.id).eq("langue", langue)
    .eq("nature", "originale").eq("statut", "validee").is("remplacee_par", null);
  let qi = supabase.from("integrateurs").select("id, support").eq("statut", "validee");
  if (body.support) {
    qc = qc.eq("support", String(body.support));
    qi = qi.eq("support", String(body.support));
  }
  const [{ data: captures, error: e1 }, { data: integrateurs, error: e2 }] = await Promise.all([
    qc.order("ecran").order("created_at"),
    qi.order("created_at"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const ids = (captures ?? []).map((c: { id: string }) => c.id);
  const { data: existants, error: e3 } = ids.length
    ? await supabase.from("mises_en_scene").select("capture_id, integrateur_id").in("capture_id", ids).neq("statut", "rejetee")
    : { data: [], error: null };
  if (e3) throw e3;
  const couples = couplesManquants(captures ?? [], integrateurs ?? [], existants ?? []);
  return json({ ok: true, couples, budget: await budget(supabase) });
}

/**
 * Captures (parmi `ids`) remplacées, ou traductions d'une originale remplacée.
 * Deux lectures simples : PostgREST ne sait pas imbriquer la relation de
 * captures_app vers elle-même (originale_id) par le nom de la clé.
 */
async function capturesARefaire(supabase: Supabase, ids: string[]): Promise<Set<string>> {
  const uniques = [...new Set(ids)];
  if (!uniques.length) return new Set();
  const { data: captures, error } = await supabase.from("captures_app").select("id, originale_id, remplacee_par")
    .in("id", uniques);
  if (error) throw error;
  const origIds = [...new Set((captures ?? []).map((c: { originale_id: string | null }) => c.originale_id).filter(Boolean))];
  const { data: originales, error: e2 } = origIds.length
    ? await supabase.from("captures_app").select("id, remplacee_par").in("id", origIds)
    : { data: [], error: null };
  if (e2) throw e2;
  const originaleDe = new Map((originales ?? []).map((o: { id: string; remplacee_par: string | null }) => [o.id, o]));
  return new Set(
    (captures ?? [])
      .filter((c: { originale_id: string | null; remplacee_par: string | null }) =>
        aRefaire(c, c.originale_id ? originaleDe.get(c.originale_id) as { remplacee_par: string | null } : null)
      )
      .map((c: { id: string }) => c.id),
  );
}

async function utiliser(supabase: Supabase, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "id requis" }, 400);
  const { data, error } = await supabase.rpc("utiliser_mise_en_scene", { p_id: id });
  if (error) throw error;
  if (data === null || data === undefined) return json({ ok: false, error: "mise en scène validée introuvable" }, 404);
  return json({ ok: true, used_count: data });
}

async function budget(supabase: Supabase) {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "mises_en_scene").maybeSingle();
  const reglages = lireReglagesMisesEnScene(r?.valeur);
  const depuis = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase.from("depenses_fal").select("le, usd").gte("le", depuis);
  if (error) throw error;
  return etatBudget(data ?? [], reglages);
}

/** Refus lisible si une image de plus dépasse le budget de la semaine. */
async function verifierBudget(supabase: Supabase, horsBudget: boolean) {
  const b = await budget(supabase);
  if (b.possible || horsBudget) return { budget: b, refus: null };
  return {
    budget: b,
    refus: json({
      ok: false,
      error:
        `budget Fal de la semaine atteint (${b.depense_semaine.toFixed(2)} $ sur ${b.budget_semaine} $) : demande l'accord d'Adrien`,
      budget: b,
    }, 402),
  };
}

async function noterDepense(supabase: Supabase, action: string, objetId: string, usd: number, par: string) {
  const { error } = await supabase.from("depenses_fal").insert({ action, objet_id: objetId, usd, par });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function decoderBase64(b64: string): Uint8Array {
  const brut = b64.trim().replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  const bin = atob(brut);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function ranger(supabase: Supabase, chemin: string, bytes: Uint8Array, mime: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`stockage : ${messageErreur(error)}`);
  return supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl as string;
}

async function importerCapture(supabase: Supabase, body: Record<string, unknown>) {
  const app = (await applications(supabase)).find((a) => a.slug === body.application);
  if (!app) return json({ ok: false, error: "application : sophia | micabo | unswipe" }, 400);
  if (!ecranValide(body.ecran)) return json({ ok: false, error: "ecran : minuscules et tirets (parcours, a-retenir…)" }, 400);
  if (!supportValide(body.support)) return json({ ok: false, error: "support : iphone | tablette | ordinateur" }, 400);
  if (!langueValide(body.langue)) return json({ ok: false, error: "langue inconnue" }, 400);
  const bytes0 = decoderBase64(String(body.image_base64 ?? ""));
  const ext = extensionImage(bytes0);
  if (!ext) return json({ ok: false, error: "image_base64 : PNG ou JPEG" }, 400);
  const bytes = sansMetadonnees((await retirerContentCredentialsBytes(bytes0)).bytes);
  const taille = tailleImage(bytes);

  let remplaceId: string | null = null;
  if (body.remplace_id) {
    const { data: ancienne } = await supabase.from("captures_app").select("id, application_id, ecran, support, langue, nature")
      .eq("id", String(body.remplace_id)).maybeSingle();
    if (
      !ancienne || ancienne.nature !== "originale" || ancienne.application_id !== app.id ||
      ancienne.ecran !== body.ecran || ancienne.support !== body.support || ancienne.langue !== body.langue
    ) {
      return json({ ok: false, error: "remplace_id : une originale du même écran, support et langue" }, 400);
    }
    remplaceId = ancienne.id;
  }

  const id = crypto.randomUUID();
  const chemin = cheminCapture(app.slug, body.langue, body.ecran, body.support, id, ext);
  const url = await ranger(supabase, chemin, bytes, ext === "png" ? "image/png" : "image/jpeg");
  const { data, error } = await supabase.from("captures_app").insert({
    id,
    application_id: app.id,
    ecran: body.ecran,
    support: body.support,
    langue: body.langue,
    nature: "originale",
    storage_path: chemin,
    url,
    largeur: taille?.largeur ?? null,
    hauteur: taille?.hauteur ?? null,
    remplace_id: remplaceId,
  }).select(COLONNES_CAPTURE).single();
  if (error) throw error;
  return json({ ok: true, capture: data });
}

async function traduireCapture(supabase: Supabase, body: Record<string, unknown>, par: string, horsBudget: boolean) {
  const langue = body.langue;
  if (!langueValide(langue)) return json({ ok: false, error: "langue inconnue" }, 400);
  const { data: orig } = await supabase.from("captures_app").select("*").eq("id", String(body.id ?? "")).maybeSingle();
  if (!orig || orig.nature !== "originale") return json({ ok: false, error: "capture originale introuvable" }, 404);
  if (orig.statut !== "validee" || orig.remplacee_par) {
    return json({ ok: false, error: "seule une originale validée et à jour se traduit" }, 400);
  }
  if (orig.langue === langue) return json({ ok: false, error: "la capture est déjà dans cette langue" }, 400);
  if (body.forcer !== true) {
    const { data: deja } = await supabase.from("captures_app").select("id").eq("originale_id", orig.id)
      .eq("langue", langue).neq("statut", "rejetee").limit(1);
    if (deja?.length) return json({ ok: false, error: "déjà traduite dans cette langue (forcer pour refaire)", capture_id: deja[0].id }, 409);
  }
  const { budget: b, refus } = await verifierBudget(supabase, horsBudget);
  if (refus) return refus;
  const capture = await creerCaptureTraduite(supabase, orig, langue, par, b.prix_image);
  return json({ ok: true, capture, budget: await budget(supabase) });
}

/** Traduit à plat une originale (Nano Banana Pro) : nouvelle capture `traduite`, à valider. */
// deno-lint-ignore no-explicit-any
async function creerCaptureTraduite(supabase: Supabase, orig: any, langue: string, par: string, prix: number) {
  const app = (await applications(supabase)).find((a) => a.id === orig.application_id);
  const prompt = promptTraduction(await chargerPrompt(supabase, "mise_en_scene_traduction"), langue, app?.nom ?? "");
  const res = await editerNanoBananaPro(orig.url, prompt, undefined, { aspectRatio: "auto", resolution: "2K", budgetMs: 130_000 });
  const id = crypto.randomUUID();
  await noterDepense(supabase, "traduire_capture", id, prix, par);
  const nettoye = await retirerContentCredentialsBytes(res.bytes);
  const bytes = sansMetadonnees(nettoye.bytes);
  const mime = nettoye.mime;
  const ext = extensionImage(bytes) ?? "png";
  const taille = tailleImage(bytes);
  const chemin = cheminCapture(app?.slug ?? "app", langue, orig.ecran, orig.support, id, ext);
  const url = await ranger(supabase, chemin, bytes, mime === "application/octet-stream" ? "image/png" : mime);
  const { data, error } = await supabase.from("captures_app").insert({
    id,
    application_id: orig.application_id,
    ecran: orig.ecran,
    support: orig.support,
    langue,
    nature: "traduite",
    originale_id: orig.id,
    storage_path: chemin,
    url,
    largeur: taille?.largeur ?? null,
    hauteur: taille?.hauteur ?? null,
  }).select(COLONNES_CAPTURE).single();
  if (error) throw error;
  return data;
}

async function ajouterIntegrateur(supabase: Supabase, body: Record<string, unknown>, appelant: Appelant) {
  if (!supportValide(body.support)) return json({ ok: false, error: "support : iphone | tablette | ordinateur" }, 400);
  const { data: media } = await supabase.from("media_library").select("id, storage_path")
    .eq("id", String(body.media_id ?? "")).maybeSingle();
  if (!media) return json({ ok: false, error: "photo introuvable dans la bibliothèque" }, 404);
  if (!String(media.storage_path).startsWith("propre/")) {
    return json({ ok: false, error: "l'intégrateur doit être une photo propre de la bibliothèque" }, 400);
  }
  const admin = appelant.role === "admin";
  const { data, error } = await supabase.from("integrateurs").upsert({
    media_id: media.id,
    support: body.support,
    note: body.note ? String(body.note).slice(0, 300) : null,
    statut: admin ? "validee" : "a_valider",
    motif_rejet: null,
    decide_par: admin ? appelant.userId : null,
    decide_le: admin ? new Date().toISOString() : null,
  }, { onConflict: "media_id,support" }).select(COLONNES_INTEGRATEUR).single();
  if (error) throw error;
  return json({ ok: true, integrateur: data });
}

async function mettreEnScene(supabase: Supabase, body: Record<string, unknown>, par: string, horsBudget: boolean) {
  const { data: capture } = await supabase.from("captures_app").select("*")
    .eq("id", String(body.capture_id ?? "")).maybeSingle();
  if (!capture) return json({ ok: false, error: "capture introuvable" }, 404);
  if (capture.nature !== "originale") {
    return json({ ok: false, error: "une capture traduite passe par traduire_mise_en_scene (même photo que l'originale)" }, 400);
  }
  if (capture.statut !== "validee" || (await capturesARefaire(supabase, [capture.id])).size) {
    return json({ ok: false, error: "seule une capture validée et à jour se met en scène" }, 400);
  }
  const { data: integrateur } = await supabase.from("integrateurs").select("id, support, statut, media:media_library (id, url)")
    .eq("id", String(body.integrateur_id ?? "")).maybeSingle();
  if (!integrateur?.media) return json({ ok: false, error: "intégrateur introuvable" }, 404);
  if (integrateur.statut !== "validee") return json({ ok: false, error: "seul un intégrateur validé reçoit une capture" }, 400);
  if (integrateur.support !== capture.support) {
    return json({ ok: false, error: `support différent : capture ${capture.support}, intégrateur ${integrateur.support}` }, 400);
  }

  const essai = await essaiSuivant(supabase, body.relance_de, (m) => m.capture_id === capture.id && m.integrateur_id === integrateur.id);
  if (essai instanceof Response) return essai;
  if (!essai.relanceDe) {
    const { data: vivante } = await supabase.from("mises_en_scene").select("id").eq("capture_id", capture.id)
      .eq("integrateur_id", integrateur.id).neq("statut", "rejetee").limit(1);
    if (vivante?.length) return json({ ok: false, error: "ce couple a déjà sa mise en scène", mise_en_scene_id: vivante[0].id }, 409);
  }

  const { budget: b, refus } = await verifierBudget(supabase, horsBudget);
  if (refus) return refus;
  const prompt = promptIncrustation(await chargerPrompt(supabase, "mise_en_scene_incrustation"), capture.support);
  const data = await produire(supabase, {
    images: [integrateur.media.url, capture.url],
    prompt,
    capture,
    integrateurId: integrateur.id,
    sceneId: integrateur.media.id,
    versionDe: null,
    ...essai,
  }, par, b.prix_image);
  return json({ ok: true, mise_en_scene: data, budget: await budget(supabase) });
}

/**
 * Version `langue` d'une mise en scène originale validée. Sans capture
 * traduite : la traduit à plat (à valider par un humain) et s'arrête là.
 * Avec la capture traduite validée : remplace l'écran de l'image d'origine.
 */
async function traduireMiseEnScene(supabase: Supabase, body: Record<string, unknown>, par: string, horsBudget: boolean) {
  const langue = body.langue;
  if (!langueValide(langue)) return json({ ok: false, error: "langue inconnue" }, 400);
  const { data: racine } = await supabase.from("mises_en_scene").select("*").eq("id", String(body.id ?? "")).maybeSingle();
  if (!racine || racine.version_de) return json({ ok: false, error: "mise en scène d'origine introuvable" }, 404);
  if (racine.statut !== "validee" || (await capturesARefaire(supabase, [racine.capture_id])).size) {
    return json({ ok: false, error: "seule une mise en scène validée et à jour se traduit" }, 400);
  }
  if (racine.langue === langue) return json({ ok: false, error: "la mise en scène est déjà dans cette langue" }, 400);

  const essai = await essaiSuivant(supabase, body.relance_de, (m) => m.version_de === racine.id && m.langue === langue);
  if (essai instanceof Response) return essai;
  if (!essai.relanceDe) {
    const { data: vivante } = await supabase.from("mises_en_scene").select("id").eq("version_de", racine.id)
      .eq("langue", langue).neq("statut", "rejetee").limit(1);
    if (vivante?.length) return json({ ok: false, error: "cette langue a déjà sa version", mise_en_scene_id: vivante[0].id }, 409);
  }

  // 1. La capture traduite, relue à plat.
  const { data: traduites, error: e1 } = await supabase.from("captures_app").select("*").eq("originale_id", racine.capture_id)
    .eq("langue", langue).neq("statut", "rejetee").is("remplacee_par", null).order("created_at", { ascending: false }).limit(1);
  if (e1) throw e1;
  const traduite = traduites?.[0];
  if (!traduite) {
    const { budget: b, refus } = await verifierBudget(supabase, horsBudget);
    if (refus) return refus;
    const { data: orig } = await supabase.from("captures_app").select("*").eq("id", racine.capture_id).single();
    const capture = await creerCaptureTraduite(supabase, orig, langue, par, b.prix_image);
    return json({ ok: true, etape: "capture_traduite", capture, budget: await budget(supabase) });
  }
  if (traduite.statut !== "validee") {
    return json({ ok: true, etape: "capture_a_valider", capture: traduite });
  }

  // 2. Le même écran, traduit, dans la même image.
  const { budget: b, refus } = await verifierBudget(supabase, horsBudget);
  if (refus) return refus;
  const prompt = promptVersion(await chargerPrompt(supabase, "mise_en_scene_version"), racine.support);
  const data = await produire(supabase, {
    images: [racine.url, traduite.url],
    prompt,
    capture: traduite,
    integrateurId: racine.integrateur_id,
    sceneId: racine.scene_id,
    versionDe: racine.id,
    ...essai,
  }, par, b.prix_image);
  return json({ ok: true, etape: "version", mise_en_scene: data, budget: await budget(supabase) });
}

/** De quoi lancer un lot de versions `langue` (aucun appel Fal ici). */
async function versionsManquantes(supabase: Supabase, body: Record<string, unknown>) {
  const app = (await applications(supabase)).find((a) => a.slug === body.application);
  if (!app) return json({ ok: false, error: "application : sophia | micabo | unswipe" }, 400);
  const langue = body.langue;
  if (!langueValide(langue)) return json({ ok: false, error: "langue inconnue" }, 400);
  let q = supabase.from("mises_en_scene").select("id, capture_id, langue").eq("application_id", app.id)
    .is("version_de", null).eq("statut", "validee").neq("langue", langue);
  if (body.support) q = q.eq("support", String(body.support));
  const { data: origines, error } = await q.order("created_at");
  if (error) throw error;
  const refaire = await capturesARefaire(supabase, (origines ?? []).map((o: { capture_id: string }) => o.capture_id));
  const vivantes = (origines ?? []).filter((o: { capture_id: string }) => !refaire.has(o.capture_id));
  const ids = vivantes.map((o: { id: string }) => o.id);
  const capIds = [...new Set(vivantes.map((o: { capture_id: string }) => o.capture_id))];
  const [{ data: versions, error: e1 }, { data: traduites, error: e2 }] = await Promise.all([
    ids.length
      ? supabase.from("mises_en_scene").select("version_de").in("version_de", ids).eq("langue", langue).neq("statut", "rejetee")
      : { data: [], error: null },
    capIds.length
      ? supabase.from("captures_app").select("originale_id, statut").in("originale_id", capIds).eq("langue", langue)
        .neq("statut", "rejetee").is("remplacee_par", null)
      : { data: [], error: null },
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const faites = new Set((versions ?? []).map((v: { version_de: string }) => v.version_de));
  const statutCapture = new Map((traduites ?? []).map((c: { originale_id: string; statut: string }) => [c.originale_id, c.statut]));
  const pretes: string[] = [];
  const captures_a_traduire = new Set<string>();
  const captures_a_valider = new Set<string>();
  for (const o of vivantes as { id: string; capture_id: string }[]) {
    if (faites.has(o.id)) continue;
    const st = statutCapture.get(o.capture_id);
    if (st === "validee") pretes.push(o.id);
    else if (st) captures_a_valider.add(o.capture_id);
    else captures_a_traduire.add(o.capture_id);
  }
  return json({
    ok: true,
    pretes,
    captures_a_traduire: [...captures_a_traduire],
    captures_a_valider: [...captures_a_valider],
    budget: await budget(supabase),
  });
}

/** Reprend les fichiers déjà rangés : mêmes pixels, plus aucune métadonnée. */
async function renettoyer(supabase: Supabase) {
  const lignes: { table: string; id: string; storage_path: string; url: string }[] = [];
  for (const table of ["mises_en_scene", "captures_app"]) {
    const { data, error } = await supabase.from(table).select("id, storage_path, url");
    if (error) throw error;
    for (const l of data ?? []) lignes.push({ table, ...l });
  }
  let repris = 0;
  for (const l of lignes) {
    const r = await fetch(l.url);
    if (!r.ok) throw new Error(`téléchargement ${l.storage_path} : ${r.status}`);
    const avant = new Uint8Array(await r.arrayBuffer());
    const apres = sansMetadonnees((await retirerContentCredentialsBytes(avant)).bytes);
    if (apres.length === avant.length) continue;
    const { error } = await supabase.storage.from(BUCKET).upload(l.storage_path, apres, {
      contentType: extensionImage(apres) === "png" ? "image/png" : "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`stockage ${l.storage_path} : ${messageErreur(error)}`);
    repris += 1;
  }
  return json({ ok: true, fichiers: lignes.length, repris });
}

/** Essai 1, ou relance (une seule) d'un essai raté qui vérifie `memeObjet`. */
async function essaiSuivant(
  supabase: Supabase,
  relanceDe: unknown,
  // deno-lint-ignore no-explicit-any
  memeObjet: (m: any) => boolean,
): Promise<{ essai: number; relanceDe: string | null } | Response> {
  if (!relanceDe) return { essai: 1, relanceDe: null };
  const { data: ancien } = await supabase.from("mises_en_scene").select("*").eq("id", String(relanceDe)).maybeSingle();
  if (!ancien || !memeObjet(ancien)) return json({ ok: false, error: "relance_de : un essai de la même mise en scène" }, 400);
  if (!relancePermise(ancien.essai) || ancien.statut === "validee") {
    return json({ ok: false, error: "une seule relance : au-delà, la mise en scène est rejetée" }, 400);
  }
  return { essai: ancien.essai + 1, relanceDe: ancien.id };
}

/** Appel Nano Banana Pro, stockage sans C2PA, dépense notée, ligne insérée. */
async function produire(
  supabase: Supabase,
  p: {
    images: string[];
    prompt: string;
    // deno-lint-ignore no-explicit-any
    capture: any;
    integrateurId: string;
    sceneId: string;
    versionDe: string | null;
    essai: number;
    relanceDe: string | null;
  },
  par: string,
  prix: number,
) {
  const res = await editerNanoBananaPro(p.images, p.prompt, undefined, {
    aspectRatio: "auto",
    resolution: "2K",
    budgetMs: 130_000,
  });
  const id = crypto.randomUUID();
  await noterDepense(supabase, p.versionDe ? "traduire_mise_en_scene" : "mettre_en_scene", id, prix, par);
  const nettoye = await retirerContentCredentialsBytes(res.bytes);
  const bytes = sansMetadonnees(nettoye.bytes);
  const mime = nettoye.mime;
  const ext = extensionImage(bytes) ?? "png";
  const taille = tailleImage(bytes);
  const c = p.capture;
  const slug = (await applications(supabase)).find((a) => a.id === c.application_id)?.slug ?? "app";
  const chemin = cheminMiseEnScene(slug, c.langue, c.ecran, c.support, id, ext);
  const url = await ranger(supabase, chemin, bytes, mime === "application/octet-stream" ? "image/png" : mime);
  // L'essai raté sort avant que la relance n'entre (un seul vivant).
  if (p.relanceDe) {
    const { error: e0 } = await supabase.from("mises_en_scene")
      .update({ statut: "rejetee", motif_rejet: `relancée (${id.slice(0, 8)})` }).eq("id", p.relanceDe);
    if (e0) throw e0;
  }
  const { data, error } = await supabase.from("mises_en_scene").insert({
    id,
    capture_id: c.id,
    integrateur_id: p.integrateurId,
    scene_id: p.sceneId,
    application_id: c.application_id,
    ecran: c.ecran,
    langue: c.langue,
    support: c.support,
    storage_path: chemin,
    url,
    largeur: taille?.largeur ?? null,
    hauteur: taille?.hauteur ?? null,
    essai: p.essai,
    relance_de: p.relanceDe,
    version_de: p.versionDe,
    prompt: p.prompt,
  }).select(COLONNES_MES).single();
  if (error) throw error;
  return data;
}

const TABLES_DECISION: Record<string, string> = {
  capture: "captures_app",
  integrateur: "integrateurs",
  mise_en_scene: "mises_en_scene",
};

async function decider(supabase: Supabase, body: Record<string, unknown>, userId: string | null) {
  const statut = body.statut;
  if (statut !== "validee" && statut !== "rejetee") return json({ ok: false, error: "statut : validee | rejetee" }, 400);
  const table = TABLES_DECISION[String(body.objet ?? "")];
  if (!table) return json({ ok: false, error: "objet : capture | integrateur | mise_en_scene" }, 400);
  const id = String(body.id ?? "");
  const { data, error } = await supabase.from(table).update({
    statut,
    motif_rejet: statut === "rejetee" ? (body.motif ? String(body.motif).slice(0, 500) : null) : null,
    decide_par: userId,
    decide_le: new Date().toISOString(),
  }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) return json({ ok: false, error: "introuvable" }, 404);
  // Une nouvelle capture validée remplace l'ancienne du même écran : ses
  // traductions et mises en scène deviennent « à refaire ».
  if (table === "captures_app" && statut === "validee" && data.remplace_id) {
    const { error: e2 } = await supabase.from("captures_app").update({ remplacee_par: data.id }).eq("id", data.remplace_id);
    if (e2) throw e2;
  }
  return json({ ok: true, ligne: data });
}
