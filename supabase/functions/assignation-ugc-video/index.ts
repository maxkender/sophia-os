/**
 * Assignation UGC AI VIDEO (reaction → NB → Kling → concat → caption).
 *
 *   {} | { date, compteId?, manuel?, test?, stream?, forcer?, jusquA? }
 *   jusquA: "face_ref" | "complet" (défaut) — "face_ref" = jusqu'à Nano Banana (0–2)
 *   { action: "annuler_test", compteId, date }
 *
 * Stream NDJSON recommandé (Kling / merge > 150s idle).
 */

import {
  annulerAssignationUgcVideoTest,
  assignerTousComptesUgcVideo,
} from "../_shared/assignation_ugc_video.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  corsHeaders,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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

  const jour = (body?.date as string | undefined) ?? aujourdhuiParis();
  const compteId = (body?.compteId as string | null | undefined) ?? null;
  const test = Boolean(body?.test);
  // En test Admin : forcer 1 slot par défaut (sinon « quota atteint » bloque les relances).
  const forcer = body?.forcer === undefined ? test : Boolean(body?.forcer);
  const manuel = Boolean(body?.manuel);
  const jusquA =
    body?.jusquA === "face_ref" ? ("face_ref" as const) : ("complet" as const);
  const action = typeof body?.action === "string" ? body.action : null;
  const stream = test || veutStream(request, body);

  try {
    if (action === "annuler_test") {
      if (!compteId) return json({ error: "compteId requis" }, 400);
      const r = await annulerAssignationUgcVideoTest(supabase, compteId, jour);
      return json({ ok: true, jour, compteId, ...r });
    }

    if (test && !compteId) {
      return json({ error: "compteId requis pour un test" }, 400);
    }

    if (!manuel && !test) {
      const { data: pause } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      if ((pause?.valeur as { actif?: boolean } | null)?.actif === false) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
          jour,
        });
      }
    }

    const opts = {
      test,
      forcer,
      jusquA,
      ignorerWarmup: test || Boolean(body?.ignorerWarmup),
    };

    if (stream) {
      return reponseNdjson(async (emit) => {
        const log = (detail: string) =>
          emit({
            etape: "ugc_ai_video",
            statut: "en_cours",
            detail,
            at: new Date().toISOString(),
          });
        const hbMsg =
          jusquA === "face_ref"
            ? "… encore en cours (nettoyage / Nano Banana)"
            : "… encore en cours (Kling / merge)";
        const hb = setInterval(() => log(hbMsg), 25_000);
        try {
          log(
            test
              ? `Assignation UGC AI VIDEO TEST · ${jour} · compte ${String(compteId).slice(0, 8)}${
                  jusquA === "face_ref" ? " · jusqu'à face_ref (0–2)" : ""
                }`
              : `Assignation UGC AI VIDEO · ${jour}${compteId ? ` · ${String(compteId).slice(0, 8)}` : " · tous"}`,
          );
          const resultats = await assignerTousComptesUgcVideo(
            supabase,
            jour,
            compteId,
            { ...opts, onLog: log },
          );
          const crees = resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
          emit({
            etape: "ready",
            statut: "ok",
            ok: true,
            jour,
            test,
            crees,
            resultats,
            detail: `${crees} vidéo(s) créée(s)`,
            at: new Date().toISOString(),
          });
        } catch (e) {
          emit({
            etape: "ready",
            statut: "echec",
            ok: false,
            error: messageErreur(e),
            detail: messageErreur(e),
            at: new Date().toISOString(),
          });
        } finally {
          clearInterval(hb);
        }
      });
    }

    const resultats = await assignerTousComptesUgcVideo(
      supabase,
      jour,
      compteId,
      opts,
    );
    return json({
      ok: true,
      jour,
      test,
      crees: resultats.reduce((n, r) => n + (r.crees ?? 0), 0),
      resultats,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
