import { supabase } from "@/lib/supabase/client";
import type { UgcPersona, UgcPersonaDefaults } from "./types";

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

export function sauverUgcPersona(input: {
  nom: string;
  promptBase: string;
  faceUrl: string;
  leftUrl: string;
  rightUrl: string;
  downUrl: string;
  draftId?: string;
  promptLeft?: string;
  promptRight?: string;
  promptDown?: string;
}) {
  return invokeUgc<{ ok: boolean; persona: UgcPersona }>({ action: "save", ...input });
}

export function supprimerUgcPersona(id: string) {
  return invokeUgc<{ ok: boolean }>({ action: "delete", id });
}
