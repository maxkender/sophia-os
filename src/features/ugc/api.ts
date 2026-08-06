import { supabase } from "@/lib/supabase/client";
import type {
  UgcAngle,
  UgcPersona,
  UgcPersonaDefaults,
  UgcProfileRef,
  UgcReaction,
  UgcUtilisation,
} from "./types";
import type { VideoTrim } from "./videoCrop";

export type { UgcAngle, UgcProfileRef, UgcReaction, UgcUtilisation };

async function invokeUgc<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ugc-persona", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corps = (await ctx.json()) as { error?: string };
        if (corps?.error) message = corps.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const result = data as { error?: string };
  if (result?.error) throw new Error(result.error);
  return data as T;
}

/** Stream NDJSON vers ugc-persona (évite idle timeout 150s). */
async function invokeUgcStream(
  body: Record<string, unknown>,
  onProgress?: (detail: string) => void,
): Promise<Record<string, unknown>> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch(`${url}/functions/v1/ugc-persona`, {
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
    let message = `Edge ugc-persona ${res.status}`;
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
        if (typeof ev.detail === "string") onProgress?.(ev.detail);
        if (ev.statut === "echec" && typeof ev.detail === "string") {
          throw new Error(ev.detail);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
          if (e.message.startsWith("Edge") || !e.message.includes("JSON")) throw e;
        }
      }
    }
  }

  if (!dernier || dernier.statut === "echec") {
    throw new Error(
      typeof dernier?.detail === "string" ? dernier.detail : "Génération UGC échouée",
    );
  }
  if (dernier.etape === "ready" && dernier.ok === false) {
    throw new Error(typeof dernier.error === "string" ? dernier.error : "Échec");
  }
  return dernier;
}

export function ugcPersonaDefaults() {
  return invokeUgc<UgcPersonaDefaults & { ok: boolean }>({ action: "defaults" });
}

export function listerUgcPersonas() {
  return invokeUgc<{ ok: boolean; personas: UgcPersona[] }>({ action: "list" });
}

/** Comptes liés à un persona UGC (pour la liste admin). */
export interface AffectationPersonaUgc {
  compteId: string;
  personaId: string;
  personaNom: string | null;
  handle: string | null;
  posterPrenom: string | null;
  posterNom: string | null;
}

export async function listerAffectationsPersonasUgc(): Promise<AffectationPersonaUgc[]> {
  const { data, error } = await supabase
    .from("comptes")
    .select(
      "id, ugc_persona_id, persona_nom, handle_tiktok, profiles(prenom, nom)",
    )
    .not("ugc_persona_id", "is", null)
    .eq("is_active", true);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((c: any) => ({
    compteId: c.id as string,
    personaId: c.ugc_persona_id as string,
    personaNom: (c.persona_nom as string | null) ?? null,
    handle: (c.handle_tiktok as string | null) ?? null,
    posterPrenom: (c.profiles?.prenom as string | null) ?? null,
    posterNom: (c.profiles?.nom as string | null) ?? null,
  }));
}

export async function genererUgcFace(
  prompt: string,
  onProgress?: (detail: string) => void,
): Promise<{ imageUrl: string; draftId: string; prompt: string }> {
  const r = await invokeUgcStream({ action: "generate_face", prompt }, onProgress);
  return {
    imageUrl: String(r.imageUrl ?? ""),
    draftId: String(r.draftId ?? ""),
    prompt: String(r.prompt ?? prompt),
  };
}

export async function genererUgcAngles(
  input: {
    faceUrl: string;
    draftId: string;
    promptLeft: string;
    promptRight: string;
    promptDown: string;
  },
  onProgress?: (detail: string) => void,
): Promise<{
  leftUrl: string;
  rightUrl: string;
  downUrl: string;
  promptLeft: string;
  promptRight: string;
  promptDown: string;
}> {
  const r = await invokeUgcStream({ action: "generate_angles", ...input }, onProgress);
  return {
    leftUrl: String(r.leftUrl ?? ""),
    rightUrl: String(r.rightUrl ?? ""),
    downUrl: String(r.downUrl ?? ""),
    promptLeft: String(r.promptLeft ?? input.promptLeft),
    promptRight: String(r.promptRight ?? input.promptRight),
    promptDown: String(r.promptDown ?? input.promptDown),
  };
}

