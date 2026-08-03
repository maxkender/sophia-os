import { supabase } from "@/lib/supabase/client";
import { LANGUES_CIBLES } from "@/features/moteur/langues";
import type { Role } from "@/features/auth/AuthContext";
import type { EvenementEtape } from "@/features/moteur/nettoyageEtapes";
import type {
  Compte,
  StatsCompte,
  StatsPost,
  CompteAvecDetails,
  CompteReference,
  Media,
  Post,
  PostSlide,
  PosterProfil,
  Reglages,
  Sujet,
  SujetSlide,
  Label,
  Contenu,
  ContenuLangue,
  ContenuSlide,
  EloImportRapport,
  Passage,
} from "./types";
import { compteEnProcessus } from "./warmup";

export type { EloImportRapport };

/** Date du jour en YYYY-MM-DD, en heure locale — le poster raisonne sur sa
 *  journée, pas sur celle de Greenwich. */
export function aujourdhui(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Jour calendaire Paris (YYYY-MM-DD) — aligné sur minuit / assignation / alertes. */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Jour Paris d'un timestamptz ISO (ou null). */
function jourParisDepuisIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Sur une réponse non-2xx, supabase renvoie un message générique
    // (« Edge Function returned a non-2xx status code ») : on va lire le vrai
    // message dans le corps de la réponse pour l'afficher tel quel.
    let message = error.message;
    if (/idle timeout|150s/i.test(message)) {
      message =
        "Timeout Edge (150s) — le rattrapage doit tourner compte par compte (logs live).";
    }
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corps = (await ctx.json()) as {
          error?: string;
          message?: string;
          code?: string;
        };
        if (corps?.error) message = corps.error;
        else if (corps?.code === "WORKER_RESOURCE_LIMIT") {
          message =
            "Mémoire Edge saturée (WORKER_RESOURCE_LIMIT) — SeedVR : 1 photo à la fois / JPEG ; sinon Real-ESRGAN.";
        } else if (corps?.message) {
          message = /WORKER_RESOURCE_LIMIT/i.test(corps.message)
            ? "Mémoire Edge saturée (WORKER_RESOURCE_LIMIT) — SeedVR : 1 photo à la fois / JPEG ; sinon Real-ESRGAN."
            : corps.message;
        }
      }
    } catch {
      // corps illisible : on garde le message générique
    }
    throw new Error(message);
  }
  const result = data as { error?: string };
  if (result?.error) throw new Error(result.error);
  return data as T;
}

/**
 * Appelle une edge function de nettoyage en NDJSON streamé : chaque ligne =
 * une étape (Fal → Replicate text-removal → C2PA → ready).
 */
