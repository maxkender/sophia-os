/**
 * API officielle ElevenLabs (bibliothèque + TTS).
 * Secret : ELEVENLABS_API_KEY (ou ELEVEN_API_KEY) dans les secrets Supabase.
 */

import {
  estLocuteurCm,
  filtrerVoixParLangue,
  motsDepuisAlignement,
  normaliserCodeLangueVoix,
  resoudreVoix,
  voixDefautDepuisListe,
  type VoixEleven,
} from "./papier_voix.ts";

const API = "https://api.elevenlabs.io";

export function cleElevenLabs(): string | null {
  return (
    Deno.env.get("ELEVENLABS_API_KEY")?.trim() ||
    Deno.env.get("ELEVEN_API_KEY")?.trim() ||
    Deno.env.get("ELEVENLABS_KEY")?.trim() ||
    null
  );
}

function headersJson(key: string): HeadersInit {
  return {
    "xi-api-key": key,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function languesDepuis(v: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const labels = v.labels && typeof v.labels === "object" ? (v.labels as Record<string, unknown>) : {};
  for (const k of ["language", "accent"]) {
    const raw = String(labels[k] ?? v[k] ?? "").trim();
    if (raw) out.add(normaliserCodeLangueVoix(raw));
  }
  const verified = Array.isArray(v.verified_languages) ? v.verified_languages : [];
  for (const item of verified) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const lang = String(o.language ?? o.locale ?? "").trim();
    if (lang) out.add(normaliserCodeLangueVoix(lang));
  }
  return [...out].filter(Boolean);
}

function previewDepuis(v: Record<string, unknown>, langue?: string): string | null {
  const code = langue ? normaliserCodeLangueVoix(langue) : "";
  const verified = Array.isArray(v.verified_languages) ? v.verified_languages : [];
  if (code) {
    for (const item of verified) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const lang = normaliserCodeLangueVoix(String(o.language ?? o.locale ?? ""));
      const url = String(o.preview_url ?? "").trim();
      if (lang === code && url) return url;
    }
  }
  const url = String(v.preview_url ?? "").trim();
  return url || null;
}

function mapVoix(
  v: Record<string, unknown>,
  source: VoixEleven["source"],
  langue?: string,
): VoixEleven | null {
  const id = String(v.voice_id ?? v.voiceId ?? "").trim();
  const name = String(v.name ?? "").trim();
  if (!id || !name) return null;
  const category = String(v.category ?? "").trim() || "premade";
  const custom =
    source === "library" &&
    (category === "cloned" ||
      category === "generated" ||
      category === "professional" ||
      estLocuteurCm({ id, name }));
  const labels = v.labels && typeof v.labels === "object" ? (v.labels as Record<string, unknown>) : {};
  return {
    id,
    name,
    languages: languesDepuis(v),
    previewUrl: previewDepuis(v, langue),
    category,
    gender: String(v.gender ?? labels.gender ?? "").trim() || null,
    accent: String(v.accent ?? labels.accent ?? "").trim() || null,
    source,
    ownerId: String(v.public_owner_id ?? v.public_user_id ?? "").trim() || null,
    custom,
  };
}

