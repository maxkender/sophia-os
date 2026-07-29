import { cleanImage, verifyClean, type EvenementEtape } from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

/**
 * Re-nettoie UNE slide d'un contenu v-next (structure_slides), à la demande.
 * Même pipeline que l'import : Fal → Replicate text-removal → C2PA (`cleanImage`).
 *
 *   { contenuId, position, stream?: true }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let corps: { contenuId?: string; position?: number; stream?: boolean } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  const contenuId = corps.contenuId ?? null;
  const position = Number(corps.position);
  if (!contenuId || !Number.isFinite(position)) {
    return json({ error: "contenuId et position requis" }, 400);
  }

  const stream = veutStream(request, corps);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const { data: contenu } = await supabase
      .from("contenus")
      .select("id, compte_reference_id, langue_source, structure_slides")
      .eq("id", contenuId)
      .single();
    if (!contenu) {
      emit?.({ etape: "ready", statut: "echec", detail: "contenu introuvable" });
      return { ok: false as const, nettoyee: false, motif: "contenu introuvable" };
    }

    const slides = [...((contenu.structure_slides ?? []) as Array<{
      position: number;
      media_id?: string | null;
      raw_url?: string | null;
      reference_url?: string | null;
    }>)];
    const idx = slides.findIndex((s) => s.position === position);
    if (idx < 0) {
      emit?.({ etape: "ready", statut: "echec", detail: "slide introuvable" });
      return { ok: false as const, nettoyee: false, motif: "slide introuvable" };
    }
    const slide = slides[idx]!;
    const sourceUrl = slide.raw_url ?? slide.reference_url;
    if (!sourceUrl) {
      emit?.({ etape: "ready", statut: "echec", detail: "pas d'URL source" });
      return { ok: false as const, nettoyee: false, motif: "pas d'URL source" };
    }

    try {
      const onEtape = emit ? (e: EvenementEtape) => emit(e) : undefined;
      const propre = await cleanImage(sourceUrl, onEtape);
      if (propre && (await verifyClean(propre.base64, propre.mime))) {
        const ext = propre.mime === "image/jpeg" ? "jpg" : "png";
        const path = `propre/${contenu.id}/${slide.position}.${ext}`;
        const bytes = Uint8Array.from(atob(propre.base64), (c) => c.charCodeAt(0));
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: propre.mime, upsert: true });
        if (upErr) throw upErr;

        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const { data: media, error: insErr } = await supabase
          .from("media_library")
          .upsert(
            {
              compte_reference_id: contenu.compte_reference_id,
              contenu_id: contenu.id,
              storage_path: path,
              url,
              source: "nettoye_reference",
              langue: contenu.langue_source,
              visage_identifiable: null,
              verifie_le: new Date().toISOString(),
              texte_restant: false,
            },
            { onConflict: "storage_path" },
          )
          .select("id")
          .single();
        if (insErr) throw insErr;

        slides[idx] = { ...slide, media_id: media.id };
        await supabase
          .from("contenus")
          .update({ structure_slides: slides })
          .eq("id", contenu.id);

        emit?.({
          etape: "ready",
          statut: "ok",
          ok: true,
          nettoyee: true,
          moteur: propre.moteur,
          mediaId: media.id,
          url,
        });
        return {
          ok: true as const,
          nettoyee: true,
          moteur: propre.moteur,
          mediaId: media.id,
          url,
          etapes: propre.etapes,
        };
      }
      emit?.({
        etape: "ready",
        statut: "echec",
        detail: "texte encore présent ou nettoyage vide",
      });
      return {
        ok: false as const,
        nettoyee: false,
        motif: "texte encore présent ou nettoyage vide",
      };
    } catch (error) {
      const msg = messageErreur(error);
      console.warn(`[renettoyer-contenu] ${contenuId}#${position}: ${msg}`);
      emit?.({ etape: "ready", statut: "echec", detail: msg });
      return { ok: false as const, nettoyee: false, motif: msg };
    }
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
