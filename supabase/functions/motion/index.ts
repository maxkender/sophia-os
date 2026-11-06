/**
 * Motion (page /admin/motion, migration 0663) : une vidéo explicative en papier
 * découpé (Remotion), refaite dans plusieurs langues (voix ElevenLabs,
 * bruitages, sous-titres) puis postée sur le compte MOTION de chaque langue.
 * Hors podz. La page lit les tables directement ; tout changement passe ici.
 *
 * Deux appelants :
 *
 * L'admin (jeton Supabase, rôle admin) :
 *   { action: "creer", sujet, consigne?, langues? }   → un sujet, et la tâche « script » du moteur
 *   { action: "maj_script", video_id, script }        → reporte les textes modifiés (scènes, outro,
 *                                                       légende) sur le script du moteur
 *   { action: "maj_capture", video_id, capture_chemin } → la capture d'accueil Sophia (anglais),
 *                                                       déposée par la page dans medias/motion/<video>/
 *   { action: "demander_script", video_id, consigne? } → le moteur réécrit le script
 *   { action: "valider_script", video_id }            → production dans toutes les langues
 *   { action: "valider_langue", video_id, langue }    → pose le post vidéo sur le compte MOTION
 *                                                       de la langue (1 post par jour, 0662)
 *   { action: "rejeter_langue", video_id, langue, commentaire }
 *                                                     → le moteur corrige cette langue
 *   { action: "archiver", video_id }
 *   { action: "jeton" }                               → nouveau jeton du moteur, rendu une fois
 *   { action: "comptes" }                             → les comptes MOTION, par langue
 *
 * Le moteur (une session Claude Code hors podz, en-tête `x-motion-jeton`) :
 *   { action: "prendre" }                             → la plus ancienne tâche libre, verrouillée 3 h
 *   { action: "script_pret", tache_id, video_id, script, projet? }
 *   { action: "upload_url", video_id, langue, nom }   → URL d'envoi signée vers
 *                                                       medias/motion/<video>/<langue>/<nom>
 *   { action: "langue_en_cours", video_id, langue }
 *   { action: "langue_prete", video_id, langue, script, legende, video_chemin,
 *     video_brute_chemin, duree_s }                   → la langue passe « à valider »
 *   { action: "journal", video_id, message }
 *   { action: "finir", tache_id, resultat? }
 *   { action: "echec", tache_id, erreur }             → la tâche repart (3 essais), sinon échec
 *
 * Réponses : { ok: true, … } ou { ok: false, error } avec un code HTTP.
 */

