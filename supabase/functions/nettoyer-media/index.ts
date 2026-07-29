import { cleanImage, verifyClean, type EvenementEtape } from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

/**
 * Nettoie une photo de la bibliothèque à la demande de l'admin, en place.
 *
 *   { mediaId, stream?: true }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let corps: { mediaId?: string; stream?: boolean } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  const mediaId = corps.mediaId ?? null;
  if (!mediaId) return json({ error: "mediaId requis" }, 400);

  const stream = veutStream(request, corps);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const { data: media } = await supabase
      .from("media_library")
      .select("id, url, storage_path, texte_restant")
      .eq("id", mediaId)
      .single();
    if (!media) {
      emit?.({ etape: "ready", statut: "echec", detail: "média introuvable" });
      return { ok: false as const, nettoyee: false, motif: "média introuvable" };
    }

    if (media.storage_path.startsWith("propre/") && !media.texte_restant) {
      emit?.({ etape: "ready", statut: "ok", detail: "déjà nettoyée", ok: true });
      return { ok: true as const, nettoyee: true, note: "déjà nettoyée" };
    }

    const onEtape = emit ? (e: EvenementEtape) => emit(e) : undefined;
    const propre = await cleanImage(media.url, onEtape);
    if (!propre) {
      emit?.({ etape: "ready", statut: "echec", detail: "aucune image renvoyée" });
      return { ok: false as const, nettoyee: false, motif: "aucune image renvoyée" };
    }
    if (!(await verifyClean(propre.base64, propre.mime))) {
      emit?.({
        etape: "ready",
        statut: "echec",
        detail: "texte encore présent après nettoyage",
      });
      return {
        ok: false as const,
        nettoyee: false,
        motif: "texte encore présent après nettoyage",
        etapes: propre.etapes,
      };
    }

    const ext = propre.mime === "image/jpeg" ? "jpg" : "png";
    const path = `propre/manuel/${media.id}.${ext}`;
    const bytes = Uint8Array.from(atob(propre.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: propre.mime, upsert: true });
    if (upErr) throw upErr;

    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { error: majErr } = await supabase
      .from("media_library")
      .update({
        storage_path: path,
        url,
        verifie_le: new Date().toISOString(),
        texte_restant: false,
      })
      .eq("id", media.id);
    if (majErr) throw majErr;

    emit?.({
      etape: "ready",
      statut: "ok",
      ok: true,
      nettoyee: true,
      url,
      moteur: propre.moteur,
    });
    return {
      ok: true as const,
      nettoyee: true,
      url,
      moteur: propre.moteur,
      etapes: propre.etapes,
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
