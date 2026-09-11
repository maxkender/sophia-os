/**
 * Localisation papier à la demande : une langue, ticks 42 s.
 * FR se fait à la fin du pipeline master (bibliothèque).
 * Les autres langues naissent à l'assignation s'il existe un CM.
 * traduire → TTS Fal → mix clip+voix → concat → karaoke.
 */

import { incrusterKaraokeFal } from "./fal_auto_subtitle.ts";
import { synthetiserVoixFal } from "./fal_elevenlabs_tts.ts";
import { chargerPromptsPapier } from "./papier_prompts.ts";
import { assurerMasterPretSiClips, publierVideoFrMaster } from "./papier_master.ts";
import {
  chargerReglagesPapier,
  estErreurQuotaFal,
  estVoixPapier,
  reserverFalPapier,
  voixEffectiveMaster,
} from "./papier_reglages.ts";
import { mergerAudioVideoFal } from "./fal_merge_audio.ts";
import { trimmerVideoFal } from "./fal_trim_video.ts";
import { mergerVideosFal } from "./fal_merge_videos.ts";
import { composerFinalePapier, reduireVideoPapierTikTok, assurerNoirVideoUrl } from "./fal_cadre_papier.ts";
import type { FalQueueProgress } from "./fal_queue.ts";
import {
  etapeAssemblage,
  prochaineLangueATiquer,
  statutDepuisLocaleAssets,
  sousTitresDepuisScenes,
  type PapierScriptTraduit,
} from "./papier_locales_core.ts";
import { traduireScriptPapier } from "./papier_traduction.ts";
import { finTrimClipPourVoix, type PapierScript } from "./papier_script_core.ts";
import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
const TICK_BUDGET_MS = 42_000;
/** Overlay/karaoke dépasse souvent 4 min : un steal trop tôt double la facture Fal. */
const CLAIM_STALE_MS = 900_000;
/** Un lot Fal (concat ou cadre) doit tenir dans le wall clock de l'edge. */
const FAL_ASSEMBLAGE_MS = 130_000;
const CONCAT_LOT = 4;
const started = () => Date.now();
const outOfTime = (t0: number) => Date.now() - t0 > TICK_BUDGET_MS - 4_000;

export type PapierLangueStatut =
  | "queued"
  | "translating"
  | "voice"
  | "mix"
  | "render"
  | "karaoke"
  | "ready"
  | "failed";

export type PapierLangueRow = {
  id: string;
  master_id: string;
  langue: string;
  title: string | null;
  hook: string | null;
  cta: string | null;
  hashtags: string | null;
  script: PapierScriptTraduit | null;
  statut: PapierLangueStatut;
  etape: string | null;
  progression: number;
  erreur: string | null;
  busy: boolean;
  voice: string;
  video_mix_path: string | null;
  video_mix_url: string | null;
  video_path: string | null;
  video_url: string | null;
  journal: Array<{ at: string; etape: string; detail: string }>;
  updated_at?: string;
};

export type PapierLangueSceneRow = {
  id: string;
  langue_id: string;
  index: number;
  narration: string;
  overlay: string;
  audio_path: string | null;
  audio_url: string | null;
  words: unknown;
  duree_sec: number | null;
  mix_path: string | null;
  mix_url: string | null;
};

export type PapierLocaleTick = {
  ok: boolean;
  idle?: boolean;
  done: boolean;
  kick?: boolean;
  masterId?: string;
  langueId?: string;
  langue?: string;
  statut?: PapierLangueStatut;
  progression?: number;
  detail?: string;
  error?: string;
};

