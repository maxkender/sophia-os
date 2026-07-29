import {
  contientContentCredentials,
  retirerContentCredentials,
} from "../_shared/c2pa.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

/**
 * Retire les Content Credentials (C2PA) d'une photo de la bibliothèque,
 * sans re-nettoyer les pixels (Fal / proxy / inpaint).
 *
 *   { mediaId }
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
    // corps vide
  }

  const mediaId = body?.mediaId ? String(body.mediaId) : null;
  if (!mediaId) return json({ ok: false, error: "mediaId requis" }, 400);

  try {
    const { data: media } = await supabase
      .from("media_library")
      .select("id, url, storage_path")
      .eq("id", mediaId)
      .single();
    if (!media) return json({ ok: false, error: "média introuvable" }, 404);

    const resp = await fetch(media.url);
    if (!resp.ok) {
      return json({ ok: false, error: `téléchargement ${resp.status}` }, 502);
    }
    const buf = new Uint8Array(await resp.arrayBuffer());

    if (!contientContentCredentials(buf)) {
      return json({
        ok: true,
        mediaId,
        saute: true,
        retire: false,
        detail: "pas de Content Credentials détectés",
      });
    }

    let binaire = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      binaire += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binaire);

    const strip = await retirerContentCredentials(base64);
    if (!strip.retire) {
      return json({
        ok: true,
        mediaId,
        saute: true,
        retire: false,
        detail: "format non stripable ou déjà propre",
      });
    }

    const bytes = Uint8Array.from(atob(strip.base64), (c) => c.charCodeAt(0));
    const ext = strip.mime === "image/jpeg" ? "jpg" : "png";
    // Conserve le dossier d'origine ; suffixe pour forcer un refresh CDN.
    const basePath = media.storage_path.replace(/\.[^.]+$/, "");
    const path = `${basePath}-noc2pa.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: strip.mime, upsert: true });
    if (upErr) throw upErr;

    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: majErr } = await supabase
      .from("media_library")
      .update({ storage_path: path, url })
      .eq("id", media.id);
    if (majErr) throw majErr;

    return json({
      ok: true,
      mediaId,
      saute: false,
      retire: true,
      url,
      detail: "Content Credentials retirés",
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
