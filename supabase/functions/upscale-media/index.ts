import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import { upscaleViaSeedVr } from "../_shared/fal_seedvr_upscale.ts";
import {
  upscaleViaRealEsrgan,
  type UpscaleProgress,
} from "../_shared/replicate_realesrgan_upscale.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

export type ModeleUpscale = "realesrgan" | "seedvr";

function extPourMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "bin";
}

function parserModele(brut: unknown): ModeleUpscale {
  return brut === "seedvr" ? "seedvr" : "realesrgan";
}

/**
 * Upscale une photo de la bibliothèque :
 *   1) Real-ESRGAN v2 (Replicate) OU SeedVR2 (Fal)
 *   2) strip C2PA lossless (bytes, sans base64)
 *   3) remplace le fichier + pose `upscale_le`
 *
 *   { mediaId, forcer?, modele?, scale?, stream?: true }
 *
 * Stream NDJSON obligatoire pour SeedVR : le poll Fal dépasse souvent
 * l’idle timeout Edge 150s si aucune donnée n’est écrite.
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
  const modele = parserModele(body?.modele);
  const scaleRaw = Number(body?.scale);
  const scale = Number.isFinite(scaleRaw) && scaleRaw >= 1 && scaleRaw <= 4
    ? scaleRaw
    : modele === "seedvr"
    ? 2
    : 1;
  const stream = veutStream(request, body);
  if (!mediaId) return json({ ok: false, error: "mediaId requis" }, 400);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const { data: media } = await supabase
      .from("media_library")
      .select("id, url, storage_path, upscale_le")
      .eq("id", mediaId)
      .single();
    if (!media) {
      emit?.({ etape: "ready", statut: "echec", detail: "média introuvable", ok: false });
      return { ok: false as const, error: "média introuvable" };
    }

    if (media.upscale_le && !forcer) {
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
        saute: true,
        detail: "déjà upscalée",
        upscale_le: media.upscale_le,
      };
    }

    const label = modele === "seedvr" ? "SeedVR" : "Real-ESRGAN";
    emit?.({
      etape: "ready",
      statut: "encours",
      detail: `${label} — démarrage (×${scale})`,
      modele,
    });

    // Keepalive : chaque poll écrit une ligne → idle timeout Edge reset.
    const onProgress: UpscaleProgress = async (info) => {
      emit?.({
        etape: "ready",
        statut: "encours",
        detail: info.detail ?? `${info.phase}${info.statut ? ` → ${info.statut}` : ""}`,
        phase: info.phase,
        polls: info.polls,
        modele,
      });
    };

    const resultat = modele === "seedvr"
      ? await upscaleViaSeedVr(media.url, onProgress, scale)
      : await upscaleViaRealEsrgan(media.url, onProgress, scale);

    if (!resultat) {
      const error = modele === "seedvr" ? "FAL_KEY manquant" : "REPLICATE_API_TOKEN manquant";
      emit?.({ etape: "ready", statut: "echec", detail: error, ok: false });
      return { ok: false as const, error };
    }

    emit?.({
      etape: "c2pa",
      statut: "encours",
      detail: "strip C2PA lossless",
      modele,
    });
    const strip = await retirerContentCredentialsBytes(resultat.bytes);
    const mime = strip.mime === "application/octet-stream" ? resultat.mime : strip.mime;
    const bytes = strip.bytes;
    const ext = extPourMime(mime);

    const basePath = String(media.storage_path)
      .replace(/\.[^.]+$/, "")
      .replace(/-upscale$/, "")
      .replace(/-noc2pa$/, "");
    const path = `${basePath}-upscale.${ext}`;

    emit?.({
      etape: "ready",
      statut: "encours",
      detail: `upload ${Math.round(bytes.length / 1024)} Ko`,
      modele,
    });

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

    if (media.storage_path && media.storage_path !== path) {
      await supabase.storage.from(BUCKET).remove([media.storage_path]).catch(() => null);
    }

    const payload = {
      ok: true as const,
      mediaId,
      saute: false,
      url,
      mime,
      modele,
      scale,
      upscale_le: maintenant,
      c2pa_retire: strip.retire,
      octets: bytes.length,
      detail: `upscalée ${label} + métadonnées stripées (lossless)`,
    };
    emit?.({
      etape: "ready",
      statut: "ok",
      ...payload,
    });
    return payload;
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      await executer(emit);
    });
  }

  // Sans stream : SeedVR risque l’idle 150s — on force quand même un message clair.
  try {
    if (modele === "seedvr") {
      return json({
        ok: false,
        error:
          "SeedVR nécessite le stream NDJSON (idle Edge 150s). Relance depuis l’UI à jour.",
      }, 400);
    }
    return json(await executer());
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
