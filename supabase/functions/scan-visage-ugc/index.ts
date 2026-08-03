/**
 * Scan UGC : visage humain au premier plan via fal openrouter/router/vision.
 *
 *   { action: "scan_media", media_id }
 *   { action: "scan_url", image_url, media_id? }  // optionnel persist si media_id
 *
 * Résultat stocké dans media_library.visage_premier_plan (éditable côté client).
 */

import { detecterVisagePremierPlan } from "../_shared/fal_openrouter_vision.ts";
import {
  assertAuthorised,
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
    return json({ error: "corps JSON attendu" }, 400);
  }

  const action = String(body.action ?? "scan_media");

  try {
    if (action === "scan_media") {
      const mediaId = String(body.media_id ?? "");
      if (!mediaId) return json({ error: "media_id requis" }, 400);

      const { data: media, error } = await supabase
        .from("media_library")
        .select("id, url, storage_path")
        .eq("id", mediaId)
        .maybeSingle();
      if (error) throw error;
      if (!media?.url) return json({ error: "média introuvable" }, 404);

      const det = await detecterVisagePremierPlan(media.url as string);
      const { error: errUp } = await supabase
        .from("media_library")
        .update({ visage_premier_plan: det.visage })
        .eq("id", mediaId);
      if (errUp) throw errUp;

      return json({
        ok: true,
        media_id: mediaId,
        visage_premier_plan: det.visage,
        brut: det.brut,
        model: det.model,
      });
    }

    if (action === "scan_url") {
      const imageUrl = String(body.image_url ?? "");
      if (!imageUrl) return json({ error: "image_url requis" }, 400);
      const mediaId = body.media_id ? String(body.media_id) : null;

      const det = await detecterVisagePremierPlan(imageUrl);
      if (mediaId) {
        const { error: errUp } = await supabase
          .from("media_library")
          .update({ visage_premier_plan: det.visage })
          .eq("id", mediaId);
        if (errUp) throw errUp;
      }

      return json({
        ok: true,
        media_id: mediaId,
        visage_premier_plan: det.visage,
        brut: det.brut,
        model: det.model,
      });
    }

    return json({ error: `action inconnue: ${action}` }, 400);
  } catch (e) {
    return json({ error: messageErreur(e) }, 500);
  }
});
