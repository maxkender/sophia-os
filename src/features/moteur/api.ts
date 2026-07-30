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

export type { EloImportRapport };

/** Date du jour en YYYY-MM-DD, en heure locale — le poster raisonne sur sa
 *  journée, pas sur celle de Greenwich. */
export function aujourdhui(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Sur une réponse non-2xx, supabase renvoie un message générique
    // (« Edge Function returned a non-2xx status code ») : on va lire le vrai
    // message dans le corps de la réponse pour l'afficher tel quel.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corps = await ctx.json();
        if (corps?.error) message = corps.error as string;
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

/** Clamp le quota poster à 1–3 avant écriture. */
function normaliserPostsParJour(n: number): number {
  if (!Number.isFinite(n)) return 1;
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
      "id, prenom, nom, email, langues, nationalite, upwork_url, manager_id, is_active, must_change_password, cout_mensuel",
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
    .select("id, poster_id, handle_tiktok, persona_nom, persona_bio, avatar_url, comptes_reference(handle_tiktok)")
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
      role: (parUtilisateur.get(p.id) ?? null) as PosterProfil["role"],
      compte_id: compte?.id ?? null,
      handle_tiktok: compte?.handle_tiktok ?? null,
      reference_handle: referenceParPoster.get(p.id) ?? null,
      persona_nom: compte?.persona_nom ?? null,
      persona_bio: compte?.persona_bio ?? null,
      avatar_url: compte?.avatar_url ?? null,
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

/** Crée directement un recruteur (hiring manager) par son nom + sa langue
 *  (admin). Son espace est prêt à sa première connexion. */
export function creerRecruteur(input: { prenom: string; nom: string; langue?: string }) {
  return invoke<{ userId: string; email: string }>("manage-users", {
    action: "create",
    role: "hiring_manager",
    prenom: input.prenom,
    nom: input.nom,
    password: "12345678",
    langue: input.langue,
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
  persona_nom: string | null;
  persona_bio: string | null;
  handle_tiktok: string | null;
  avatar_url: string | null;
  langue: string;
}

/** Le compte de publication du poster connecté : son identité TikTok (pseudo,
 *  bio, avatar), générée automatiquement à la création. La RLS ne renvoie que
 *  sa propre ligne. */
export async function monCompte(): Promise<MonCompte | null> {
  const { data, error } = await supabase
    .from("comptes")
    .select("persona_nom, persona_bio, handle_tiktok, avatar_url, langue")
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
}) {
  return invoke<{
    userId: string;
    email: string;
    compte: { id: string; reference: string | null; persona: boolean } | null;
  }>("manage-users", {
    action: "create",
    ...input,
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
 *  un utilisateur a un seul rôle à la fois dans notre modèle. La `nationalite`,
 *  quand elle est fournie (promotion en recruteur), sert de langue par défaut à
 *  la création de posters. */
export async function definirRole(
  userId: string,
  role: Role,
  nationalite?: string,
): Promise<void> {
  const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (error) throw error;
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

const CHUNK_IDS = 80;

async function mediasPropresParIds(ids: string[]): Promise<Media[]> {
  if (ids.length === 0) return [];
  const out: Media[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_IDS) {
    const chunk = ids.slice(i, i + CHUNK_IDS);
    const { data, error } = await supabase
      .from("media_library")
      .select("*")
      .like("storage_path", "propre/%")
      .in("id", chunk)
      .order("created_at", { ascending: false });
    if (error) throw error;
    out.push(...((data ?? []) as Media[]));
  }
  return out;
}

/**
 * Bibliothèque groupée par label (source de vérité = media_labels).
 * Plus de plafond « 500 derniers » qui faisait ressembler le tri à un tri par compte.
 */
export async function listerBibliothequeParLabels(
  labelId?: string,
): Promise<GroupeBiblio[]> {
  const { data: rowsLabels, error: errLabels } = await supabase
    .from("labels")
    .select("*")
    .order("nom");
  if (errLabels) throw errLabels;
  const labels = (rowsLabels ?? []) as Label[];
  const cibles = labelId ? labels.filter((l) => l.id === labelId) : labels;

  const bruts = await Promise.all(
    cibles.map(async (label): Promise<GroupeBiblio | null> => {
      const { data: liens, error } = await supabase
        .from("media_labels")
        .select("media_id")
        .eq("label_id", label.id);
      if (error) throw error;
      const ids = [...new Set((liens ?? []).map((r) => r.media_id as string))];
      const medias = await mediasPropresParIds(ids);
      if (medias.length === 0) return null;
      return { label, medias };
    }),
  );
  const groupes: GroupeBiblio[] = bruts.filter((g): g is GroupeBiblio => g != null);

  groupes.sort((a, b) => (a.label?.nom ?? "").localeCompare(b.label?.nom ?? "", "fr"));

  // Section « Sans label » seulement en vue globale.
  if (!labelId) {
    const { data: tousLiens, error: errTous } = await supabase
      .from("media_labels")
      .select("media_id");
    if (errTous) throw errTous;
    const labeled = new Set((tousLiens ?? []).map((r) => r.media_id as string));

    const sans: Media[] = [];
    let from = 0;
    const page = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("media_library")
        .select("*")
        .like("storage_path", "propre/%")
        .order("created_at", { ascending: false })
        .range(from, from + page - 1);
      if (error) throw error;
      const batch = (data ?? []) as Media[];
      if (batch.length === 0) break;
      for (const m of batch) {
        if (!labeled.has(m.id)) sans.push(m);
      }
      if (batch.length < page) break;
      from += page;
    }
    if (sans.length > 0) groupes.push({ label: null, medias: sans });
  }

  return groupes;
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
    .select("*, media_library(url, storage_path)")
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
  persona_nom: string | null;
  handle_tiktok: string | null;
  poster_prenom: string | null;
  poster_nom: string | null;
  sujet_titre: string | null;
  langue: string | null;
}

/** Tous les posts, pour le calendrier admin. RLS admin = accès complet. */
export async function postsCalendrierAdmin(): Promise<PostCalendrierAdmin[]> {
  // L'embed profiles sous comptes fonctionne depuis la FK
  // comptes.poster_id → profiles.id (migration 0109).
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, compte_id, date_publication_prevue, type, statut, pipeline_statut, publie_at, " +
        "sujets(titre), comptes(persona_nom, handle_tiktok, langue, profiles(prenom, nom))",
    )
    .order("date_publication_prevue", { ascending: false, nullsFirst: false })
    .limit(400);
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  return (data as any[]).map((p) => ({
    id: p.id,
    compte_id: p.compte_id,
    date_publication_prevue: p.date_publication_prevue,
    type: p.type,
    statut: p.statut,
    pipeline_statut: p.pipeline_statut,
    publie_at: p.publie_at,
    persona_nom: p.comptes?.persona_nom ?? null,
    handle_tiktok: p.comptes?.handle_tiktok ?? null,
    poster_prenom: p.comptes?.profiles?.prenom ?? null,
    poster_nom: p.comptes?.profiles?.nom ?? null,
    sujet_titre: p.sujets?.titre ?? null,
    langue: p.comptes?.langue ?? null,
  }));
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
      .select("id, persona_nom, handle_tiktok, avatar_url, langue, posts_par_jour")
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
  return (comptesRes.data ?? []).map((c: any) => ({
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
 *  même créateur + date. Renvoie l'id du nouveau post (à faire avancer ensuite). */
export const revoquerPost = (postId: string) =>
  invoke<{ ok: boolean; newPostId: string | null }>("revoquer-post", { postId });

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

export async function creerLabel(nom: string, couleur?: string | null): Promise<Label> {
  const base = slugify(nom);
  let slug = base;
  for (let i = 0; i < 5; i += 1) {
    const { data, error } = await supabase
      .from("labels")
      .insert({ nom: nom.trim(), slug, couleur: couleur ?? null })
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
  patch: { nom?: string; couleur?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.nom) body.slug = slugify(patch.nom);
  const { error } = await supabase.from("labels").update(body).eq("id", id);
  if (error) throw error;
}

export async function supprimerLabel(id: string): Promise<void> {
  const { error } = await supabase.from("labels").delete().eq("id", id);
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
  /** URL des visuels nettoyés indexés par media_id. */
  mediaUrls?: Record<string, string>;
}

async function urlsMediasPropres(
  contenus: Contenu[],
): Promise<Record<string, string>> {
  const mediaIds = [
    ...new Set(
      contenus.flatMap((c) =>
        ((c.structure_slides ?? []) as Contenu["structure_slides"])
          .map((s) => s.media_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  if (mediaIds.length === 0) return {};
  // Uniquement storage propre/ — jamais le brut TikTok (même si texte_restant
  // est flagué : c'est encore le JPEG Fal, pas le raw).
  const { data } = await supabase
    .from("media_library")
    .select("id, url, storage_path")
    .in("id", mediaIds);
  const map: Record<string, string> = {};
  for (const m of data ?? []) {
    const path = (m.storage_path as string) ?? "";
    if (path.startsWith("propre/")) {
      map[m.id as string] = m.url as string;
    }
  }
  return map;
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
  const [{ data: liens }, { data: scores }, mediaUrls] = await Promise.all([
    supabase.from("contenu_labels").select("contenu_id, label_id, labels(*)").in("contenu_id", ids),
    supabase
      .from("contenu_langues")
      .select("contenu_id, langue, score, nb_passages")
      .in("contenu_id", ids),
    urlsMediasPropres(contenus),
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

  return contenus.map((c) => {
    const idsContenu = new Set(
      (c.structure_slides ?? [])
        .map((s) => s.media_id)
        .filter((id): id is string => Boolean(id)),
    );
    const urls: Record<string, string> = {};
    for (const mid of idsContenu) {
      if (mediaUrls[mid]) urls[mid] = mediaUrls[mid];
    }
    return {
      ...c,
      labels: labelsPar.get(c.id) ?? [],
      scores: scoresPar.get(c.id) ?? [],
      mediaUrls: urls,
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

  const [{ data: langues }, { data: passages }, { data: liens }, mediaUrls] = await Promise.all([
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
    urlsMediasPropres([contenu as Contenu]),
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

  return {
    ...(contenu as Contenu),
    labels,
    mediaUrls,
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

/** Coût mensuel = base + posts_par_jour × unitaire. */
export function coutMensuelCalcule(
  postsParJour: number,
  paiement: { tarif_base_mensuel: number; tarif_par_post_jour: number },
): number {
  return paiement.tarif_base_mensuel + postsParJour * paiement.tarif_par_post_jour;
}