async function invokeNettoyageStream(
  name: string,
  body: Record<string, unknown>,
  onEtape: (e: EvenementEtape) => void,
): Promise<EvenementEtape> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok || !res.body) {
    let message = `Edge ${name} ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error || j?.erreur) message = j.error ?? j.erreur;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dernier: EvenementEtape | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lignes = buffer.split("\n");
    buffer = lignes.pop() ?? "";
    for (const ligne of lignes) {
      const trim = ligne.trim();
      if (!trim) continue;
      try {
        const ev = JSON.parse(trim) as EvenementEtape;
        dernier = ev;
        onEtape(ev);
      } catch {
        // ligne partielle / bruit
      }
    }
  }
  if (buffer.trim()) {
    try {
      const ev = JSON.parse(buffer.trim()) as EvenementEtape;
      dernier = ev;
      onEtape(ev);
    } catch {
      // ignore
    }
  }

  if (!dernier) throw new Error("Aucune étape reçue du nettoyage");
  return dernier;
}

// --- Comptes de référence ---------------------------------------------------

export async function listerSources(): Promise<CompteReference[]> {
  const { data, error } = await supabase
    .from("comptes_reference")
    .select("*")
    .order("handle_tiktok");
  if (error) throw error;
  return data as CompteReference[];
}

export async function creerSource(input: {
  handle: string;
  niche: string;
  langue: string;
  /** Rattache la source à un compte principal (source « conjointe »). */
  parent_id?: string | null;
  /** Genre hérité du principal (les conjoints partagent le même genre). */
  genre?: "homme" | "femme";
}): Promise<CompteReference> {
  const { data, error } = await supabase
    .from("comptes_reference")
    .insert({
      handle_tiktok: input.handle.trim().replace(/^@/, ""),
      niche: input.niche.trim() || null,
      langue: input.langue,
      parent_id: input.parent_id ?? null,
      ...(input.genre ? { genre: input.genre } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data as CompteReference;
}

/** Stock de slideshows reproductibles PAR source (compte de référence). Le front
 *  agrège par groupe (principal + conjoints) pour flaguer un groupe épuisé. */
export async function stockParSource(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("sujets")
    .select("compte_reference_id")
    .eq("preparation_statut", "done")
    .in("statut", ["retenu", "utilise"]);
  if (error) throw error;
  const m: Record<string, number> = {};
  for (const s of data ?? []) {
    const k = s.compte_reference_id as string | null;
    if (k) m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

export async function majSource(id: string, patch: Partial<CompteReference>): Promise<void> {
  const { error } = await supabase.from("comptes_reference").update(patch).eq("id", id);
  if (error) throw error;
}

/** Supprime le compte source uniquement. Slideshows, images et labels de
 *  contenus restent (FK ON DELETE SET NULL — jamais de cascade). */
export async function supprimerSource(id: string): Promise<void> {
  const { error } = await supabase.from("comptes_reference").delete().eq("id", id);
  if (error) throw error;
}

// --- Sujets -----------------------------------------------------------------

export async function listerSujets(): Promise<Sujet[]> {
  const { data, error } = await supabase
    .from("sujets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Sujet[];
}

// --- Comptes de publication -------------------------------------------------

export async function listerComptes(): Promise<CompteAvecDetails[]> {
  const { data, error } = await supabase
    .from("comptes")
    .select("*, profiles(prenom, nom, upwork_url), comptes_reference(handle_tiktok)")
    // Comptes ACTIFS uniquement : un compte désactivé (doublon retiré, ancienne
    // identité…) ne doit plus apparaître ni dans l'éditeur ni dans les tests.
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CompteAvecDetails[];
}

export async function creerCompte(input: {
  posterId: string;
  compteReferenceId: string | null;
  langue: string;
  personaNom: string;
  handleTiktok: string;
}): Promise<void> {
  const { error } = await supabase.from("comptes").insert({
    poster_id: input.posterId,
    compte_reference_id: input.compteReferenceId,
    langue: input.langue,
    persona_nom: input.personaNom.trim() || null,
    handle_tiktok: input.handleTiktok.trim().replace(/^@/, "") || null,
    posts_par_jour: 1,
  });
  if (error) throw error;
}

/**
 * Crée le compte d'un poster existant en consommant la file admin
 * (label + UGC + persona) — même logique que la création poster.
 */
export function assurerComptePoster(input: {
  userId: string;
  langue: string;
  posts_par_jour?: number;
}) {
  return invoke<{
    ok: boolean;
    deja?: boolean;
    compteId?: string;
    compte?: {
      id: string;
      reference: string | null;
      persona: boolean;
      labelId: string | null;
      ugc: boolean;
    };
  }>("manage-users", {
    action: "ensure_compte",
    userId: input.userId,
    langue: input.langue,
    ...(input.posts_par_jour != null
      ? { posts_par_jour: normaliserPostsParJour(Number(input.posts_par_jour)) }
      : {}),
  });
}

/** Clamp le quota poster à 1–3 avant écriture. Défaut 2 si invalide. */
function normaliserPostsParJour(n: number): number {
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.round(n)));
}

export async function majCompte(id: string, patch: Partial<Compte>): Promise<void> {
  const body = { ...patch };
  if (body.posts_par_jour != null) {
    body.posts_par_jour = normaliserPostsParJour(Number(body.posts_par_jour));
  }
  const { error } = await supabase.from("comptes").update(body).eq("id", id);
  if (error) throw error;
}

export async function supprimerCompte(id: string): Promise<void> {
  const { error } = await supabase.from("comptes").delete().eq("id", id);
  if (error) throw error;
}

// --- Posters ----------------------------------------------------------------

export async function listerPosters(): Promise<PosterProfil[]> {
  const { data: profils, error } = await supabase
    .from("profiles")
    .select(
      "id, prenom, nom, email, langues, nationalite, upwork_url, manager_id, is_active, must_change_password, cout_mensuel, hm_ugc_ai_video",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: roles } = await supabase.from("user_roles").select("user_id, role");
  const parUtilisateur = new Map((roles ?? []).map((r) => [r.user_id, r.role]));

  // Le pseudo TikTok du poster vit sur son compte de publication ; on rapatrie
  // aussi son compte de RÉFÉRENCE (la source), visible côté admin seulement.
  // Comptes ACTIFS seulement : un doublon désactivé ne doit pas détourner le lien
  // TikTok du header (bug où la liste montrait un @ ≠ de celui de l'éditeur).
  const { data: comptes } = await supabase
    .from("comptes")
    .select(
      "id, poster_id, handle_tiktok, persona_nom, persona_bio, avatar_url, score, score_maj_at, warmup_started_at, warmup_ends_at, comptes_reference(handle_tiktok)",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  // Un poster ne doit avoir qu'UN compte actif ; si par accident il y en a
  // plusieurs, on garde le premier (le plus récent) — le MÊME que celui affiché
  // par l'éditeur, pour que le @ du lien et celui du champ coïncident toujours.
  const compteParPoster = new Map<string, NonNullable<typeof comptes>[number]>();
  const referenceParPoster = new Map<string, string>();
  for (const c of comptes ?? []) {
    if (!compteParPoster.has(c.poster_id)) compteParPoster.set(c.poster_id, c);
    const ref = (c as { comptes_reference?: { handle_tiktok?: string } }).comptes_reference;
    if (ref?.handle_tiktok && !referenceParPoster.has(c.poster_id)) {
      referenceParPoster.set(c.poster_id, ref.handle_tiktok);
    }
  }

  const nomParId = new Map(
    (profils ?? []).map((p) => [
      p.id,
      [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—",
    ]),
  );

  return (profils ?? []).map((p) => {
    const compte = compteParPoster.get(p.id);
    return {
      ...p,
      hm_ugc_ai_video: Boolean(
        (p as { hm_ugc_ai_video?: boolean }).hm_ugc_ai_video,
      ),
      role: (parUtilisateur.get(p.id) ?? null) as PosterProfil["role"],
      compte_id: compte?.id ?? null,
      handle_tiktok: compte?.handle_tiktok ?? null,
      reference_handle: referenceParPoster.get(p.id) ?? null,
      persona_nom: compte?.persona_nom ?? null,
      persona_bio: compte?.persona_bio ?? null,
      avatar_url: compte?.avatar_url ?? null,
      /** ELO / forme du compte TikTok (moyenne pondérée des perfs). */
      score: compte?.score ?? null,
      score_maj_at: compte?.score_maj_at ?? null,
      warmup_started_at: (compte?.warmup_started_at as string | null) ?? null,
      warmup_ends_at: (compte?.warmup_ends_at as string | null) ?? null,
      manager_nom: p.manager_id ? (nomParId.get(p.manager_id) ?? null) : null,
    };
  });
}

// --- Reviews -----------------------------------------------------------------

export interface Review {
  id: string;
  poster_id: string;
  body: string;
  note: number | null;
  created_at: string;
  seen_at: string | null;
}

/** L'admin envoie une review (retour) à un poster : elle s'affichera en pop-up
 *  à sa prochaine connexion. */
export async function envoyerReview(posterId: string, body: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reviews")
    .insert({ poster_id: posterId, body: body.trim(), admin_id: auth.user?.id ?? null });
  if (error) throw error;
}

/** Toutes les reviews (admin), les plus récentes d'abord. */
export async function listerReviews(): Promise<Review[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, poster_id, body, note, created_at, seen_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Review[];
}

/** Reviews non encore vues du poster connecté (RLS ne renvoie que les siennes). */
export async function mesReviewsNonVues(): Promise<Review[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, poster_id, body, note, created_at, seen_at")
    .is("seen_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Review[];
}

/** Le poster marque une review comme vue (referme le pop-up). */
export async function marquerReviewVue(id: string): Promise<void> {
  const { error } = await supabase
    .from("reviews")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Crée un recruteur (hiring manager) avec une ou plusieurs langues gérées
 *  (admin). Il pourra créer des créateurs dans chacune de ces langues. */
export function creerRecruteur(input: {
  prenom: string;
  nom: string;
  /** @deprecated préfère `langues` */
  langue?: string;
  langues?: string[];
  /** HM UGC AI VIDEO : créateurs = marque + labels HM + persona. */
  ugc_ai_video?: boolean;
  /** Labels thématiques UGC AI VIDEO assignés au HM. */
  ugc_ai_video_label_ids?: string[];
}) {
  const langues =
    input.langues?.filter(Boolean) ??
    (input.langue ? [input.langue] : []);
  return invoke<{ userId: string; email: string }>("manage-users", {
    action: "create",
    role: "hiring_manager",
    prenom: input.prenom,
    nom: input.nom,
    password: "12345678",
    langue: langues[0],
    langues,
    ...(input.ugc_ai_video
      ? {
          ugc_ai_video: true,
          ugc_ai_video_label_ids: input.ugc_ai_video_label_ids ?? [],
        }
      : {}),
  });
}

/** Enregistre le lien de la conversation Upwork d'un poster (admin). */
export async function majUpwork(userId: string, url: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ upwork_url: url.trim() || null })
    .eq("id", userId);
  if (error) throw error;
}

/** Coût mensuel (€) d'un créateur/recruteur, saisi par l'admin (null = vide). */
export async function majCoutMensuel(userId: string, montant: number | null): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ cout_mensuel: montant })
    .eq("id", userId);
  if (error) throw error;
}

export interface MonCompte {
  id: string;
  persona_nom: string | null;
  persona_bio: string | null;
  handle_tiktok: string | null;
  avatar_url: string | null;
  langue: string;
  warmup_started_at: string | null;
  warmup_ends_at: string | null;
}

/** Le compte de publication du poster connecté : son identité TikTok (pseudo,
 *  bio, avatar), générée automatiquement à la création. La RLS ne renvoie que
 *  sa propre ligne. */
export async function monCompte(): Promise<MonCompte | null> {
  const { data, error } = await supabase
    .from("comptes")
    .select(
      "id, persona_nom, persona_bio, handle_tiktok, avatar_url, langue, warmup_started_at, warmup_ends_at",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as MonCompte) ?? null;
}

/** Le poster met à jour son pseudo TikTok (après avoir créé son compte). */
export async function majMonHandle(handle: string): Promise<void> {
  const { error } = await supabase.rpc("maj_mon_handle", { nouveau: handle });
  if (error) throw error;
}

/** Le poster met à jour SON lien de conversation Upwork depuis son espace. */
export async function majMonUpwork(url: string): Promise<void> {
  const { error } = await supabase.rpc("maj_mon_upwork", { nouveau: url });
  if (error) throw error;
}

/** Le poster a-t-il déjà vu la vidéo d'onboarding ? (null = jamais vue). */
export async function onboardingVu(): Promise<boolean> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return true;
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_vu_at")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.onboarding_vu_at);
}

/** Marque la vidéo d'onboarding comme vue (le pop-up ne réapparaîtra plus). */
export async function marquerOnboardingVu(): Promise<void> {
  const { error } = await supabase.rpc("marquer_onboarding_vu");
  if (error) throw error;
}

/** Le lien Upwork du poster connecté (sur sa propre ligne profiles). */
export async function monUpwork(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("upwork_url")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data?.upwork_url as string | null) ?? null;
}

export function creerPoster(input: {
  prenom: string;
  nom: string;
  password: string;
  langue?: string;
  /** Quota d'assignation journalier (1–3). Défaut 2 côté Edge. */
  posts_par_jour?: number;
}) {
  return invoke<{
    userId: string;
    email: string;
    compte: {
      id: string;
      reference: string | null;
      persona: boolean;
      labelId: string | null;
    } | null;
  }>("manage-users", {
    action: "create",
    ...input,
    ...(input.posts_par_jour != null
      ? { posts_par_jour: normaliserPostsParJour(Number(input.posts_par_jour)) }
      : {}),
  });
}

/** Démarre le warmup d'un compte (créateur sur son compte, ou admin). */
export function demarrerWarmup(compteId: string) {
  return invoke<{
    ok: boolean;
    deja?: boolean;
    warmup_started_at: string;
    warmup_ends_at: string;
    heures?: number;
  }>("manage-users", {
    action: "start_warmup",
    compteId,
  });
}

/** Admin : coupe le timer warmup — compte immédiatement actif. */
export function skipWarmup(compteId: string) {
  return invoke<{
    ok: boolean;
    warmup_started_at: string;
    warmup_ends_at: string;
  }>("manage-users", {
    action: "skip_warmup",
    compteId,
  });
}

/** Langues distinctes des comptes de référence actifs (pour le hiring manager
 *  et l'admin : on ne propose que des langues qui ont de la matière). */
/** Langues proposées pour un poster = langues CIBLES supportées (ce dans quoi il
 *  publie), pas les langues des comptes sources. Un slideshow source stocké est
 *  re-traduit vers n'importe laquelle de ces langues. */
export async function listerLanguesReference(): Promise<string[]> {
  return [...LANGUES_CIBLES];
}

/** Définit LE rôle d'un utilisateur (admin uniquement, via RLS). On remplace :
 *  un utilisateur a un seul rôle à la fois dans notre modèle.
 *  À la promotion en recruteur, `langues` (ou `nationalite` seule) fixe les
 *  langues dans lesquelles il pourra créer des créateurs. */
export async function definirRole(
  userId: string,
  role: Role,
  nationalite?: string,
  langues?: string[],
): Promise<void> {
  const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (error) throw error;

  if (role === "hiring_manager") {
    const ensemble = [
      ...new Set(
        (langues?.filter(Boolean) ?? (nationalite ? [nationalite] : [])).map((l) =>
          l.toLowerCase(),
        ),
      ),
    ];
    if (ensemble.length > 0) {
      const { error: langErr } = await supabase
        .from("profiles")
        .update({ langues: ensemble, nationalite: ensemble[0] ?? null })
        .eq("id", userId);
      if (langErr) throw langErr;
      return;
    }
  }

  if (nationalite !== undefined) {
    const { error: natErr } = await supabase
      .from("profiles")
      .update({ nationalite: nationalite || null })
      .eq("id", userId);
    if (natErr) throw natErr;
  }
}

export interface SlideApercu {
  position: number;
  texte_original: string | null;
  url_propre: string | null;
  url_brute: string | null;
}

/** Les slides d'un sujet DANS L'ORDRE, avec l'image nettoyée + l'image d'origine
 *  (avec texte) + le texte : c'est le slideshow stocké, prêt à re-traduire. */
export async function apercuSujet(sujetId: string): Promise<SlideApercu[]> {
  const { data: sujet, error } = await supabase
    .from("sujets")
    .select("structure_slides")
    .eq("id", sujetId)
    .single();
  if (error) throw error;
  const slides = (sujet?.structure_slides ?? []) as Array<{
    position: number;
    texte_original: string | null;
    raw_url: string | null;
    media_id: string | null;
  }>;

  const mediaIds = slides.map((s) => s.media_id).filter(Boolean) as string[];
  const urlParMedia = new Map<string, string>();
  if (mediaIds.length > 0) {
    const { data: medias } = await supabase
      .from("media_library")
      .select("id, url")
      .in("id", mediaIds);
    for (const m of medias ?? []) urlParMedia.set(m.id as string, m.url as string);
  }

  return slides
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      position: s.position,
      texte_original: s.texte_original,
      url_propre: s.media_id ? urlParMedia.get(s.media_id) ?? null : null,
      url_brute: s.raw_url ?? null,
    }));
}

export interface PostReproduisible {
  id: string;
  source_url: string | null;
  /** Le hook = texte de la 1ʳᵉ photo (OCR). Sert de titre sur la page. */
  hook: string | null;
  vues: number | null;
  pertinence_score: number | null;
  reference_id: string | null;
  reference_handle: string | null;
  langue: string;
  /** URLs des visuels dans l'ordre (nettoyée si dispo, sinon brute) pour l'aperçu. */
  apercus: string[];
  /** Pas encore nettoyé (lien ajouté à la main, nettoyage en cours). */
  en_preparation: boolean;
  created_at: string;
}

/**
 * Les « posts reproduisibles » : sujets préparés et retenus (pertinents + assez
 * performants), prêts à être reproduits. Un appel unique résout les visuels.
 */
export async function listerReproduisibles(): Promise<PostReproduisible[]> {
  const { data: sujets, error } = await supabase
    .from("sujets")
    .select(
      "id, source_url, vues, pertinence_score, pertinence_raison, preparation_statut, langue, created_at, structure_slides, compte_reference_id, comptes_reference(handle_tiktok)",
    )
    .in("statut", ["retenu", "utilise"])
    .order("vues", { ascending: false, nullsFirst: false });
  if (error) throw error;

  // On montre TOUT ce qui est retenu (pertinent + performant), aperçu brut, SANS
  // attendre le nettoyage : le stock, c'est le catalogue de TikToks à reproduire.
  // Le nettoyage (retrait du texte) ne sert qu'AU MOMENT de reproduire, pas pour
  // figurer au stock. Un badge « en préparation » signale ceux pas encore nettoyés.
  return (sujets ?? []).map((s) => {
    const slides = ((s.structure_slides ?? []) as SujetSlide[]).slice().sort((a, b) => a.position - b.position);
    // Aperçu = les images D'ORIGINE du TikTok (raw_url), pas les versions
    // nettoyées : un « post reproduisible », c'est le TikTok source qu'on décide
    // de reproduire — on veut le voir tel qu'il est, avec son texte.
    const apercus = slides.map((sl) => sl.raw_url).filter(Boolean) as string[];
    const ref = (s as { comptes_reference?: { handle_tiktok?: string } }).comptes_reference;
    return {
      id: s.id,
      source_url: s.source_url,
      hook: slides[0]?.texte_original ?? null,
      vues: s.vues,
      pertinence_score: s.pertinence_score,
      reference_id: (s as { compte_reference_id?: string | null }).compte_reference_id ?? null,
      reference_handle: ref?.handle_tiktok ?? null,
      langue: s.langue,
      apercus,
      en_preparation: (s as { preparation_statut?: string }).preparation_statut !== "done",
      created_at: s.created_at,
    };
  });
}

// --- Documents (guides, FAQ) -------------------------------------------------

export interface DocumentEditable {
  id: string;
  cle: string;
  /** Version française (défaut). */
  titre: string;
  contenu: string;
  /** Version anglaise (le viewer retombe sur le français si vide). */
  titre_en: string | null;
  contenu_en: string | null;
  audience: "manager" | "poster" | "all";
  ordre: number;
  updated_at: string;
}

/** Documents visibles par l'appelant (RLS : admin tout, manager/poster les leurs). */
export async function listerDocuments(): Promise<DocumentEditable[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("audience")
    .order("ordre");
  if (error) throw error;
  return (data ?? []) as DocumentEditable[];
}

export async function lireDocument(cle: string): Promise<DocumentEditable | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("cle", cle)
    .maybeSingle();
  if (error) throw error;
  return (data as DocumentEditable) ?? null;
}

/** Traduit un document FR → EN (HTML préservé) sans l'enregistrer : le front
 *  remplit les champs anglais, l'admin relit puis sauvegarde. Évite de tout
 *  rédiger deux fois. */
export const traduireDocument = (titre: string, contenu: string) =>
  invoke<{ titre_en: string; contenu_en: string }>("traduire-doc", { titre, contenu });

/** Édition d'un document (admin uniquement via RLS). */
export async function majDocument(
  id: string,
  patch: { titre?: string; contenu?: string; titre_en?: string | null; contenu_en?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function supprimerPoster(userId: string) {
  return invoke("manage-users", { action: "delete", userId });
}

export async function majPoster(id: string, patch: { is_active?: boolean }): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

// --- Bibliothèque -----------------------------------------------------------

export async function listerMedias(compteReferenceId?: string): Promise<Media[]> {
  // La bibliothèque ne montre QUE les photos nettoyées (propre/) : une image à
  // texte n'est pas un visuel utilisable, elle n'a rien à y faire. Les brut
  // restent en base pour le banc de test et comme source de nettoyage, mais pas
  // ici. C'est aussi ce qui garantit qu'un remplacement pioche une photo propre.
  let query = supabase
    .from("media_library")
    .select("*")
    .like("storage_path", "propre/%")
    .order("created_at", { ascending: false })
    .limit(200);
  if (compteReferenceId) query = query.eq("compte_reference_id", compteReferenceId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Media[];
}

export type GroupeBiblio = {
  label: Label | null;
  medias: Media[];
};

export const BIBLIO_PAGE_SIZE = 100;

export type PageBiblio = {
  medias: Media[];
  /** Groupes pour l'affichage (labels des médias de la page). */
  groupes: GroupeBiblio[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Regroupe une page de médias par leurs labels (pour l'UI). */
async function grouperMediasParLabels(medias: Media[]): Promise<GroupeBiblio[]> {
  if (medias.length === 0) return [];
  const byId = new Map(medias.map((m) => [m.id, m]));
  const ids = medias.map((m) => m.id);

  const { data: liens, error } = await supabase
    .from("media_labels")
    .select("media_id, label_id, labels(*)")
    .in("media_id", ids);
  if (error) throw error;

  const parLabel = new Map<string, { label: Label; medias: Media[] }>();
  const vus = new Set<string>();

  for (const row of liens ?? []) {
    const r = row as unknown as {
      media_id: string;
      label_id: string;
      labels: Label | null;
    };
    const media = byId.get(r.media_id);
    if (!media || !r.labels) continue;
    vus.add(media.id);
    let g = parLabel.get(r.label_id);
    if (!g) {
      g = { label: r.labels, medias: [] };
      parLabel.set(r.label_id, g);
    }
    if (!g.medias.some((m) => m.id === media.id)) g.medias.push(media);
  }

  const groupes: GroupeBiblio[] = [...parLabel.values()]
    .map((g) => ({
      label: g.label,
      medias: g.medias.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }))
    .sort((a, b) => (a.label?.nom ?? "").localeCompare(b.label?.nom ?? "", "fr"));

  const sans = medias.filter((m) => !vus.has(m.id));
  if (sans.length > 0) groupes.push({ label: null, medias: sans });

  return groupes;
}

/**
 * Bibliothèque paginée (100 / page) — ne charge que la page demandée.
 * Filtre optionnel par label via `media_labels`.
 */
export async function listerBibliothequePage(opts?: {
  labelId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageBiblio> {
  const pageSize = opts?.pageSize ?? BIBLIO_PAGE_SIZE;
  const page = Math.max(1, opts?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let medias: Media[] = [];
  let total = 0;

  if (opts?.labelId) {
    const { data, error, count } = await supabase
      .from("media_library")
      .select("*, media_labels!inner(label_id)", { count: "exact" })
      .eq("media_labels.label_id", opts.labelId)
      .like("storage_path", "propre/%")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    medias = ((data ?? []) as any[]).map(({ media_labels: _ml, ...m }) => m as Media);
    total = count ?? 0;
  } else {
    const { data, error, count } = await supabase
      .from("media_library")
      .select("*", { count: "exact" })
      .like("storage_path", "propre/%")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    medias = (data ?? []) as Media[];
    total = count ?? 0;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groupes = await grouperMediasParLabels(medias);

  return { medias, groupes, total, page, pageSize, totalPages };
}

/**
 * @deprecated Préférer `listerBibliothequePage` (pagination).
 * Bibliothèque groupée par label — charge tout (lourd).
 */
export async function listerBibliothequeParLabels(
  labelId?: string,
): Promise<GroupeBiblio[]> {
  const page = await listerBibliothequePage({
    labelId,
    page: 1,
    pageSize: 10_000,
  });
  return page.groupes;
}

// --- Posts ------------------------------------------------------------------

export async function listerPosts(compteId?: string): Promise<Post[]> {
  let query = supabase
    .from("posts")
    .select("*")
    .order("date_publication_prevue", { ascending: false, nullsFirst: false })
    .limit(200);
  if (compteId) query = query.eq("compte_id", compteId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Post[];
}

export async function lirePost(id: string): Promise<Post | null> {
  const { data } = await supabase.from("posts").select("*").eq("id", id).single();
  return (data as Post) ?? null;
}

export async function listerSlides(postId: string): Promise<PostSlide[]> {
  const { data, error } = await supabase
    .from("post_slides")
    // storage_path distingue une photo nettoyée (`propre/…`) d'un original
    // gardé faute de nettoyage (`brut/…`), qui porte encore son texte.
    // upscale_le : badge / forcer re-upscale depuis le détail post.
    .select("*, media_library(url, storage_path, upscale_le)")
    .eq("post_id", postId)
    .order("position");
  if (error) throw error;
  return data as PostSlide[];
}

/** Réordonne en réécrivant les positions ; l'ordre visuel du poster fait foi. */
export async function reordonnerSlides(slides: PostSlide[]): Promise<void> {
  for (const [index, slide] of slides.entries()) {
    const { error } = await supabase
      .from("post_slides")
      .update({ position: index + 1 })
      .eq("id", slide.id);
    if (error) throw error;
  }
}

export async function majPost(id: string, patch: Partial<Post>): Promise<void> {
  if (patch.statut === "publie" && !String(patch.publie_url ?? "").trim()) {
    throw new Error("Lien TikTok obligatoire pour marquer comme publié");
  }
  const { error } = await supabase.from("posts").update(patch).eq("id", id);
  if (error) throw error;

  // Miroir v-next : un passage lié doit suivre statut / lien TikTok (scoring).
  if (
    patch.statut !== undefined ||
    patch.publie_url !== undefined ||
    patch.publie_at !== undefined
  ) {
    const miroir: Record<string, unknown> = {};
    if (patch.statut !== undefined) miroir.statut = patch.statut;
    if (patch.publie_url !== undefined) miroir.publie_url = patch.publie_url;
    if (patch.publie_at !== undefined) miroir.publie_at = patch.publie_at;
    await supabase.from("passages").update(miroir).eq("post_id", id);
  }
}

export async function majPassage(
  id: string,
  patch: Partial<{
    statut: string;
    publie_at: string | null;
    publie_url: string | null;
  }>,
): Promise<void> {
  if (patch.statut === "publie" && !String(patch.publie_url ?? "").trim()) {
    throw new Error("Lien TikTok obligatoire pour marquer comme publié");
  }
  const { error } = await supabase.from("passages").update(patch).eq("id", id);
  if (error) throw error;
}

/** Un TikTok déjà publié par un créateur (passage v-next et/ou post legacy). */
export interface PublicationCompte {
  key: string;
  passage_id: string | null;
  post_id: string | null;
  date_publication_prevue: string | null;
  publie_at: string | null;
  publie_url: string | null;
  titre: string | null;
  langue: string | null;
  statut: string;
}

/** Tous les posts publiés d'un compte (passages + posts legacy, dédupliqués). */
export async function listerPublicationsCompte(
  compteId: string,
): Promise<PublicationCompte[]> {
  const [{ data: passages, error: e1 }, { data: posts, error: e2 }] = await Promise.all([
    supabase
      .from("passages")
      .select(
        "id, post_id, date_publication_prevue, publie_at, publie_url, langue, statut, contenus(titre)",
      )
      .eq("compte_id", compteId)
      .eq("statut", "publie")
      .order("date_publication_prevue", { ascending: false }),
    supabase
      .from("posts")
      .select(
        "id, date_publication_prevue, publie_at, publie_url, statut, sujets(titre)",
      )
      .eq("compte_id", compteId)
      .eq("statut", "publie")
      .eq("est_test", false)
      .order("date_publication_prevue", { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byPostId = new Map<string, PublicationCompte>();
  const result: PublicationCompte[] = [];

  for (const p of passages ?? []) {
    const titre =
      (p as { contenus?: { titre?: string | null } | null }).contenus?.titre ?? null;
    const row: PublicationCompte = {
      key: `passage:${p.id}`,
      passage_id: p.id,
      post_id: p.post_id,
      date_publication_prevue: p.date_publication_prevue,
      publie_at: p.publie_at,
      publie_url: p.publie_url,
      titre,
      langue: p.langue,
      statut: p.statut,
    };
    if (p.post_id) byPostId.set(p.post_id, row);
    result.push(row);
  }

  for (const p of posts ?? []) {
    const existing = byPostId.get(p.id);
    if (existing) {
      if (!existing.publie_url && p.publie_url) existing.publie_url = p.publie_url;
      if (!existing.titre) {
        existing.titre =
          (p as { sujets?: { titre?: string | null } | null }).sujets?.titre ?? null;
      }
      continue;
    }
    result.push({
      key: `post:${p.id}`,
      passage_id: null,
      post_id: p.id,
      date_publication_prevue: p.date_publication_prevue,
      publie_at: p.publie_at,
      publie_url: p.publie_url,
      titre: (p as { sujets?: { titre?: string | null } | null }).sujets?.titre ?? null,
      langue: null,
      statut: p.statut,
    });
  }

  result.sort((a, b) => {
    const da = a.date_publication_prevue ?? a.publie_at ?? "";
    const db = b.date_publication_prevue ?? b.publie_at ?? "";
    return db.localeCompare(da);
  });
  return result;
}

/**
 * Renseigne / corrige le lien TikTok d'une publication déjà faite.
 * Met à jour le post ET le passage lié — sans toucher aux scores ELO langues.
 */
export async function renseignerLienPublie(
  opts: { passageId?: string | null; postId?: string | null },
  url: string,
): Promise<void> {
  const lien = url.trim();
  if (!lien) throw new Error("Lien TikTok requis");

  let postId = opts.postId ?? null;
  let passageId = opts.passageId ?? null;

  if (passageId && !postId) {
    const { data } = await supabase
      .from("passages")
      .select("post_id")
      .eq("id", passageId)
      .maybeSingle();
    postId = data?.post_id ?? null;
  }
  if (postId && !passageId) {
    const { data } = await supabase
      .from("passages")
      .select("id")
      .eq("post_id", postId)
      .maybeSingle();
    passageId = data?.id ?? null;
  }

  if (!postId && !passageId) throw new Error("Publication introuvable");

  if (postId) {
    const { error } = await supabase
      .from("posts")
      .update({ publie_url: lien })
      .eq("id", postId);
    if (error) throw error;
  }
  if (passageId) {
    const { error } = await supabase
      .from("passages")
      .update({ publie_url: lien })
      .eq("id", passageId);
    if (error) throw error;
  }
}

// --- Analyse ----------------------------------------------------------------

export async function statsComptes(): Promise<StatsCompte[]> {
  const { data, error } = await supabase
    .from("stats_comptes")
    .select("*")
    .order("vues_totales", { ascending: false });
  if (error) throw error;
  return data as StatsCompte[];
}

export type PilotageDashboard = {
  vuesSerie: Array<{
    jour: string;
    vues_totales: number;
    vues_delta: number | null;
    nb_comptes: number;
  }>;
  recruteurs: Array<{
    id: string;
    nom: string;
    eloMoyen: number;
    nbCreateurs: number;
  }>;
  postsVeille: Array<{
    id: string;
    titre: string | null;
    handle: string | null;
    vues: number;
    publie_url: string | null;
    compte_id: string;
  }>;
  eloTop: Array<{
    compte_id: string;
    nom: string;
    handle: string | null;
    score: number;
  }>;
  eloBas: Array<{
    compte_id: string;
    nom: string;
    handle: string | null;
    score: number;
  }>;
  alertes: {
    niveau1: Array<{
      compte_id: string;
      nom: string;
      handle: string | null;
    }>;
    niveau2: Array<{
      compte_id: string;
      nom: string;
      handle: string | null;
      joursSansPost: number;
    }>;
  };
};

/** Données Pilotage : courbe vues, classements ELO / recruteurs, alertes posts. */
export async function chargerPilotageDashboard(): Promise<PilotageDashboard> {
  // Fuseau Paris (comme minuit / assignation) — pas l'heure locale du navigateur.
  const auj = aujourdhuiParis();
  const veille = ajouterJoursParisCalendaire(auj, -1);

  const [
    { data: serie, error: errSerie },
    { data: comptes, error: errComptes },
    { data: roles, error: errRoles },
    { data: profils, error: errProfils },
    { data: postsVeille, error: errPosts },
  ] = await Promise.all([
    supabase
      .from("vues_globales_jour")
      .select("jour, vues_totales, vues_delta, nb_comptes")
      .order("jour", { ascending: true })
      .limit(60),
    supabase
      .from("comptes")
      .select(
        "id, poster_id, persona_nom, handle_tiktok, score, is_active, warmup_started_at, warmup_ends_at",
      )
      .eq("is_active", true),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("profiles").select("id, prenom, nom, manager_id, is_active"),
    supabase
      .from("passages")
      .select("id, compte_id, vues, publie_url, contenus(titre), comptes(handle_tiktok, persona_nom)")
      .eq("statut", "publie")
      .eq("date_publication_prevue", veille)
      .not("vues", "is", null)
      .order("vues", { ascending: false })
      .limit(15),
  ]);
  if (errSerie) throw errSerie;
  if (errComptes) throw errComptes;
  if (errRoles) throw errRoles;
  if (errProfils) throw errProfils;
  if (errPosts) throw errPosts;

  const profilParId = new Map((profils ?? []).map((p) => [p.id as string, p]));
  const roleParUser = new Map((roles ?? []).map((r) => [r.user_id as string, r.role as string]));

  const nomCompte = (c: {
    persona_nom: string | null;
    handle_tiktok: string | null;
    poster_id: string;
  }) => {
    const p = profilParId.get(c.poster_id);
    const perso = [p?.prenom, p?.nom].filter(Boolean).join(" ");
    return perso || c.persona_nom || (c.handle_tiktok ? `@${c.handle_tiktok}` : "—");
  };

  // Hors warmup uniquement (pas encore démarré / en cours → exclus classements + alertes).
  const eloListe = (comptes ?? [])
    .filter((c) =>
      compteEnProcessus({
        warmup_started_at: c.warmup_started_at as string | null,
        warmup_ends_at: c.warmup_ends_at as string | null,
      }),
    )
    .map((c) => ({
      compte_id: c.id as string,
      nom: nomCompte(c as never),
      handle: (c.handle_tiktok as string | null) ?? null,
      score: Number(c.score ?? 50),
      poster_id: c.poster_id as string,
    }))
    .sort((a, b) => b.score - a.score);

  // Recruteurs = hiring_manager ; moyenne ELO des créateurs rattachés (manager_id).
  const recruteursIds = [...roleParUser.entries()]
    .filter(([, role]) => role === "hiring_manager")
    .map(([id]) => id);

  const recruteurs = recruteursIds
    .map((rid) => {
      const p = profilParId.get(rid);
      const createurs = eloListe.filter((c) => {
        const pr = profilParId.get(c.poster_id);
        return pr?.manager_id === rid;
      });
      if (createurs.length === 0) {
        return {
          id: rid,
          nom: [p?.prenom, p?.nom].filter(Boolean).join(" ") || "—",
          eloMoyen: 0,
          nbCreateurs: 0,
        };
      }
      const eloMoyen = createurs.reduce((s, c) => s + c.score, 0) / createurs.length;
      return {
        id: rid,
        nom: [p?.prenom, p?.nom].filter(Boolean).join(" ") || "—",
        eloMoyen,
        nbCreateurs: createurs.length,
      };
    })
    .filter((r) => r.nbCreateurs > 0)
    .sort((a, b) => b.eloMoyen - a.eloMoyen);

  /**
   * Alertes = récence du DERNIER post réel (jour Paris de publie_at,
   * fallback date_publication_prevue si publie_at null).
   * - L2 : dernier post ≥ 2 jours
   * - L1 : pas posté hier et pas encore aujourd'hui (dernier = avant-hier serait L2)
   *   → concrètement : dernier post = hier est OK ; si posté aujourd'hui → aucune alerte
   *     (évite les faux positifs « posté il y a 5 h » dans L1).
   */
  const compteIds = eloListe.map((c) => c.compte_id);
  /** Dernier jour de publication (YYYY-MM-DD Paris) par compte. */
  const dernierPostParCompte = new Map<string, string>();
  if (compteIds.length > 0) {
    const depuis = ajouterJoursParisCalendaire(auj, -30);
    // Chunk .in() (limite URL PostgREST) + filtre simple statut=publie.
    const chunk = 80;
    for (let i = 0; i < compteIds.length; i += chunk) {
      const ids = compteIds.slice(i, i + chunk);
      const { data: postsRecents } = await supabase
        .from("passages")
        .select("compte_id, date_publication_prevue, publie_at")
        .in("compte_id", ids)
        .eq("statut", "publie");

      for (const p of postsRecents ?? []) {
        const cid = p.compte_id as string;
        const jourPublie = jourParisDepuisIso(p.publie_at as string | null);
        const prevue = p.date_publication_prevue as string | null;
        // Jour effectif = quand c'est parti en ligne ; sinon jour prévu.
        const jour = jourPublie ?? prevue;
        if (!jour || jour < depuis) continue;
        const prev = dernierPostParCompte.get(cid);
        if (!prev || jour > prev) dernierPostParCompte.set(cid, jour);
      }
    }
  }

  const niveau1: PilotageDashboard["alertes"]["niveau1"] = [];
  const niveau2: PilotageDashboard["alertes"]["niveau2"] = [];

  for (const c of eloListe) {
    const dernier = dernierPostParCompte.get(c.compte_id) ?? null;

    let joursSans = 99;
    if (dernier) {
      joursSans = Math.max(0, diffJoursParis(dernier, auj));
    }

    // Posté aujourd'hui → à jour, hors alertes (même s'il a loupé hier).
    if (joursSans === 0) continue;

    // L2 : 2 jours ou + sans post.
    if (joursSans >= 2) {
      niveau2.push({
        compte_id: c.compte_id,
        nom: c.nom,
        handle: c.handle,
        joursSansPost: Math.min(joursSans, 99),
      });
      continue;
    }

    // L1 : dernier post hier, rien aujourd'hui encore.
    if (joursSans === 1) {
      niveau1.push({
        compte_id: c.compte_id,
        nom: c.nom,
        handle: c.handle,
      });
    }
  }

  niveau2.sort((a, b) => b.joursSansPost - a.joursSansPost);

  // deno-lint-ignore no-explicit-any
  const postsVeilleMapped = ((postsVeille ?? []) as any[]).map((p) => ({
    id: p.id as string,
    titre: (p.contenus?.titre as string | null) ?? null,
    handle: (p.comptes?.handle_tiktok as string | null) ?? null,
    vues: Number(p.vues ?? 0),
    publie_url: (p.publie_url as string | null) ?? null,
    compte_id: p.compte_id as string,
  }));

  return {
    vuesSerie: (serie ?? []).map((s) => ({
      jour: s.jour as string,
      vues_totales: Number(s.vues_totales),
      vues_delta: s.vues_delta == null ? null : Number(s.vues_delta),
      nb_comptes: Number(s.nb_comptes ?? 0),
    })),
    recruteurs,
    postsVeille: postsVeilleMapped,
    eloTop: eloListe.slice(0, 10).map(({ compte_id, nom, handle, score }) => ({
      compte_id,
      nom,
      handle,
      score,
    })),
    eloBas: [...eloListe]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map(({ compte_id, nom, handle, score }) => ({
        compte_id,
        nom,
        handle,
        score,
      })),
    alertes: { niveau1, niveau2 },
  };
}

export async function statsPosts(compteId?: string): Promise<StatsPost[]> {
  let query = supabase
    .from("stats_posts")
    .select("*")
    .order("vues", { ascending: false, nullsFirst: false })
    .limit(100);
  if (compteId) query = query.eq("compte_id", compteId);

  const { data, error } = await query;
  if (error) throw error;
  return data as StatsPost[];
}

/** Réassignation manuelle : change le compte destinataire et/ou la date. */
export async function reassignerPost(
  id: string,
  patch: { compte_id?: string; date_publication_prevue?: string | null },
): Promise<void> {
  const { error } = await supabase.from("posts").update(patch).eq("id", id);
  if (error) throw error;
}

export interface PostCalendrierAdmin {
  id: string;
  compte_id: string;
  date_publication_prevue: string | null;
  type: string;
  statut: string;
  pipeline_statut: string;
  publie_at: string | null;
  publie_url: string | null;
  persona_nom: string | null;
  handle_tiktok: string | null;
  avatar_url: string | null;
  score: number | null;
  poster_prenom: string | null;
  poster_nom: string | null;
  sujet_titre: string | null;
  langue: string | null;
  /** Nombre de slides (0 = slideshow vide / matérialisation ratée). */
  nb_slides: number;
  /** Slides avec un media_id non null. */
  nb_media: number;
  /** Aucune slide, ou aucune image — inutilisable pour le poster. */
  slideshow_vide: boolean;
}

/** Médias uniques liés aux slides des posts prévus un jour (planning). */
export async function mediasPostsPrevusJour(date: string): Promise<
  Array<{ mediaId: string; postId: string; upscale_le: string | null }>
> {
  const { data: posts, error: e1 } = await supabase
    .from("posts")
    .select("id")
    .eq("date_publication_prevue", date)
    .eq("est_test", false);
  if (e1) throw e1;
  const postIds = (posts ?? []).map((p) => p.id as string);
  if (postIds.length === 0) return [];

  const out: Array<{ mediaId: string; postId: string; upscale_le: string | null }> = [];
  const vus = new Set<string>();
  const chunk = 80;
  for (let i = 0; i < postIds.length; i += chunk) {
    const ids = postIds.slice(i, i + chunk);
    const { data: slides, error: e2 } = await supabase
      .from("post_slides")
      .select("media_id, post_id, media_library(upscale_le)")
      .in("post_id", ids)
      .not("media_id", "is", null);
    if (e2) throw e2;
    for (const s of slides ?? []) {
      const mediaId = s.media_id as string | null;
      if (!mediaId || vus.has(mediaId)) continue;
      vus.add(mediaId);
      // deno-lint-ignore no-explicit-any
      const lib = (s as any).media_library as { upscale_le?: string | null } | null;
      out.push({
        mediaId,
        postId: s.post_id as string,
        upscale_le: lib?.upscale_le ?? null,
      });
    }
  }
  return out;
}

/** Posts (non-test) pour le planning admin jour par jour. */
export async function postsCalendrierAdmin(): Promise<PostCalendrierAdmin[]> {
  // L'embed profiles sous comptes fonctionne depuis la FK
  // comptes.poster_id → profiles.id (migration 0109).
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, compte_id, date_publication_prevue, type, statut, pipeline_statut, publie_at, publie_url, " +
        "sujets(titre), comptes(persona_nom, handle_tiktok, avatar_url, score, langue, profiles(prenom, nom))",
    )
    .eq("est_test", false)
    .order("date_publication_prevue", { ascending: false, nullsFirst: false })
    .limit(800);
  if (error) throw error;

  // Embeds profils / sujets : typage PostgREST parfois trop strict.
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const ids = rows.map((p) => p.id as string);
  const slidesParPost = new Map<string, { nb: number; media: number }>();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data: slides, error: e2 } = await supabase
      .from("post_slides")
      .select("post_id, media_id")
      .in("post_id", slice);
    if (e2) throw e2;
    for (const s of slides ?? []) {
      const pid = s.post_id as string;
      const cur = slidesParPost.get(pid) ?? { nb: 0, media: 0 };
      cur.nb += 1;
      if (s.media_id) cur.media += 1;
      slidesParPost.set(pid, cur);
    }
  }

  return rows.map((p) => {
    const counts = slidesParPost.get(p.id as string) ?? { nb: 0, media: 0 };
    const slideshow_vide = counts.nb === 0 || counts.media === 0;
    return {
      id: p.id as string,
      compte_id: p.compte_id as string,
      date_publication_prevue: p.date_publication_prevue as string | null,
      type: p.type as string,
      statut: p.statut as string,
      pipeline_statut: p.pipeline_statut as string,
      publie_at: (p.publie_at as string | null) ?? null,
      publie_url: (p.publie_url as string | null) ?? null,
      persona_nom: (p.comptes?.persona_nom as string | null) ?? null,
      handle_tiktok: (p.comptes?.handle_tiktok as string | null) ?? null,
      avatar_url: (p.comptes?.avatar_url as string | null) ?? null,
      score: (p.comptes?.score as number | null) ?? null,
      poster_prenom: (p.comptes?.profiles?.prenom as string | null) ?? null,
      poster_nom: (p.comptes?.profiles?.nom as string | null) ?? null,
      sujet_titre: (p.sujets?.titre as string | null) ?? null,
      langue: (p.comptes?.langue as string | null) ?? null,
      nb_slides: counts.nb,
      nb_media: counts.media,
      slideshow_vide,
    };
  });
}

export interface CompteCreateurDetail {
  id: string;
  poster_id: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  avatar_url: string | null;
  langue: string;
  score: number;
  score_maj_at: string | null;
  is_active: boolean;
  poster_prenom: string | null;
  poster_nom: string | null;
  poster_email: string | null;
  stats: StatsCompte | null;
}

/** Fiche créateur admin : identité + ELO + stats globales. */
export async function lireCompteCreateur(compteId: string): Promise<CompteCreateurDetail | null> {
  const { data, error } = await supabase
    .from("comptes")
    .select(
      "id, poster_id, persona_nom, handle_tiktok, avatar_url, langue, score, score_maj_at, is_active, profiles(prenom, nom, email)",
    )
    .eq("id", compteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: stats } = await supabase
    .from("stats_comptes")
    .select("*")
    .eq("compte_id", compteId)
    .maybeSingle();

  // Supabase type parfois `profiles` en tableau (join) — on normalise.
  const raw = data.profiles as
    | { prenom: string | null; nom: string | null; email: string | null }
    | Array<{ prenom: string | null; nom: string | null; email: string | null }>
    | null;
  const profiles = Array.isArray(raw) ? (raw[0] ?? null) : raw;

  return {
    id: data.id as string,
    poster_id: data.poster_id as string,
    persona_nom: (data.persona_nom as string | null) ?? null,
    handle_tiktok: (data.handle_tiktok as string | null) ?? null,
    avatar_url: (data.avatar_url as string | null) ?? null,
    langue: (data.langue as string) ?? "fr",
    score: Number(data.score ?? 50),
    score_maj_at: (data.score_maj_at as string | null) ?? null,
    is_active: Boolean(data.is_active),
    poster_prenom: profiles?.prenom ?? null,
    poster_nom: profiles?.nom ?? null,
    poster_email: profiles?.email ?? null,
    stats: (stats as StatsCompte | null) ?? null,
  };
}

/** Supprime un post et ses slides (cascade). Action admin, depuis le calendrier. */
/** Supprime TOUS les posts (non-test) d'une journée. Renvoie le nombre supprimé. */
export async function supprimerPostsDuJour(date: string): Promise<number> {
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("date_publication_prevue", date)
    .eq("est_test", false)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/** Langue (nationalité) d'un recruteur — la langue par défaut de ses futurs
 *  créateurs. Éditable par l'admin. */
export async function majNationalite(userId: string, nationalite: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ nationalite }).eq("id", userId);
  if (error) throw error;
}

/** Langues gérées par un recruteur (il peut créer des créateurs dans chacune).
 *  `nationalite` = la première, pour compatibilité. */
export async function majLanguesRecruteur(userId: string, langues: string[]): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ langues, nationalite: langues[0] ?? null })
    .eq("id", userId);
  if (error) throw error;
}

export async function supprimerPost(id: string): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

/** Modifie le texte d'une slide. Édition manuelle admin, aucun appel IA. */
export async function majTexteSlide(slideId: string, texte: string): Promise<void> {
  const { error } = await supabase
    .from("post_slides")
    .update({ texte_overlay: texte })
    .eq("id", slideId);
  if (error) throw error;
}

/** Relance le nettoyage d'une seule photo (déclenché à la main par l'admin).
 *  `remplacee` = le nettoyage a échoué mais la photo a été remplacée par une
 *  autre déjà propre de la bibliothèque du compte. */
export async function renettoyerSlide(
  postSlideId: string,
  onEtape?: (e: EvenementEtape) => void,
) {
  if (!onEtape) {
    return invoke<{
      ok: boolean;
      nettoyee: boolean;
      remplacee?: boolean;
      moteur?: "text_removal" | "replicate_text_removal";
      erreur?: string;
      motif?: string;
    }>("renettoyer", { postSlideId });
  }
  const fin = await invokeNettoyageStream("renettoyer", { postSlideId }, onEtape);
  return {
    ok: fin.ok !== false && fin.statut !== "echec",
    nettoyee: Boolean(fin.nettoyee),
    remplacee: fin.remplacee,
    moteur: fin.moteur,
    motif: fin.detail,
    erreur: fin.statut === "echec" ? fin.detail : undefined,
  };
}

/** Fait pointer une slide vers un autre visuel déjà en bibliothèque. */
export async function majMediaSlide(slideId: string, mediaId: string): Promise<void> {
  const { error } = await supabase
    .from("post_slides")
    .update({ media_id: mediaId })
    .eq("id", slideId);
  if (error) throw error;
}

/** Retire la photo d'une slide (le visuel reste en bibliothèque, seul le lien
 *  saute). La slide affiche alors « photo manquante », à recharger. */
export async function retirerPhotoSlide(slideId: string): Promise<void> {
  const { error } = await supabase
    .from("post_slides")
    .update({ media_id: null })
    .eq("id", slideId);
  if (error) throw error;
}

/** Supprime une slide ENTIÈRE d'un post, puis renumérote les suivantes pour que
 *  les positions restent contiguës (1, 2, 3…). */
export async function supprimerSlide(slideId: string): Promise<void> {
  const { data: slide } = await supabase
    .from("post_slides")
    .select("post_id, position")
    .eq("id", slideId)
    .single();

  const { error } = await supabase.from("post_slides").delete().eq("id", slideId);
  if (error) throw error;

  if (slide) {
    const { data: apres } = await supabase
      .from("post_slides")
      .select("id, position")
      .eq("post_id", slide.post_id)
      .gt("position", slide.position)
      .order("position");
    for (const s of apres ?? []) {
      await supabase.from("post_slides").update({ position: s.position - 1 }).eq("id", s.id);
    }
  }
}

/** Nettoie une photo de la bibliothèque à la demande (bouton admin). */
export async function nettoyerMedia(
  mediaId: string,
  onEtape?: (e: EvenementEtape) => void,
) {
  if (!onEtape) {
    return invoke<{
      ok: boolean;
      nettoyee: boolean;
      moteur?: "text_removal" | "replicate_text_removal";
      erreur?: string;
    }>("nettoyer-media", { mediaId });
  }
  const fin = await invokeNettoyageStream("nettoyer-media", { mediaId }, onEtape);
  return {
    ok: fin.ok !== false && fin.statut !== "echec",
    nettoyee: Boolean(fin.nettoyee ?? fin.ok),
    moteur: fin.moteur,
    erreur: fin.statut === "echec" ? fin.detail : undefined,
  };
}

export type JobReimportPhoto = {
  contenuId: string;
  position: number;
};

/** Jobs réimport pour un contenu (slides avec brut source). */
export function jobsReimportDepuisSlides(
  contenuId: string,
  slides: ContenuSlide[] | null | undefined,
): JobReimportPhoto[] {
  const jobs: JobReimportPhoto[] = [];
  for (const s of slides ?? []) {
    if (s.raw_url || s.reference_url) {
      jobs.push({ contenuId, position: s.position });
    }
  }
  return jobs;
}

/**
 * Toutes les slides des contenus `valide` qui ont une URL source (brut TikTok).
 * Sert au lot « réimporter photos » — texte / OCR / decks inchangés.
 */
export async function listerJobsReimportPhotosValides(): Promise<JobReimportPhoto[]> {
  const jobs: JobReimportPhoto[] = [];
  const pageSize = 200;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("contenus")
      .select("id, structure_slides")
      .eq("statut", "valide")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) {
      jobs.push(
        ...jobsReimportDepuisSlides(
          row.id as string,
          (row.structure_slides ?? []) as ContenuSlide[],
        ),
      );
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return jobs;
}

/** Re-nettoie une slide d'un slideshow v-next (structure_slides). */
export async function renettoyerSlideContenu(
  contenuId: string,
  position: number,
  onEtape?: (e: EvenementEtape) => void,
) {
  if (!onEtape) {
    return invoke<{
      ok: boolean;
      nettoyee: boolean;
      remplacee?: boolean;
      moteur?: "text_removal" | "replicate_text_removal";
      mediaId?: string;
      url?: string;
      motif?: string;
      erreur?: string;
    }>("renettoyer-contenu", { contenuId, position });
  }
  const fin = await invokeNettoyageStream(
    "renettoyer-contenu",
    { contenuId, position },
    onEtape,
  );
  return {
    ok: fin.ok !== false && fin.statut !== "echec",
    nettoyee: Boolean(fin.nettoyee),
    remplacee: Boolean(fin.remplacee),
    moteur: fin.moteur,
    mediaId: typeof fin.mediaId === "string" ? fin.mediaId : undefined,
    url: fin.url,
    motif: fin.detail,
    erreur: fin.statut === "echec" ? fin.detail : undefined,
  };
}

/** Remplace le visuel d'une slide de contenu par un média bibliothèque. */
export async function majMediaSlideContenu(
  contenuId: string,
  position: number,
  mediaId: string,
): Promise<void> {
  const { data: contenu, error } = await supabase
    .from("contenus")
    .select("structure_slides")
    .eq("id", contenuId)
    .single();
  if (error) throw error;
  const slides = [...((contenu.structure_slides ?? []) as ContenuSlide[])];
  const idx = slides.findIndex((s) => s.position === position);
  if (idx < 0) throw new Error("Slide introuvable");
  slides[idx] = { ...slides[idx], media_id: mediaId };
  const { error: majErr } = await supabase
    .from("contenus")
    .update({ structure_slides: slides })
    .eq("id", contenuId);
  if (majErr) throw majErr;
}

/**
 * Visuels candidats pour remplacer une slide : même compte de référence,
 * plus médias des contenus partageant au moins un label.
 */
export async function listerMediasPourContenu(contenuId: string): Promise<Media[]> {
  const { data: contenu, error } = await supabase
    .from("contenus")
    .select("compte_reference_id")
    .eq("id", contenuId)
    .single();
  if (error) throw error;

  const { data: labs } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", contenuId);
  const labelIds = (labs ?? []).map((l) => l.label_id);

  const byId = new Map<string, Media>();

  if (contenu.compte_reference_id) {
    const { data: memes } = await supabase
      .from("media_library")
      .select("*")
      .eq("compte_reference_id", contenu.compte_reference_id)
      .like("storage_path", "propre/%")
      .eq("texte_restant", false)
      .order("created_at", { ascending: false })
      .limit(80);
    for (const m of memes ?? []) byId.set(m.id, m as Media);
  }

  if (labelIds.length > 0) {
    // Via media_labels (labels du slideshow mère posés à l'import).
    const { data: liens } = await supabase
      .from("media_labels")
      .select("media_id")
      .in("label_id", labelIds)
      .limit(200);
    const mediaIds = [...new Set((liens ?? []).map((l) => l.media_id as string))];
    if (mediaIds.length > 0) {
      const { data: mediaLabels } = await supabase
        .from("media_library")
        .select("*")
        .in("id", mediaIds)
        .like("storage_path", "propre/%")
        .eq("texte_restant", false)
        .order("created_at", { ascending: false })
        .limit(80);
      for (const m of mediaLabels ?? []) byId.set(m.id, m as Media);
    }

    // Repli frères contenu_labels (si media_labels encore partiel).
    const { data: freres } = await supabase
      .from("contenu_labels")
      .select("contenu_id")
      .in("label_id", labelIds)
      .neq("contenu_id", contenuId)
      .limit(60);
    const contenuIds = [...new Set((freres ?? []).map((f) => f.contenu_id))];
    if (contenuIds.length > 0) {
      const { data: mediaFreres } = await supabase
        .from("media_library")
        .select("*")
        .in("contenu_id", contenuIds)
        .like("storage_path", "propre/%")
        .eq("texte_restant", false)
        .order("created_at", { ascending: false })
        .limit(80);
      for (const m of mediaFreres ?? []) byId.set(m.id, m as Media);
    }
  }

  return [...byId.values()];
}

/** Nettoyage de test NON destructif : renvoie l'image nettoyée sans rien écraser. */
export async function nettoyerTest(
  url: string,
  onEtape?: (e: EvenementEtape) => void,
) {
  if (!onEtape) {
    return invoke<{
      ok: boolean;
      url?: string;
      moteur?: "text_removal" | "replicate_text_removal";
      erreur?: string;
      motif?: string;
    }>("nettoyer-test", { url });
  }
  const fin = await invokeNettoyageStream("nettoyer-test", { url }, onEtape);
  return {
    ok: fin.ok !== false && fin.statut === "ok",
    url: fin.url,
    moteur: fin.moteur,
    erreur: fin.statut === "echec" ? fin.detail : undefined,
    motif: fin.detail,
  };
}

/** Visuels bruts (à texte) regroupés par compte de référence, pour l'écran de test. */
export interface MediaTest {
  id: string;
  url: string;
  compte_reference_id: string | null;
  source: string;
}
export async function mediasBrutsParSource(): Promise<
  Array<{ source: string; medias: MediaTest[] }>
> {
  const { data, error } = await supabase
    .from("media_library")
    .select("id, url, compte_reference_id, storage_path, comptes_reference(handle_tiktok)")
    .like("storage_path", "brut/%")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  const groupes = new Map<string, { source: string; medias: MediaTest[] }>();
  // deno-lint-ignore no-explicit-any
  for (const m of data as any[]) {
    const source = m.comptes_reference?.handle_tiktok ?? "sans compte";
    if (!groupes.has(source)) groupes.set(source, { source, medias: [] });
    groupes.get(source)!.medias.push({
      id: m.id,
      url: m.url,
      compte_reference_id: m.compte_reference_id,
      source,
    });
  }
  return [...groupes.values()];
}

/** Supprime un visuel de la bibliothèque. Les slides qui l'utilisaient
 *  repassent à « photo manquante » (media_id mis à null par la FK). */
export async function supprimerMedia(mediaId: string): Promise<void> {
  const { error } = await supabase.from("media_library").delete().eq("id", mediaId);
  if (error) throw error;
}

/** Retire les Content Credentials (C2PA) d'une photo, sans re-nettoyer. */
export const stripC2paMedia = (mediaId: string) =>
  invoke<{
    ok: boolean;
    mediaId: string;
    saute?: boolean;
    retire?: boolean;
    detail?: string;
    url?: string;
    error?: string;
  }>("strip-c2pa", { mediaId });

export type ModeleUpscale = "realesrgan" | "seedvr";

export type UpscaleMediaResultat = {
  ok: boolean;
  mediaId: string;
  saute?: boolean;
  url?: string;
  mime?: string;
  modele?: ModeleUpscale;
  scale?: number;
  upscale_le?: string;
  c2pa_retire?: boolean;
  detail?: string;
  error?: string;
};

/**
 * Upscale biblio (Real-ESRGAN ou SeedVR) → strip C2PA → remplace en place.
 * Toujours en NDJSON streamé : le poll Fal/Replicate dépasse l’idle Edge 150s
 * sans keepalive.
 */
export async function upscaleMedia(
  mediaId: string,
  opts?: {
    forcer?: boolean;
    modele?: ModeleUpscale;
    onProgress?: (detail: string) => void;
  },
): Promise<UpscaleMediaResultat> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const modele = opts?.modele ?? "realesrgan";
  const res = await fetch(`${url}/functions/v1/upscale-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      mediaId,
      forcer: opts?.forcer ?? false,
      modele,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    let message = `Edge upscale-media ${res.status}`;
    if (/idle timeout|150s/i.test(message)) {
      message =
        "Timeout Edge (150s) — l’upscale doit streamer (UI à jour). Réessaie ou Real-ESRGAN.";
    }
    try {
      const j = (await res.json()) as { error?: string; message?: string; code?: string };
      if (j?.error) message = j.error;
      else if (j?.code === "WORKER_RESOURCE_LIMIT") {
        message =
          "Mémoire Edge saturée (WORKER_RESOURCE_LIMIT) — SeedVR : 1 photo / JPEG ; sinon Real-ESRGAN.";
      } else if (j?.message) message = j.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dernier: UpscaleMediaResultat | null = null;
  let erreurStream: string | null = null;

  const traiter = (trim: string) => {
    let ev: UpscaleMediaResultat & { statut?: string; detail?: string };
    try {
      ev = JSON.parse(trim) as UpscaleMediaResultat & {
        statut?: string;
        detail?: string;
      };
    } catch {
      return; // ligne partielle / bruit
    }
    if (ev.detail) opts?.onProgress?.(ev.detail);
    if (ev.statut === "echec") {
      erreurStream = ev.detail ?? ev.error ?? "Échec upscale";
      return;
    }
    if (ev.statut === "ok" || ev.ok === true) {
      dernier = {
        ok: true,
        mediaId: ev.mediaId ?? mediaId,
        saute: ev.saute,
        url: ev.url,
        mime: ev.mime,
        modele: ev.modele ?? modele,
        scale: ev.scale,
        upscale_le: ev.upscale_le,
        c2pa_retire: ev.c2pa_retire,
        detail: ev.detail,
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lignes = buffer.split("\n");
    buffer = lignes.pop() ?? "";
    for (const ligne of lignes) {
      const trim = ligne.trim();
      if (trim) traiter(trim);
    }
  }
  if (buffer.trim()) traiter(buffer.trim());

  if (erreurStream) throw new Error(erreurStream);
  if (!dernier) throw new Error("Upscale : aucune réponse (stream coupé ?)");
  return dernier;
}


/** Le compte de référence dont dépend un post — pour filtrer sa bibliothèque. */
export async function compteReferenceDuPost(postId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("posts")
    .select("comptes(compte_reference_id)")
    .eq("id", postId)
    .single();
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data as any)?.comptes?.compte_reference_id ?? null;
}

export async function sujetsDisponibles(): Promise<Array<{ id: string; titre: string }>> {
  const { data, error } = await supabase
    .from("sujets")
    .select("id, titre")
    .eq("preparation_statut", "done")
    .in("statut", ["retenu", "utilise"])
    .order("pertinence_score", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Array<{ id: string; titre: string }>;
}

// --- Réglages et prompts ----------------------------------------------------

/** Lit `{ items }` ou legacy `{ label_ids }` → file normalisée. */
export function normaliserFileLabels(raw: unknown): Reglages["file_labels_comptes"] {
  const v = (raw ?? {}) as {
    items?: Array<{ label_id?: string; ugc?: boolean }>;
    label_ids?: string[];
  };
  if (Array.isArray(v.items) && v.items.length > 0) {
    return {
      items: v.items
        .map((it) => ({
          label_id: String(it?.label_id ?? "").trim(),
          ugc: Boolean(it?.ugc),
        }))
        .filter((it) => it.label_id),
    };
  }
  const ids = (v.label_ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  return { items: ids.map((label_id) => ({ label_id, ugc: false })) };
}

export async function lireReglages(): Promise<Reglages> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur");
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));

  return {
    repartition: map.get("repartition") ?? { recycle: 60, remanie: 20, nouveau: 20 },
    frequence: map.get("frequence") ?? { posts_par_jour: 1 },
    semaine1: map.get("semaine1") ?? {
      actif: true,
      jours: 7,
      posts_par_jour: 1,
      tout_recycle: true,
    },
    scoring: {
      ewma_alpha: 0.3,
      regularisation_k: 5,
      transfert_inter_langue: 0.15,
      top_k: 5,
      temperature: 0.7,
      saturation_jours: 7,
      saturation_penalite: 0.2,
      variation_seuil_score: 80,
      variation_min_passages: 3,
      variation_age_jours: 5,
      variation_profondeur_max: 2,
      score_prior: 50,
      pertinence_seuil: 50,
      elo_seuil_import: 55,
      elo_poids_vues: 0.9,
      elo_vues_plafond: 80_000,
      elo_regularisation_k: 1,
      ...((map.get("scoring") as Partial<Reglages["scoring"]> | undefined) ?? {}),
    },
    paiement: (map.get("paiement") as Reglages["paiement"] | undefined) ?? {
      tarif_base_mensuel: 0,
      tarif_par_post_jour: 0,
    },
    moteur_vnext: (map.get("moteur_vnext") as Reglages["moteur_vnext"] | undefined) ?? {
      actif: false,
    },
    assignation_auto: (map.get("assignation_auto") as Reglages["assignation_auto"] | undefined) ?? {
      actif: true,
    },
    nettoyage: {
      provider_principal: "fal",
      ...((map.get("nettoyage") as Partial<Reglages["nettoyage"]> | undefined) ?? {}),
    },
    file_labels_comptes: normaliserFileLabels(map.get("file_labels_comptes")),
    warmup: {
      heures: 24,
      ...((map.get("warmup") as Partial<Reglages["warmup"]> | undefined) ?? {}),
    },
  };
}

export async function ecrireReglage(cle: string, valeur: unknown): Promise<void> {
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: "cle" });
  if (error) throw error;
}