/** Régénère un seul angle (draft de création ou persona enregistré). */
export async function genererUgcAngle(
  input: {
    angle: UgcAngle;
    faceUrl?: string;
    draftId?: string;
    prompt?: string;
    personaId?: string;
  },
  onProgress?: (detail: string) => void,
): Promise<{
  angle: UgcAngle;
  imageUrl: string;
  prompt: string;
  persona: UgcPersona | null;
}> {
  const r = await invokeUgcStream({ action: "generate_angle", ...input }, onProgress);
  return {
    angle: (String(r.angle ?? input.angle) as UgcAngle),
    imageUrl: String(r.imageUrl ?? ""),
    prompt: String(r.prompt ?? input.prompt ?? ""),
    persona: (r.persona as UgcPersona | null) ?? null,
  };
}

/** Photo de profil 1:1 — Nano Banana Edit (4 angles en refs).
 *  `refUrl` optionnel : pose de référence (Figure 1), visage persona en Figures 2+. */
export async function genererUgcProfile(
  input: {
    faceUrl?: string;
    leftUrl?: string;
    rightUrl?: string;
    downUrl?: string;
    draftId?: string;
    prompt?: string;
    personaId?: string;
    refUrl?: string;
  },
  onProgress?: (detail: string) => void,
): Promise<{
  imageUrl: string;
  prompt: string;
  draftId: string;
  persona: UgcPersona | null;
}> {
  const r = await invokeUgcStream({ action: "generate_profile", ...input }, onProgress);
  return {
    imageUrl: String(r.imageUrl ?? ""),
    prompt: String(r.prompt ?? input.prompt ?? ""),
    draftId: String(r.draftId ?? input.draftId ?? ""),
    persona: (r.persona as UgcPersona | null) ?? null,
  };
}

export function listerUgcProfileRefs() {
  return invokeUgc<{ ok: boolean; refs: UgcProfileRef[] }>({
    action: "list_profile_refs",
  });
}

export function importerUgcProfileRefFichier(input: {
  bytesBase64: string;
  mime?: string;
  label?: string;
}) {
  return invokeUgc<{ ok: boolean; ref: UgcProfileRef }>({
    action: "import_profile_ref",
    mode: "upload",
    ...input,
  });
}

export function importerUgcProfileRefTiktok(input: {
  handleOrUrl: string;
  label?: string;
}) {
  return invokeUgc<{ ok: boolean; ref: UgcProfileRef }>({
    action: "import_profile_ref",
    mode: "tiktok",
    ...input,
  });
}

export function supprimerUgcProfileRef(id: string) {
  return invokeUgc<{ ok: boolean }>({ action: "delete_profile_ref", id });
}

/** Lit un File en data-URL base64. */
export function fichierEnBase64(file: File): Promise<{ bytesBase64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve({ bytesBase64: dataUrl, mime: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

export function sauverUgcPersona(input: {
  nom: string;
  promptBase: string;
  faceUrl: string;
  leftUrl: string;
  rightUrl: string;
  downUrl: string;
  profileUrl: string;
  draftId?: string;
  promptLeft?: string;
  promptRight?: string;
  promptDown?: string;
  promptProfile?: string;
}) {
  return invokeUgc<{ ok: boolean; persona: UgcPersona }>({ action: "save", ...input });
}

export function supprimerUgcPersona(id: string) {
  return invokeUgc<{ ok: boolean }>({ action: "delete", id });
}

/* ─── Vidéos AI / reactions ─────────────────────────────────────────── */

async function invokeReactions<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ugc-reactions", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corps = (await ctx.json()) as { error?: string };
        if (corps?.error) message = corps.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const result = data as { error?: string };
  if (result?.error) throw new Error(result.error);
  return data as T;
}

async function invokeReactionsStream(
  body: Record<string, unknown>,
  onProgress?: (detail: string) => void,
): Promise<Record<string, unknown>> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase non configuré");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");

  const res = await fetch(`${url}/functions/v1/ugc-reactions`, {
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
    let message = `Edge ugc-reactions ${res.status}`;
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
        if (typeof ev.detail === "string") onProgress?.(ev.detail);
        if (ev.statut === "echec" && typeof ev.detail === "string") {
          throw new Error(ev.detail);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
          if (e.message.startsWith("Edge") || !e.message.includes("JSON")) throw e;
        }
      }
    }
  }

  if (!dernier || dernier.statut === "echec") {
    throw new Error(
      typeof dernier?.detail === "string" ? dernier.detail : "Reaction UGC échouée",
    );
  }
  return dernier;
}