async function lireJson(res: Response, contexte: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${contexte}: ${res.status} ${text.slice(0, 240)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${contexte}: JSON invalide`);
  }
}

export async function listerVoixElevenLabs(opts?: {
  langue?: string;
}): Promise<{ voix: VoixEleven[]; hasKey: boolean }> {
  const key = cleElevenLabs();
  if (!key) return { voix: [], hasKey: false };
  const langue = opts?.langue?.trim();
  const [libRes, sharedRes] = await Promise.all([
    fetch(`${API}/v1/voices?show_legacy=true`, { headers: { "xi-api-key": key, Accept: "application/json" } }),
    langue
      ? fetch(
          `${API}/v1/shared-voices?page_size=100&language=${encodeURIComponent(normaliserCodeLangueVoix(langue))}`,
          { headers: { "xi-api-key": key, Accept: "application/json" } },
        )
      : Promise.resolve(null),
  ]);
  const libJson = await lireJson(libRes, "ElevenLabs /v1/voices");
  const library = (Array.isArray(libJson.voices) ? libJson.voices : [])
    .map((v) => mapVoix(v as Record<string, unknown>, "library", langue))
    .filter((v): v is VoixEleven => Boolean(v));
  let shared: VoixEleven[] = [];
  if (sharedRes) {
    try {
      const sharedJson = await lireJson(sharedRes, "ElevenLabs /v1/shared-voices");
      shared = (Array.isArray(sharedJson.voices) ? sharedJson.voices : [])
        .map((v) => mapVoix(v as Record<string, unknown>, "shared", langue))
        .filter((v): v is VoixEleven => Boolean(v));
    } catch {
      shared = [];
    }
  }
  const seen = new Set(library.map((v) => v.id));
  const merged = [...library];
  for (const v of shared) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    merged.push(v);
  }
  return { voix: langue ? filtrerVoixParLangue(merged, langue) : merged, hasKey: true };
}

export async function assurerVoixCollection(voix: VoixEleven): Promise<string> {
  if (voix.source !== "shared" || !voix.ownerId) return voix.id;
  const key = cleElevenLabs();
  if (!key) return voix.id;
  const res = await fetch(`${API}/v1/voices/add/${voix.ownerId}/${voix.id}`, {
    method: "POST",
    headers: headersJson(key),
    body: JSON.stringify({ new_name: voix.name, bookmarked: true }),
  });
  if (res.status === 409) return voix.id;
  const json = await lireJson(res, "ElevenLabs add shared voice");
  return String(json.voice_id ?? voix.id);
}

export async function resoudreVoiceId(ref: string, langue?: string): Promise<{ id: string; voix?: VoixEleven }> {
  const wanted = ref.trim();
  const { voix } = await listerVoixElevenLabs({ langue });
  const found = resoudreVoix(wanted, voix) ?? resoudreVoix(voixDefautDepuisListe(voix, langue ?? "fr"), voix);
  if (found) {
    const id = await assurerVoixCollection(found);
    return { id, voix: { ...found, id } };
  }
  if (wanted) return { id: wanted };
  throw new Error("Aucune voix ElevenLabs (ajoute locuteur-cm ou une voix FR dans la bibliothèque)");
}

export async function synthetiserVoixElevenLabs(input: {
  text: string;
  voiceId: string;
  langue?: string;
  stability?: number;
  speed?: number;
}): Promise<{ bytes: Uint8Array; mime: string; words: { word: string; start: number; end: number }[] }> {
  const key = cleElevenLabs();
  if (!key) throw new Error("ELEVENLABS_API_KEY manquant (secret Supabase)");
  const text = input.text.trim();
  if (!text) throw new Error("TTS: texte vide");
  const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`, {
    method: "POST",
    headers: headersJson(key),
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      language_code: input.langue ? normaliserCodeLangueVoix(input.langue) : undefined,
      voice_settings: {
        stability: input.stability ?? 0.55,
        similarity_boost: 0.75,
        speed: input.speed ?? 1,
      },
    }),
  });
  const json = await lireJson(res, "ElevenLabs TTS");
  const b64 = String(json.audio_base64 ?? json.audioBase64 ?? "").trim();
  if (!b64) throw new Error("ElevenLabs TTS: audio_base64 vide");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const align =
    (json.alignment as Record<string, unknown> | undefined) ??
    (json.normalized_alignment as Record<string, unknown> | undefined) ??
    {};
  const characters = Array.isArray(align.characters) ? align.characters.map((c) => String(c)) : [];
  const starts = Array.isArray(align.character_start_times_seconds)
    ? align.character_start_times_seconds.map((n) => Number(n))
    : [];
  const ends = Array.isArray(align.character_end_times_seconds)
    ? align.character_end_times_seconds.map((n) => Number(n))
    : [];
  const words = motsDepuisAlignement(text, characters, starts, ends);
  return { bytes, mime: "audio/mpeg", words };
}

export function bytesVersBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function extrairePreviewVoix(opts: {
  voiceId: string;
  langue?: string;
}): Promise<{ previewUrl?: string; audioBase64?: string; mime?: string; voiceId: string }> {
  const langue = opts.langue ?? "fr";
  const { voix } = await listerVoixElevenLabs({ langue });
  const trouvee = resoudreVoix(opts.voiceId, voix);
  if (trouvee?.previewUrl) {
    return { previewUrl: trouvee.previewUrl, voiceId: trouvee.id };
  }
  const resolved = await resoudreVoiceId(opts.voiceId, langue);
  const texte = langue.startsWith("fr")
    ? "Bonjour. Voici un extrait de ma voix."
    : "Hello. This is a short sample of my voice.";
  const tts = await synthetiserVoixElevenLabs({
    text: texte,
    voiceId: resolved.id,
    langue,
    stability: 0.5,
    speed: 1,
  });
  return {
    audioBase64: bytesVersBase64(tts.bytes),
    mime: tts.mime,
    voiceId: resolved.id,
  };
}
