import { retirerContentCredentials } from "../_shared/c2pa.ts";
import { upscaleViaRealEsrgan } from "../_shared/replicate_realesrgan_upscale.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

function extPourMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "bin";
}

/**
 * Upscale une photo de la bibliothèque (Real-ESRGAN v2 via Replicate) :
 *   1) upscale
 *   2) strip C2PA lossless (pixels inchangés)
 *   3) remplace le fichier + pose `upscale_le`
 *
 *   { mediaId, forcer?: boolean, scale?: number }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // vide
  }

  const mediaId = body?.mediaId ? String(body.mediaId) : null;
  const forcer = Boolean(body?.forcer);
  const scaleRaw = Number(body?.scale);
  const scale = Number.isFinite(scaleRaw) && scaleRaw >= 1 && scaleRaw <= 4
    ? scaleRaw
    : 2;
  if (!mediaId) return json({ ok: false, error: "mediaId requis" }, 400);

  try {
    const { data: media } = await supabase
      .from("media_library")
      .select("id, url, storage_path, upscale_le")
      .eq("id", mediaId)
      .single();
    if (!media) return json({ ok: false, error: "média introuvable" }, 404);

    if (media.upscale_le && !forcer) {
      return json({
        ok: true,
        mediaId,
        saute: true,
        detail: "déjà upscalée",
        upscale_le: media.upscale_le,
      });
    }

    const resultat = await upscaleViaRealEsrgan(media.url, undefined, scale);
    if (!resultat) {
      return json({
        ok: false,
        error: "REPLICATE_API_TOKEN manquant",
      }, 500);
    }

    // Strip métadonnées SANS ré-encode lossy (JPEG/PNG) ; webp inchangé si pas C2PA.
    const strip = await retirerContentCredentials(resultat.base64);
    const mime = strip.mime === "application/octet-stream" ? resultat.mime : strip.mime;
    const bytes = Uint8Array.from(atob(strip.base64), (c) => c.charCodeAt(0));
    const ext = extPourMime(mime);

    // Nouveau path (évite cache CDN / ancien format) dans le même dossier.
    const basePath = String(media.storage_path)
      .replace(/\.[^.]+$/, "")
      .replace(/-upscale$/, "")
      .replace(/-noc2pa$/, "");
    const path = `${basePath}-upscale.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: "60",
      });
    if (upErr) throw upErr;

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const url = `${publicUrl}?v=${Date.now()}`;
    const maintenant = new Date().toISOString();

    const { error: majErr } = await supabase
      .from("media_library")
      .update({
        storage_path: path,
        url,
        upscale_le: maintenant,
      })
      .eq("id", media.id);
    if (majErr) throw majErr;

    // Best-effort : retire l'ancien fichier s'il a changé de chemin.
    if (media.storage_path && media.storage_path !== path) {
      await supabase.storage.from(BUCKET).remove([media.storage_path]).catch(() => null);
    }

    return json({
      ok: true,
      mediaId,
      saute: false,
      url,
      mime,
      scale,
      upscale_le: maintenant,
      c2pa_retire: strip.retire,
      detail: "upscalée Real-ESRGAN + métadonnées stripées (lossless)",
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