export async function lirePrompt(cle: string): Promise<string> {
  const { data } = await supabase
    .from("prompts")
    .select("contenu")
    .eq("cle", cle)
    .maybeSingle();
  return data?.contenu ?? "";
}

export async function ecrirePrompt(cle: string, contenu: string): Promise<void> {
  const { error } = await supabase
    .from("prompts")
    .upsert({ cle, contenu, updated_at: new Date().toISOString() }, { onConflict: "cle" });
  if (error) throw error;
}

// --- Moteur -----------------------------------------------------------------

export const lancerExtraction = (compteReferenceId?: string) =>
  invoke<{ sujetsCrees: number }>("extraction", { compteReferenceId: compteReferenceId ?? null });

export const lancerPreparation = (sujetId?: string) =>
  invoke<{ etape?: string; idle?: boolean }>("preparation", { sujetId: sujetId ?? null });

/** Pipeline v-next : avance d'un pas l'import pré-calculé d'un contenu (ou la file). */
export const lancerImportContenu = (contenuId?: string) =>
  invoke<{
    ok: boolean;
    contenuId?: string;
    etape?: string;
    idle?: boolean;
    elo?: EloImportRapport | null;
    nettoyage?: { texte: string } | null;
  }>("import-contenu", {
    contenuId: contenuId ?? null,
  });