import { ID_SOPHIA } from "../_shared/multi_app.ts";
import {
  cheminCaptureValide,
  cheminDeLaLangue,
  cheminMotion,
  compteMotionDeLaLangue,
  type CompteMotion,
  demandeCreation,
  dureeOuNull,
  empreinte,
  estUuid,
  fusionnerScriptEdite,
  langueValide,
  legendeOuNull,
  memesEmpreintes,
  nouveauJeton,
  plusJours,
  premierJourLibre,
  scriptValide,
  statutApresEchec,
  statutVideoDepuisLangues,
  CONSIGNE_MAX,
  JOURS_RECHERCHE,
} from "../_shared/motion.ts";
import { poserPostVideo } from "../_shared/posts_video.ts";
import { assertRole, aujourdhuiParis, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";
type Supabase = ReturnType<typeof serviceClient>;
type Corps = Record<string, unknown>;

const maintenant = () => new Date().toISOString();
const ok = (corps: Corps = {}) => json({ ok: true, ...corps });
const refus = (error: string, status = 400) => json({ ok: false, error }, status);
const urlPublique = (supabase: Supabase, chemin: string) =>
  supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl as string;

async function journaliser(supabase: Supabase, videoId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc("motion_journaliser", { p_video: videoId, p_message: message });
  if (error) console.error("motion journal", messageErreur(error));
}

async function lireVideo(supabase: Supabase, id: unknown) {
  if (!estUuid(id)) return null;
  const { data, error } = await supabase.from("motion_videos").select("*").eq("id", String(id).toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function nouvelleTache(
  supabase: Supabase,
  videoId: string,
  type: "script" | "produire" | "corriger",
  langue: string | null,
  consigne: string | null,
): Promise<void> {
  const { error } = await supabase.from("motion_taches").insert({ video_id: videoId, type, langue, consigne });
  if (error) throw new Error(error.message);
}

async function majVideo(supabase: Supabase, id: string, champs: Corps): Promise<void> {
  const { error } = await supabase.from("motion_videos").update({ ...champs, updated_at: maintenant() }).eq("id", id);
  if (error) throw new Error(error.message);
}

async function majLangue(supabase: Supabase, videoId: string, langue: string, champs: Corps): Promise<void> {
  const { error } = await supabase
    .from("motion_langues")
    .upsert({ video_id: videoId, langue, ...champs, updated_at: maintenant() }, { onConflict: "video_id,langue" });
  if (error) throw new Error(error.message);
}

/** Recalcule le statut d'une vidéo en production d'après ses langues. */
async function suivreStatutVideo(supabase: Supabase, videoId: string): Promise<void> {
  const { data: video, error: errV } = await supabase.from("motion_videos").select("statut").eq("id", videoId).maybeSingle();
  if (errV) throw new Error(errV.message);
  if (!video || !["production", "a_valider"].includes(video.statut)) return;
  const { data: langues, error } = await supabase.from("motion_langues").select("statut").eq("video_id", videoId);
  if (error) throw new Error(error.message);
  const statut = statutVideoDepuisLangues((langues ?? []).map((l: { statut: string }) => l.statut));
  if (statut && statut !== video.statut) await majVideo(supabase, videoId, { statut });
}

/** Les comptes actifs ou non qui portent le label MOTION. */
async function comptesMotion(supabase: Supabase): Promise<Array<CompteMotion & { persona_nom: string | null }>> {
  const { data: label, error: errL } = await supabase.from("labels").select("id").eq("slug", "motion").maybeSingle();
  if (errL) throw new Error(errL.message);
  if (!label) return [];
  const { data: liens, error: errCl } = await supabase.from("compte_labels").select("compte_id").eq("label_id", label.id);
  if (errCl) throw new Error(errCl.message);
  const ids = [...new Set((liens ?? []).map((l: { compte_id: string }) => l.compte_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("comptes")
    .select("id, langue, handle_tiktok, persona_nom, is_active, created_at")
    .in("id", ids)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function creer(supabase: Supabase, body: Corps, userId: string): Promise<Response> {
  const d = demandeCreation(body);
  if ("erreur" in d) return refus(d.erreur);
  const { data: video, error } = await supabase
    .from("motion_videos")
    .insert({
      sujet: d.sujet,
      consigne: d.consigne,
      langues: d.langues,
      statut: "script_demande",
      created_by: estUuid(userId) ? userId : null,
    })
    .select("*")
    .single();
  if (error || !video) throw new Error(error?.message ?? "vidéo non créée");
  await nouvelleTache(supabase, video.id, "script", null, d.consigne);
  await journaliser(supabase, video.id, `Sujet créé (${d.langues.join(", ")}) : le moteur écrit le script.`);
  return ok({ video });
}

async function majScript(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const script = fusionnerScriptEdite(video.script, body.script);
  if ("erreur" in script) return refus(String(script.erreur));
  const statut = ["script_demande", "script_pret"].includes(video.statut) ? "script_pret" : video.statut;
  await majVideo(supabase, video.id, { script, statut });
  await journaliser(supabase, video.id, "Script modifié par l'admin.");
  return ok({ script });
}

/** La capture d'accueil Sophia en anglais, déposée par la page (l'admin écrit dans `medias`). */
async function majCapture(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  if (!cheminCaptureValide(body.capture_chemin, video.id)) {
    return refus(`capture_chemin : attendu motion/${video.id}/capture-<horodatage>.png|jpg|webp`);
  }
  const chemin = String(body.capture_chemin);
  const ancien = video.capture_chemin as string | null;
  await majVideo(supabase, video.id, { capture_chemin: chemin, capture_url: urlPublique(supabase, chemin) });
  if (ancien && ancien !== chemin) await supabase.storage.from(BUCKET).remove([ancien]);
  await journaliser(supabase, video.id, "Capture Sophia (anglais) ajoutée.");
  return ok({ capture_url: urlPublique(supabase, chemin) });
}

async function demanderScript(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const consigne = typeof body.consigne === "string" && body.consigne.trim() ? body.consigne.trim() : null;
  if (consigne && consigne.length > CONSIGNE_MAX) return refus(`Consigne : ${CONSIGNE_MAX} caractères au plus`);
  await nouvelleTache(supabase, video.id, "script", null, consigne ?? video.consigne ?? null);
  await majVideo(supabase, video.id, { statut: "script_demande", erreur: null });
  await journaliser(supabase, video.id, consigne ? `Script à refaire : ${consigne}` : "Script à refaire.");
  return ok();
}

async function validerScript(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  if (!scriptValide(video.script)) return refus("Pas encore de script à valider");
  if (video.statut === "archive") return refus("Vidéo archivée");
  for (const langue of video.langues as string[]) {
    await majLangue(supabase, video.id, langue, { statut: "en_attente", commentaire: null });
  }
  await nouvelleTache(supabase, video.id, "produire", null, null);
  await majVideo(supabase, video.id, { statut: "production", erreur: null });
  await journaliser(supabase, video.id, "Script validé : production lancée.");
  return ok();
}

async function validerLangue(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const langue = langueValide(body.langue);
  if (!langue) return refus("Langue invalide");
  const { data: ligne, error: errL } = await supabase
    .from("motion_langues")
    .select("*")
    .eq("video_id", video.id)
    .eq("langue", langue)
    .maybeSingle();
  if (errL) throw new Error(errL.message);
  if (!ligne) return refus("Langue introuvable", 404);
  if (ligne.statut === "distribuee") return refus("Déjà publiée", 409);
  if (!["a_valider", "validee"].includes(ligne.statut)) return refus("Cette langue n'est pas prête");
  if (!ligne.video_url) return refus("Pas de vidéo pour cette langue");

  const compte = compteMotionDeLaLangue(await comptesMotion(supabase), langue);
  if (!compte) return refus(`Aucun compte MOTION en ${langue}`);

  // 1 post par jour sur le compte : le premier jour libre à partir d'aujourd'hui.
  const aujourdhui = aujourdhuiParis();
  const { data: pris, error: errP } = await supabase
    .from("posts")
    .select("date_publication_prevue")
    .eq("compte_id", compte.id)
    .eq("est_test", false)
    .gte("date_publication_prevue", aujourdhui)
    .lte("date_publication_prevue", plusJours(aujourdhui, JOURS_RECHERCHE));
  if (errP) throw new Error(errP.message);
  const date = premierJourLibre(aujourdhui, (pris ?? []).map((p: { date_publication_prevue: string }) => p.date_publication_prevue));
  if (!date) return refus(`Le compte MOTION ${langue} n'a pas de jour libre dans les ${JOURS_RECHERCHE} jours`, 409);

  await majLangue(supabase, video.id, langue, { statut: "validee", validee_at: maintenant() });
  const postId = await poserPostVideo(supabase, {
    compteId: compte.id,
    date,
    langue: compte.langue || langue,
    // Le fichier reste dans le dossier de la vidéo Motion : pas de chemin, rien à supprimer avec le post.
    videos: [{ url: ligne.video_url, chemin: null, nom: `motion-${langue}.mp4`, generationId: null }],
    legende: ligne.legende ?? null,
    ctaTexte: null,
    ctaIncruste: true,
    captureUrl: null,
    musiqueUrl: null,
    musiqueTitre: null,
    applicationId: ID_SOPHIA,
  });
  await majLangue(supabase, video.id, langue, {
    statut: "distribuee",
    compte_id: compte.id,
    post_id: postId,
    distribuee_at: maintenant(),
  });
  const handle = compte.handle_tiktok ? `@${compte.handle_tiktok}` : compte.id.slice(0, 8);
  await journaliser(supabase, video.id, `${langue.toUpperCase()} validée : post du ${date} sur ${handle}.`);
  await suivreStatutVideo(supabase, video.id);
  return ok({ postId, compteId: compte.id, date });
}

async function rejeterLangue(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const langue = langueValide(body.langue);
  if (!langue) return refus("Langue invalide");
  const commentaire = typeof body.commentaire === "string" ? body.commentaire.trim() : "";
  if (!commentaire) return refus("Dis ce qu'il faut corriger");
  if (commentaire.length > CONSIGNE_MAX) return refus(`Commentaire : ${CONSIGNE_MAX} caractères au plus`);
  const { data: ligne } = await supabase
    .from("motion_langues")
    .select("statut")
    .eq("video_id", video.id)
    .eq("langue", langue)
    .maybeSingle();
  if (!ligne) return refus("Langue introuvable", 404);
  if (ligne.statut === "distribuee") return refus("Déjà publiée : on ne la rejette plus", 409);
  await majLangue(supabase, video.id, langue, { statut: "rejetee", commentaire });
  await nouvelleTache(supabase, video.id, "corriger", langue, commentaire);
  if (video.statut === "a_valider") await majVideo(supabase, video.id, { statut: "production" });
  await journaliser(supabase, video.id, `${langue.toUpperCase()} rejetée : ${commentaire}`);
  return ok();
}

async function archiver(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  await majVideo(supabase, video.id, { statut: "archive" });
  // Plus rien à faire pour le moteur sur cette vidéo.
  await supabase.from("motion_taches").update({ statut: "faite", updated_at: maintenant() }).eq("video_id", video.id).eq("statut", "en_attente");
  await journaliser(supabase, video.id, "Archivée.");
  return ok();
}

async function genererJeton(supabase: Supabase): Promise<Response> {
  const jeton = nouveauJeton();
  const { error } = await supabase
    .from("motion_reglages")
    .upsert({ id: true, jeton_hash: await empreinte(jeton), updated_at: maintenant() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return ok({ jeton });
}

async function listerComptes(supabase: Supabase): Promise<Response> {
  const comptes = await comptesMotion(supabase);
  const parLangue: Record<string, typeof comptes> = {};
  for (const c of comptes) (parLangue[c.langue ?? "?"] ??= []).push(c);
  return ok({ comptes, parLangue });
}

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

async function moteurAuthentifie(request: Request, supabase: Supabase): Promise<boolean> {
  const jeton = request.headers.get("x-motion-jeton") ?? "";
  if (!jeton) return false;
  const { data } = await supabase.from("motion_reglages").select("jeton_hash").eq("id", true).maybeSingle();
  const attendu = (data?.jeton_hash as string | null | undefined) ?? "";
  return Boolean(attendu) && memesEmpreintes(await empreinte(jeton), attendu);
}

async function prendre(supabase: Supabase): Promise<Response> {
  const { data, error } = await supabase.rpc("motion_prendre_tache");
  if (error) throw new Error(error.message);
  const tache = (data ?? [])[0];
  if (!tache) return ok({ tache: null });
  const video = await lireVideo(supabase, tache.video_id);
  const { data: langues, error: errL } = await supabase.from("motion_langues").select("*").eq("video_id", tache.video_id).order("langue");
  if (errL) throw new Error(errL.message);
  return ok({ tache, video, langues: langues ?? [] });
}

async function lireTache(supabase: Supabase, id: unknown) {
  if (!estUuid(id)) return null;
  const { data, error } = await supabase.from("motion_taches").select("*").eq("id", String(id).toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function finirTache(supabase: Supabase, id: string, resultat: unknown): Promise<void> {
  const { error } = await supabase
    .from("motion_taches")
    .update({ statut: "faite", resultat: resultat ?? null, erreur: null, verrou_jusqua: null, updated_at: maintenant() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function scriptPret(supabase: Supabase, body: Corps): Promise<Response> {
  const tache = await lireTache(supabase, body.tache_id);
  if (!tache) return refus("Tâche introuvable", 404);
  const video = await lireVideo(supabase, body.video_id);
  if (!video || video.id !== tache.video_id) return refus("Vidéo introuvable", 404);
  const script = scriptValide(body.script);
  if (!script) return refus("Script invalide : au moins une scène avec un texte");
  const projet = typeof body.projet === "string" && /^[a-z0-9][a-z0-9-]{0,60}$/.test(body.projet) ? body.projet : video.projet;
  await majVideo(supabase, video.id, { script, projet, statut: "script_pret", erreur: null });
  await finirTache(supabase, tache.id, { script: true });
  await journaliser(supabase, video.id, "Script écrit par le moteur : à relire et valider.");
  return ok();
}

async function urlEnvoi(supabase: Supabase, body: Corps): Promise<Response> {
  const chemin = cheminMotion(body.video_id, body.langue, body.nom);
  if (typeof chemin !== "string") return refus(chemin.erreur);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(chemin, { upsert: true });
  if (error || !data) throw new Error(`url d'envoi : ${messageErreur(error)}`);
  return ok({ chemin, url_upload: data.signedUrl, url_publique: urlPublique(supabase, chemin) });
}

async function langueEnCours(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const langue = langueValide(body.langue);
  if (!langue) return refus("Langue invalide");
  await majLangue(supabase, video.id, langue, { statut: "en_cours" });
  return ok();
}

async function languePrete(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const langue = langueValide(body.langue);
  if (!langue) return refus("Langue invalide");
  const script = scriptValide(body.script);
  if (!script) return refus("Script invalide : au moins une scène avec un texte");
  const legende = legendeOuNull(body.legende);
  if (legende && typeof legende === "object") return refus(legende.erreur);
  if (!cheminDeLaLangue(body.video_chemin, video.id, langue)) return refus(`video_chemin : attendu sous motion/${video.id}/${langue}/`);
  const brute = body.video_brute_chemin == null || body.video_brute_chemin === "" ? null : String(body.video_brute_chemin);
  if (brute && !cheminDeLaLangue(brute, video.id, langue)) return refus(`video_brute_chemin : attendu sous motion/${video.id}/${langue}/`);
  const chemin = String(body.video_chemin);
  await majLangue(supabase, video.id, langue, {
    statut: "a_valider",
    script,
    legende,
    video_chemin: chemin,
    video_url: urlPublique(supabase, chemin),
    video_brute_chemin: brute,
    video_brute_url: brute ? urlPublique(supabase, brute) : null,
    duree_s: dureeOuNull(body.duree_s),
    commentaire: null,
  });
  await journaliser(supabase, video.id, `${langue.toUpperCase()} rendue : à valider.`);
  await suivreStatutVideo(supabase, video.id);
  return ok();
}

async function noter(supabase: Supabase, body: Corps): Promise<Response> {
  const video = await lireVideo(supabase, body.video_id);
  if (!video) return refus("Vidéo introuvable", 404);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return refus("message requis");
  await journaliser(supabase, video.id, message);
  return ok();
}

async function finir(supabase: Supabase, body: Corps): Promise<Response> {
  const tache = await lireTache(supabase, body.tache_id);
  if (!tache) return refus("Tâche introuvable", 404);
  await finirTache(supabase, tache.id, body.resultat);
  return ok();
}

async function echec(supabase: Supabase, body: Corps): Promise<Response> {
  const tache = await lireTache(supabase, body.tache_id);
  if (!tache) return refus("Tâche introuvable", 404);
  const erreur = (typeof body.erreur === "string" && body.erreur.trim() ? body.erreur.trim() : "échec sans message").slice(0, 2000);
  const statut = statutApresEchec(Number(tache.tentatives ?? 0));
  const { error } = await supabase
    .from("motion_taches")
    .update({ statut, erreur, verrou_jusqua: null, updated_at: maintenant() })
    .eq("id", tache.id);
  if (error) throw new Error(error.message);
  await majVideo(supabase, tache.video_id, { erreur });
  if (statut === "echec" && tache.type !== "script") {
    // Les langues que cette tâche devait rendre restent en échec : à relancer depuis la page.
    let q = supabase
      .from("motion_langues")
      .update({ statut: "echec", updated_at: maintenant() })
      .eq("video_id", tache.video_id)
      .in("statut", ["en_attente", "en_cours", "rejetee"]);
    if (tache.langue) q = q.eq("langue", tache.langue);
    const { error: errL } = await q;
    if (errL) throw new Error(errL.message);
  }
  await journaliser(
    supabase,
    tache.video_id,
    statut === "echec" ? `Échec du moteur (${tache.type}, abandon) : ${erreur}` : `Échec du moteur (${tache.type}, nouvel essai) : ${erreur}`,
  );
  return ok({ statut });
}

// ---------------------------------------------------------------------------

const ACTIONS_ADMIN = "creer | maj_script | maj_capture | demander_script | valider_script | valider_langue | rejeter_langue | archiver | jeton | comptes";
const ACTIONS_MOTEUR = "prendre | script_pret | upload_url | langue_en_cours | langue_prete | journal | finir | echec";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "access-control-allow-headers": `${corsHeaders["access-control-allow-headers"]}, x-motion-jeton` },
    });
  }

  let body: Corps = {};
  const supabase = serviceClient();

  // Le moteur : jeton dédié, jamais un jeton d'utilisateur.
  if (request.headers.get("x-motion-jeton")) {
    if (!(await moteurAuthentifie(request, supabase))) return refus("unauthorized", 401);
    try {
      body = await request.json();
    } catch {
      return refus("corps JSON attendu");
    }
    try {
      switch (body.action) {
        case "prendre":
          return await prendre(supabase);
        case "script_pret":
          return await scriptPret(supabase, body);
        case "upload_url":
          return await urlEnvoi(supabase, body);
        case "langue_en_cours":
          return await langueEnCours(supabase, body);
        case "langue_prete":
          return await languePrete(supabase, body);
        case "journal":
          return await noter(supabase, body);
        case "finir":
          return await finir(supabase, body);
        case "echec":
          return await echec(supabase, body);
        default:
          return refus(`action inconnue (${ACTIONS_MOTEUR})`);
      }
    } catch (e) {
      console.error("motion moteur", body.action, e);
      return refus(messageErreur(e), 500);
    }
  }

  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;
  try {
    body = await request.json();
  } catch {
    return refus("corps JSON attendu");
  }
  try {
    switch (body.action) {
      case "creer":
        return await creer(supabase, body, acces.userId);
      case "maj_script":
        return await majScript(supabase, body);
      case "maj_capture":
        return await majCapture(supabase, body);
      case "demander_script":
        return await demanderScript(supabase, body);
      case "valider_script":
        return await validerScript(supabase, body);
      case "valider_langue":
        return await validerLangue(supabase, body);
      case "rejeter_langue":
        return await rejeterLangue(supabase, body);
      case "archiver":
        return await archiver(supabase, body);
      case "jeton":
        return await genererJeton(supabase);
      case "comptes":
        return await listerComptes(supabase);
      default:
        return refus(`action inconnue (${ACTIONS_ADMIN})`);
    }
  } catch (e) {
    console.error("motion", body.action, e);
    return refus(messageErreur(e), 500);
  }
});
