/**
 * UGC IA (page /admin/ugc-ia, migrations 0656 à 0662) : une réaction TikTok
 * (la source) refaite par un ou plusieurs personas synthétiques avec
 * Higgsfield Genjutsu (transfert de mouvement). Admin seulement. La page lit
 * les tables directement ; tout changement passe ici.
 *
 *   { action: "importer", url }                    → télécharge la vidéo TikTok (Apify)
 *                                                    et capture son CTA (premier écran + OCR)
 *   { action: "lire_cta", id }                     → recapture le CTA d'une source
 *   { action: "enregistrer_cta", id, texte }       → corrige le texte du CTA
 *   { action: "couper", id, partie?, debut, fin }  → coupe la réaction (envoyée à Genjutsu)
 *                                                    ou la partie téléphone (gardée telle quelle)
 *   { action: "generer", sourceId, personaIds, prompt?, resolution? }
 *                                                  → une génération Genjutsu par persona
 *                                                    coché (refaire = relancer pour un persona)
 *   { action: "suivre" }                           → relève les générations en cours et
 *                                                    rapatrie les vidéos terminées
 *   { action: "monter", id, debut?, fin?, bandeau? } → recadre la vidéo générée et/ou pose le
 *                                                    bandeau (PNG rendu par la page), en
 *                                                    arrière-plan ; la vidéo montée devient la
 *                                                    vidéo enregistrée, l'original reste gardé
 *   { action: "annuler_montage", id }              → revient à la vidéo d'origine de Genjutsu
 *   { action: "supprimer_source", id }             → la source, ses générations, ses fichiers
 *   { action: "supprimer_generation", id }         → une génération et sa vidéo
 *   { action: "rapatrier_personas" }               → copie dans le stockage de l'OS les images
 *                                                    des personas ajoutés par Claude (URL externe)
 *   { action: "assigner_persona", personaId, compteId|null }
 *                                                  → rattache le persona à un compte UGCV
 *                                                    (1 persona = 1 compte, migration 0661)
 *   { action: "creer_post_video", compteId, date, videos, ctaTexte?, ctaIncruste?,
 *     captureUrl?, legende?, musiqueUrl?, musiqueTitre?, applicationId? }
 *                                                  → pose un post vidéo sur un compte UGCV
 *                                                    (1 par jour), compté comme un post
 *                                                    normal (posts + passage sans contenu, 0662)
 *   { action: "supprimer_post_video", id }         → retire un post vidéo pas encore publié
 *
 * Secrets : APIFY_TOKEN, FAL_KEY, HIGGSFIELD_API_KEY (« KEY_ID:KEY_SECRET »).
 */

import { downloadMedia, scrapeVideoPost } from "../_shared/apify.ts";
import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import { falDownloadBytes, falQueueAwaitJson, falQueueSubmit } from "../_shared/fal_queue.ts";
import { sonderVideoMeta } from "../_shared/fal_normaliser_video.ts";
import { trimmerVideoFal } from "../_shared/fal_trim_video.ts";
import { ocrFrame } from "../_shared/gemini.ts";
import { poserPostVideo } from "../_shared/posts_video.ts";
import {
  cleHiggsfield,
  corpsGenjutsu,
  lancerGenjutsuMouvement,
  RESOLUTIONS_GENJUTSU,
  type ResolutionGenjutsu,
  suivreGenjutsu,
  urlPropre,
} from "../_shared/higgsfield.ts";
import { assertAuthorised, aujourdhuiParis, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import {
  cheminGeneration,
  cheminPersona,
  cheminsMontage,
  cheminsUgcIa,
  coupeUtile,
  demandeAssignation,
  demandeMontage,
  type DemandeMontage,
  demandePostVideo,
  lienTiktok,
  nettoyerCta,
  partieSource,
  passage,
  personasDemandees,
  PROMPT_DEFAUT,
  TELEPHONE_MAX_S,
  urlImageExtraite,
  urlVideoFal,
} from "../_shared/ugc_ia.ts";

const BUCKET = "medias";
const MODELE_PREMIER_ECRAN = "fal-ai/ffmpeg-api/extract-frame";
/** Pose une image (le bandeau, PNG transparent de la taille de la vidéo) par-dessus la vidéo. */
const MODELE_COMPOSE = "fal-ai/ffmpeg-api/compose";
type Supabase = ReturnType<typeof serviceClient>;

const maintenant = () => new Date().toISOString();

async function deposer(supabase: Supabase, chemin: string, octets: Uint8Array, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, octets, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`stockage : ${error.message}`);
  return `${supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl}?v=${Date.now()}`;
}

