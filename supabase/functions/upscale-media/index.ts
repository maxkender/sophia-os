import {
  parserModeleUpscale,
  upscalerMediaLibrary,
} from "../_shared/upscale_media_core.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Upscale une photo de la bibliothèque :
 *   1) Real-ESRGAN v2 (Replicate) OU SeedVR2 (Fal)
 *   2) strip C2PA lossless en fin (bytes, sans base64)
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
  const modele = parserModeleUpscale(body?.modele);
  const scaleRaw = Number(body?.scale);
  const scale = Number.isFinite(scaleRaw) && scaleRaw >= 1 && scaleRaw <= 4
    ? scaleRaw
    : undefined;
  const stream = veutStream(request, body);
  if (!mediaId) return json({ ok: false, error: "mediaId requis" }, 400);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    try {
      const r = await upscalerMediaLibrary(supabase, {
        mediaId,
        forcer,
        modele,
        scale,
        onProgress: async (info) => {
          emit?.({
            etape: info.phase === "result" && info.detail?.includes("C2PA")
              ? "c2pa"
              : "ready",
            statut: "encours",
            detail: info.detail ?? `${info.phase}${info.statut ? ` → ${info.statut}` : ""}`,
            phase: info.phase,
            polls: info.polls,
            modele,
          });
        },
      });

      if (!r.ok) {
        emit?.({ etape: "ready", statut: "echec", detail: r.error, ok: false });
        return r;
      }

      emit?.({
        etape: "ready",
        statut: "ok",
        ...r,
      });
      return r;
    } catch (error) {
      const detail = messageErreur(error);
      emit?.({ etape: "ready", statut: "echec", detail, ok: false });
      return { ok: false as const, error: detail, mediaId };
    }
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      await executer(emit);
    });
  }

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
