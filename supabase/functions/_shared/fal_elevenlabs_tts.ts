/**
 * Fal — ElevenLabs TTS multilingual v2 (voix papier).
 *   fal-ai/elevenlabs/tts/multilingual-v2
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import {
  dureeDepuisTimings,
  normaliserTimestampsFal,
  type PapierWordTiming,
} from "./papier_locales_core.ts";
import {
  stabiliteVoixDepuisPrompt,
  vitesseVoixDepuisPrompt,
} from "./papier_prompt_defauts.ts";
import { estimerSecondesParole } from "./papier_script_core.ts";

export const ELEVEN_TTS = "fal-ai/elevenlabs/tts/multilingual-v2";
export const VOIX_PAPIER_DEFAUT = "George";

export async function synthetiserVoixFal(input: {
  text: string;
  langue: string;
  voice?: string;
  delivery?: string;
  onProgress?: FalQueueProgress;
}): Promise<{
  url: string;
  bytes: Uint8Array;
  mime: string;
  words: PapierWordTiming[];
  dureeSec: number;
}> {
  const text = input.text.trim();
  if (!text) throw new Error("TTS: texte vide");
  const delivery = input.delivery?.trim() ?? "";
  const speed = vitesseVoixDepuisPrompt(delivery);
  const stability = stabiliteVoixDepuisPrompt(delivery) ?? 0.55;
  const queued = await falQueueSubmit(
    ELEVEN_TTS,
    {
      text,
      voice: input.voice?.trim() || VOIX_PAPIER_DEFAUT,
      language_code: input.langue,
      timestamps: true,
      stability,
      ...(speed != null ? { speed } : {}),
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(ELEVEN_TTS, queued, input.onProgress, 120_000);
  const payload = (data?.data ?? data) as {
    audio?: { url?: string; content_type?: string };
    timestamps?: unknown;
  };
  const url = payload?.audio?.url;
  if (!url) {
    throw new Error(`TTS: pas de audio.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const file = await falDownloadBytes(url, input.onProgress);
  const fallback = estimerSecondesParole(text);
  const words = normaliserTimestampsFal(payload.timestamps ?? data, text, fallback);
  return {
    url: file.url,
    bytes: file.bytes,
    mime: file.mime.includes("audio") ? file.mime : "audio/mpeg",
    words,
    dureeSec: dureeDepuisTimings(words, fallback),
  };
}
