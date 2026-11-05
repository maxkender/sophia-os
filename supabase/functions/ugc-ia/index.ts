/**
 * UGC IA (page /admin/ugc-ia, migration 0656) : une réaction TikTok refaite
 * par un persona synthétique avec Higgsfield Genjutsu (transfert de mouvement).
 * Admin seulement. La page lit les tables directement ; tout changement passe ici.
 *
 *   { action: "importer", url, personaId? }   → télécharge la vidéo TikTok (Apify)
 *   { action: "couper", id, debut, fin }       → coupe le passage (Fal, sans recodage)
 *   { action: "generer", id, prompt?, resolution? } → lance Genjutsu (API Higgsfield)
 *   { action: "suivre" }                        → relève les générations en cours et
 *                                                 rapatrie les vidéos terminées
 *   { action: "supprimer", id }                 → la vidéo et ses fichiers
 *
 * Secrets : APIFY_TOKEN, FAL_KEY, HIGGSFIELD_API_KEY (« KEY_ID:KEY_SECRET »).
 */

import { downloadMedia, scrapeVideoPost } from "../_shared/apify.ts";
import { trimmerVideoFal } from "../_shared/fal_trim_video.ts";
import {
  cleHiggsfield,
  corpsGenjutsu,
  lancerGenjutsuMouvement,
  RESOLUTIONS_GENJUTSU,
  type ResolutionGenjutsu,
  suivreGenjutsu,
} from "../_shared/higgsfield.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { cheminsUgcIa, lienTiktok, passage, PROMPT_DEFAUT } from "../_shared/ugc_ia.ts";

const BUCKET = "medias";
type Supabase = ReturnType<typeof serviceClient>;

async function deposer(supabase: Supabase, chemin: string, octets: Uint8Array): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, octets, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`stockage : ${error.message}`);
  return `${supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl}?v=${Date.now()}`;
}

