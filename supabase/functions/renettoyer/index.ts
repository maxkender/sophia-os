import {
  cleanImage,
  mimeDepuisBase64,
  type EvenementEtape,
} from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { restaurerResolutionMediaSiBesoin } from "../_shared/restore_resolution.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
const BUCKET = "medias";

/**
 * Re-nettoie la photo d'UNE slide, à la demande de l'admin.
 * Même pipeline que l'import : Fal text-removal → Replicate flux-kontext
 * text-removal → C2PA (`cleanImage`).
 *
 *   { postSlideId, stream?: true }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let corps: { postSlideId?: string; stream?: boolean } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  const postSlideId = corps.postSlideId ?? null;
  if (!postSlideId) return json({ error: "postSlideId requis" }, 400);

  const stream = veutStream(request, corps);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const { data: slide } = await supabase
      .from("post_slides")
      .select("id, position, reference_url, post_id")
      .eq("id", postSlideId)
      .single();
    if (!slide) {
      emit?.({ etape: "ready", statut: "echec", detail: "slide introuvable" });
      return { ok: false as const, nettoyee: false, motif: "slide introuvable" };
    }

    const { data: post } = await supabase
      .from("posts")
      .select("compte_id, comptes(compte_reference_id)")
      .eq("id", slide.post_id)
      .single();
    // deno-lint-ignore no-explicit-any
    const refId = (post as any)?.comptes?.compte_reference_id ?? null;

    if (slide.reference_url) {
      try {
        const onEtape = emit ? (e: EvenementEtape) => emit(e) : undefined;
        const propre = await cleanImage(slide.reference_url, onEtape);
        // verifyClean en pause — stocke dès que Fal/Replicate renvoie une image.
        const meta = propre
          ? mimeDepuisBase64(propre.base64, propre.mime)
          : null;
        if (propre && meta) {
          const path = `propre/manuel/${slide.id}.${meta.ext}`;
          const bytes = Uint8Array.from(atob(propre.base64), (c) => c.charCodeAt(0));
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, bytes, {
              contentType: meta.mime,
              upsert: true,
              cacheControl: "60",
            });
          if (upErr) throw upErr;

          const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data
            .publicUrl;
          const url = `${publicUrl}?v=${Date.now()}`;
          const { data: media, error: insErr } = await supabase
            .from("media_library")
            .upsert(
              {
                compte_id: post?.compte_id ?? null,
                storage_path: path,
                url,
                source: "nettoye_reference",
                visage_identifiable: null,
                verifie_le: new Date().toISOString(),
                texte_restant: false,
              },
              { onConflict: "storage_path" },
            )
            .select("id")
            .single();
          if (insErr) throw insErr;

          await supabase.from("post_slides").update({ media_id: media.id }).eq("id", slide.id);
          await restaurerResolutionMediaSiBesoin(
            media.id,
            slide.reference_url,
            url,
            emit,
          );
          emit?.({
            etape: "ready",
            statut: "ok",
            ok: true,
            nettoyee: true,
            moteur: propre.moteur,
          });
          return {
            ok: true as const,
            nettoyee: true,
            moteur: propre.moteur,
            etapes: propre.etapes,
          };
        }
      } catch (error) {
        console.warn(`[renettoyer] nettoyage échoué, on remplace : ${messageErreur(error)}`);
        emit?.({
          etape: "ready",
          statut: "echec",
          detail: `nettoyage échoué — remplacement: ${messageErreur(error)}`,
        });
      }
    }

    const alt = await visuelPropreDeSecours(supabase, refId, slide.post_id);
    if (alt) {
      await supabase.from("post_slides").update({ media_id: alt }).eq("id", slide.id);
      emit?.({
        etape: "ready",
        statut: "ok",
        ok: true,
        nettoyee: false,
        remplacee: true,
      });
      return { ok: true as const, nettoyee: false, remplacee: true };
    }

    emit?.({
      etape: "ready",
      statut: "echec",
      detail: "nettoyage impossible et aucune photo propre de rechange",
    });
    return {
      ok: false as const,
      nettoyee: false,
      motif:
        "nettoyage impossible et aucune photo propre de rechange dans la bibliothèque du compte",
    };
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      await executer(emit);
    });
  }

  try {
    return json(await executer());
  } catch (error) {
    return json({ ok: false, nettoyee: false, erreur: messageErreur(error) }, 500);
  }
});

async function visuelPropreDeSecours(
  supabase: Supabase,
  refId: string | null,
  postId: string,
): Promise<string | null> {
  const { data: slides } = await supabase
    .from("post_slides")
    .select("media_id")
    .eq("post_id", postId);
  const dejaUtilises = new Set((slides ?? []).map((s) => s.media_id).filter(Boolean));

  let query = supabase
    .from("media_library")
    .select("id")
    .like("storage_path", "propre/%")
    .eq("texte_restant", false)
    .order("used_count", { ascending: true })
    .limit(30);
  if (refId) query = query.eq("compte_reference_id", refId);

  const { data } = await query;
  const liste = (data ?? []).map((m) => m.id);
  return liste.find((id) => !dejaUtilises.has(id)) ?? liste[0] ?? null;
}
