import { dimensionsJpeg } from "../_shared/pods.ts";
import { BANDE_DEFAUT, cheminEtape, cheminRetouche, dejaRetouchee, recadrages, urlRendu } from "../_shared/retouche_bande.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";
const MAX_PAR_APPEL = 10;

/**
 * Retire la bande du bas de photos « propres » de la bibliothèque : efface une
 * signature de compte source collée au même endroit sur toutes ses slides, que
 * le nettoyage de l'import a laissée (@Don.LoQ, 14/11). Deux recadrages par les
 * transformations d'images de Supabase Storage, sans décoder ici : détail dans
 * `_shared/retouche_bande.ts`.
 *
 *   { mediaIds: string[] (10 au plus), bande?: number (fraction, 0,07 par défaut) }
 *   → { ok, resultats: [{ mediaId, ok, url?, saute?, erreur? }] }
 *
 * Admin ou secret des crons. Seulement les photos sous propre/. Une photo déjà
 * retouchée (suffixe « -bande ») est sautée : chaque passage rogne encore.
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
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const resultats = [];
  for (const mediaId of ids) {
    try {
      const { data: media } = await supabase
        .from("media_library")
        .select("id, storage_path")
        .eq("id", mediaId)
        .maybeSingle();
      if (!media) throw new Error("média introuvable");
      const source = String(media.storage_path ?? "");
      if (!source.startsWith("propre/")) throw new Error("pas une photo propre");
      if (dejaRetouchee(source)) {
        resultats.push({ mediaId, ok: true, saute: true });
        continue;
      }
      const cle = `${Date.now()}`;

      // Dimensions lues dans l'en-tête du JPEG, sans le décoder.
      const brut = await fetch(supabase.storage.from(BUCKET).getPublicUrl(source).data.publicUrl);
      if (!brut.ok) throw new Error(`téléchargement ${brut.status}`);
      const dims = dimensionsJpeg(new Uint8Array(await brut.arrayBuffer()));
      if (!dims) throw new Error("pas un JPEG lisible");
      const { etape: t1, finale: t2 } = recadrages(dims.l, dims.h, bande);

      // 1. Recadrage centré : la bande du bas part (avec la même en haut).
      const r1 = await fetch(urlRendu(base, BUCKET, source, t1.l, t1.h, cle));
      if (!r1.ok) throw new Error(`rendu 1 : ${r1.status}`);
      const etape = cheminEtape(source);
      const up1 = await supabase.storage.from(BUCKET)
        .upload(etape, new Uint8Array(await r1.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
      if (up1.error) throw up1.error;

      // 2. Retour au format d'origine : on rogne un peu les côtés.
      const r2 = await fetch(urlRendu(base, BUCKET, etape, t2.l, t2.h, cle));
      if (!r2.ok) throw new Error(`rendu 2 : ${r2.status}`);
      const finale = cheminRetouche(source);
      const up2 = await supabase.storage.from(BUCKET)
        .upload(finale, new Uint8Array(await r2.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
      if (up2.error) throw up2.error;
      await supabase.storage.from(BUCKET).remove([etape]);

      const url = `${supabase.storage.from(BUCKET).getPublicUrl(finale).data.publicUrl}?v=${cle}`;
      const { error: majErr } = await supabase
        .from("media_library")
        .update({ storage_path: finale, url })
        .eq("id", media.id);
      if (majErr) throw majErr;
      resultats.push({ mediaId, ok: true, url });
    } catch (error) {
      resultats.push({ mediaId, ok: false, erreur: messageErreur(error) });
    }
  }
  return json({ ok: true, resultats });
});