async function lireVideo(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("ugc_ia_videos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function importer(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const url = lienTiktok(body.url);
  const personaId = String(body.personaId ?? "").trim();
  const requete = supabase.from("ugc_ia_personas").select("id").eq("actif", true);
  const { data: persona, error: errPersona } = await (personaId ? requete.eq("id", personaId) : requete.order("created_at"))
    .limit(1)
    .maybeSingle();
  if (errPersona) throw new Error(errPersona.message);
  if (!persona) return json({ error: "aucun persona actif" }, 400);

  const post = await scrapeVideoPost(url);
  const octets = await downloadMedia(post.videoUrl);
  const id = crypto.randomUUID();
  const chemin = cheminsUgcIa(id).source;
  const brutUrl = await deposer(supabase, chemin, octets);
  const { data, error } = await supabase
    .from("ugc_ia_videos")
    .insert({
      id,
      persona_id: persona.id,
      source_url: post.webVideoUrl || url,
      source_texte: post.text || null,
      source_vues: post.stats.vues,
      source_duree_s: post.dureeMs != null ? post.dureeMs / 1000 : null,
      brut_path: chemin,
      brut_url: brutUrl,
      statut: "importee",
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([chemin]);
    throw new Error(error.message);
  }
  return json({ ok: true, video: data });
}

async function couper(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  const video = id ? await lireVideo(supabase, id) : null;
  if (!video) return json({ error: "vidéo introuvable" }, 404);
  if (!["importee", "coupee", "echec"].includes(video.statut)) {
    return json({ error: "cette vidéo est déjà générée ou en cours de génération" }, 409);
  }
  if (!video.brut_url) return json({ error: "pas de vidéo source à couper" }, 409);
  const p = passage(body.debut, body.fin, video.source_duree_s != null ? Number(video.source_duree_s) : null);
  if ("erreur" in p) return json({ error: p.erreur }, 400);

  const coupe = await trimmerVideoFal({ videoUrl: video.brut_url, startSec: p.debut, endSec: p.fin });
  const chemin = cheminsUgcIa(id).reaction;
  const coupeUrl = await deposer(supabase, chemin, coupe.bytes);
  const { data, error } = await supabase
    .from("ugc_ia_videos")
    .update({
      debut_s: p.debut,
      fin_s: p.fin,
      coupe_path: chemin,
      coupe_url: coupeUrl,
      statut: "coupee",
      erreur: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return json({ ok: true, video: data });
}

async function generer(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const cle = cleHiggsfield();
  if (!cle) return json({ error: "Clé Higgsfield absente : ajoute le secret HIGGSFIELD_API_KEY (KEY_ID:KEY_SECRET) dans Supabase" }, 500);
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id requis" }, 400);
  const resolution = String(body.resolution ?? "720p") as ResolutionGenjutsu;
  if (!RESOLUTIONS_GENJUTSU.includes(resolution)) return json({ error: "résolution : 480p, 720p ou 1080p" }, 400);
  const prompt = String(body.prompt ?? "").trim() || PROMPT_DEFAUT;

  // Passage à « en_cours » sous condition : un double clic ne lance pas deux
  // générations (chacune est facturée).
  const { data: video, error } = await supabase
    .from("ugc_ia_videos")
    .update({
      statut: "en_cours",
      prompt,
      resolution,
      erreur: null,
      higgsfield_request_id: null,
      lancee_le: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("statut", ["coupee", "echec"])
    .not("coupe_url", "is", null)
    .select("*, persona:ugc_ia_personas(image_url)")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!video) return json({ error: "vidéo pas encore coupée, ou génération déjà lancée" }, 409);

  try {
    const corps = corpsGenjutsu({
      videoUrl: video.coupe_url,
      imageUrls: [(video.persona as { image_url: string } | null)?.image_url ?? ""],
      prompt,
      resolution,
    });
    const { requestId } = await lancerGenjutsuMouvement(cle, corps);
    const { data, error: errMaj } = await supabase
      .from("ugc_ia_videos")
      .update({ higgsfield_request_id: requestId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (errMaj) throw new Error(errMaj.message);
    return json({ ok: true, video: data });
  } catch (e) {
    await supabase
      .from("ugc_ia_videos")
      .update({ statut: "echec", erreur: messageErreur(e), updated_at: new Date().toISOString() })
      .eq("id", id);
    throw e;
  }
}

/** Relève les générations en cours (les plus anciennes d'abord) et rapatrie les vidéos prêtes. */
async function suivre(supabase: Supabase): Promise<Response> {
  const cle = cleHiggsfield();
  if (!cle) return json({ error: "Clé Higgsfield absente : ajoute le secret HIGGSFIELD_API_KEY dans Supabase" }, 500);

  // Lancement coupé avant la réponse de Higgsfield (fonction arrêtée) : sans
  // identifiant, rien à relever. Après 10 min, on la rend relançable.
  await supabase
    .from("ugc_ia_videos")
    .update({ statut: "echec", erreur: "lancement interrompu avant la réponse de Higgsfield : relance", updated_at: new Date().toISOString() })
    .eq("statut", "en_cours")
    .is("higgsfield_request_id", null)
    .lt("lancee_le", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: enCours, error } = await supabase
    .from("ugc_ia_videos")
    .select("id, higgsfield_request_id")
    .eq("statut", "en_cours")
    .not("higgsfield_request_id", "is", null)
    .order("lancee_le")
    .limit(4);
  if (error) throw new Error(error.message);

  const bilan: Array<{ id: string; statut: string; erreur?: string }> = [];
  for (const v of enCours ?? []) {
    try {
      const etat = await suivreGenjutsu(cle, v.higgsfield_request_id as string);
      if (etat.statut === "en_cours") {
        bilan.push({ id: v.id, statut: "en_cours" });
        continue;
      }
      const maintenant = new Date().toISOString();
      if (etat.statut === "echec") {
        await supabase
          .from("ugc_ia_videos")
          .update({ statut: "echec", erreur: etat.erreur, updated_at: maintenant })
          .eq("id", v.id)
          .eq("statut", "en_cours");
        bilan.push({ id: v.id, statut: "echec", erreur: etat.erreur });
        continue;
      }
      const r = await fetch(etat.videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`téléchargement du résultat : HTTP ${r.status}`);
      const chemin = cheminsUgcIa(v.id).video;
      const videoUrl = await deposer(supabase, chemin, new Uint8Array(await r.arrayBuffer()));
      await supabase
        .from("ugc_ia_videos")
        .update({ statut: "prete", video_path: chemin, video_url: videoUrl, generee_le: maintenant, updated_at: maintenant })
        .eq("id", v.id)
        .eq("statut", "en_cours");
      bilan.push({ id: v.id, statut: "prete" });
    } catch (e) {
      // Erreur passagère (réseau, stockage) : on reste en cours, le prochain relevé réessaie.
      bilan.push({ id: v.id, statut: "en_cours", erreur: messageErreur(e) });
    }
  }
  return json({ ok: true, bilan });
}

async function supprimer(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  const video = id ? await lireVideo(supabase, id) : null;
  if (!video) return json({ error: "vidéo introuvable" }, 404);
  const chemins = [video.brut_path, video.coupe_path, video.video_path].filter((c): c is string => Boolean(c));
  if (chemins.length) await supabase.storage.from(BUCKET).remove(chemins);
  const { error } = await supabase.from("ugc_ia_videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

Deno.serve(async (request) => {
  const refus = await assertAuthorised(request);
  if (refus) return refus;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }
  const supabase = serviceClient();
  try {
    switch (body.action) {
      case "importer":
        return await importer(supabase, body);
      case "couper":
        return await couper(supabase, body);
      case "generer":
        return await generer(supabase, body);
      case "suivre":
        return await suivre(supabase);
      case "supprimer":
        return await supprimer(supabase, body);
      default:
        return json({ error: "action inconnue (importer | couper | generer | suivre | supprimer)" }, 400);
    }
  } catch (e) {
    console.error("ugc-ia", body.action, e);
    return json({ error: messageErreur(e) }, 500);
  }
});