/** Avance le pipeline d'import d'un contenu sur plusieurs pas. */
export async function avancerImportContenuPlusieursPas(
  contenuId: string,
  maxPas = 8,
): Promise<string | undefined> {
  let derniere: string | undefined;
  for (let i = 0; i < maxPas; i += 1) {
    const r = await lancerImportContenu(contenuId).catch(() => null);
    if (!r) break;
    derniere = r.etape;
    if (
      r.idle ||
      r.etape === "done" ||
      r.etape === "rejete" ||
      r.etape === "elo_insuffisant"
    ) {
      break;
    }
  }
  return derniere;
}

/** Import v-next d'un TikTok isolé — enqueue serveur (drain autonome). */
export const importerContenuDepuisLien = (
  postUrl: string,
  compteReferenceId: string | null,
  labelIds?: string[],
) =>
  invoke<{
    ok: boolean;
    batchId: string;
    enqueued: number;
    skipped: number;
  }>("import-contenu", {
    postUrl,
    compteReferenceId,
    labelIds: labelIds ?? null,
  });

/** Liste les URLs photo inédites d'un compte (sans scrape lourd des visuels). */
export const listerSlideshowsCompte = (compteReferenceId: string) =>
  invoke<{
    ok: boolean;
    handle: string;
    urls: string[];
    total: number;
    connus: number;
    source: "page" | "apify" | "mixte";
  }>("import-contenu", {
    compteReferenceId,
    lister: true,
  });

