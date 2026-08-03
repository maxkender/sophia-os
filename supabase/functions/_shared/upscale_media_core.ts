/**
 * Cœur upscale biblio : SeedVR (Fal) ou Real-ESRGAN → strip C2PA en fin → remplace fichier.
 * Partagé par `upscale-media` (UI) et `upscale-assignes` (drain minuit).
 */

import { retirerContentCredentialsBytes } from "./c2pa.ts";
import { upscaleViaSeedVr } from "./fal_seedvr_upscale.ts";
import {
  upscaleViaRealEsrgan,
  type UpscaleProgress,
} from "./replicate_realesrgan_upscale.ts";
import { serviceClient } from "./supabase.ts";

const BUCKET = "medias";

export type ModeleUpscale = "realesrgan" | "seedvr";
type Supabase = ReturnType<typeof serviceClient>;

function extPourMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "bin";
}

export function parserModeleUpscale(brut: unknown): ModeleUpscale {
  return brut === "seedvr" ? "seedvr" : "realesrgan";
}

export type UpscaleMediaResultat =
  | {
      ok: true;
      mediaId: string;
      saute: boolean;
      url?: string;
      mime?: string;
      modele: ModeleUpscale;
      scale: number;
      upscale_le: string;
      c2pa_retire?: boolean;
      octets?: number;
      detail: string;
    }
  | { ok: false; error: string; mediaId?: string };

/**
 * Upscale + strip Content Credentials en toute fin (Fal/Replicate peuvent
 * réinjecter des credentials — un strip avant serait perdu).
 */
export async function upscalerMediaLibrary(
  supabase: Supabase,
  input: {
    mediaId: string;
    forcer?: boolean;
    modele?: ModeleUpscale;
    scale?: number;
    onProgress?: UpscaleProgress;
  },
): Promise<UpscaleMediaResultat> {
  const mediaId = input.mediaId;
  const forcer = Boolean(input.forcer);
  const modele = input.modele ?? "seedvr";
  const scale =
    typeof input.scale === "number" && input.scale >= 1 && input.scale <= 4
      ? input.scale
      : modele === "seedvr"
        ? 2
        : 1;
  const onProgress = input.onProgress;

  const { data: media } = await supabase
    .from("media_library")
    .select("id, url, storage_path, upscale_le")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media) return { ok: false, error: "média introuvable", mediaId };

  if (media.upscale_le && !forcer) {
    return {
      ok: true,
      mediaId,
      saute: true,
      modele,
      scale,
      upscale_le: media.upscale_le as string,
      detail: "déjà upscalée",
    };
  }

  const label = modele === "seedvr" ? "SeedVR" : "Real-ESRGAN";
  await onProgress?.({
    phase: "submit",
    detail: `${label} — démarrage (×${scale})`,
  });

  const resultat =
    modele === "seedvr"
      ? await upscaleViaSeedVr(media.url as string, onProgress, scale)
      : await upscaleViaRealEsrgan(media.url as string, onProgress, scale);

  if (!resultat) {
    return {
      ok: false,
      mediaId,
      error: modele === "seedvr" ? "FAL_KEY manquant" : "REPLICATE_API_TOKEN manquant",
    };
  }

  // Strip C2PA en dernier — après upscale (évite double strip inutile avant Fal).
  await onProgress?.({ phase: "result", detail: "strip C2PA lossless" });
  const strip = await retirerContentCredentialsBytes(resultat.bytes);
  const mime = strip.mime === "application/octet-stream" ? resultat.mime : strip.mime;
  const bytes = strip.bytes;
  const ext = extPourMime(mime);

  const basePath = String(media.storage_path)
    .replace(/\.[^.]+$/, "")
    .replace(/-upscale$/, "")
    .replace(/-noc2pa$/, "");
  const path = `${basePath}-upscale.${ext}`;

  await onProgress?.({
    phase: "download",
    detail: `upload ${Math.round(bytes.length / 1024)} Ko`,
  });

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
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
    await supabase.storage.from(BUCKET).remove([media.storage_path as string]).catch(() => null);
  }

  return {
    ok: true,
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
}

/** Médias des posts prévus ce jour, pas encore upscalés (dédupliqués). */
export async function listerMediasAssignesNonUpscales(
  supabase: Supabase,
  jour: string,
): Promise<string[]> {
  const { data: posts, error: e1 } = await supabase
    .from("posts")
    .select("id")
    .eq("date_publication_prevue", jour)
    .eq("est_test", false);
  if (e1) throw e1;
  const postIds = (posts ?? []).map((p) => p.id as string);
  if (postIds.length === 0) return [];

  const pending = new Set<string>();
  const chunk = 80;
  for (let i = 0; i < postIds.length; i += chunk) {
    const ids = postIds.slice(i, i + chunk);
    const { data: slides, error: e2 } = await supabase
      .from("post_slides")
      .select("media_id, media_library(upscale_le)")
      .in("post_id", ids)
      .not("media_id", "is", null);
    if (e2) throw e2;
    for (const s of slides ?? []) {
      const mediaId = s.media_id as string | null;
      if (!mediaId) continue;
      // deno-lint-ignore no-explicit-any
      const lib = (s as any).media_library as { upscale_le?: string | null } | null;
      if (lib?.upscale_le) continue;
      pending.add(mediaId);
    }
  }
  return [...pending];
}

/** Kick drain upscale-assignes (1 worker SeedVR) via waitUntil. */
export function kickUpscaleAssignes(
  request: Request,
  body: Record<string, unknown>,
): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/x-ndjson",
  };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/upscale-assignes`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  // Consommer le stream NDJSON : keepalive SeedVR (idle Edge 150s).
  const p = fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, stream: true }),
  })
    .then(async (res) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    })
    .catch(() => null);

  if (edge?.waitUntil) edge.waitUntil(p);
}