export function listerUgcReactions() {
  return invokeReactions<{ ok: boolean; reactions: UgcReaction[] }>({
    action: "list",
  });
}

export function supprimerUgcReaction(id: string) {
  return invokeReactions<{ ok: boolean }>({ action: "delete", id });
}

export async function importerReactionTikTok(
  url: string,
  onProgress?: (detail: string) => void,
): Promise<UgcReaction> {
  const r = await invokeReactionsStream(
    { action: "import_tiktok", url },
    onProgress,
  );
  const reaction = r.reaction as UgcReaction | undefined;
  if (!reaction?.id) throw new Error("Import sans reaction");
  return reaction;
}

export async function finaliserUgcReaction(
  input: {
    id: string;
    titre?: string;
    crop: VideoTrim;
    videoPath: string;
    videoUrl: string;
    firstFramePath: string;
    firstFrameUrl: string;
    videoText?: string;
    dureeMs?: number;
    /** Label UGC AI VIDEO requis. */
    labelId: string;
  },
  onProgress?: (detail: string) => void,
): Promise<UgcReaction> {
  const r = await invokeReactionsStream(
    { action: "finalize", ...input },
    onProgress,
  );
  const reaction = r.reaction as UgcReaction | undefined;
  if (!reaction?.id) throw new Error("Finalize sans reaction");
  return reaction;
}

/** Upload fichier dans medias/ (admin). */
export async function uploadUgcReactionFichier(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<{ path: string; url: string }> {
  const { error } = await supabase.storage.from("medias").upload(path, blob, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  const pub = supabase.storage.from("medias").getPublicUrl(path).data.publicUrl;
  return { path, url: `${pub}?v=${Date.now()}` };
}

export function listerUgcUtilisations() {
  return invokeReactions<{ ok: boolean; utilisations: UgcUtilisation[] }>({
    action: "list_utilisations",
  });
}

export function supprimerUgcUtilisation(id: string) {
  return invokeReactions<{ ok: boolean }>({ action: "delete_utilisation", id });
}

export async function enregistrerUgcUtilisation(input: {
  titre?: string;
  videoPath: string;
  videoUrl: string;
  nomFichier?: string;
  dureeMs?: number;
  /** Label UGC AI VIDEO requis. */
  labelId: string;
}): Promise<UgcUtilisation> {
  const r = await invokeReactions<{ ok: boolean; utilisation: UgcUtilisation }>({
    action: "register_utilisation",
    ...input,
  });
  if (!r.utilisation?.id) throw new Error("Enregistrement utilisation échoué");
  return r.utilisation;
}

/** Upload admin d’une utilisation (fichier local → storage + DB). */
export async function importerUtilisationFichier(
  file: File,
  titre: string | undefined,
  labelId: string,
): Promise<UgcUtilisation> {
  const id = crypto.randomUUID();
  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `ugc/utilisations/${id}/video.${ext}`;
  const mime = file.type || "video/mp4";
  const up = await uploadUgcReactionFichier(path, file, mime);
  return enregistrerUgcUtilisation({
    titre: titre?.trim() || file.name.replace(/\.[^.]+$/, ""),
    videoPath: up.path,
    videoUrl: up.url,
    nomFichier: file.name,
    labelId,
  });
}