/** Enfile toutes les URLs d'un compte + kick workers serveur. */
export const enqueueImportCompte = (
  compteReferenceId: string,
  labelIds?: string[],
  langue?: string | null,
) =>
  invoke<{
    ok: boolean;
    handle: string;
    total: number;
    connus: number;
    source: string;
    batchId: string;
    enqueued: number;
    skipped: number;
    langue?: string | null;
  }>("import-contenu", {
    enqueueCompte: true,
    compteReferenceId,
    labelIds: labelIds ?? [],
    langue: langue ?? null,
  });

/** Enfile une liste d'URLs pour scrape+pipeline serveur. */
export const enqueueImportUrls = (opts: {
  urls: string[];
  compteReferenceId: string | null;
  labelIds?: string[];
  batchId?: string;
  /** Langue d'origine du TikTok (boost ELO). */
  langue?: string | null;
}) =>
  invoke<{
    ok: boolean;
    batchId: string;
    enqueued: number;
    skipped: number;
  }>("import-contenu", {
    enqueueUrls: true,
    urls: opts.urls,
    compteReferenceId: opts.compteReferenceId,
    labelIds: opts.labelIds ?? [],
    batchId: opts.batchId ?? null,
    langue: opts.langue ?? null,
  });

/** Progression d'un batch d'import serveur. */
export const statsImportBatch = (batchId: string) =>
  invoke<{
    ok: boolean;
    total: number;
    pending: number;
    running: number;
    done: number;
    failed: number;
    contenusPending: number;
    contenusDone: number;
  }>("import-contenu", { stats: true, batchId });

/** Contenu d'un batch avec rapport ELO (pour logs live). */
export async function contenusEloDuBatch(batchId: string): Promise<
  Array<{
    contenuId: string;
    postUrl: string;
    importEtape: string | null;
    importErreur: string | null;
    statut: string | null;
    elo: EloImportRapport | null;
    forceSeuil: boolean;
  }>
> {
  const { data: rows, error } = await supabase
    .from("import_file")
    .select("contenu_id, post_url")
    .eq("batch_id", batchId)
    .not("contenu_id", "is", null);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.contenu_id as string).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: contenus, error: cErr } = await supabase
    .from("contenus")
    .select(
      "id, statut, import_etape, import_erreur, import_elo_rapport, import_elo_force_seuil, source_url",
    )
    .in("id", ids);
  if (cErr) throw cErr;
  const byId = new Map((contenus ?? []).map((c) => [c.id as string, c]));
  return (rows ?? []).flatMap((r) => {
    const c = byId.get(r.contenu_id as string);
    if (!c) return [];
    return [
      {
        contenuId: c.id as string,
        postUrl: (r.post_url as string) || (c.source_url as string) || "",
        importEtape: (c.import_etape as string | null) ?? null,
        importErreur: (c.import_erreur as string | null) ?? null,
        statut: (c.statut as string | null) ?? null,
        elo: (c.import_elo_rapport as EloImportRapport | null) ?? null,
        forceSeuil: Boolean(c.import_elo_force_seuil),
      },
    ];
  });
}

export interface ImportHistoriqueLigne {
  fileId: string;
  postUrl: string;
  fileStatut: string;
  fileErreur: string | null;
  batchId: string | null;
  createdAt: string;
  contenuId: string | null;
  contenuStatut: string | null;
  importStatut: string | null;
  importEtape: string | null;
  importErreur: string | null;
  vues: number | null;
  pertinence: number | null;
  elo: EloImportRapport | null;
  forceSeuil: boolean;
  titre: string | null;
}

/** Historique des imports (file serveur + ELO persisté). */
export async function listerHistoriqueImports(
  limit = 15,
): Promise<{ lignes: ImportHistoriqueLigne[]; hasMore: boolean }> {
  // +1 pour savoir s'il reste une page sans compter en SQL.
  const { data, error } = await supabase
    .from("import_file")
    .select(
      "id, post_url, statut, erreur, batch_id, created_at, contenu_id, contenus:contenu_id(id, titre, statut, import_statut, import_etape, import_erreur, vues_source, pertinence_score, import_elo_rapport, import_elo_force_seuil)",
    )
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const lignes = rows.slice(0, limit).map((r) => {
    const c = Array.isArray(r.contenus) ? r.contenus[0] : r.contenus;
    const contenu = c as
      | {
          id: string;
          titre: string | null;
          statut: string;
          import_statut: string;
          import_etape: string | null;
          import_erreur: string | null;
          vues_source: number | null;
          pertinence_score: number | null;
          import_elo_rapport: EloImportRapport | null;
          import_elo_force_seuil: boolean | null;
        }
      | null
      | undefined;
    return {
      fileId: r.id as string,
      postUrl: r.post_url as string,
      fileStatut: r.statut as string,
      fileErreur: (r.erreur as string | null) ?? null,
      batchId: (r.batch_id as string | null) ?? null,
      createdAt: r.created_at as string,
      contenuId: contenu?.id ?? (r.contenu_id as string | null) ?? null,
      contenuStatut: contenu?.statut ?? null,
      importStatut: contenu?.import_statut ?? null,
      importEtape: contenu?.import_etape ?? null,
      importErreur: contenu?.import_erreur ?? null,
      vues: contenu?.vues_source ?? null,
      pertinence: contenu?.pertinence_score ?? null,
      elo: contenu?.import_elo_rapport ?? null,
      forceSeuil: Boolean(contenu?.import_elo_force_seuil),
      titre: contenu?.titre ?? null,
    };
  });
  return { lignes, hasMore };
}

/** Boost ELO au seuil + relance le pipeline (nettoyage…). */
export const forcerImportEloContenu = (contenuId: string) =>
  invoke<{
    ok: boolean;
    contenuId?: string;
    elo?: EloImportRapport | null;
    langues?: string[];
    error?: string;
  }>("import-contenu", { forcerElo: true, contenuId });

/** Scrape v-next d'un compte de référence → jusqu'à N contenus en file (legacy série). */
export const scraperSourceVersContenus = (compteReferenceId: string) =>
  invoke<{ ok: boolean; crees: number; ids: string[]; scrapes?: number }>(
    "import-contenu",
    {
      compteReferenceId,
      scrape: true,
    },
  );

/** Pipeline minuit v-next : stats → (scores PAUSE) → assignation contenus. */
export const lancerMinuitVnext = (body: Record<string, unknown> = {}) =>
  invoke<{ ok: boolean; saute?: boolean; jour?: string }>("minuit-vnext", body);

export const lancerScoringVnext = (compteId?: string) =>
  invoke<{ ok: boolean; contenus: number; comptes: number }>("scoring", {
    compteId: compteId ?? null,
  });

export type RattrapageEloLog = {
  at: string;
  level: "info" | "ok" | "warn" | "error";
  message: string;
  detail?: string;
};

export type RattrapageEloBrief = {
  resume: string;
  fenetre: string;
  passages: number;
  stats: {
    comptes: number;
    releves: number;
    sansMatch: number;
    fallbackUrl: number;
    fallbackCoherence: number;
    erreurs: number;
  };
  eloLangue: {
    appliques: number;
    ignores: number;
    deltaNet: number;
    hausses: number;
    baisses: number;
    top: Array<{
      passageId: string;
      contenuId: string;
      compteId: string;
      handle: string | null;
      langue: string;
      date: string | null;
      vues: number;
      avant: number;
      apres: number;
      delta: number;
    }>;
  };
  eloCompte: {
    maj: number;
    top: Array<{
      compteId: string;
      handle: string | null;
      avant: number;
      apres: number;
      posts: number;
    }>;
  };
};

/** Rattrapage ELO (4 jours Paris) : stats → deltas langue (vues) → ELO compte ≤10 posts. */
export const lancerRattrapageElo = (opts?: {
  compteId?: string;
  jours?: number;
  forcer?: boolean;
  dryRun?: boolean;
  /** Figé seulement vues_globales_jour (fin de run live). */
  snapshot?: boolean;
}) =>
  invoke<{
    ok: boolean;
    fenetre: { debut: string; fin: string; jours: number };
    stats: {
      comptes: number;
      releves: number;
      fallbackUrl: number;
      fallbackCoherence: number;
      sansMatch: number;
      erreurs: Array<{ compteId: string; handle?: string | null; erreur: string }>;
    };
    eloLangue: {
      appliques: number;
      ignores: number;
      deltas: number;
      hausses: number;
      baisses: number;
    };
    eloCompte: { maj: number };
    brief: RattrapageEloBrief;
    logs: RattrapageEloLog[];
    dryRun: boolean;
    snapshot?: {
      jour: string;
      vues_totales: number;
      vues_delta: number | null;
      nb_comptes: number;
    };
    error?: string;
  }>("rattrapage-elo", {
    compteId: opts?.compteId ?? null,
    jours: opts?.jours ?? 4,
    forcer: opts?.forcer ?? false,
    dryRun: opts?.dryRun ?? false,
    snapshot: opts?.snapshot ?? false,
  });

