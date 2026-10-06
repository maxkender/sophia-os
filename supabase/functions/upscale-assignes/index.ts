/**
 * Drain upscale auto (minuit) — SeedVR Fal + strip C2PA en fin.
 *
 * Traite UN média assigné du jour sans `upscale_le`, puis s’auto-enchaîne
 * s’il en reste (×1 : SeedVR = mémoire Edge serrée).
 *
 *   {} | { date?, mediaId?, stream? }
 *
 * Déclenché par :
 *   - étape `upscale` de minuit-vnext (après assignation)
 *   - cron `upscale-assignes-drain` (file restante)
 *   - auto-kick waitUntil
 */

import {
  kickUpscaleAssignes,
  listerMediasAssignesNonUpscales,
  upscalerMediaLibrary,
  type UpscaleMediaResultat,
} from "../_shared/upscale_media_core.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

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

  const jour = String(body?.date ?? aujourdhuiParis());
  const forceMediaId = body?.mediaId ? String(body.mediaId) : null;
  const stream = veutStream(request, body);

  const run = async (emit?: (e: Record<string, unknown>) => void) => {
    const file = forceMediaId
      ? [forceMediaId]
      : await listerMediasAssignesNonUpscales(supabase, jour);
    const restants = forceMediaId ? 0 : file.length;

    if (!forceMediaId) {
      emit?.({
        etape: "queue",
        statut: "encours",
        detail: file.length
          ? `${file.length} photo(s) à upscaler (${jour})`
          : `file vide (${jour})`,
        jour,
        pending: file.length,
      });
    }

    if (file.length === 0) {
      const idle = {
        ok: true as const,
        idle: true,
        jour,
        pending: 0,
        detail: "rien à upscaler",
      };
      emit?.({ etape: "ready", statut: "ok", ...idle });
      return idle;
    }

    // Un média dont le chemin d'upscale est déjà détenu par un AUTRE média ne
    // peut pas aboutir : l'écriture finale casse, `upscale_le` reste NULL, et
    // il revient en tête de file au passage suivant. Le drain ne prenant que
    // `file[0]`, un seul média dans ce cas gelait TOUTE la file et faisait
    // repayer un upscale SeedVR par minute (352 en une journée, aucune autre
    // photo upscalée pendant ce temps). On le saute donc pour prendre le
    // suivant : `upscalerMediaLibrary` détecte le squat sans appeler le
    // provider, sauter ne coûte aucun crédit.
    let mediaId: string | null = null;
    let r: UpscaleMediaResultat | null = null;
    const collisions: Array<{ mediaId: string; detail: string }> = [];

    for (const candidat of file) {
      emit?.({
        etape: "upscale",
        statut: "encours",
        detail: `SeedVR ${candidat.slice(0, 8)}…`,
        mediaId: candidat,
        jour,
      });

      const tentative = await upscalerMediaLibrary(supabase, {
        mediaId: candidat,
        modele: "seedvr",
        scale: 2,
        onProgress: async (info) => {
          emit?.({
            etape: info.detail?.includes("C2PA") ? "c2pa" : "upscale",
            statut: "encours",
            detail: info.detail ?? info.phase,
            phase: info.phase,
            polls: info.polls,
            mediaId: candidat,
          });
        },
      });

      if (tentative.ok || !tentative.collision) {
        mediaId = candidat;
        r = tentative;
        break;
      }

      collisions.push({ mediaId: candidat, detail: tentative.error });
      emit?.({
        etape: "upscale",
        statut: "echec",
        detail: tentative.error,
        mediaId: candidat,
        collision: true,
        jour,
      });
    }

    if (!r || !mediaId) {
      // Toute la file est en collision : rien à upscaler, et surtout rien de
      // payé. On le REMONTE au lieu de retourner `idle`, sinon la file reste
      // bloquée sans que personne ne le sache.
      const bloque = {
        ok: false as const,
        error: `file entièrement en collision de chemin (${collisions.length})`,
        jour,
        collisions,
        pending: file.length,
      };
      emit?.({ etape: "ready", statut: "echec", ...bloque });
      return bloque;
    }

    // Combien restent après ce coup ?
    const encore = await listerMediasAssignesNonUpscales(supabase, jour);
    const more = encore.length > 0;

    if (more) {
      // Enchaîne 1 seul (SeedVR sérialisé).
      kickUpscaleAssignes(request, { date: jour });
    }

    if (!r.ok) {
      emit?.({
        etape: "ready",
        statut: "echec",
        detail: r.error,
        ok: false,
        mediaId,
        more,
        pending: encore.length,
        jour,
      });
      return {
        ok: false as const,
        error: r.error,
        mediaId,
        jour,
        more,
        pending: encore.length,
      };
    }

    const payload = {
      ok: true as const,
      jour,
      mediaId,
      saute: r.saute,
      url: r.url,
      c2pa_retire: r.c2pa_retire,
      upscale_le: r.upscale_le,
      more,
      pending: encore.length,
      restantsAvant: restants || undefined,
      detail: r.detail,
    };
    emit?.({ etape: "ready", statut: "ok", ...payload });
    return payload;
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      try {
        await run(emit);
      } catch (error) {
        emit({
          etape: "ready",
          statut: "echec",
          detail: messageErreur(error),
          ok: false,
        });
      }
    });
  }

  try {
    // Sans stream : OK pour idle (cron peut aussi passer stream via kick).
    // SeedVR long → préférer stream ; on tente quand même.
    return json(await run());
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