async function retirer(supabase: Supabase, chemins: Array<string | null | undefined>): Promise<void> {
  const liste = chemins.filter((c): c is string => Boolean(c));
  if (liste.length) await supabase.storage.from(BUCKET).remove(liste);
}

async function lireSource(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("ugc_ia_sources").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Le CTA d'une source : son premier écran (Fal) et le texte qu'on y lit (OCR). */
async function capturerCta(
  supabase: Supabase,
  source: { id: string; brut_url: string },
): Promise<{ cta_image_path: string; cta_image_url: string; cta_texte: string }> {
  const file = await falQueueSubmit(MODELE_PREMIER_ECRAN, { video_url: urlPropre(source.brut_url), frame_type: "first" });
  const sortie = await falQueueAwaitJson(MODELE_PREMIER_ECRAN, file, undefined, 90_000);
  const url = urlImageExtraite(sortie);
  if (!url) throw new Error(`premier écran : pas d'image (${JSON.stringify(sortie).slice(0, 200)})`);
  const image = await falDownloadBytes(url);
  const chemin = cheminsUgcIa(source.id).cta;
  const imageUrl = await deposer(supabase, chemin, image.bytes, image.mime.startsWith("image/") ? image.mime : "image/jpeg");
  return { cta_image_path: chemin, cta_image_url: imageUrl, cta_texte: nettoyerCta(await ocrFrame(urlPropre(imageUrl))) };
}

async function importer(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const url = lienTiktok(body.url);
  const post = await scrapeVideoPost(url);
  const octets = await downloadMedia(post.videoUrl);
  const id = crypto.randomUUID();
  const chemin = cheminsUgcIa(id).source;
  const brutUrl = await deposer(supabase, chemin, octets, "video/mp4");
  const { data, error } = await supabase
    .from("ugc_ia_sources")
    .insert({
      id,
      source_url: post.webVideoUrl || url,
      source_texte: post.text || null,
      source_vues: post.stats.vues,
      source_duree_s: post.dureeMs != null ? post.dureeMs / 1000 : null,
      musique_url: post.musicUrl,
      musique_titre: post.musicTitle,
      brut_path: chemin,
      brut_url: brutUrl,
    })
    .select("*")
    .single();
  if (error) {
    await retirer(supabase, [chemin]);
    throw new Error(error.message);
  }
  // Le CTA ne bloque pas l'import : en cas d'échec, la page propose de le recapturer.
  let avertissement: string | null = null;
  try {
    const cta = await capturerCta(supabase, { id, brut_url: brutUrl });
    const { data: maj } = await supabase.from("ugc_ia_sources").update({ ...cta, updated_at: maintenant() }).eq("id", id).select("*").single();
    return json({ ok: true, source: maj ?? data });
  } catch (e) {
    avertissement = `CTA non capturé : ${messageErreur(e)}`;
    console.error("ugc-ia cta", id, e);
  }
  return json({ ok: true, source: data, avertissement });
}

async function lireCta(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  const source = id ? await lireSource(supabase, id) : null;
  if (!source) return json({ error: "source introuvable" }, 404);
  if (!source.brut_url) return json({ error: "pas de vidéo source" }, 409);
  const cta = await capturerCta(supabase, source);
  const { data, error } = await supabase.from("ugc_ia_sources").update({ ...cta, updated_at: maintenant() }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return json({ ok: true, source: data });
}

async function enregistrerCta(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id requis" }, 400);
  const texte = String(body.texte ?? "").trim().slice(0, 500);
  const { data, error } = await supabase
    .from("ugc_ia_sources")
    .update({ cta_texte: texte, updated_at: maintenant() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return json({ error: "source introuvable" }, 404);
  return json({ ok: true, source: data });
}

async function couper(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  const partie = partieSource(body.partie);
  if (!partie) return json({ error: "partie : reaction ou telephone" }, 400);
  const source = id ? await lireSource(supabase, id) : null;
  if (!source) return json({ error: "source introuvable" }, 404);
  if (!source.brut_url) return json({ error: "pas de vidéo source à couper" }, 409);
  if (partie === "reaction") {
    // Genjutsu lit la réaction pendant la génération : on ne la remplace pas sous ses pieds.
    const { count } = await supabase
      .from("ugc_ia_generations")
      .select("id", { count: "exact", head: true })
      .eq("source_id", id)
      .eq("statut", "en_cours");
    if (count) return json({ error: "des générations sont en cours sur cette réaction : attends qu'elles finissent pour recouper" }, 409);
  }
  const duree = source.source_duree_s != null ? Number(source.source_duree_s) : null;
  const p = passage(body.debut, body.fin, duree, partie === "telephone" ? TELEPHONE_MAX_S : undefined);
  if ("erreur" in p) return json({ error: p.erreur }, 400);

  const coupe = await trimmerVideoFal({ videoUrl: source.brut_url, startSec: p.debut, endSec: p.fin });
  const chemin = cheminsUgcIa(id)[partie];
  const url = await deposer(supabase, chemin, coupe.bytes, "video/mp4");
  const champs =
    partie === "reaction"
      ? { debut_s: p.debut, fin_s: p.fin, coupe_path: chemin, coupe_url: url }
      : { telephone_debut_s: p.debut, telephone_fin_s: p.fin, telephone_path: chemin, telephone_url: url };
  const { data, error } = await supabase
    .from("ugc_ia_sources")
    .update({ ...champs, updated_at: maintenant() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return json({ ok: true, source: data });
}

async function generer(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const cle = cleHiggsfield();
  if (!cle) return json({ error: "Clé Higgsfield absente : ajoute le secret HIGGSFIELD_API_KEY (KEY_ID:KEY_SECRET) dans Supabase" }, 500);
  const sourceId = String(body.sourceId ?? "").trim();
  const source = sourceId ? await lireSource(supabase, sourceId) : null;
  if (!source) return json({ error: "source introuvable" }, 404);
  if (!source.coupe_url) return json({ error: "coupe d'abord le passage de la réaction" }, 409);
  const ids = personasDemandees(body.personaIds);
  if ("erreur" in ids) return json({ error: ids.erreur }, 400);
  const resolution = String(body.resolution ?? "720p") as ResolutionGenjutsu;
  if (!RESOLUTIONS_GENJUTSU.includes(resolution)) return json({ error: "résolution : 480p, 720p ou 1080p" }, 400);
  const prompt = String(body.prompt ?? "").trim() || PROMPT_DEFAUT;

  const { data: personas, error: errPersonas } = await supabase
    .from("ugc_ia_personas")
    .select("id, nom, image_url")
    .in("id", ids)
    .eq("actif", true);
  if (errPersonas) throw new Error(errPersonas.message);
  const parId = new Map((personas ?? []).map((p) => [p.id as string, p]));

  const resultats: Array<{ personaId: string; nom: string | null; generationId?: string; erreur?: string }> = [];
  for (const personaId of ids) {
    const persona = parId.get(personaId);
    if (!persona) {
      resultats.push({ personaId, nom: null, erreur: "persona inconnu ou inactif" });
      continue;
    }
    // L'index unique (une génération en cours par source et par persona) arrête
    // un double clic avant tout appel facturé.
    const { data: gen, error } = await supabase
      .from("ugc_ia_generations")
      .insert({ source_id: sourceId, persona_id: personaId, debut_s: source.debut_s, fin_s: source.fin_s, prompt, resolution })
      .select("id")
      .single();
    if (error || !gen) {
      const doublon = error?.code === "23505";
      resultats.push({ personaId, nom: persona.nom, erreur: doublon ? "déjà une génération en cours pour ce persona" : messageErreur(error) });
      continue;
    }
    try {
      const { requestId } = await lancerGenjutsuMouvement(
        cle,
        corpsGenjutsu({ videoUrl: source.coupe_url, imageUrls: [persona.image_url], prompt, resolution }),
      );
      await supabase.from("ugc_ia_generations").update({ higgsfield_request_id: requestId, updated_at: maintenant() }).eq("id", gen.id);
      resultats.push({ personaId, nom: persona.nom, generationId: gen.id });
    } catch (e) {
      await supabase.from("ugc_ia_generations").update({ statut: "echec", erreur: messageErreur(e), updated_at: maintenant() }).eq("id", gen.id);
      resultats.push({ personaId, nom: persona.nom, generationId: gen.id, erreur: messageErreur(e) });
    }
  }
  return json({ ok: true, resultats });
}

/** Relève les générations en cours (les plus anciennes d'abord) et rapatrie les vidéos prêtes. */
async function suivre(supabase: Supabase): Promise<Response> {
  const cle = cleHiggsfield();
  if (!cle) return json({ error: "Clé Higgsfield absente : ajoute le secret HIGGSFIELD_API_KEY dans Supabase" }, 500);

  // Lancement coupé avant la réponse de Higgsfield (fonction arrêtée) : sans
  // identifiant, rien à relever. Après 10 min, on la rend relançable.
  await supabase
    .from("ugc_ia_generations")
    .update({ statut: "echec", erreur: "lancement interrompu avant la réponse de Higgsfield : refais-la", updated_at: maintenant() })
    .eq("statut", "en_cours")
    .is("higgsfield_request_id", null)
    .lt("lancee_le", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: enCours, error } = await supabase
    .from("ugc_ia_generations")
    .select("id, source_id, higgsfield_request_id")
    .eq("statut", "en_cours")
    .not("higgsfield_request_id", "is", null)
    .order("lancee_le")
    .limit(6);
  if (error) throw new Error(error.message);

  const bilan: Array<{ id: string; statut: string; erreur?: string }> = [];
  for (const g of enCours ?? []) {
    try {
      const etat = await suivreGenjutsu(cle, g.higgsfield_request_id as string);
      if (etat.statut === "en_cours") {
        bilan.push({ id: g.id, statut: "en_cours" });
        continue;
      }
      if (etat.statut === "echec") {
        await supabase
          .from("ugc_ia_generations")
          .update({ statut: "echec", erreur: etat.erreur, updated_at: maintenant() })
          .eq("id", g.id)
          .eq("statut", "en_cours");
        bilan.push({ id: g.id, statut: "echec", erreur: etat.erreur });
        continue;
      }
      const r = await fetch(etat.videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`téléchargement du résultat : HTTP ${r.status}`);
      const chemin = cheminGeneration(g.source_id, g.id);
      const videoUrl = await deposer(supabase, chemin, new Uint8Array(await r.arrayBuffer()), "video/mp4");
      await supabase
        .from("ugc_ia_generations")
        .update({
          statut: "prete",
          video_path: chemin,
          video_url: videoUrl,
          video_brute_path: chemin,
          video_brute_url: videoUrl,
          generee_le: maintenant(),
          updated_at: maintenant(),
        })
        .eq("id", g.id)
        .eq("statut", "en_cours");
      bilan.push({ id: g.id, statut: "prete" });
    } catch (e) {
      // Erreur passagère (réseau, stockage) : on reste en cours, le prochain relevé réessaie.
      bilan.push({ id: g.id, statut: "en_cours", erreur: messageErreur(e) });
    }
  }
  return json({ ok: true, bilan });
}

async function supprimerSource(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  const source = id ? await lireSource(supabase, id) : null;
  if (!source) return json({ error: "source introuvable" }, 404);
  const { data: gens } = await supabase.from("ugc_ia_generations").select("id, video_path, video_brute_path").eq("source_id", id);
  await retirer(supabase, [
    source.brut_path,
    source.coupe_path,
    source.telephone_path,
    source.cta_image_path,
    ...(gens ?? []).flatMap((g) => fichiersGeneration(id, g)),
  ]);
  const { error } = await supabase.from("ugc_ia_sources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

async function supprimerGeneration(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id requis" }, 400);
  const { data: gen, error: errLecture } = await supabase
    .from("ugc_ia_generations")
    .select("id, source_id, video_path, video_brute_path")
    .eq("id", id)
    .maybeSingle();
  if (errLecture) throw new Error(errLecture.message);
  if (!gen) return json({ error: "génération introuvable" }, 404);
  await retirer(supabase, fichiersGeneration(gen.source_id as string, gen));
  const { error } = await supabase.from("ugc_ia_generations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

/** Tous les fichiers d'une génération : l'original, la vidéo montée, la coupe et le bandeau. */
function fichiersGeneration(sourceId: string, g: { id: unknown; video_path?: unknown; video_brute_path?: unknown }): Array<string | null> {
  const m = cheminsMontage(sourceId, String(g.id));
  return [g.video_path as string | null, g.video_brute_path as string | null, m.coupe, m.bandeau, m.monte];
}

/** Lance un travail après la réponse (EdgeRuntime.waitUntil) ; à défaut, l'attend. */
async function enArrierePlan(travail: Promise<unknown>): Promise<void> {
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(travail);
  else await travail;
}

/** Pose le bandeau (PNG de la taille de la vidéo) sur toute la durée de la vidéo. */
async function poserBandeau(videoUrl: string, imageUrl: string, dureeS: number): Promise<Uint8Array> {
  const ms = Math.round(dureeS * 1000);
  const file = await falQueueSubmit(MODELE_COMPOSE, {
    tracks: [
      { id: "video", type: "video", keyframes: [{ url: urlPropre(videoUrl), timestamp: 0, duration: ms }] },
      { id: "bandeau", type: "image", keyframes: [{ url: urlPropre(imageUrl), timestamp: 0, duration: ms }] },
    ],
  });
  const sortie = await falQueueAwaitJson(MODELE_COMPOSE, file, undefined, 300_000);
  const url = urlVideoFal(sortie);
  if (!url) throw new Error(`bandeau : pas de vidéo rendue (${JSON.stringify(sortie).slice(0, 200)})`);
  return (await falDownloadBytes(url)).bytes;
}

type GenerationAMonter = { id: string; source_id: string; video_brute_path: string; video_brute_url: string };

/** Le rendu du montage : coupe de l'original si besoin, puis bandeau si demandé. */
async function rendreMontage(supabase: Supabase, g: GenerationAMonter, d: DemandeMontage): Promise<void> {
  const chemins = cheminsMontage(g.source_id, g.id);
  try {
    let base = { path: g.video_brute_path, url: g.video_brute_url };
    const dureeBrute = (await sonderVideoMeta(base.url)).durationSec;
    const coupee = coupeUtile(d.debut, d.fin, dureeBrute);
    let duree = dureeBrute;
    if (coupee) {
      const coupe = await trimmerVideoFal({ videoUrl: base.url, startSec: d.debut ?? 0, endSec: d.fin ?? 0 });
      base = { path: chemins.coupe, url: await deposer(supabase, chemins.coupe, coupe.bytes, "video/mp4") };
      duree = (await sonderVideoMeta(base.url)).durationSec ?? coupe.trimmedDuration ?? (d.fin ?? 0) - (d.debut ?? 0);
    }
    let final = base;
    if (d.bandeau) {
      if (!(duree && duree > 0)) throw new Error("durée de la vidéo inconnue : impossible de poser le bandeau");
      const pngUrl = await deposer(supabase, chemins.bandeau, d.bandeau.png, "image/png");
      const octets = await poserBandeau(base.url, pngUrl, duree);
      final = { path: chemins.monte, url: await deposer(supabase, chemins.monte, octets, "video/mp4") };
    }
    await supabase
      .from("ugc_ia_generations")
      .update({
        video_path: final.path,
        video_url: final.url,
        montage_debut_s: coupee ? d.debut : null,
        montage_fin_s: coupee ? d.fin : null,
        bandeau_actif: Boolean(d.bandeau),
        bandeau_texte: d.bandeauTexte,
        bandeau_position: d.bandeauPosition,
        montage_statut: null,
        montage_erreur: null,
        updated_at: maintenant(),
      })
      .eq("id", g.id);
  } catch (e) {
    console.error("ugc-ia montage", g.id, e);
    await supabase
      .from("ugc_ia_generations")
      .update({ montage_statut: "echec", montage_erreur: messageErreur(e), updated_at: maintenant() })
      .eq("id", g.id);
  }
}

async function monter(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id requis" }, 400);
  const d = demandeMontage(body);
  if ("erreur" in d) return json({ error: d.erreur }, 400);
  // Un montage à la fois par vidéo : la ligne passe « en cours » sous condition.
  const { data: g, error } = await supabase
    .from("ugc_ia_generations")
    .update({ montage_statut: "en_cours", montage_erreur: null, updated_at: maintenant() })
    .eq("id", id)
    .eq("statut", "prete")
    .not("video_brute_url", "is", null)
    .or("montage_statut.is.null,montage_statut.eq.echec")
    .select("id, source_id, video_brute_path, video_brute_url")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!g) return json({ error: "vidéo pas prête, ou montage déjà en cours" }, 409);
  await enArrierePlan(rendreMontage(supabase, g as GenerationAMonter, d));
  return json({ ok: true, statut: "en_cours" });
}

async function annulerMontage(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id requis" }, 400);
  const { data: g, error: errLecture } = await supabase
    .from("ugc_ia_generations")
    .select("id, video_brute_path, video_brute_url, montage_statut")
    .eq("id", id)
    .maybeSingle();
  if (errLecture) throw new Error(errLecture.message);
  if (!g?.video_brute_url) return json({ error: "pas de vidéo d'origine" }, 404);
  if (g.montage_statut === "en_cours") return json({ error: "un montage est en cours : attends sa fin" }, 409);
  const { error } = await supabase
    .from("ugc_ia_generations")
    .update({
      video_path: g.video_brute_path,
      video_url: g.video_brute_url,
      montage_debut_s: null,
      montage_fin_s: null,
      bandeau_actif: false,
      montage_statut: null,
      montage_erreur: null,
      updated_at: maintenant(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

/**
 * Les personas ajoutés par Claude pointent vers une URL externe (Higgsfield…).
 * On copie l'image chez nous, sans ses Content Credentials (C2PA).
 */
async function rapatrierPersonas(supabase: Supabase): Promise<Response> {
  const { data: personas, error } = await supabase.from("ugc_ia_personas").select("id, image_url").is("image_path", null).limit(10);
  if (error) throw new Error(error.message);
  const bilan: Array<{ id: string; erreur?: string }> = [];
  for (const p of personas ?? []) {
    try {
      const r = await fetch(p.image_url as string, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const propre = await retirerContentCredentialsBytes(new Uint8Array(await r.arrayBuffer()));
      if (!propre.mime.startsWith("image/")) throw new Error("ce n'est pas une image JPEG, PNG ou WebP");
      const chemin = cheminPersona(p.id as string, propre.mime);
      const url = await deposer(supabase, chemin, propre.bytes, propre.mime);
      await supabase.from("ugc_ia_personas").update({ image_url: urlPropre(url), image_path: chemin }).eq("id", p.id);
      bilan.push({ id: p.id as string });
    } catch (e) {
      bilan.push({ id: p.id as string, erreur: messageErreur(e) });
    }
  }
  return json({ ok: true, bilan });
}

/** Rattache un persona à un compte UGCV, ou l'en détache ; le compte est repris à son ancien persona. */
async function assignerPersona(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const d = demandeAssignation(body);
  if ("erreur" in d) return json({ error: d.erreur }, 400);
  const { data: persona, error: errP } = await supabase.from("ugc_ia_personas").select("id").eq("id", d.personaId).maybeSingle();
  if (errP) throw new Error(errP.message);
  if (!persona) return json({ error: "Persona introuvable" }, 404);
  if (d.compteId) {
    const { data: compte, error: errC } = await supabase.from("comptes").select("id, ugcv").eq("id", d.compteId).maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!compte) return json({ error: "Compte introuvable" }, 404);
    if (!compte.ugcv) return json({ error: "Ce compte n'est pas UGCV : pose-lui d'abord le label UGCV (page Posters)" }, 400);
    const { error: errL } = await supabase
      .from("ugc_ia_personas")
      .update({ compte_id: null })
      .eq("compte_id", d.compteId)
      .neq("id", d.personaId);
    if (errL) throw new Error(errL.message);
  }
  const { error } = await supabase.from("ugc_ia_personas").update({ compte_id: d.compteId }).eq("id", d.personaId);
  if (error) throw new Error(error.message);
  return json({ ok: true });
}

/**
 * Un post vidéo sur un compte UGCV, compté comme un post normal : le post
 * (type `video`, assigné, prêt), ses vidéos dans l'ordre, et un passage sans
 * contenu que lisent la paie, les relances, la résolution du lien et les vues
 * (`poserPostVideo`, partagé avec la fonction `motion`).
 */
async function creerPostVideo(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const d = demandePostVideo(body, aujourdhuiParis());
  if ("erreur" in d) return json({ error: d.erreur }, 400);

  const { data: compte, error: errC } = await supabase
    .from("comptes")
    .select("id, ugcv, is_active, langue")
    .eq("id", d.compteId)
    .maybeSingle();
  if (errC) throw new Error(errC.message);
  if (!compte) return json({ error: "Compte introuvable" }, 404);
  if (!compte.ugcv) return json({ error: "Ce compte n'est pas UGCV" }, 400);
  if (!compte.is_active) return json({ error: "Ce compte est désactivé" }, 400);

  // 1 post par jour sur un compte UGCV.
  const { data: deja, error: errD } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", d.compteId)
    .eq("date_publication_prevue", d.date)
    .eq("est_test", false)
    .limit(1);
  if (errD) throw new Error(errD.message);
  if ((deja ?? []).length > 0) return json({ error: "Ce compte a déjà un post ce jour-là" }, 409);

  const postId = await poserPostVideo(supabase, {
    compteId: d.compteId,
    date: d.date,
    langue: (compte.langue as string | null) || "en",
    videos: d.videos,
    legende: d.legende,
    ctaTexte: d.ctaTexte,
    ctaIncruste: d.ctaIncruste,
    captureUrl: d.captureUrl,
    musiqueUrl: d.musiqueUrl,
    musiqueTitre: d.musiqueTitre,
    applicationId: d.applicationId,
  });
  return json({ ok: true, postId });
}

/** Retire un post vidéo pas encore publié, et les vidéos importées pour lui. */
async function supprimerPostVideo(supabase: Supabase, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? "");
  const { data: post, error } = await supabase.from("posts").select("id, type, publie_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!post || post.type !== "video") return json({ error: "Post vidéo introuvable" }, 404);
  if (post.publie_at) return json({ error: "Ce post est déjà publié : il compte pour la paie, il reste" }, 409);
  const { data: videos } = await supabase.from("post_videos").select("chemin").eq("post_id", id);
  const { error: errPa } = await supabase.from("passages").delete().eq("post_id", id);
  if (errPa) throw new Error(errPa.message);
  const { error: errP } = await supabase.from("posts").delete().eq("id", id);
  if (errP) throw new Error(errP.message);
  await retirer(supabase, (videos ?? []).map((v) => v.chemin as string | null));
  return json({ ok: true });
}

Deno.serve(async (request) => {
  const refus = await assertAuthorised(request);
  if (refus) return refus;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }
  const supabase = serviceClient();
  try {
    switch (body.action) {
      case "importer":
        return await importer(supabase, body);
      case "lire_cta":
        return await lireCta(supabase, body);
      case "enregistrer_cta":
        return await enregistrerCta(supabase, body);
      case "couper":
        return await couper(supabase, body);
      case "generer":
        return await generer(supabase, body);
      case "suivre":
        return await suivre(supabase);
      case "monter":
        return await monter(supabase, body);
      case "annuler_montage":
        return await annulerMontage(supabase, body);
      case "supprimer_source":
        return await supprimerSource(supabase, body);
      case "supprimer_generation":
        return await supprimerGeneration(supabase, body);
      case "rapatrier_personas":
        return await rapatrierPersonas(supabase);
      case "assigner_persona":
        return await assignerPersona(supabase, body);
      case "creer_post_video":
        return await creerPostVideo(supabase, body);
      case "supprimer_post_video":
        return await supprimerPostVideo(supabase, body);
      default:
        return json(
          {
            error:
              "action inconnue (importer | lire_cta | enregistrer_cta | couper | generer | suivre | monter | annuler_montage | supprimer_source | supprimer_generation | rapatrier_personas | assigner_persona | creer_post_video | supprimer_post_video)",
          },
          400,
        );
    }
  } catch (e) {
    console.error("ugc-ia", body.action, e);
    return json({ error: messageErreur(e) }, 500);
  }
});
