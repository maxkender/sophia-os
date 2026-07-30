import { retirerContentCredentialsOctets } from "../_shared/c2pa.ts";
import { reponseNdjson, veutStream } from "../_shared/ndjson.ts";
import { upscaleViaRecraftCrisp } from "../_shared/replicate_crisp_upscale.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

function extPourMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "bin";
}

type Emit = (e: Record<string, unknown>) => void;

function log(emit: Emit | undefined, msg: string, extra?: Record<string, unknown>) {
  const line = `[upscale] ${msg}`;
  console.log(line, extra ?? "");
  emit?.({ etape: "log", statut: "info", detail: msg, ...extra });
}

/**
 * Upscale une photo de la bibliothèque (Recraft Crisp via Replicate) :
 *   1) upscale
 *   2) strip C2PA lossless (pixels inchangés) — chemin octets, pas de base64
 *   3) remplace le fichier + pose `upscale_le`
 *
 *   { mediaId, forcer?: boolean, stream?: true }
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
  if (!mediaId) return json({ ok: false, error: "mediaId requis" }, 400);

  const stream = veutStream(request, body);

  const executer = async (emit?: Emit) => {
    const t0 = Date.now();
    const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

    log(emit, `début mediaId=${mediaId.slice(0, 8)}… forcer=${forcer}`);

    const { data: media, error: loadErr } = await supabase
      .from("media_library")
      .select("id, url, storage_path, upscale_le")
      .eq("id", mediaId)
      .single();
    if (loadErr) {
      log(emit, `lecture DB échouée: ${messageErreur(loadErr)}`);
      throw loadErr;
    }
    if (!media) {
      log(emit, "média introuvable");
      emit?.({ etape: "ready", statut: "echec", detail: "média introuvable", ok: false });
      return { ok: false as const, error: "média introuvable" };
    }

    log(emit, `média trouvé path=${media.storage_path} upscale_le=${media.upscale_le ?? "null"}`, {
      url: String(media.url).slice(0, 120),
    });

    if (media.upscale_le && !forcer) {
      log(emit, `déjà upscalée → skip (${elapsed()})`);
      emit?.({
        etape: "ready",
        statut: "ok",
        detail: "déjà upscalée",
        ok: true,
        saute: true,
        upscale_le: media.upscale_le,
      });
      return {
        ok: true as const,
        mediaId,
        saute: true as const,
        detail: "déjà upscalée",
        upscale_le: media.upscale_le as string,
      };
    }

    log(emit, "appel Recraft Crisp (Replicate)…");
    const resultat = await upscaleViaRecraftCrisp(media.url, async (p) => {
      if (p.phase === "submit") log(emit, `Replicate submit — ${p.detail ?? ""}`);
      else if (p.phase === "poll") {
        log(emit, `Replicate poll #${p.polls} statut=${p.statut} (${elapsed()})`);
      } else if (p.phase === "result") log(emit, `Replicate succeeded (${elapsed()})`);
      else if (p.phase === "download") log(emit, "téléchargement résultat Recraft…");
    });

    if (!resultat) {
      log(emit, "REPLICATE_API_TOKEN manquant");
      emit?.({
        etape: "ready",
        statut: "echec",
        detail: "REPLICATE_API_TOKEN manquant",
        ok: false,
      });
      return { ok: false as const, error: "REPLICATE_API_TOKEN manquant" };
    }

    log(emit, `résultat reçu mime=${resultat.mime} octets=${resultat.bytes.byteLength} (${elapsed()})`);

    log(emit, "strip C2PA (octets, lossless)…");
    const strip = await retirerContentCredentialsOctets(resultat.bytes);
    const mime = strip.mime === "application/octet-stream" ? resultat.mime : strip.mime;
    const bytes = strip.bytes;
    const ext = extPourMime(mime);
    log(emit, `C2PA retire=${strip.retire} mime=${mime} octets=${bytes.byteLength}`);

    const basePath = String(media.storage_path)
      .replace(/\.[^.]+$/, "")
      .replace(/-upscale$/, "")
      .replace(/-noc2pa$/, "");
    const path = `${basePath}-upscale.${ext}`;
    log(emit, `upload storage → ${path} (${bytes.byteLength} octets)`);

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: "60",
      });
    if (upErr) {
      log(emit, `upload échoué: ${messageErreur(upErr)}`);
      throw upErr;
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const url = `${publicUrl}?v=${Date.now()}`;
    const maintenant = new Date().toISOString();

    log(emit, `maj DB upscale_le=${maintenant}`);
    const { error: majErr } = await supabase
      .from("media_library")
      .update({
        storage_path: path,
        url,
        upscale_le: maintenant,
      })
      .eq("id", media.id);
    if (majErr) {
      log(emit, `maj DB échouée: ${messageErreur(majErr)}`);
      throw majErr;
    }

    if (media.storage_path && media.storage_path !== path) {
      log(emit, `suppression ancien fichier ${media.storage_path}`);
      await supabase.storage.from(BUCKET).remove([media.storage_path]).catch((e) => {
        log(emit, `suppression ancien (best-effort) ignorée: ${messageErreur(e)}`);
      });
    }

    log(emit, `OK total=${elapsed()} url=${url.slice(0, 100)}`);
    emit?.({
      etape: "ready",
      statut: "ok",
      detail: "upscalée + métadonnées stripées (lossless)",
      ok: true,
      saute: false,
      url,
      mime,
      upscale_le: maintenant,
      c2pa_retire: strip.retire,
    });

    return {
      ok: true as const,
      mediaId,
      saute: false as const,
      url,
      mime,
      upscale_le: maintenant,
      c2pa_retire: strip.retire,
      detail: "upscalée + métadonnées stripées (lossless)",
    };
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      try {
        const r = await executer(emit);
        if (!r.ok) {
          // déjà émis ready/echec
        }
      } catch (error) {
        const detail = messageErreur(error);
        console.error("[upscale] exception", detail);
        emit({ etape: "ready", statut: "echec", detail, ok: false });
      }
    });
  }

  try {
    const r = await executer();
    if (!r.ok) return json(r, r.error === "média introuvable" ? 404 : 500);
    return json(r);
  } catch (error) {
    const detail = messageErreur(error);
    console.error("[upscale] exception", detail);
    return json({ ok: false, error: detail }, 500);
  }
});
