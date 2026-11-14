import { BANDE_DEFAUT, cheminRetouche, recouvrirBandeBas } from "../_shared/retouche_bande.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";
const MAX_PAR_APPEL = 30;

/**
 * Recouvre la bande du bas de photos « propres » de la bibliothèque avec la
 * bande juste au-dessus : efface une signature de compte source collée au même
 * endroit sur toutes ses slides, que le nettoyage de l'import a laissée
 * (@Don.LoQ, 14/11). Détail dans `_shared/retouche_bande.ts`.
 *
 *   { mediaIds: string[] (30 au plus), bande?: number (fraction de la hauteur, 0,07 par défaut) }
 *   → { ok, resultats: [{ mediaId, ok, url?, bande?, erreur? }] }
 *
 * Admin ou secret des crons. Seulement les photos sous propre/ ; JPEG seulement.
 * La version retouchée est écrite à côté (suffixe « -bande ») et media_library
 * pointe dessus : relancer réécrit le même fichier.
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // corps vide
  }
  const ids: string[] = Array.isArray(body?.mediaIds) ? body.mediaIds.map(String).slice(0, MAX_PAR_APPEL) : [];
  if (!ids.length) return json({ ok: false, error: "mediaIds requis" }, 400);
  const bande = Number(body?.bande ?? BANDE_DEFAUT);

  const supabase = serviceClient();
  const { decode, encode } = await import("npm:jpeg-js@0.4.4");
  const resultats = [];
  for (const mediaId of ids) {
    try {
      const { data: media } = await supabase
        .from("media_library")
        .select("id, url, storage_path")
        .eq("id", mediaId)
        .maybeSingle();
      if (!media) throw new Error("média introuvable");
      if (!String(media.storage_path ?? "").startsWith("propre/")) throw new Error("pas une photo propre");

      const resp = await fetch(media.url);
      if (!resp.ok) throw new Error(`téléchargement ${resp.status}`);
      const octets = new Uint8Array(await resp.arrayBuffer());
      if (octets[0] !== 0xff || octets[1] !== 0xd8) throw new Error("pas un JPEG");

      const img = decode(octets, { useTArray: true, maxMemoryUsageInMB: 128 });
      const hb = recouvrirBandeBas(img.data, img.width, img.height, bande);
      const sortie = encode({ data: img.data, width: img.width, height: img.height }, 90).data;

      const path = cheminRetouche(media.storage_path);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, sortie, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const url = `${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error: majErr } = await supabase
        .from("media_library")
        .update({ storage_path: path, url })
        .eq("id", media.id);
      if (majErr) throw majErr;
      resultats.push({ mediaId, ok: true, url, bande: hb });
    } catch (error) {
      resultats.push({ mediaId, ok: false, erreur: messageErreur(error) });
    }
  }
  return json({ ok: true, resultats });
});
