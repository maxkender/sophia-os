import { cleanImage, type EvenementEtape } from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

/**
 * Nettoyage de TEST, non destructif.
 *
 *   { url, stream?: true }
 *     → JSON { ok, url, moteur, etapes }
 *     → ou NDJSON si stream=true (une ligne / étape, puis ready + url)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { url?: string; stream?: boolean } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  const url = corps.url ?? null;
  if (!url) return json({ error: "url requise" }, 400);

  const stream = veutStream(request, corps);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const onEtape = emit ? (e: EvenementEtape) => emit(e) : undefined;
    const propre = await cleanImage(url, onEtape);
    if (!propre) {
      emit?.({ etape: "ready", statut: "echec", detail: "aucune image renvoyée" });
      return { ok: false as const, motif: "aucune image renvoyée", etapes: [] };
    }

    const supabase = serviceClient();
    const ext = propre.mime === "image/jpeg" ? "jpg" : "png";
    const chemin = `test/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(propre.base64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, bytes, { contentType: propre.mime, upsert: true });
    if (error) throw error;

    const publique = supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
    emit?.({
      etape: "ready",
      statut: "ok",
      url: publique,
      moteur: propre.moteur,
      ok: true,
    });
    return {
      ok: true as const,
      url: publique,
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
    const res = await executer();
    if (!res.ok) return json(res);
    return json(res);
  } catch (error) {
    return json({ ok: false, erreur: messageErreur(error) }, 500);
  }
});