export type RattrapageEloResultat = Awaited<ReturnType<typeof lancerRattrapageElo>>;

export type RattrapageEloProgress = {
  index: number;
  total: number;
  compteId: string;
  handle: string | null;
  phase: "start" | "done" | "error";
  logs: RattrapageEloLog[];
  briefPartial: RattrapageEloBrief | null;
  erreur?: string;
};

/** Ajoute des jours calendaires en ancrage Paris (midi UTC → format en-CA). */
function ajouterJoursParisCalendaire(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

/** Nombre de jours calendaires Paris entre deux YYYY-MM-DD (fin − début). */
function diffJoursParis(debut: string, fin: string): number {
  const a = new Date(`${debut}T12:00:00Z`).getTime();
  const b = new Date(`${fin}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Tous les comptes en process (warmup terminé) avec @ — ELO + metrics. */
async function comptesPourRattrapage(
  _jours: number,
): Promise<Array<{ id: string; handle: string | null }>> {
  const { data: comptes, error } = await supabase
    .from("comptes")
    .select("id, handle_tiktok, warmup_started_at, warmup_ends_at")
    .eq("is_active", true)
    .not("handle_tiktok", "is", null)
    .order("handle_tiktok");
  if (error) throw error;

  return (comptes ?? [])
    .filter((c) =>
      compteEnProcessus({
        warmup_started_at: c.warmup_started_at as string | null,
        warmup_ends_at: c.warmup_ends_at as string | null,
      }),
    )
    .map((c) => ({
      id: c.id as string,
      handle: (c.handle_tiktok as string | null) ?? null,
    }));
}

function fusionnerBriefs(
  jours: number,
  parts: RattrapageEloBrief[],
  erreurs: number,
): RattrapageEloBrief {
  const empty: RattrapageEloBrief = {
    resume: "",
    fenetre: parts[0]?.fenetre ?? `${jours}j`,
    passages: 0,
    stats: {
      comptes: 0,
      releves: 0,
      sansMatch: 0,
      fallbackUrl: 0,
      fallbackCoherence: 0,
      erreurs,
    },
    eloLangue: {
      appliques: 0,
      ignores: 0,
      deltaNet: 0,
      hausses: 0,
      baisses: 0,
      top: [],
    },
    eloCompte: { maj: 0, top: [] },
  };
  const agg = parts.reduce((a, b) => {
    a.passages += b.passages;
    a.stats.comptes += b.stats.comptes;
    a.stats.releves += b.stats.releves;
    a.stats.sansMatch += b.stats.sansMatch;
    a.stats.fallbackUrl += b.stats.fallbackUrl;
    a.stats.fallbackCoherence += b.stats.fallbackCoherence;
    a.eloLangue.appliques += b.eloLangue.appliques;
    a.eloLangue.ignores += b.eloLangue.ignores;
    a.eloLangue.deltaNet += b.eloLangue.deltaNet;
    a.eloLangue.hausses += b.eloLangue.hausses;
    a.eloLangue.baisses += b.eloLangue.baisses;
    a.eloLangue.top.push(...b.eloLangue.top);
    a.eloCompte.maj += b.eloCompte.maj;
    a.eloCompte.top.push(...b.eloCompte.top);
    return a;
  }, empty);

  agg.eloLangue.top = [...agg.eloLangue.top]
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 12);
  agg.eloCompte.top = [...agg.eloCompte.top]
    .sort((x, y) => Math.abs(y.apres - y.avant) - Math.abs(x.apres - x.avant))
    .slice(0, 12);

  const delta = Math.round(agg.eloLangue.deltaNet * 10) / 10;
  const deltaStr = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
  agg.resume =
    `${agg.fenetre} · ${agg.stats.releves} stats · ` +
    `${agg.eloLangue.appliques} ELO langue (${agg.eloLangue.hausses}↑ ${agg.eloLangue.baisses}↓, Δ ${deltaStr}) · ` +
    `${agg.eloCompte.maj} ELO compte` +
    (agg.stats.sansMatch ? ` · ${agg.stats.sansMatch} sans match` : "") +
    (erreurs ? ` · ${erreurs} erreur(s)` : "");
  agg.stats.erreurs = erreurs;
  return agg;
}

function estTimeoutEdge(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /idle timeout|150s|Timeout Edge/i.test(m);
}

/** Erreur réseau / gateway supabase-js — souvent après un Relancer long. */
function estFetchEdgeEchoue(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /Failed to send a request to the Edge Function|Failed to fetch|NetworkError|Load failed/i.test(
    m,
  );
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Un compte ELO : 1 essai, puis retry fenêtre courte si timeout 150s. */
async function lancerRattrapageEloCompteRobuste(opts: {
  compteId: string;
  jours: number;
  forcer: boolean;
}): Promise<RattrapageEloResultat> {
  try {
    return await lancerRattrapageElo(opts);
  } catch (e) {
    if (!estTimeoutEdge(e)) throw e;
    // 2e chance : fenêtre plus courte pour rester sous 150s.
    return await lancerRattrapageElo({
      compteId: opts.compteId,
      jours: Math.min(2, opts.jours),
      forcer: opts.forcer,
    });
  }
}

/**
 * Rattrapage ELO compte-par-compte (évite le timeout Edge 150s) avec
 * progression + logs live via `onProgress`.
 * Ne throw jamais pour un timeout partiel — continue les autres comptes.
 */
export async function lancerRattrapageEloLive(opts?: {
  jours?: number;
  forcer?: boolean;
  onProgress?: (p: RattrapageEloProgress) => void;
}): Promise<{
  ok: boolean;
  brief: RattrapageEloBrief;
  logs: RattrapageEloLog[];
  stats: RattrapageEloResultat["stats"];
  eloLangue: RattrapageEloResultat["eloLangue"];
  eloCompte: { maj: number };
  fenetre: { debut: string; fin: string; jours: number };
}> {
  const jours = opts?.jours ?? 4;
  const forcer = opts?.forcer ?? false;
  const onProgress = opts?.onProgress;

  const comptes = await comptesPourRattrapage(jours);
  const logs: RattrapageEloLog[] = [];
  const briefs: RattrapageEloBrief[] = [];
  const erreurs: Array<{ compteId: string; handle?: string | null; erreur: string }> = [];
  let fenetre = { debut: aujourdhui(), fin: aujourdhui(), jours };
  let releves = 0;
  let sansMatch = 0;
  let fallbackUrl = 0;
  let fallbackCoherence = 0;
  let eloLangue = {
    appliques: 0,
    ignores: 0,
    deltas: 0,
    hausses: 0,
    baisses: 0,
  };
  let eloCompteMaj = 0;

  const pushLog = (level: RattrapageEloLog["level"], message: string, detail?: string) => {
    logs.push({ at: new Date().toISOString(), level, message, detail });
  };

  pushLog(
    "info",
    `Rattrapage ELO live — ${comptes.length} compte(s) actifs (${jours}j)`,
  );
  onProgress?.({
    index: 0,
    total: comptes.length,
    compteId: "",
    handle: null,
    phase: "start",
    logs: [...logs],
    briefPartial: null,
  });

  if (comptes.length === 0) {
    pushLog("warn", "Aucun compte actif avec @ TikTok");
    const brief = fusionnerBriefs(jours, [], 0);
    brief.resume = `Aucun compte à traiter (${jours}j)`;
    return {
      ok: true,
      brief,
      logs,
      stats: {
        comptes: 0,
        releves: 0,
        fallbackUrl: 0,
        fallbackCoherence: 0,
        sansMatch: 0,
        erreurs: [],
      },
      eloLangue,
      eloCompte: { maj: 0 },
      fenetre,
    };
  }

  for (let i = 0; i < comptes.length; i++) {
    const c = comptes[i]!;
    pushLog("info", `[${i + 1}/${comptes.length}] @${c.handle ?? c.id.slice(0, 8)} — démarrage`);
    onProgress?.({
      index: i + 1,
      total: comptes.length,
      compteId: c.id,
      handle: c.handle,
      phase: "start",
      logs: [...logs],
      briefPartial: briefs.length ? fusionnerBriefs(jours, briefs, erreurs.length) : null,
    });

    try {
      const r = await lancerRattrapageEloCompteRobuste({
        compteId: c.id,
        jours,
        forcer,
      });
      fenetre = r.fenetre;
      for (const l of r.logs ?? []) logs.push(l);
      if (r.brief) briefs.push(r.brief);
      releves += r.stats.releves;
      sansMatch += r.stats.sansMatch ?? 0;
      fallbackUrl += r.stats.fallbackUrl;
      fallbackCoherence += r.stats.fallbackCoherence;
      erreurs.push(...(r.stats.erreurs ?? []));
      eloLangue.appliques += r.eloLangue.appliques;
      eloLangue.ignores += r.eloLangue.ignores;
      eloLangue.deltas += r.eloLangue.deltas;
      eloLangue.hausses += r.eloLangue.hausses ?? 0;
      eloLangue.baisses += r.eloLangue.baisses ?? 0;
      eloCompteMaj += r.eloCompte.maj;
      pushLog(
        "ok",
        `[${i + 1}/${comptes.length}] @${c.handle ?? "?"} — OK`,
        `${r.stats.releves} stats · ${r.eloLangue.appliques} langue · ${r.eloCompte.maj} compte`,
      );
      onProgress?.({
        index: i + 1,
        total: comptes.length,
        compteId: c.id,
        handle: c.handle,
        phase: "done",
        logs: [...logs],
        briefPartial: fusionnerBriefs(jours, briefs, erreurs.length),
      });
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e);
      const detail = estTimeoutEdge(e)
        ? `${erreur} — compte sauté, on continue`
        : erreur;
      erreurs.push({ compteId: c.id, handle: c.handle, erreur: detail });
      pushLog("error", `[${i + 1}/${comptes.length}] @${c.handle ?? "?"} — échec`, detail);
      onProgress?.({
        index: i + 1,
        total: comptes.length,
        compteId: c.id,
        handle: c.handle,
        phase: "error",
        logs: [...logs],
        briefPartial: briefs.length ? fusionnerBriefs(jours, briefs, erreurs.length) : null,
        erreur: detail,
      });
    }
  }

  // Snapshot vues globales (Pilotage : courbe Δ j0−j1).
  try {
    pushLog("info", "Snapshot vues globales…");
    const snapRes = await lancerRattrapageElo({ snapshot: true });
    for (const l of snapRes.logs ?? []) logs.push(l);
    if (snapRes.snapshot) {
      pushLog(
        "ok",
        `Snapshot ${snapRes.snapshot.jour}`,
        `total ${snapRes.snapshot.vues_totales} · Δ ${snapRes.snapshot.vues_delta ?? "n/a"}`,
      );
    }
  } catch (e) {
    pushLog(
      "warn",
      "Snapshot vues globales échoué",
      e instanceof Error ? e.message : String(e),
    );
  }

  const brief = fusionnerBriefs(jours, briefs, erreurs.length);
  pushLog("ok", "Rattrapage terminé", brief.resume);

  return {
    ok: true,
    brief,
    logs,
    stats: {
      comptes: comptes.length,
      releves,
      fallbackUrl,
      fallbackCoherence,
      sansMatch,
      erreurs,
    },
    eloLangue,
    eloCompte: { maj: eloCompteMaj },
    fenetre,
  };
}

export const lancerAssignationContenu = (opts?: {
  compteId?: string;
  date?: string;
  forcer?: boolean;
}) =>
  invoke<{ ok: boolean; jour: string; resultats: unknown[] }>("assignation-contenu", {
    compteId: opts?.compteId ?? null,
    date: opts?.date ?? null,
    forcer: opts?.forcer ?? false,
  });

/** Drain variations v-next : un contenu gagnant → un remix. */
export const lancerVariations = (forcer = false) =>
  invoke<{ ok: boolean; idle?: boolean; contenuId?: string; parentId?: string; langue?: string }>(
    "variations",
    { forcer },
  );

/** Importe un slideshow depuis un lien TikTok collé à la main : scrape ce seul
 *  post et en fait un sujet, rattaché à un compte de référence (pour que ses
 *  visuels rejoignent la bonne bibliothèque). Le nettoyage et la composition
 *  suivent le cours normal ensuite. */
export const importerDepuisLien = (postUrl: string, compteReferenceId: string | null) =>
  invoke<{ ok: boolean; sujetId: string | null; reused: boolean; error?: string }>("extraction", {
    postUrl,
    compteReferenceId,
  });

/** Rentre un lien TikTok DIRECTEMENT dans le stock reproductible d'une source
 *  (le lien peut venir d'une autre source — il se range ici). On l'importe en le
 *  marquant « à garder » puis on déclenche sa préparation (nettoyage) ; il
 *  apparaît dans le stock une fois nettoyé. */
export async function ajouterLienAuStock(
  postUrl: string,
  compteReferenceId: string,
): Promise<{ sujetId: string | null; reused: boolean }> {
  const r = await invoke<{ ok: boolean; sujetId: string | null; reused: boolean; error?: string }>(
    "extraction",
    { postUrl, compteReferenceId, reproductible: true },
  );
  if (r.sujetId) await lancerPreparation(r.sujetId).catch(() => {});
  return { sujetId: r.sujetId, reused: r.reused };
}

/**
 * Assigne un TikTok précis à un créateur pour une date : on importe le lien (→
 * sujet, rattaché au compte de référence du créateur), puis on fabrique le post
 * pour ce créateur à cette date. Le nettoyage/traduction/Sophia suivent tout
 * seuls (le post attend la préparation avant de se composer).
 */
export async function assignerTikTok(input: {
  url: string;
  compteId: string;
  type?: string;
  date?: string;
  estTest?: boolean;
}): Promise<{ postId: string; reused: boolean }> {
  const { data: compte } = await supabase
    .from("comptes")
    .select("compte_reference_id")
    .eq("id", input.compteId)
    .single();

  const imp = await importerDepuisLien(input.url.trim(), compte?.compte_reference_id ?? null);
  if (!imp.sujetId) throw new Error(imp.error ?? "Aucun post photo trouvé à ce lien.");

  // On crée juste la COQUILLE du post et on rend la main TOUT DE SUITE. Le
  // nettoyage puis la composition (Sophia) sont ensuite PILOTÉS depuis la page du
  // post — progression visible, substitution d'image possible, et REPRISE si
  // l'onglet a dormi. Avant, tout se jouait dans ce seul appel de plusieurs
  // minutes : dès que l'ordi se mettait en veille, le test mourait sans trace.
  const post = await lancerComposition({
    compteId: input.compteId,
    sujetId: imp.sujetId,
    type: input.type,
    date: input.date,
    estTest: input.estTest,
  });
  return { postId: post.postId, reused: imp.reused };
}

export const lancerAssignation = (
  compteId?: string,
  type?: string,
  /** Mode test : crée un post même si le quota du jour est atteint. */
  forcer = false,
) =>
  invoke<{ resultats: Array<{ compteId: string; crees: number; types?: string[] }> }>(
    "assignation",
    { compteId: compteId ?? null, type: type ?? null, forcer, manuel: true },
  );

/** Assignation du jour (v-next) : labels ∩ + score → passages (+ pont posts).
 *  Contourne la pause auto via `manuel`. Appelle `assignation` (cutover côté Edge
 *  — plus de recycle). Quota = posts_par_jour du compte (1–3). */
export const lancerAssignationJour = (date: string, compteId?: string) =>
  invoke<{
    ok?: boolean;
    jour: string;
    resultats: Array<{
      compteId: string;
      crees: number;
      passageIds?: string[];
      types?: string[];
      erreur?: string;
      raison?: string;
    }>;
    saute?: boolean;
    raison?: string;
  }>("assignation", {
    date,
    manuel: true,
    compteId: compteId ?? null,
  });

export type AssignationTestResultat = {
  ok?: boolean;
  jour: string;
  test?: boolean;
  resultats: Array<{
    compteId: string;
    crees: number;
    passageIds?: string[];
    erreur?: string;
    raison?: string;
  }>;
};

export type AssignationTestLog = {
  at: string;
  detail: string;
  statut?: string;
};

/**
 * Assignation test UN compte — NDJSON streamé (évite idle Edge 150s) + logs.
 * Face swap / deck peuvent durer plusieurs minutes.
 */
export async function lancerAssignationTestCompte(
  date: string,
  compteId: string,
  onLog?: (ligne: AssignationTestLog) => void,
): Promise<AssignationTestResultat> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch(`${url}/functions/v1/assignation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      date,
      compteId,
      manuel: true,
      test: true,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    let message = `Edge assignation ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) message = j.error;
    } catch {
      // ignore
    }
    if (/idle timeout|150s/i.test(message)) {
      message =
        "Timeout Edge (150s) — relance le test (stream NDJSON requis pour UGC / deck).";
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dernier: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lignes = buffer.split("\n");
    buffer = lignes.pop() ?? "";
    for (const ligne of lignes) {
      const trim = ligne.trim();
      if (!trim) continue;
      try {
        const ev = JSON.parse(trim) as Record<string, unknown>;
        dernier = ev;
        const detail = typeof ev.detail === "string" ? ev.detail : "";
        if (detail) {
          onLog?.({
            at: typeof ev.at === "string" ? ev.at : new Date().toISOString(),
            detail,
            statut: typeof ev.statut === "string" ? ev.statut : undefined,
          });
        }
        if (ev.statut === "echec" && ev.etape !== "ready" && detail) {
          // échec partiel loggé — le ready final tranche
        }
      } catch {
        // ligne partielle
      }
    }
  }

  if (!dernier) throw new Error("Assignation test : aucune réponse stream");

  if (dernier.etape === "ready" && dernier.ok === false) {
    throw new Error(
      typeof dernier.error === "string"
        ? dernier.error
        : typeof dernier.detail === "string"
          ? dernier.detail
          : "Assignation test échouée",
    );
  }

  if (dernier.statut === "echec" && !Array.isArray(dernier.resultats)) {
    throw new Error(
      typeof dernier.detail === "string" ? dernier.detail : "Assignation test échouée",
    );
  }

  return {
    ok: true,
    jour: String(dernier.jour ?? date),
    test: true,
    resultats: Array.isArray(dernier.resultats)
      ? (dernier.resultats as AssignationTestResultat["resultats"])
      : [],
  };
}

/** Rollback assignation test (compte + jour) — posts/passages/médias UGC swap. */
export const annulerAssignationTestCompte = (date: string, compteId: string) =>
  invoke<{
    ok: boolean;
    jour: string;
    compteId: string;
    posts: number;
    passages: number;
    medias: number;
  }>("assignation", {
    action: "annuler_test",
    date,
    compteId,
  });

export interface UgcVideoPostTest {
  id: string;
  statut: string;
  caption: string | null;
  video_finale_url: string | null;
  image_ref_url: string | null;
  pipeline_erreur: string | null;
  reaction_id: string;
  utilisation_id: string;
}

/** Assignation UGC AI VIDEO test (1 créateur) — stream NDJSON + logs exacts. */
export async function lancerAssignationUgcVideoTest(
  date: string,
  compteId: string,
  onLog?: (ligne: AssignationTestLog) => void,
): Promise<{
  ok: boolean;
  jour: string;
  crees: number;
  resultats: Array<{
    compteId: string;
    crees: number;
    postIds?: string[];
    erreur?: string;
    raison?: string;
  }>;
}> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch(`${url}/functions/v1/assignation-ugc-video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      date,
      compteId,
      manuel: true,
      test: true,
      stream: true,
      ignorerWarmup: true,
    }),
  });

  if (!res.ok || !res.body) {
    let message = `Edge assignation-ugc-video ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) message = j.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dernier: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lignes = buffer.split("\n");
    buffer = lignes.pop() ?? "";
    for (const ligne of lignes) {
      const trim = ligne.trim();
      if (!trim) continue;
      try {
        const ev = JSON.parse(trim) as Record<string, unknown>;
        dernier = ev;
        const detail = typeof ev.detail === "string" ? ev.detail : "";
        if (detail) {
          onLog?.({
            at: typeof ev.at === "string" ? ev.at : new Date().toISOString(),
            detail,
            statut: typeof ev.statut === "string" ? ev.statut : undefined,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  if (!dernier) throw new Error("Assignation UGC VIDEO : aucune réponse stream");
  if (dernier.ok === false) {
    throw new Error(
      typeof dernier.error === "string"
        ? dernier.error
        : typeof dernier.detail === "string"
          ? dernier.detail
          : "Assignation UGC VIDEO échouée",
    );
  }

  return {
    ok: true,
    jour: String(dernier.jour ?? date),
    crees: Number(dernier.crees ?? 0),
    resultats: Array.isArray(dernier.resultats)
      ? (dernier.resultats as Array<{
          compteId: string;
          crees: number;
          postIds?: string[];
          erreur?: string;
          raison?: string;
        }>)
      : [],
  };
}

export const annulerAssignationUgcVideoTest = (date: string, compteId: string) =>
  invoke<{ ok: boolean; jour: string; compteId: string; posts: number }>(
    "assignation-ugc-video",
    { action: "annuler_test", date, compteId },
  );

export async function listerUgcVideoPostsTest(
  compteId: string,
  date: string,
): Promise<UgcVideoPostTest[]> {
  const { data, error } = await supabase
    .from("ugc_video_posts")
    .select(
      "id, statut, caption, video_finale_url, image_ref_url, pipeline_erreur, reaction_id, utilisation_id",
    )
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", date)
    .eq("est_test", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UgcVideoPostTest[];
}

export type AssignationJourResultat = Awaited<ReturnType<typeof lancerAssignationJour>>;

/**
 * Assignation compte-par-compte (évite timeout Edge 150s sur Relancer).
 * Continue même si un compte échoue / timeout.
 * Skip les comptes déjà au quota ; retry les « Failed to send… » (réseau).
 */
export async function lancerAssignationJourLive(
  date: string,
  opts?: {
    onProgress?: (p: {
      index: number;
      total: number;
      compteId: string;
      nom: string;
    }) => void;
  },
): Promise<AssignationJourResultat> {
  const lignes = await suiviAssignation(date);
  const aFaire = lignes.filter((l) => l.posts.length < l.quota);
  const resultats: AssignationJourResultat["resultats"] = [];

  for (let i = 0; i < aFaire.length; i++) {
    const l = aFaire[i]!;
    opts?.onProgress?.({
      index: i + 1,
      total: aFaire.length,
      compteId: l.compteId,
      nom: l.nom,
    });

    let dernierErr: unknown = null;
    let ok = false;
    for (let essai = 0; essai < 3 && !ok; essai++) {
      try {
        if (essai > 0) await sleepMs(1500 * essai);
        const r = await lancerAssignationJour(date, l.compteId);
        resultats.push(...(r.resultats ?? []));
        ok = true;
      } catch (e) {
        dernierErr = e;
        // Retry seulement les échecs réseau / gateway ; le reste saute.
        if (!estFetchEdgeEchoue(e) && !estTimeoutEdge(e)) break;
      }
    }
    if (!ok) {
      const erreur = dernierErr instanceof Error ? dernierErr.message : String(dernierErr);
      resultats.push({
        compteId: l.compteId,
        crees: 0,
        erreur: estTimeoutEdge(dernierErr) || estFetchEdgeEchoue(dernierErr)
          ? `${erreur} — compte sauté après retry`
          : erreur,
      });
    }
  }

  return { ok: true, jour: date, resultats };
}

/** Une ligne de suivi « minuit » : un compte actif, son quota du jour, et les
 *  passages / posts réellement produits ce jour-là. */
export interface SuiviMinuit {
  compteId: string;
  nom: string;
  handle: string | null;
  avatar_url: string | null;
  langue: string;
  quota: number;
  posts: Array<{
    id: string;
    passage_id: string | null;
    type: Post["type"];
    statut: string;
    pipeline_statut: string;
    pipeline_etape: string | null;
    pipeline_erreur: string | null;
  }>;
}

/** État de l'assignation d'une date, compte par compte : passages v-next
 *  (source de vérité), avec le post pont pour l'ouverture admin / poster. */
export async function suiviAssignation(date: string): Promise<SuiviMinuit[]> {
  const [comptesRes, passagesRes, postsRes, regRes] = await Promise.all([
    supabase
      .from("comptes")
      .select(
        "id, persona_nom, handle_tiktok, avatar_url, langue, posts_par_jour, warmup_started_at, warmup_ends_at",
      )
      .eq("is_active", true)
      .order("persona_nom", { nullsFirst: false }),
    supabase
      .from("passages")
      .select("id, compte_id, post_id, statut")
      .eq("date_publication_prevue", date)
      .order("created_at"),
    supabase
      .from("posts")
      .select("id, compte_id, type, statut, pipeline_statut, pipeline_etape, pipeline_erreur")
      .eq("date_publication_prevue", date)
      .eq("est_test", false)
      .eq("type", "contenu")
      .order("created_at"),
    supabase.from("reglages").select("valeur").eq("cle", "frequence").maybeSingle(),
  ]);
  if (comptesRes.error) throw comptesRes.error;
  if (passagesRes.error) throw passagesRes.error;
  if (postsRes.error) throw postsRes.error;

  const quotaGlobal =
    (regRes.data?.valeur as { posts_par_jour?: number } | null)?.posts_par_jour ?? 1;

  const postsById = new Map(
    (postsRes.data ?? []).map((p) => [p.id as string, p]),
  );

  const parCompte = new Map<string, SuiviMinuit["posts"]>();
  for (const pas of passagesRes.data ?? []) {
    const post = pas.post_id ? postsById.get(pas.post_id as string) : undefined;
    const liste = parCompte.get(pas.compte_id as string) ?? [];
    liste.push({
      id: (pas.post_id as string | null) ?? (pas.id as string),
      passage_id: pas.id as string,
      type: "contenu",
      statut: (post?.statut as string) ?? (pas.statut as string),
      pipeline_statut: (post?.pipeline_statut as string) ?? "done",
      pipeline_etape: (post?.pipeline_etape as string | null) ?? null,
      pipeline_erreur: (post?.pipeline_erreur as string | null) ?? null,
    });
    parCompte.set(pas.compte_id as string, liste);
  }

  // deno-lint-ignore no-explicit-any
  return (comptesRes.data ?? [])
    .filter((c: any) =>
      compteEnProcessus({
        warmup_started_at: c.warmup_started_at,
        warmup_ends_at: c.warmup_ends_at,
      }),
    )
    .map((c: any) => ({
      compteId: c.id,
      nom: c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8),
      handle: c.handle_tiktok,
      avatar_url: c.avatar_url,
      langue: c.langue,
      quota: c.posts_par_jour ?? quotaGlobal,
      posts: parCompte.get(c.id) ?? [],
    }));
}

/** Un pas de fabrication pour un post précis (avance le pipeline d'une étape). */
export const avancerUnPost = (postId: string) =>
  invoke<{ ok: boolean; etape?: string }>("composition", { postId });

/** Révoque un post inutilisable (rejette son sujet) et en refait un autre pour le
 *  même créateur + date. Renvoie l'id du nouveau post (à faire avancer ensuite).
 *  Côté créateur : max 2 recharges, fabrication avancée jusqu'à done. */
export const revoquerPost = (postId: string) =>
  invoke<{
    ok: boolean;
    newPostId: string | null;
    recharges_createur?: number;
    restantes?: number;
    error?: string;
  }>("revoquer-post", { postId });

/** Alias créateur : même Edge, contrôles ownership + quota côté serveur. */
export const rechargerPostCreateur = revoquerPost;

/** Les posts d'une date donnée avec leur avancement, pour suivre en direct la
 *  simulation de minuit. */
export async function postsDuJour(date: string): Promise<
  Array<{ id: string; statut: string; nom: string }>
> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, pipeline_statut, comptes(persona_nom, handle_tiktok)")
    .eq("date_publication_prevue", date)
    .eq("est_test", false)
    .order("created_at");
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    statut: p.pipeline_statut,
    nom: p.comptes?.persona_nom ?? p.comptes?.handle_tiktok ?? p.id.slice(0, 8),
  }));
}

export interface PostTest {
  id: string;
  titre: string | null;
  persona: string | null;
  pipeline_statut: string;
  created_at: string;
}

/** Les posts de TEST récents (invisibles sur les calendriers) — pour les
 *  retrouver après coup au lieu de perdre leur lien. */
export async function listerPostsTest(): Promise<PostTest[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, pipeline_statut, created_at, comptes(persona_nom), sujets(titre)")
    .eq("est_test", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    titre: p.sujets?.titre ?? null,
    persona: p.comptes?.persona_nom ?? null,
    pipeline_statut: p.pipeline_statut,
    created_at: p.created_at,
  }));
}

/** Posts test d'un compte pour un jour (après assignation test / avant rollback). */
export async function listerPostsTestCompte(
  compteId: string,
  date: string,
): Promise<Array<{ id: string; pipeline_statut: string }>> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, pipeline_statut")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", date)
    .eq("est_test", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    pipeline_statut: p.pipeline_statut as string,
  }));
}

export const genererPersona = (compteId: string, appliquer = false) =>
  invoke<{ pseudos: string[]; bio: string; avatarUrl: string | null; applique: boolean }>(
    "persona",
    { compteId, appliquer },
  );

export const lancerMetriques = (compteId?: string) =>
  invoke<{ resultats: Array<{ compteId: string; releves: number }> }>("metriques", {
    compteId: compteId ?? null,
  });

/** Répare les liens musique périmés (re-scrape des sons pour un lien stable). */
export const reparerMusique = () =>
  invoke<{ ok: boolean; examines: number; corriges: number; echecs: number }>(
    "backfill-musique",
    {},
  );

export const lancerComposition = (input: {
  compteId: string;
  sujetId: string;
  type?: string;
  date?: string;
  estTest?: boolean;
}) => invoke<{ postId: string }>("composition", input);

export interface PostScrapeTest {
  url: string;
  texte: string;
  photos: number;
  vues: number;
  likes: number;
  estPhoto: boolean;
  dejaVu: boolean;
  pertinence: number;
  raison: string;
  sophia: boolean;
}

/** Teste la traduction d'un texte vers une langue (même prompt que le moteur),
 *  sans fabriquer de post. Sert à régler les prompts de traduction. */
export const testerTraduction = (texte: string, langue: string) =>
  invoke<{ ok: boolean; traduction: string }>("traduire-test", { texte, langue });

/** Teste le scrape d'un compte de référence : renvoie ses posts avec leurs vues
 *  (triés par vues), SANS rien créer — pour vérifier que le moteur repère bien
 *  les TikToks qui performent. */
export const testerScrape = (compteReferenceId: string) =>
  invoke<{ ok: boolean; handle: string; posts: PostScrapeTest[]; error?: string }>("extraction", {
    testScrape: compteReferenceId,
  });

// --- Labels / contenus v-next ------------------------------------------------

function slugify(nom: string): string {
  return (
    nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "label"
  );
}

export async function listerLabels(): Promise<Label[]> {
  const { data, error } = await supabase.from("labels").select("*").order("nom");
  if (error) throw error;
  return data as Label[];
}

/** Labels qui ont au moins un slideshow `ugc_compatible` (file UGC admin). */
export async function listerLabelIdsAvecUgc(): Promise<string[]> {
  const { data, error } = await supabase
    .from("contenu_labels")
    .select("label_id, contenus!inner(ugc_compatible)")
    .eq("contenus.ugc_compatible", true);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.label_id as string).filter(Boolean))];
}

export async function creerLabel(
  nom: string,
  couleur?: string | null,
  opts?: { ugc_ai_video?: boolean },
): Promise<Label> {
  const base = slugify(nom);
  let slug = base;
  for (let i = 0; i < 5; i += 1) {
    const { data, error } = await supabase
      .from("labels")
      .insert({
        nom: nom.trim(),
        slug,
        couleur: couleur ?? null,
        ugc_ai_video: Boolean(opts?.ugc_ai_video),
      })
      .select()
      .single();
    if (!error && data) return data as Label;
    if (error?.code !== "23505") throw error;
    slug = `${base}-${i + 2}`;
  }
  throw new Error("Impossible de créer le label (slug pris)");
}

export async function majLabel(
  id: string,
  patch: { nom?: string; couleur?: string | null; ugc_ai_video?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.nom) body.slug = slugify(patch.nom);
  const { error } = await supabase.from("labels").update(body).eq("id", id);
  if (error) throw error;
}

export async function supprimerLabel(id: string): Promise<void> {
  const { data: lab } = await supabase
    .from("labels")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  if (lab?.slug === "ugc-ai-video") {
    throw new Error("LABEL_MARQUE_PROTEGE");
  }
  const { error } = await supabase.from("labels").delete().eq("id", id);
  if (error) throw error;
}

/** Labels du pool UGC AI VIDEO (optionnellement hors marque système). */
export async function listerLabelsUgcAiVideo(opts?: {
  inclureMarque?: boolean;
}): Promise<Label[]> {
  const tous = await listerLabels();
  return tous.filter(
    (l) =>
      l.ugc_ai_video &&
      (opts?.inclureMarque || l.slug !== "ugc-ai-video"),
  );
}

export async function labelsDuHmUgcVideo(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("hm_ugc_video_labels")
    .select("label_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((r) => r.label_id as string);
}

/** Remplace les labels thématiques UGC AI VIDEO d’un HM. */
export async function setLabelsHmUgcVideo(
  profileId: string,
  labelIds: string[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("hm_ugc_video_labels")
    .delete()
    .eq("profile_id", profileId);
  if (delErr) throw delErr;
  const uniques = [...new Set(labelIds.filter(Boolean))];
  if (uniques.length === 0) return;
  const { error } = await supabase.from("hm_ugc_video_labels").insert(
    uniques.map((label_id) => ({ profile_id: profileId, label_id })),
  );
  if (error) throw error;
}

export async function labelsDuCompte(compteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("compte_labels")
    .select("label_id")
    .eq("compte_id", compteId);
  if (error) throw error;
  return (data ?? []).map((r) => r.label_id as string);
}

/** Labels de plusieurs comptes (pour afficher sur la liste posters). */
export async function labelsDesComptes(
  compteIds: string[],
): Promise<Map<string, Label[]>> {
  const out = new Map<string, Label[]>();
  if (compteIds.length === 0) return out;
  const { data, error } = await supabase
    .from("compte_labels")
    .select("compte_id, labels(*)")
    .in("compte_id", compteIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const r = row as unknown as { compte_id: string; labels: Label | null };
    if (!r.labels) continue;
    const list = out.get(r.compte_id) ?? [];
    list.push(r.labels);
    out.set(r.compte_id, list);
  }
  return out;
}

export async function labelsDeLaSource(compteReferenceId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("compte_reference_labels")
    .select("label_id")
    .eq("compte_reference_id", compteReferenceId);
  if (error) throw error;
  return (data ?? []).map((r) => r.label_id as string);
}

export async function labelsDuContenu(contenuId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", contenuId);
  if (error) throw error;
  return (data ?? []).map((r) => r.label_id as string);
}

async function syncLabels(
  table: "compte_labels" | "compte_reference_labels" | "contenu_labels",
  fk: string,
  fkValue: string,
  labelIds: string[],
): Promise<void> {
  const { error: delErr } = await supabase.from(table).delete().eq(fk, fkValue);
  if (delErr) throw delErr;
  if (labelIds.length === 0) return;
  const rows = labelIds.map((label_id) => ({ [fk]: fkValue, label_id }));
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

export const setLabelsCompte = (compteId: string, labelIds: string[]) =>
  syncLabels("compte_labels", "compte_id", compteId, labelIds);

/** Écrit les labels de la source puis les propage à tous ses slideshows + images. */
export async function setLabelsSource(
  compteReferenceId: string,
  labelIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("set_labels_source", {
    p_compte_reference_id: compteReferenceId,
    p_label_ids: labelIds,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function setLabelsContenu(
  contenuId: string,
  labelIds: string[],
): Promise<void> {
  await syncLabels("contenu_labels", "contenu_id", contenuId, labelIds);
  // Propager aux images de la bibliothèque liées à ce slideshow.
  const { data: medias } = await supabase
    .from("media_library")
    .select("id")
    .eq("contenu_id", contenuId);
  const mediaIds = (medias ?? []).map((m) => m.id as string);
  if (mediaIds.length === 0) return;
  await supabase.from("media_labels").delete().in("media_id", mediaIds);
  if (labelIds.length === 0) return;
  const rows = mediaIds.flatMap((media_id) =>
    labelIds.map((label_id) => ({ media_id, label_id })),
  );
  const { error } = await supabase.from("media_labels").insert(rows);
  if (error) throw error;
}

/** Applique rétroactivement les labels d'une source à tous ses contenus + images. */
export async function propagerLabelsSource(compteReferenceId: string): Promise<number> {
  const { data, error } = await supabase.rpc("propager_labels_source", {
    p_compte_reference_id: compteReferenceId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export interface ContenuListe extends Contenu {
  labels?: Label[];
  scores?: Array<{ langue: string; score: number; nb_passages: number }>;
  /** Nombre de passages / posts assignés sur ce slideshow. */
  nb_posts?: number;
  /** URL des visuels nettoyés indexés par media_id. */
  mediaUrls?: Record<string, string>;
  /** visage_premier_plan par media_id (scan UGC). */
  mediaVisages?: Record<string, boolean | null>;
}

async function metasMediasPropres(
  contenus: Contenu[],
): Promise<{
  urls: Record<string, string>;
  visages: Record<string, boolean | null>;
}> {
  const mediaIds = [
    ...new Set(
      contenus.flatMap((c) =>
        ((c.structure_slides ?? []) as Contenu["structure_slides"])
          .map((s) => s.media_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  if (mediaIds.length === 0) return { urls: {}, visages: {} };
  // Uniquement storage propre/ — jamais le brut TikTok (même si texte_restant
  // est flagué : c'est encore le JPEG Fal, pas le raw).
  const { data } = await supabase
    .from("media_library")
    .select("id, url, storage_path, visage_premier_plan")
    .in("id", mediaIds);
  const urls: Record<string, string> = {};
  const visages: Record<string, boolean | null> = {};
  for (const m of data ?? []) {
    const path = (m.storage_path as string) ?? "";
    const id = m.id as string;
    if (path.startsWith("propre/")) {
      urls[id] = m.url as string;
    }
    visages[id] = (m.visage_premier_plan as boolean | null) ?? null;
  }
  return { urls, visages };
}

export async function listerContenus(opts?: {
  statut?: string;
  limit?: number;
}): Promise<ContenuListe[]> {
  let q = supabase
    .from("contenus")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 80);
  if (opts?.statut) q = q.eq("statut", opts.statut);
  const { data, error } = await q;
  if (error) throw error;
  const contenus = (data ?? []) as Contenu[];
  if (contenus.length === 0) return [];

  const ids = contenus.map((c) => c.id);
  const [{ data: liens }, { data: scores }, { data: passages }, metas] =
    await Promise.all([
      supabase
        .from("contenu_labels")
        .select("contenu_id, label_id, labels(*)")
        .in("contenu_id", ids),
      supabase
        .from("contenu_langues")
        .select("contenu_id, langue, score, nb_passages")
        .in("contenu_id", ids),
      supabase.from("passages").select("contenu_id").in("contenu_id", ids),
      metasMediasPropres(contenus),
    ]);

  const labelsPar = new Map<string, Label[]>();
  for (const l of liens ?? []) {
    const row = l as unknown as { contenu_id: string; labels: Label | null };
    if (!row.labels) continue;
    const list = labelsPar.get(row.contenu_id) ?? [];
    list.push(row.labels);
    labelsPar.set(row.contenu_id, list);
  }
  const scoresPar = new Map<string, NonNullable<ContenuListe["scores"]>>();
  for (const s of scores ?? []) {
    const list = scoresPar.get(s.contenu_id) ?? [];
    list.push({ langue: s.langue, score: s.score, nb_passages: s.nb_passages });
    scoresPar.set(s.contenu_id, list);
  }
  const postsPar = new Map<string, number>();
  for (const p of passages ?? []) {
    const cid = p.contenu_id as string;
    postsPar.set(cid, (postsPar.get(cid) ?? 0) + 1);
  }

  return contenus.map((c) => {
    const idsContenu = new Set(
      (c.structure_slides ?? [])
        .map((s) => s.media_id)
        .filter((id): id is string => Boolean(id)),
    );
    const urls: Record<string, string> = {};
    const visages: Record<string, boolean | null> = {};
    for (const mid of idsContenu) {
      if (metas.urls[mid]) urls[mid] = metas.urls[mid];
      if (mid in metas.visages) visages[mid] = metas.visages[mid];
    }
    return {
      ...c,
      ugc_compatible: Boolean((c as Contenu).ugc_compatible),
      labels: labelsPar.get(c.id) ?? [],
      scores: scoresPar.get(c.id) ?? [],
      nb_posts: postsPar.get(c.id) ?? 0,
      mediaUrls: urls,
      mediaVisages: visages,
    };
  });
}

export interface SlideshowDetail extends ContenuListe {
  langues: ContenuLangue[];
  passages: Array<
    Passage & {
      comptes?: { handle_tiktok: string | null; persona_nom: string | null; langue: string } | null;
    }
  >;
  source?: { handle_tiktok: string } | null;
}

/**
 * Supprime un slideshow (`contenus`) et son entourage :
 * posts pontés via passages, médias liés, puis la ligne (cascade labels /
 * langues / passages). Réservé admin (RLS).
 */
export async function supprimerContenu(id: string): Promise<void> {
  const { data: contenu, error: errC } = await supabase
    .from("contenus")
    .select("id, structure_slides")
    .eq("id", id)
    .maybeSingle();
  if (errC) throw errC;
  if (!contenu) throw new Error("Slideshow introuvable");

  const { data: passages, error: errP } = await supabase
    .from("passages")
    .select("post_id")
    .eq("contenu_id", id);
  if (errP) throw errP;
  const postIds = [
    ...new Set(
      (passages ?? [])
        .map((p) => p.post_id as string | null)
        .filter((pid): pid is string => Boolean(pid)),
    ),
  ];
  if (postIds.length > 0) {
    const { error } = await supabase.from("posts").delete().in("id", postIds);
    if (error) throw error;
  }

  const mediaIds = new Set<string>();
  const slides = (contenu.structure_slides ?? []) as Array<{ media_id?: string | null }>;
  for (const s of slides) {
    if (s.media_id) mediaIds.add(s.media_id);
  }
  const { data: mediasContenu } = await supabase
    .from("media_library")
    .select("id, storage_path")
    .eq("contenu_id", id);
  for (const m of mediasContenu ?? []) {
    mediaIds.add(m.id as string);
  }

  if (mediaIds.size > 0) {
    const ids = [...mediaIds];
    const { data: medias } = await supabase
      .from("media_library")
      .select("id, storage_path")
      .in("id", ids);
    const paths = (medias ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      await supabase.storage.from("medias").remove(paths);
    }
    const { error: errM } = await supabase.from("media_library").delete().in("id", ids);
    if (errM) throw errM;
  }

  const { error } = await supabase.from("contenus").delete().eq("id", id);
  if (error) throw error;
}

/** Détail d'un slideshow importé : decks propres/traduits, ELO, passages. */
export async function lireSlideshow(id: string): Promise<SlideshowDetail | null> {
  const { data: contenu, error } = await supabase.from("contenus").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!contenu) return null;

  const [{ data: langues }, { data: passages }, { data: liens }, metas] = await Promise.all([
    supabase
      .from("contenu_langues")
      .select("*")
      .eq("contenu_id", id)
      .order("score", { ascending: false }),
    supabase
      .from("passages")
      .select("*, comptes(handle_tiktok, persona_nom, langue)")
      .eq("contenu_id", id)
      .order("date_publication_prevue", { ascending: false }),
    supabase.from("contenu_labels").select("label_id, labels(*)").eq("contenu_id", id),
    metasMediasPropres([contenu as Contenu]),
  ]);

  let source: { handle_tiktok: string } | null = null;
  if (contenu.compte_reference_id) {
    const { data: ref } = await supabase
      .from("comptes_reference")
      .select("handle_tiktok")
      .eq("id", contenu.compte_reference_id)
      .maybeSingle();
    source = ref;
  }

  const labels: Label[] = [];
  for (const l of liens ?? []) {
    const row = l as unknown as { labels: Label | null };
    if (row.labels) labels.push(row.labels);
  }

  const c = contenu as Contenu;
  return {
    ...c,
    ugc_compatible: Boolean(c.ugc_compatible),
    labels,
    mediaUrls: metas.urls,
    mediaVisages: metas.visages,
    scores: (langues ?? []).map((l) => ({
      langue: l.langue,
      score: l.score,
      nb_passages: l.nb_passages,
    })),
    langues: (langues ?? []) as ContenuLangue[],
    passages: (passages ?? []) as SlideshowDetail["passages"],
    source,
  };
}

/** IDs médias (propre) d'un slideshow via structure_slides. */
export function mediaIdsDepuisSlides(
  structure: Contenu["structure_slides"] | null | undefined,
): string[] {
  return [
    ...new Set(
      ((structure ?? []) as ContenuSlide[])
        .map((s) => s.media_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export async function setContenuUgcCompatible(
  contenuId: string,
  ugc: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("contenus")
    .update({ ugc_compatible: ugc })
    .eq("id", contenuId);
  if (error) throw error;
}

/** Ids des slideshows d'un compte référence. */
export async function idsContenusParCompte(
  compteReferenceId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("contenus")
    .select("id")
    .eq("compte_reference_id", compteReferenceId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

/** Ids des slideshows portant un label. */
export async function idsContenusParLabel(labelId: string): Promise<string[]> {
  const { data: liens, error: errL } = await supabase
    .from("contenu_labels")
    .select("contenu_id")
    .eq("label_id", labelId);
  if (errL) throw errL;
  return [...new Set((liens ?? []).map((l) => l.contenu_id as string))];
}

/** Marque UGC tous les slideshows d'un compte référence. Renvoie les ids. */
export async function marquerUgcParCompte(
  compteReferenceId: string,
  ugc = true,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("contenus")
    .update({ ugc_compatible: ugc })
    .eq("compte_reference_id", compteReferenceId)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

/** Marque UGC tous les slideshows portant un label. Renvoie les ids. */
export async function marquerUgcParLabel(
  labelId: string,
  ugc = true,
): Promise<string[]> {
  const ids = await idsContenusParLabel(labelId);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("contenus")
    .update({ ugc_compatible: ugc })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

/** Collecte les media_id uniques des slideshows donnés. */
export async function collecterMediaIdsContenus(
  contenuIds: string[],
): Promise<string[]> {
  if (contenuIds.length === 0) return [];
  const { data, error } = await supabase
    .from("contenus")
    .select("structure_slides")
    .in("id", contenuIds);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const id of mediaIdsDepuisSlides(
      row.structure_slides as Contenu["structure_slides"],
    )) {
      set.add(id);
    }
  }
  return [...set];
}

/** Scan vision UGC d'un média (Edge fal openrouter/router/vision). */
export async function scannerVisageUgcMedia(
  mediaId: string,
): Promise<{ visage_premier_plan: boolean; model?: string }> {
  const r = await invoke<{
    ok?: boolean;
    visage_premier_plan?: boolean;
    model?: string;
    error?: string;
  }>("scan-visage-ugc", { action: "scan_media", media_id: mediaId });
  if (r?.error) throw new Error(r.error);
  if (typeof r.visage_premier_plan !== "boolean") {
    throw new Error("Réponse scan-visage-ugc invalide");
  }
  return { visage_premier_plan: r.visage_premier_plan, model: r.model };
}

/** Correction manuelle du flag visage premier plan. */
export async function majVisagePremierPlan(
  mediaId: string,
  valeur: boolean | null,
): Promise<void> {
  const { error } = await supabase
    .from("media_library")
    .update({ visage_premier_plan: valeur })
    .eq("id", mediaId);
  if (error) throw error;
}

/** Coût mensuel = base + posts_par_jour × unitaire. */
export function coutMensuelCalcule(
  postsParJour: number,
  paiement: { tarif_base_mensuel: number; tarif_par_post_jour: number },
): number {
  return paiement.tarif_base_mensuel + postsParJour * paiement.tarif_par_post_jour;
}
