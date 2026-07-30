/**
 * Fal / Flux Kontext text-removal sortent ~1 MP (ex. 1080×1920 → ~752×1392).
 *
 * Après upload du média propre, on détecte le downscale puis on délègue
 * l’upscale Recraft Crisp à la Edge Function `upscale-media` (isolate séparé)
 * pour éviter WORKER_RESOURCE_LIMIT dans le worker de nettoyage.
 */

import { dimensionsImage } from "./inpaint.ts";

export type RestoreEtapeEmit = (e: {
  etape: "restore_resolution";
  statut: "encours" | "ok" | "echec" | "saute";
  detail?: string;
}) => void | Promise<void>;

/** Lit seulement le début du fichier pour obtenir w×h (pas le fichier entier). */
async function dimsDepuisUrlLeger(
  url: string,
): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-131071" },
    });
    if (!res.ok && res.status !== 206) {
      // Certains CDN ignorent Range → fallback complet (souvent < 200 Ko en JPEG TikTok).
      const full = await fetch(url);
      if (!full.ok) return null;
      return dimensionsImage(new Uint8Array(await full.arrayBuffer()));
    }
    return dimensionsImage(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

function supabaseFunctionsBase(): string | null {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/functions/v1`;
}

/**
 * Si le média propre est nettement plus petit que la source TikTok,
 * appelle `upscale-media` (Recraft Crisp) en HTTP — worker séparé.
 * Soft-fail : en cas d’échec on garde la version basse rés.
 */
export async function restaurerResolutionMediaSiBesoin(
  mediaId: string,
  sourceUrl: string,
  mediaUrl: string,
  emit?: RestoreEtapeEmit,
): Promise<{ restaure: boolean; url?: string }> {
  await emit?.({
    etape: "restore_resolution",
    statut: "encours",
    detail: "③ Comparaison résolution source vs propre…",
  });

  const [srcDims, outDims] = await Promise.all([
    dimsDepuisUrlLeger(sourceUrl),
    dimsDepuisUrlLeger(mediaUrl),
  ]);

  if (!srcDims || !outDims) {
    await emit?.({
      etape: "restore_resolution",
      statut: "saute",
      detail: "③ Restore SAUTÉ — dims illisibles",
    });
    return { restaure: false };
  }

  const ratioW = outDims.w / srcDims.w;
  const ratioH = outDims.h / srcDims.h;
  if (ratioW >= 0.92 && ratioH >= 0.92) {
    await emit?.({
      etape: "restore_resolution",
      statut: "saute",
      detail: `③ Résolution OK ${outDims.w}×${outDims.h} (source ${srcDims.w}×${srcDims.h})`,
    });
    return { restaure: false };
  }

  const base = supabaseFunctionsBase();
  const secret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("TEST_SECRET");
  if (!base || !secret) {
    await emit?.({
      etape: "restore_resolution",
      statut: "saute",
      detail: "③ Restore SAUTÉ — CRON_SECRET / SUPABASE_URL absents",
    });
    return { restaure: false };
  }

  await emit?.({
    etape: "restore_resolution",
    statut: "encours",
    detail: `③ Downscale ${outDims.w}×${outDims.h} ← ${srcDims.w}×${srcDims.h} — Recraft Crisp (worker dédié)…`,
  });

  try {
    const res = await fetch(`${base}/upscale-media`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": secret,
      },
      body: JSON.stringify({ mediaId, forcer: true }),
    });
    const corps = await res.json().catch(() => ({})) as {
      ok?: boolean;
      url?: string;
      error?: string;
      detail?: string;
      saute?: boolean;
    };

    if (!res.ok || !corps.ok) {
      await emit?.({
        etape: "restore_resolution",
        statut: "echec",
        detail: `③ Restore ÉCHEC: ${(corps.error ?? res.statusText).slice(0, 180)} — basse rés. conservée`,
      });
      return { restaure: false };
    }

    // Vérifie les dims après upscale (best-effort).
    let detail = `③ Restore OK via Recraft Crisp (était ${outDims.w}×${outDims.h})`;
    if (corps.url) {
      const upDims = await dimsDepuisUrlLeger(corps.url);
      if (upDims) {
        detail =
          `③ Restore OK → ${upDims.w}×${upDims.h} (était ${outDims.w}×${outDims.h}, source ${srcDims.w}×${srcDims.h})`;
      }
    }

    await emit?.({
      etape: "restore_resolution",
      statut: "ok",
      detail,
    });
    return { restaure: true, url: corps.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await emit?.({
      etape: "restore_resolution",
      statut: "echec",
      detail: `③ Restore ÉCHEC: ${msg.slice(0, 180)} — basse rés. conservée`,
    });
    return { restaure: false };
  }
}