async function uploader(
  supabase: Supabase,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Upload storage: ${error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${pub}?v=${Date.now()}`;
}

async function chargerLangue(supabase: Supabase, id: string): Promise<PapierLangueRow | null> {
  const { data, error } = await supabase.from("papier_langues").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PapierLangueRow | null) ?? null;
}

async function chargerScenesLangue(
  supabase: Supabase,
  langueId: string,
): Promise<PapierLangueSceneRow[]> {
  const { data, error } = await supabase
    .from("papier_langue_scenes")
    .select("*")
    .eq("langue_id", langueId)
    .order("index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PapierLangueSceneRow[];
}

async function chargerClipsMaster(
  supabase: Supabase,
  masterId: string,
): Promise<Array<{ index: number; clip_url: string | null }>> {
  const { data, error } = await supabase
    .from("papier_scenes")
    .select("index, clip_url")
    .eq("master_id", masterId)
    .order("index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{ index: number; clip_url: string | null }>;
}

async function chargerScriptMaster(
  supabase: Supabase,
  masterId: string,
): Promise<PapierScript | null> {
  const { data, error } = await supabase
    .from("papier_masters")
    .select("script")
    .eq("id", masterId)
    .maybeSingle();
  if (error) throw error;
  if (!(await assurerMasterPretSiClips(supabase, masterId))) return null;
  return ((data as { script?: PapierScript } | null)?.script ?? null) as PapierScript | null;
}

async function patchLangue(
  supabase: Supabase,
  id: string,
  patch: Record<string, unknown>,
  journal?: { etape: string; detail: string },
): Promise<void> {
  const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (journal) {
    const row = await chargerLangue(supabase, id);
    next.journal = [...(row?.journal ?? []), { at: new Date().toISOString(), ...journal }].slice(-40);
  }
  const { error } = await supabase.from("papier_langues").update(next).eq("id", id);
  if (error) throw error;
}

async function heartbeatLangue(supabase: Supabase, id: string): Promise<void> {
  await patchLangue(supabase, id, {});
}

function langueBusyRecente(row: { busy: boolean; updated_at?: string }): boolean {
  if (!row.busy) return false;
  const stale = Date.parse(row.updated_at ?? "") || 0;
  return Boolean(stale) && Date.now() - stale < CLAIM_STALE_MS;
}

async function patchSceneLangue(
  supabase: Supabase,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("papier_langue_scenes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function claimLangue(supabase: Supabase, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("papier_langues")
    .update({ busy: true, updated_at: now })
    .eq("id", id)
    .eq("busy", false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data) return true;
  const row = await chargerLangue(supabase, id);
  if (!row) return false;
  const stale = Date.parse(row.updated_at ?? "") || 0;
  if (row.busy && Date.now() - stale > CLAIM_STALE_MS) {
    const { data: steal } = await supabase
      .from("papier_langues")
      .update({ busy: true, updated_at: now })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    return Boolean(steal);
  }
  return false;
}

async function releaseLangue(supabase: Supabase, id: string): Promise<void> {
  await supabase
    .from("papier_langues")
    .update({ busy: false, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function assurerLangueMaster(
  supabase: Supabase,
  masterId: string,
  langue: string,
): Promise<PapierLangueRow> {
  const code = langue.trim().toLowerCase();
  const { data: existant, error } = await supabase
    .from("papier_langues")
    .select("*")
    .eq("master_id", masterId)
    .eq("langue", code)
    .maybeSingle();
  if (error) throw error;
  if (existant) return existant as PapierLangueRow;
  const reglages = await chargerReglagesPapier(supabase);
  const { data: master } = await supabase
    .from("papier_masters")
    .select("voice")
    .eq("id", masterId)
    .maybeSingle();
  const { data: inserted, error: insErr } = await supabase
    .from("papier_langues")
    .insert({
      master_id: masterId,
      langue: code,
      voice: voixEffectiveMaster((master as { voice?: string } | null)?.voice, reglages, code),
      statut: "queued",
      etape: "traduction",
    })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return inserted as PapierLangueRow;
}

/** @deprecated ne crée plus les 14 langues — préfère assurerLangueMaster. */
export async function assurerLanguesMaster(
  supabase: Supabase,
  masterId: string,
): Promise<PapierLangueRow[]> {
  const { data: existants, error } = await supabase
    .from("papier_langues")
    .select("*")
    .eq("master_id", masterId);
  if (error) throw error;
  return (existants ?? []) as PapierLangueRow[];
}

function scriptDepuisFr(master: PapierScript): PapierScriptTraduit {
  return {
    title: master.title,
    hook: master.hook,
    cta: master.cta,
    hashtags: master.hashtags ?? [],
    scenes: master.scenes.map((s) => ({
      index: s.index,
      narration: s.narration,
      overlay: s.overlay,
    })),
  };
}

async function insererScenes(
  supabase: Supabase,
  langueId: string,
  script: PapierScriptTraduit,
): Promise<void> {
  const exist = await chargerScenesLangue(supabase, langueId);
  if (exist.length) return;
  const { error } = await supabase.from("papier_langue_scenes").insert(
    script.scenes.map((s) => ({
      langue_id: langueId,
      index: s.index,
      narration: s.narration,
      overlay: s.overlay,
    })),
  );
  if (error) throw error;
}

async function etapeTraduction(
  supabase: Supabase,
  row: PapierLangueRow,
  masterScript: PapierScript,
): Promise<void> {
  if (row.script && (await chargerScenesLangue(supabase, row.id)).length) return;
  await patchLangue(supabase, row.id, {
    statut: "translating",
    etape: "traduction",
    progression: 0.05,
  });
  const script =
    row.langue === "fr"
      ? scriptDepuisFr(masterScript)
      : await traduireScriptPapier(
          masterScript,
          row.langue,
          await chargerPrompt(supabase, `traduction_${row.langue}`),
        );
  await insererScenes(supabase, row.id, script);
  row.script = script;
  await patchLangue(
    supabase,
    row.id,
    {
      title: script.title,
      hook: script.hook,
      cta: script.cta,
      hashtags: script.hashtags.join(" "),
      script,
      statut: "voice",
      etape: "voix",
      progression: 0.15,
    },
    { etape: "traduction", detail: `${row.langue} · ${script.scenes.length} plans` },
  );
}

async function etapeVoix(
  supabase: Supabase,
  row: PapierLangueRow,
  scenes: PapierLangueSceneRow[],
  t0: number,
): Promise<boolean> {
  if (scenes.length > 0 && scenes.every((s) => Boolean(s.audio_url))) {
    if (row.statut === "queued" || row.statut === "translating" || row.statut === "voice") {
      await patchLangue(
        supabase,
        row.id,
        { statut: "mix", etape: "mix", progression: 0.45 },
        { etape: "voix", detail: `${scenes.length} voix` },
      );
    }
    return true;
  }
  const delivery = (await chargerPromptsPapier(supabase)).voice_delivery;
  for (const scene of scenes) {
    if (outOfTime(t0)) return false;
    if (scene.audio_url) continue;
    const tts = await synthetiserVoixFal({
      text: scene.narration,
      langue: row.langue,
      voice: row.voice,
      delivery,
    });
    const path = `papiers/${row.master_id}/${row.langue}/voice-${scene.index}.mp3`;
    const url = await uploader(supabase, path, tts.bytes, tts.mime);
    scene.audio_url = url;
    await patchSceneLangue(supabase, scene.id, {
      audio_path: path,
      audio_url: url,
      words: tts.words,
      duree_sec: tts.dureeSec,
    });
    const done = scenes.filter((s) => s.audio_url).length;
    await patchLangue(supabase, row.id, {
      statut: "voice",
      etape: "voix",
      progression: 0.15 + 0.3 * (done / scenes.length),
    });
  }
  await patchLangue(
    supabase,
    row.id,
    { statut: "mix", etape: "mix", progression: 0.45 },
    { etape: "voix", detail: `${scenes.length} voix` },
  );
  return true;
}

async function etapeMix(
  supabase: Supabase,
  row: PapierLangueRow,
  scenes: PapierLangueSceneRow[],
  clips: Array<{ index: number; clip_url: string | null }>,
  t0: number,
): Promise<boolean> {
  if (scenes.length > 0 && scenes.every((s) => Boolean(s.mix_url))) {
    if (row.statut === "voice" || row.statut === "mix" || row.statut === "queued" || row.statut === "translating") {
      await patchLangue(supabase, row.id, { statut: "render", etape: "render", progression: 0.72 });
    }
    return true;
  }
  for (const scene of scenes) {
    if (outOfTime(t0)) return false;
    if (scene.mix_url) continue;
    if (!scene.audio_url) throw new Error(`Plan ${scene.index + 1} sans voix`);
    const clip = clips.find((c) => c.index === scene.index)?.clip_url;
    if (!clip) throw new Error(`Plan ${scene.index + 1} sans clip master`);
    let videoUrl = clip;
    const finVoix = finTrimClipPourVoix(scene.duree_sec ?? 0);
    if (finVoix) {
      try {
        await reserverFalPapier(supabase);
        const trimmed = await trimmerVideoFal({
          videoUrl: clip,
          startSec: 0,
          endSec: finVoix,
        });
        videoUrl = trimmed.url;
      } catch {
        videoUrl = clip;
      }
    }
    await reserverFalPapier(supabase);
    const mix = await mergerAudioVideoFal({ videoUrl, audioUrl: scene.audio_url });
    const path = `papiers/${row.master_id}/${row.langue}/mix-${scene.index}.mp4`;
    const url = await uploader(supabase, path, mix.bytes, mix.mime);
    scene.mix_url = url;
    await patchSceneLangue(supabase, scene.id, { mix_path: path, mix_url: url });
    const done = scenes.filter((s) => s.mix_url).length;
    await patchLangue(supabase, row.id, {
      statut: "mix",
      etape: "mix",
      progression: 0.45 + 0.25 * (done / scenes.length),
    });
  }
  if (row.statut === "voice" || row.statut === "mix" || row.statut === "queued" || row.statut === "translating") {
    await patchLangue(supabase, row.id, { statut: "render", etape: "render", progression: 0.72 });
  }
  return true;
}

async function etapeRender(
  supabase: Supabase,
  row: PapierLangueRow,
  scenes: PapierLangueSceneRow[],
): Promise<void> {
  const ass = etapeAssemblage(row);
  if (ass === "ready" || ass === "karaoke") return;
  const urls = scenes.map((s) => s.mix_url).filter((u): u is string => Boolean(u));
  if (urls.length === 0) throw new Error("Aucun mix à assembler");
  const partPath = `papiers/${row.master_id}/${row.langue}/mix-part.mp4`;
  const rawPath = `papiers/${row.master_id}/${row.langue}/mix-raw.mp4`;
  const padPath = `papiers/${row.master_id}/${row.langue}/mix-pad.mp4`;
  const framedPath = `papiers/${row.master_id}/${row.langue}/mix.mp4`;

  if (ass === "merge") {
    const hasPart = (row.video_mix_path ?? "").includes("mix-part") && Boolean(row.video_mix_url);
    if (!hasPart && urls.length > CONCAT_LOT) {
      await reserverFalPapier(supabase);
      await heartbeatLangue(supabase, row.id);
      const merged = await mergerVideosFal({
        videoUrls: urls.slice(0, CONCAT_LOT),
        timeoutMs: FAL_ASSEMBLAGE_MS,
      });
      const url = await uploader(supabase, partPath, merged.bytes, merged.mime);
      await patchLangue(
        supabase,
        row.id,
        {
          video_mix_path: partPath,
          video_mix_url: url,
          statut: "render",
          etape: "render",
          progression: 0.76,
        },
        { etape: "render", detail: `concat ${CONCAT_LOT}/${urls.length}` },
      );
      return;
    }
    const queue = hasPart ? [row.video_mix_url!, ...urls.slice(CONCAT_LOT)] : urls;
    let sourceUrl = queue[0]!;
    if (queue.length > 1) {
      await reserverFalPapier(supabase);
      await heartbeatLangue(supabase, row.id);
      const merged = await mergerVideosFal({ videoUrls: queue, timeoutMs: FAL_ASSEMBLAGE_MS });
      sourceUrl = await uploader(supabase, rawPath, merged.bytes, merged.mime);
    }
    await patchLangue(
      supabase,
      row.id,
      {
        video_mix_path: rawPath,
        video_mix_url: sourceUrl,
        statut: "render",
        etape: "cadre",
        progression: 0.8,
      },
      { etape: "render", detail: `${urls.length} plans concaténés` },
    );
    return;
  }

  if (ass === "pad") {
    const source = row.video_mix_url;
    if (!source) throw new Error("Concat absente avant le pad TikTok");
    await reserverFalPapier(supabase);
    await heartbeatLangue(supabase, row.id);
    const beat: FalQueueProgress = async () => {
      await heartbeatLangue(supabase, row.id);
    };
    const noir = await assurerNoirVideoUrl(supabase);
    const padded = await reduireVideoPapierTikTok({
      videoUrl: source,
      supabase,
      noirUrl: noir.url,
      onProgress: beat,
      timeoutMs: FAL_ASSEMBLAGE_MS,
    });
    const url = await uploader(supabase, padPath, padded.bytes, padded.mime);
    await patchLangue(
      supabase,
      row.id,
      {
        video_mix_path: padPath,
        video_mix_url: url,
        statut: "render",
        etape: "cadre",
        progression: 0.82,
      },
      { etape: "render", detail: "pad 80% TikTok" },
    );
    return;
  }

  const source = row.video_mix_url;
  if (!source) throw new Error("Concat absente avant le cadre");
  await reserverFalPapier(supabase);
  await heartbeatLangue(supabase, row.id);
  const beat: FalQueueProgress = async () => {
    await heartbeatLangue(supabase, row.id);
  };
  const framed = await composerFinalePapier({
    videoUrl: source,
    supabase,
    onProgress: beat,
    timeoutMs: FAL_ASSEMBLAGE_MS,
  });
  const url = await uploader(supabase, framedPath, framed.bytes, framed.mime);
  await patchLangue(
    supabase,
    row.id,
    {
      video_mix_path: framedPath,
      video_mix_url: url,
      statut: "karaoke",
      etape: "karaoke",
      progression: 0.85,
    },
    { etape: "render", detail: "cadre 9:16" },
  );
}

async function etapeKaraoke(supabase: Supabase, row: PapierLangueRow): Promise<void> {
  if (row.video_url) return;
  const source = row.video_mix_url;
  if (!source) throw new Error("Vidéo mixte absente");
  const scenes = await chargerScenesLangue(supabase, row.id);
  const subtitles = sousTitresDepuisScenes(scenes);
  await reserverFalPapier(supabase);
  await heartbeatLangue(supabase, row.id);
  const beat: FalQueueProgress = async () => {
    await heartbeatLangue(supabase, row.id);
  };
  const kar = await incrusterKaraokeFal({
    videoUrl: source,
    langue: row.langue,
    subtitles,
    onProgress: beat,
    timeoutMs: FAL_ASSEMBLAGE_MS,
  });
  const path = `papiers/${row.master_id}/${row.langue}/final.mp4`;
  const url = await uploader(supabase, path, kar.bytes, kar.mime);
  await patchLangue(
    supabase,
    row.id,
    {
      video_path: path,
      video_url: url,
      statut: "ready",
      etape: "ready",
      progression: 1,
      erreur: null,
    },
    { etape: "karaoke", detail: subtitles.length ? `captions TTS ${subtitles.length}` : "captions STT" },
  );
}

export async function avancerLangue(
  supabase: Supabase,
  langueId: string,
): Promise<PapierLocaleTick> {
  const t0 = started();
  let row = await chargerLangue(supabase, langueId);
  if (!row) throw new Error("Langue papier introuvable");
  if (row.statut === "ready") {
    return {
      ok: true,
      done: true,
      langueId,
      masterId: row.master_id,
      langue: row.langue,
      statut: "ready",
      progression: 1,
      detail: "déjà prête",
    };
  }
  if (row.statut === "failed") {
    return {
      ok: false,
      done: true,
      langueId,
      masterId: row.master_id,
      langue: row.langue,
      statut: "failed",
      error: row.erreur ?? "échec",
    };
  }

  const claimed = await claimLangue(supabase, langueId);
  if (!claimed) {
    return {
      ok: true,
      idle: true,
      done: false,
      kick: false,
      langueId,
      masterId: row.master_id,
      langue: row.langue,
      statut: row.statut,
      detail: "tick déjà en cours",
    };
  }

  try {
    const { data: masterEtat } = await supabase
      .from("papier_masters")
      .select("annule, statut")
      .eq("id", row.master_id)
      .maybeSingle();
    if ((masterEtat as { annule?: boolean; statut?: string } | null)?.annule ||
      (masterEtat as { statut?: string } | null)?.statut === "stopped") {
      return {
        ok: true,
        idle: true,
        done: true,
        kick: false,
        langueId,
        masterId: row.master_id,
        langue: row.langue,
        statut: row.statut,
        detail: "pipeline arrêtée",
      };
    }
    const masterScript = await chargerScriptMaster(supabase, row.master_id);
    if (!masterScript) {
      return {
        ok: true,
        idle: true,
        done: true,
        langueId,
        masterId: row.master_id,
        detail: "master pas encore prêt",
      };
    }
    await etapeTraduction(supabase, row, masterScript);
    row = (await chargerLangue(supabase, langueId))!;
    if (outOfTime(t0)) return resumerLangue(row, false, "traduction ok");

    let scenes = await chargerScenesLangue(supabase, langueId);
    const voixOk = await etapeVoix(supabase, row, scenes, t0);
    if (!voixOk) {
      row = (await chargerLangue(supabase, langueId))!;
      return resumerLangue(row, false, "voix en cours");
    }

    scenes = await chargerScenesLangue(supabase, langueId);
    const clips = await chargerClipsMaster(supabase, row.master_id);
    const mixOk = await etapeMix(supabase, row, scenes, clips, t0);
    if (!mixOk) {
      row = (await chargerLangue(supabase, langueId))!;
      return resumerLangue(row, false, "mix en cours");
    }

    scenes = await chargerScenesLangue(supabase, langueId);
    row = (await chargerLangue(supabase, langueId))!;
    const ass = etapeAssemblage(row);
    if (ass === "merge" || ass === "pad" || ass === "cadre") {
      if (ass === "merge" && Date.now() - t0 > 6_000) {
        return resumerLangue(row, false, "mix ok — assemblage");
      }
      await etapeRender(supabase, row, scenes);
      row = (await chargerLangue(supabase, langueId))!;
      const detail =
        ass === "cadre" ? "cadre ok" : ass === "pad" ? "pad ok" : "concat ok";
      return resumerLangue(row, false, detail);
    }

    await etapeKaraoke(supabase, row);
    row = (await chargerLangue(supabase, langueId))!;
    if (row.langue === "fr" && row.video_url) {
      await publierVideoFrMaster(supabase, row.master_id, {
        video_url: row.video_url,
        video_path: row.video_path,
      });
    }
    return resumerLangue(row, true, "langue prête");
  } catch (error) {
    if (estErreurQuotaFal(error)) {
      const msg = messageErreur(error);
      return {
        ok: true,
        idle: true,
        kick: false,
        done: false,
        langueId,
        masterId: row.master_id,
        langue: row.langue,
        statut: row.statut,
        detail: msg,
        error: msg,
      };
    }
    const msg = messageErreur(error);
    await patchLangue(
      supabase,
      langueId,
      { statut: "failed", etape: "failed", erreur: msg, busy: false },
      { etape: "erreur", detail: msg },
    );
    return {
      ok: false,
      done: true,
      langueId,
      masterId: row.master_id,
      langue: row.langue,
      statut: "failed",
      error: msg,
    };
  } finally {
    await releaseLangue(supabase, langueId);
  }
}

function resumerLangue(
  row: PapierLangueRow,
  done: boolean,
  detail: string,
): PapierLocaleTick {
  return {
    ok: true,
    done: done || row.statut === "ready",
    langueId: row.id,
    masterId: row.master_id,
    langue: row.langue,
    statut: row.statut,
    progression: row.progression,
    detail,
  };
}

export async function tickLocalesMaster(
  supabase: Supabase,
  masterId: string,
): Promise<PapierLocaleTick> {
  const script = await chargerScriptMaster(supabase, masterId);
  if (!script) {
    return { ok: true, idle: true, done: true, kick: false, masterId, detail: "master pas prêt" };
  }
  await assurerLangueMaster(supabase, masterId, "fr");
  const { data: rows, error } = await supabase
    .from("papier_langues")
    .select("id, langue, statut")
    .eq("master_id", masterId);
  if (error) throw error;
  const nextId = prochaineLangueATiquer((rows ?? []) as Array<{ id: string; langue: string; statut: string }>);
  if (!nextId) {
    return {
      ok: true,
      idle: true,
      done: true,
      kick: false,
      masterId,
      statut: "ready",
      detail: "toutes les langues prêtes",
    };
  }
  return avancerLangue(supabase, nextId);
}

export async function destickerLanguesMaster(
  supabase: Supabase,
  masterId: string,
): Promise<void> {
  await supabase
    .from("papier_langues")
    .update({ busy: false, updated_at: new Date().toISOString() })
    .eq("master_id", masterId)
    .eq("busy", true);
}

export async function relancerLangue(
  supabase: Supabase,
  id: string,
): Promise<PapierLangueRow> {
  const row = await chargerLangue(supabase, id);
  if (!row) throw new Error("Langue papier introuvable");
  if (langueBusyRecente(row)) return row;
  const scenes = await chargerScenesLangue(supabase, id);
  const statut = statutDepuisLocaleAssets({
    script: row.script,
    scenes,
    video_mix_url: row.video_mix_url,
    video_mix_path: row.video_mix_path,
    video_url: row.video_url,
    etape: row.etape,
  });
  const cadre =
    row.etape === "cadre" ||
    row.etape === "pad" ||
    (row.video_mix_path ?? "").includes("mix-raw") ||
    (row.video_mix_path ?? "").includes("mix-pad");
  await patchLangue(
    supabase,
    id,
    {
      statut: statut === "ready" ? "ready" : statut,
      erreur: null,
      busy: false,
      etape: cadre && statut !== "ready" ? "cadre" : statut,
    },
    { etape: "relancer", detail: `reprise → ${cadre ? "cadre" : statut}` },
  );
  const next = await chargerLangue(supabase, id);
  if (!next) throw new Error("Langue introuvable après relance");
  return next;
}

export async function reinitialiserVoixLangue(
  supabase: Supabase,
  langueId: string,
  voice: string,
): Promise<PapierLangueRow> {
  const row = await chargerLangue(supabase, langueId);
  if (!row) throw new Error("Langue papier introuvable");
  const scenes = await chargerScenesLangue(supabase, langueId);
  const paths = [
    ...scenes.flatMap((s) => [s.audio_path, s.mix_path]),
    row.video_path,
    row.video_mix_path,
  ].filter((p): p is string => Boolean(p));
  if (paths.length) {
    try {
      await supabase.storage.from(BUCKET).remove(paths);
    } catch {
      // best-effort
    }
  }
  for (const scene of scenes) {
    await patchSceneLangue(supabase, scene.id, {
      audio_path: null,
      audio_url: null,
      words: null,
      duree_sec: null,
      mix_path: null,
      mix_url: null,
    });
  }
  await patchLangue(
    supabase,
    langueId,
    {
      voice,
      video_path: null,
      video_url: null,
      video_mix_path: null,
      video_mix_url: null,
      statut: "voice",
      etape: "voix",
      progression: 0.15,
      erreur: null,
      busy: false,
    },
    { etape: "voix", detail: `voix → ${voice}` },
  );
  const next = await chargerLangue(supabase, langueId);
  if (!next) throw new Error("Langue introuvable après reset voix");
  return next;
}

export type PapierVoixResultat = {
  ok: true;
  masterId: string;
  voix: string;
  rebuildFr: boolean;
  langueId?: string;
};

/** Change la voix du master. Si le FR a déjà une voix, on la refait. */
export async function changerVoixMaster(
  supabase: Supabase,
  masterId: string,
  voiceBrut: string,
): Promise<PapierVoixResultat> {
  const voice = voiceBrut.trim();
  if (!estVoixPapier(voice)) throw new Error("Voix inconnue");

  const { data: master, error } = await supabase
    .from("papier_masters")
    .select("id, voice, statut")
    .eq("id", masterId)
    .maybeSingle();
  if (error) throw error;
  if (!master) throw new Error("Master papier introuvable");

  const { data: fr } = await supabase
    .from("papier_langues")
    .select("id, voice")
    .eq("master_id", masterId)
    .eq("langue", "fr")
    .maybeSingle();

  if ((master as { voice?: string }).voice === voice && (!fr || (fr as { voice?: string }).voice === voice)) {
    return { ok: true, masterId, voix: voice, rebuildFr: false, langueId: fr?.id };
  }

  const { error: errM } = await supabase
    .from("papier_masters")
    .update({ voice, updated_at: new Date().toISOString() })
    .eq("id", masterId);
  if (errM) throw errM;

  if (!fr) return { ok: true, masterId, voix: voice, rebuildFr: false };

  const scenes = await chargerScenesLangue(supabase, fr.id);
  const dejaVoix = scenes.some((s) => Boolean(s.audio_url));
  if (!dejaVoix) {
    await patchLangue(supabase, fr.id, { voice }, { etape: "voix", detail: voice });
    return { ok: true, masterId, voix: voice, rebuildFr: false, langueId: fr.id };
  }

  await reinitialiserVoixLangue(supabase, fr.id, voice);
  const { error: errReady } = await supabase
    .from("papier_masters")
    .update({
      video_url: null,
      video_path: null,
      statut: "clips",
      etape: "fr",
      progression: 0.72,
      erreur: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", masterId);
  if (errReady) throw errReady;
  return { ok: true, masterId, voix: voice, rebuildFr: true, langueId: fr.id };
}
