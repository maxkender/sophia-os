import {
  cleanImage,
  mimeDepuisBase64,
  ocrFrame,
  scoreRelevance,
} from "../_shared/gemini.ts";
import { restaurerResolutionMediaSiBesoin } from "../_shared/restore_resolution.ts";
import { assertAuthorised, chargerPrompt, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
/** Une Edge Function ne tient pas trente appels Gemini : on avance par petits
 *  lots et le cron reprend là où on s'est arrêté. */
const SLIDES_PAR_PASSAGE = 2;
const SEUIL_PERTINENCE = 50;
// Une seule tentative de nettoyage PAR PASSAGE : cleanImage réessaie déjà le
// proxy 5× avec backoff. Ce qui aide vraiment contre la surcharge, c'est
// d'espacer les reprises dans le TEMPS — on retente donc au passage suivant du
// cron (chaque minute), jusqu'à MAX_TENTATIVES_NETTOYAGE passages, ce qui laisse
// Gemini se dégager entre deux. Le brut n'est versé qu'en tout dernier recours.
const MAX_TENTATIVES_NETTOYAGE = 4;

interface Slide {
  position: number;
  raw_url: string;
  texte_original: string | null;
  media_id: string | null;
  /** Nettoyages tentés sur cette slide, cumulés sur les passages du cron. */
  tentatives?: number;
}

/**
 * Préparation d'un sujet : OCR des visuels, notation de pertinence, puis
 * nettoyage des images vers la bibliothèque. Un sujet jugé hors-sujet est
 * rejeté avant tout nettoyage, ce qui évite de payer du Gemini pour rien.
 *
 *   {}            → le sujet le plus ancien restant à préparer
 *   { sujetId }   → ce sujet précis (essai admin)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let sujetId: string | null = null;
  try {
    const body = await request.json();
    sujetId = body?.sujetId ?? null;
  } catch {
    // Corps vide : on prend la file.
  }

  try {
    // On reprend aussi les sujets `failed` : la plupart des échecs de préparation
    // sont des 429 Gemini (quota) — transitoires. Sans ça, un sujet qui tombe sur
    // un quota plein restait bloqué à jamais. Il repart au passage suivant, quand
    // le quota s'est libéré.
    let query = supabase
      .from("sujets")
      .select("*")
      .in("preparation_statut", ["running", "pending", "failed"]);

    if (sujetId) query = query.eq("id", sujetId);
    // Les NON NOTÉS d'abord : la notation est rapide (légende) et remplit le
    // stock tout de suite ; l'OCR + le nettoyage (lents) des retenus viennent
    // ensuite. Puis les plus anciens.
    else
      query = query
        .order("pertinence_score", { ascending: true, nullsFirst: true })
        .order("created_at");

    const { data: sujets } = await query.limit(1);
    const sujet = sujets?.[0];
    if (!sujet) return json({ ok: true, idle: true });

    const etape = await avancer(supabase, sujet);
    return json({ ok: true, sujetId: sujet.id, etape });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function avancer(supabase: Supabase, sujet: any): Promise<string> {
  const slides: Slide[] = sujet.structure_slides ?? [];

  try {
    if (slides.length === 0) throw new Error("Sujet sans visuel");

    await supabase
      .from("sujets")
      .update({ preparation_statut: "running" })
      .eq("id", sujet.id);

    // 1 — OCR du HOOK (slide 1) D'ABORD : c'est le signal FIABLE de pertinence.
    // La légende n'est souvent que des hashtags (« #yoga #cortisol ») → noter
    // là-dessus rejetait de bons posts à tort. On lit donc le vrai texte du hook,
    // un seul appel, avant de trancher.
    if (slides[0] && slides[0].texte_original === null) {
      slides[0].texte_original = await ocrFrame(slides[0].raw_url);
      await supabase.from("sujets").update({ structure_slides: slides }).eq("id", sujet.id);
      return "ocr";
    }

    // 2 — PERTINENCE depuis le HOOK (+ la légende en appoint) : décide si le sujet
    // marcherait pour Sophia. Un rejeté s'arrête là (pas d'OCR ni nettoyage du
    // reste). Un retenu enchaîne — il est déjà visible au stock (brut).
    if (sujet.pertinence_score === null) {
      const { score, reason } = await scoreRelevance({
        caption: sujet.titre ?? "",
        hookText: slides[0]?.texte_original ?? "",
        instructions: await chargerPrompt(supabase, "pertinence"),
      });

      const retenu = score >= SEUIL_PERTINENCE;
      await supabase
        .from("sujets")
        .update({
          pertinence_score: score,
          pertinence_raison: reason,
          statut: retenu ? "retenu" : "rejete",
          preparation_statut: retenu ? "running" : "done",
        })
        .eq("id", sujet.id);

      return retenu ? "pertinence" : "rejete";
    }

    // 3 — OCR du RESTE des slides (pour la traduction) : le hook est déjà lu.
    const aOcr = slides.filter((s) => s.texte_original === null);
    if (aOcr.length > 0) {
      for (const slide of aOcr.slice(0, SLIDES_PAR_PASSAGE)) {
        slide.texte_original = await ocrFrame(slide.raw_url);
      }
      await supabase
        .from("sujets")
        .update({ structure_slides: slides })
        .eq("id", sujet.id);
      return "ocr";
    }

    // 3 — nettoyage des visuels retenus, versés dans la bibliothèque.
    const aNettoyer = slides.filter((s) => s.media_id === null);
    if (aNettoyer.length > 0) {
      for (const slide of aNettoyer.slice(0, SLIDES_PAR_PASSAGE)) {
        const propre = await nettoyerVersBibliotheque(supabase, sujet, slide);
        if (propre) {
          slide.media_id = propre;
          slide.tentatives = undefined;
        } else {
          // Échec passager (Gemini surchargé) : on NE fige PAS le brut. On laisse
          // media_id à null pour RE-TENTER le vrai nettoyage au passage suivant.
          slide.tentatives = (slide.tentatives ?? 0) + 1;
          if (slide.tentatives >= MAX_TENTATIVES_NETTOYAGE) {
            // Tout dernier recours après plusieurs passages : on verse le brut
            // pour ne pas bloquer le sujet. Il reste signalé, et la composition
            // tentera de le remplacer par un visuel propre de la bibliothèque.
            slide.media_id = await stockerBrut(supabase, sujet, slide);
          }
        }
        // On enregistre slide par slide, pas à la fin du lot : le worker est
        // régulièrement tué en cours de route (WORKER_RESOURCE_LIMIT), et le
        // média était alors déjà en base sans que son id soit retenu. Le
        // passage suivant reprenait la même slide et butait sur l'unicité de
        // storage_path, ce qui condamnait le sujet.
        await supabase
          .from("sujets")
          .update({ structure_slides: slides })
          .eq("id", sujet.id);
      }
      return "nettoyage";
    }

    await supabase
      .from("sujets")
      .update({ preparation_statut: "done", preparation_erreur: null })
      .eq("id", sujet.id);
    return "done";
  } catch (error) {
    await supabase
      .from("sujets")
      .update({
        preparation_statut: "failed",
        preparation_erreur: messageErreur(error),
      })
      .eq("id", sujet.id);
    return "failed";
  }
}

/**
 * Nettoie un visuel et l'ajoute à la bibliothèque. Renvoie l'id du média propre
 * en cas de SUCCÈS, ou `null` en cas d'échec de nettoyage (surcharge, refus).
 *
 * Un échec de nettoyage n'est PAS fatal : on renvoie null (l'appelant re-tentera
 * au passage suivant) au lieu de laisser l'erreur condamner tout le sujet. Seule
 * une vraie erreur d'infrastructure (upload, base) remonte.
 */
// deno-lint-ignore no-explicit-any
async function nettoyerVersBibliotheque(
  supabase: Supabase,
  sujet: any,
  slide: Slide,
): Promise<string | null> {
  let propreBase64: string | null;
  let mimeDeclare = "image/jpeg";
  try {
    // cleanImage rend une sortie de confiance (proxy) ou déjà vérifiée en interne
    // (repli inpaint/génératif). Elle réessaie déjà le proxy 5× avec backoff.
    const propre = await cleanImage(slide.raw_url);
    propreBase64 = propre?.base64 ?? null;
    mimeDeclare = propre?.mime ?? "image/jpeg";
  } catch (error) {
    // Surcharge Fal/proxy ou refus : échec de CE passage, pas du sujet. On
    // renvoie null pour re-tenter plus tard.
    console.warn(`[nettoyage échec] sujet=${sujet.id} slide=${slide.position} ${messageErreur(error)}`);
    return null;
  }
  if (!propreBase64) return null;

  // verifyClean en pause — on stocke directement le résultat Fal/Replicate.
  const { mime, ext } = mimeDepuisBase64(propreBase64, mimeDeclare);

  const path = `propre/${sujet.id}/${slide.position}.${ext}`;
  const bytes = Uint8Array.from(atob(propreBase64), (c) => c.charCodeAt(0));
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "60" });
  if (upErr) throw upErr;
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const url = `${publicUrl}?v=${Date.now()}`;

  // Upsert et non insert : `storage_path` est unique, et une reprise après un
  // worker tué retomberait sinon sur un doublon.
  const { data: media, error } = await supabase
    .from("media_library")
    .upsert(
      {
        compte_reference_id: sujet.compte_reference_id,
        storage_path: path,
        url,
        source: "nettoye_reference",
        langue: sujet.langue,
        visage_identifiable: null,
        verifie_le: new Date().toISOString(),
        texte_restant: false,
      },
      { onConflict: "storage_path" },
    )
    .select()
    .single();

  if (error) throw error;

  try {
    await restaurerResolutionMediaSiBesoin(media.id, slide.raw_url, url);
  } catch (e) {
    console.warn(
      `[nettoyage restore] sujet=${sujet.id} slide=${slide.position} ${messageErreur(e)}`,
    );
  }

  return media.id;
}

/**
 * Dernier recours après plusieurs passages de nettoyage ratés : verse l'original
 * (texte incrusté compris) comme média `brut/`, pour ne pas bloquer le sujet
 * indéfiniment. Il reste signalé « texte non retiré », et la composition tentera
 * de lui substituer un visuel propre de la bibliothèque du compte.
 */
// deno-lint-ignore no-explicit-any
async function stockerBrut(supabase: Supabase, sujet: any, slide: Slide): Promise<string> {
  const { data: media, error } = await supabase
    .from("media_library")
    .upsert(
      {
        compte_reference_id: sujet.compte_reference_id,
        storage_path: `brut/${sujet.id}/${slide.position}`,
        url: slide.raw_url,
        source: "nettoye_reference",
        langue: sujet.langue,
        visage_identifiable: null,
        // Le brut porte ENCORE son texte incrusté : on le signale, sinon il
        // pourrait être repioché comme s'il était propre (avatar, visuel de
        // remplacement…). texte_restant l'exclut de tous les pools « propres ».
        verifie_le: new Date().toISOString(),
        texte_restant: true,
      },
      { onConflict: "storage_path" },
    )
    .select()
    .single();

  if (error) throw error;
  return media.id;
}
