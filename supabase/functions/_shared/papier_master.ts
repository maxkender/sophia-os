/**
 * Pipeline master papier FR : topic → script → images → clips → voix FR + karaoké.
 * Un tick ≤ 42 s. Ready = vidéo FR en bibliothèque. Pas de fan-out 14 langues.
 */

import { editerNanoBananaPro, genererNanoBananaPro } from "./fal_nano_banana.ts";
import { attendreSeedanceI2V, soumettreSeedanceI2V, type SeedanceQueued } from "./fal_seedance.ts";
import { ecrireScriptPapier, proposerTopicPapier } from "./papier_script.ts";
import {
  chargerReglagesPapier,
  dureeCibleClipReglee,
  estErreurQuotaFal,
  reserverFalPapier,
  voixPourLangue,
} from "./papier_reglages.ts";
import { normaliserCategorie, type PapierCategorie } from "./papier_sujets.ts";
import {
  doitAttendreValidation,
  normaliserPipelineHold,
  normaliserPipelineMode,
  type PapierPipelineHold,
  type PapierPipelineMode,
} from "./papier_pipeline.ts";
import {
  masterClipsComplets,
  statutMasterDepuisAssets,
} from "./papier_assignation_core.ts";
import {
  bibleVisuelle,
  coverPromptPapier,
  motionPromptPapier,
  storyContext,
  type PapierKind,
  type PapierNarrationStyle,
  type PapierScript,
} from "./papier_script_core.ts";
import { aujourdhuiParis, messageErreur, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
const TICK_BUDGET_MS = 42_000;

const started = () => Date.now();
const remaining = (t0: number) => Math.max(0, TICK_BUDGET_MS - (Date.now() - t0));
const outOfTime = (t0: number) => remaining(t0) < 4_000;

export type PapierStatut =
  | "queued"
  | "scripting"
  | "images"
  | "clips"
  | "ready"
  | "failed"
  | "stopped";

export type PapierMasterRow = {
  id: string;
  date_publication: string;
  topic: string | null;
  topic_categorie?: PapierCategorie | string | null;
  kind: PapierKind;
  narration_style: PapierNarrationStyle;
  script: PapierScript | null;
  statut: PapierStatut;
  etape: string | null;
  progression: number;
  erreur: string | null;
  busy: boolean;
  video_url?: string | null;
  video_path?: string | null;
  voice?: string | null;
  pipeline_mode?: PapierPipelineMode | string | null;
  pipeline_hold?: PapierPipelineHold | string | null;
  duree_cible_sec?: number | null;
  annule?: boolean | null;
  journal: Array<{ at: string; etape: string; detail: string }>;
  updated_at?: string;
};

export type PapierMasterOpts = {
  topic?: string;
  date?: string;
  voice?: string;
  applicationId?: string | null;
  topicCategorie?: string;
  narrationStyle?: PapierNarrationStyle | string;
  pipelineMode?: PapierPipelineMode | string;
  dureeCibleSec?: number;
};

export type PapierSceneRow = {
  id: string;
  master_id: string;
  index: number;
  narration: string;
  overlay: string;
  image_prompt: string;
  video_prompt: string;
  image_path: string | null;
  image_url: string | null;
  clip_path: string | null;
  clip_url: string | null;
  clip_fal: SeedanceQueued | null;
  duree_cible: 4 | 6 | 8;
};

export type PapierTickResultat = {
  ok: boolean;
  idle?: boolean;
  done: boolean;
  masterId?: string;
  date?: string;
  statut?: PapierStatut;
  progression?: number;
  detail?: string;
  kick?: boolean;
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

async function chargerMaster(
  supabase: Supabase,
  id: string,
): Promise<PapierMasterRow | null> {
  const { data, error } = await supabase.from("papier_masters").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PapierMasterRow | null) ?? null;
}

async function chargerScenes(supabase: Supabase, masterId: string): Promise<PapierSceneRow[]> {
  const { data, error } = await supabase
    .from("papier_scenes")
    .select("*")
    .eq("master_id", masterId)
    .order("index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PapierSceneRow[];
}

async function patchMaster(
  supabase: Supabase,
  id: string,
  patch: Record<string, unknown>,
  journal?: { etape: string; detail: string },
): Promise<void> {
  const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (journal) {
    const row = await chargerMaster(supabase, id);
    const prev = row?.journal ?? [];
    next.journal = [...prev, { at: new Date().toISOString(), ...journal }].slice(-40);
  }
  const { error } = await supabase.from("papier_masters").update(next).eq("id", id);
  if (error) throw error;
}

async function patchScene(
  supabase: Supabase,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("papier_scenes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

function statutDepuisAssets(master: PapierMasterRow, scenes: PapierSceneRow[]): PapierStatut {
  return statutMasterDepuisAssets(master, scenes);
}

/** Clips Seedance tous là — on peut assembler la voix FR (pas encore bibliothèque). */
export async function assurerMasterPretSiClips(
  supabase: Supabase,
  masterId: string,
): Promise<boolean> {
  const master = await chargerMaster(supabase, masterId);
  if (!master || master.statut === "failed") return false;
  const scenes = await chargerScenes(supabase, masterId);
  return Boolean(master.script && masterClipsComplets(scenes));
}

export async function publierVideoFrMaster(
  supabase: Supabase,
  masterId: string,
  video: { video_url: string; video_path?: string | null },
): Promise<void> {
  await patchMaster(
    supabase,
    masterId,
    {
      statut: "ready",
      etape: "ready",
      progression: 1,
      erreur: null,
      video_url: video.video_url,
      video_path: video.video_path ?? null,
    },
    { etape: "fr", detail: "vidéo FR en bibliothèque" },
  );
}

function progressionDepuis(statut: PapierStatut, scenes: PapierSceneRow[]): number {
  if (statut === "queued") return 0;
  if (statut === "scripting") return 0.08;
  if (statut === "ready") return 1;
  if (scenes.length === 0) return 0.12;
  const img = scenes.filter((s) => s.image_url).length;
  const clips = scenes.filter((s) => s.clip_url).length;
  if (statut === "images") return 0.15 + 0.35 * (img / scenes.length);
  return 0.5 + 0.5 * (clips / scenes.length);
}

async function sujetsRecents(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase
    .from("papier_masters")
    .select("topic")
    .not("topic", "is", null)
    .order("date_publication", { ascending: false })
    .limit(14);
  return (data ?? []).map((r) => String((r as { topic?: string }).topic ?? "").trim()).filter(Boolean);
}

function styleDepuis(v: unknown, fallback: PapierNarrationStyle): PapierNarrationStyle {
  const s = String(v ?? "").trim();
  if (s === "question" || s === "revelation" || s === "storytelling" || s === "listicle") {
    return s;
  }
  return fallback;
}

export async function creerMasterBibliotheque(
  supabase: Supabase,
  opts?: PapierMasterOpts,
): Promise<PapierMasterRow> {
  const jour = opts?.date ?? aujourdhuiParis();
  const topic = opts?.topic?.trim() || null;
  const reglages = await chargerReglagesPapier(supabase);
  const voice = opts?.voice?.trim() || voixPourLangue(reglages, "fr");
  const mode = normaliserPipelineMode(opts?.pipelineMode ?? reglages.pipeline_mode);
  const categorie = normaliserCategorie(opts?.topicCategorie ?? reglages.topic_categorie);
  const style = styleDepuis(opts?.narrationStyle ?? reglages.narration_style, "revelation");
  const duree = Number(opts?.dureeCibleSec ?? reglages.duree_cible_sec);
  const { data, error } = await supabase
    .from("papier_masters")
    .insert({
      date_publication: jour,
      topic,
      topic_categorie: categorie,
      kind: "culture",
      narration_style: style,
      voice,
      pipeline_mode: mode,
      pipeline_hold: null,
      duree_cible_sec: Number.isFinite(duree) ? Math.min(90, Math.max(20, Math.round(duree))) : 48,
      annule: false,
      statut: "queued",
      etape: "topic",
      progression: 0,
      ...(opts?.applicationId ? { application_id: opts.applicationId } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PapierMasterRow;
}

/** Reprend le master en cours, sinon en crée un nouveau (bibliothèque). */
export async function masterEnCoursOuNouveau(
  supabase: Supabase,
  opts?: PapierMasterOpts,
): Promise<PapierMasterRow> {
  let q = supabase
    .from("papier_masters")
    .select("*")
    .not("statut", "in", "(ready,failed,stopped)")
    .order("created_at", { ascending: true })
    .limit(1);
  if (opts?.applicationId) q = q.eq("application_id", opts.applicationId);
  const { data: enCours, error } = await q.maybeSingle();
  if (error) throw error;
  if (enCours) {
    const row = enCours as PapierMasterRow;
    const topic = opts?.topic?.trim();
    if (topic && !row.topic) {
      await patchMaster(supabase, row.id, { topic }, { etape: "topic", detail: topic });
      row.topic = topic;
    }
    return row;
  }
  return creerMasterBibliotheque(supabase, opts);
}

/** @deprecated préfère masterEnCoursOuNouveau — plus un master unique par jour. */
export async function assurerMasterJour(
  supabase: Supabase,
  opts?: PapierMasterOpts,
): Promise<PapierMasterRow> {
  return masterEnCoursOuNouveau(supabase, opts);
}

export async function relancerMaster(supabase: Supabase, id: string): Promise<PapierMasterRow> {
  const master = await chargerMaster(supabase, id);
  if (!master) throw new Error("Master papier introuvable");
  const scenes = await chargerScenes(supabase, id);
  const statut = statutDepuisAssets(master, scenes);
  await patchMaster(
    supabase,
    id,
    {
      statut: statut === "ready" ? "ready" : statut,
      erreur: null,
      etape: statut,
      busy: false,
      annule: false,
    },
    { etape: "relancer", detail: `reprise → ${statut}` },
  );
  const next = await chargerMaster(supabase, id);
  if (!next) throw new Error("Master papier introuvable après relance");
  return next;
}

export async function regenererMaster(
  supabase: Supabase,
  id: string,
  topic?: string,
): Promise<PapierMasterRow> {
  const master = await chargerMaster(supabase, id);
  if (!master) throw new Error("Master papier introuvable");
  const scenes = await chargerScenes(supabase, id);
  const paths = scenes
    .flatMap((s) => [s.image_path, s.clip_path])
    .filter((p): p is string => Boolean(p));
  if (paths.length) {
    try {
      await supabase.storage.from(BUCKET).remove(paths);
    } catch {
      // best-effort
    }
  }
  await supabase.from("papier_langues").delete().eq("master_id", id);
  await supabase.from("papier_scenes").delete().eq("master_id", id);
  await patchMaster(
    supabase,
    id,
    {
      topic: topic?.trim() || null,
      script: null,
      statut: "queued",
      etape: "topic",
      progression: 0,
      erreur: null,
      busy: false,
      video_url: null,
      video_path: null,
      pipeline_hold: null,
      annule: false,
    },
    { etape: "regenerer", detail: topic?.trim() || "reset" },
  );
  const next = await chargerMaster(supabase, id);
  if (!next) throw new Error("Master papier introuvable après reset");
  return next;
}

async function etapeTopic(supabase: Supabase, master: PapierMasterRow): Promise<void> {
  if (master.topic?.trim()) return;
  await patchMaster(supabase, master.id, { statut: "scripting", etape: "topic", progression: 0.04 });
  const recents = await sujetsRecents(supabase);
  const topic = await proposerTopicPapier({
    style: master.narration_style,
    categorie: master.topic_categorie ?? undefined,
    recents: recents.filter((t) => t !== master.topic),
  });
  master.topic = topic;
  const mode = normaliserPipelineMode(master.pipeline_mode);
  const hold = mode === "manuel" ? "topic" : null;
  await patchMaster(
    supabase,
    master.id,
    {
      topic,
      statut: "scripting",
      etape: hold ? "topic" : "script",
      pipeline_hold: hold,
      progression: 0.08,
    },
    { etape: "topic", detail: topic },
  );
  master.pipeline_hold = hold;
}

async function claimMaster(supabase: Supabase, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("papier_masters")
    .update({ busy: true, updated_at: now })
    .eq("id", id)
    .eq("busy", false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data) return true;
  const row = await chargerMaster(supabase, id);
  if (!row) return false;
  const stale = Date.parse(row.updated_at ?? "") || 0;
  if (row.busy && Date.now() - stale > 180_000) {
    const { data: steal } = await supabase
      .from("papier_masters")
      .update({ busy: true, updated_at: now })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    return Boolean(steal);
  }
  return false;
}

async function releaseMaster(supabase: Supabase, id: string): Promise<void> {
  await supabase
    .from("papier_masters")
    .update({ busy: false, updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function etapeScript(supabase: Supabase, master: PapierMasterRow): Promise<void> {
  const exist = await chargerScenes(supabase, master.id);
  if (exist.length) return;
  const topic = master.topic?.trim();
  if (!topic) throw new Error("Sujet manquant");
  await patchMaster(supabase, master.id, { statut: "scripting", etape: "script", progression: 0.1 });
  const reglages = await chargerReglagesPapier(supabase);
  const targetSeconds = Number(master.duree_cible_sec) || reglages.duree_cible_sec;
  const script = await ecrireScriptPapier({
    topic,
    kind: master.kind,
    style: master.narration_style,
    targetSeconds,
  });
  const rows = script.scenes.map((s) => ({
    master_id: master.id,
    index: s.index,
    narration: s.narration,
    overlay: s.overlay,
    image_prompt: s.imagePrompt,
    video_prompt: s.videoPrompt,
    duree_cible: dureeCibleClipReglee(s.narration, reglages.duree_clip),
  }));
  const { error } = await supabase.from("papier_scenes").insert(rows);
  if (error) throw error;
  master.script = script;
  const mode = normaliserPipelineMode(master.pipeline_mode);
  const hold = mode === "manuel" ? "script" : null;
  await patchMaster(
    supabase,
    master.id,
    {
      script,
      statut: hold ? "scripting" : "images",
      etape: hold ? "script" : "images",
      pipeline_hold: hold,
      progression: 0.15,
    },
    { etape: "script", detail: `${script.scenes.length} plans — ${script.title}` },
  );
  master.pipeline_hold = hold;
}

async function etapeImages(
  supabase: Supabase,
  master: PapierMasterRow,
  scenes: PapierSceneRow[],
  t0: number,
): Promise<boolean> {
  const bible = bibleVisuelle(master.script);
  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.image_url) continue;
    if (await masterEstAnnule(supabase, master.id)) return false;

    const refs: string[] = [];
    if (scenes[0]?.image_url) refs.push(scenes[0].image_url);
    const prev = scenes[i - 1]?.image_url;
    if (prev && prev !== scenes[0]?.image_url) refs.push(prev);

    const base = coverPromptPapier(scene.image_prompt || scene.narration, {
      bible,
      story: storyContext(scenes, i),
    });
    const prompt = refs.length
      ? `${base}\n\nThe attached image${refs.length > 1 ? "s are" : " is"} a STYLE AND CHARACTER REFERENCE: keep EXACTLY the same characters (same faces, same hair, same clothing shapes and colours), the same materials, palette and lighting, so the video reads as one single illustrated story. Do not copy the composition — render the new scene described above as the next shot of that same story.`
      : base;

    await reserverFalPapier(supabase);
    const img = refs.length
      ? await editerNanoBananaPro(refs, prompt, undefined, { aspectRatio: "9:16" })
      : await genererNanoBananaPro(prompt);

    const path = `papiers/${master.id}/img-${i}.png`;
    const url = await uploader(supabase, path, img.bytes, img.mime.includes("png") ? img.mime : "image/png");
    scene.image_path = path;
    scene.image_url = url;
    await patchScene(supabase, scene.id, { image_path: path, image_url: url });
    const done = scenes.filter((s) => s.image_url).length;
    await patchMaster(supabase, master.id, {
      statut: "images",
      etape: "images",
      progression: 0.15 + 0.35 * (done / scenes.length),
    });
    // Une image par tick : Nano Banana peut manger le budget.
    return false;
  }
  await patchMaster(
    supabase,
    master.id,
    { statut: "clips", etape: "clips", progression: 0.5 },
    { etape: "images", detail: `${scenes.length} images` },
  );
  return true;
}

async function etapeClips(
  supabase: Supabase,
  master: PapierMasterRow,
  scenes: PapierSceneRow[],
  t0: number,
): Promise<boolean> {
  const bible = bibleVisuelle(master.script);
  for (let i = 0; i < scenes.length; i++) {
    if (outOfTime(t0)) return false;
    const scene = scenes[i]!;
    if (scene.clip_url) continue;
    if (await masterEstAnnule(supabase, master.id)) return false;
    if (!scene.image_url) throw new Error(`Plan ${i + 1} sans image`);

    if (!scene.clip_fal?.request_id && !scene.clip_fal?.status_url) {
      await reserverFalPapier(supabase);
      const queued = await soumettreSeedanceI2V({
        prompt: motionPromptPapier(scene.video_prompt || scene.narration, {
          bible,
          story: storyContext(scenes, i),
        }),
        imageUrl: scene.image_url,
        duree: scene.duree_cible,
      });
      scene.clip_fal = queued;
      await patchScene(supabase, scene.id, { clip_fal: queued });
    }

    const poll = await attendreSeedanceI2V(scene.clip_fal!, undefined, remaining(t0));
    if (!poll.done) return false;

    const path = `papiers/${master.id}/clip-${i}.mp4`;
    const url = await uploader(supabase, path, poll.bytes, poll.mime);
    scene.clip_path = path;
    scene.clip_url = url;
    scene.clip_fal = null;
    await patchScene(supabase, scene.id, {
      clip_path: path,
      clip_url: url,
      clip_fal: null,
    });
    const done = scenes.filter((s) => s.clip_url).length;
    if (done < scenes.length) {
      await patchMaster(supabase, master.id, {
        statut: "clips",
        etape: "clips",
        progression: 0.5 + 0.5 * (done / scenes.length),
      });
      return false;
    }
  }
  await patchMaster(
    supabase,
    master.id,
    { statut: "clips", etape: "fr", progression: 0.72, erreur: null },
    { etape: "clips", detail: `${scenes.length} clips — FR à assembler` },
  );
  return true;
}

export async function avancerMaster(
  supabase: Supabase,
  masterId: string,
): Promise<PapierTickResultat> {
  const t0 = started();
  let master = await chargerMaster(supabase, masterId);
  if (!master) throw new Error("Master papier introuvable");
  if (master.statut === "ready") {
    return {
      ok: true,
      done: true,
      masterId,
      date: master.date_publication,
      statut: "ready",
      progression: 1,
      detail: "déjà prêt",
    };
  }
  if (master.statut === "failed") {
    return {
      ok: false,
      done: true,
      masterId,
      date: master.date_publication,
      statut: "failed",
      error: master.erreur ?? "échec",
      detail: "en échec — relancer",
    };
  }
  if (master.statut === "stopped" || master.annule) {
    return {
      ok: true,
      idle: true,
      done: true,
      kick: false,
      masterId,
      date: master.date_publication,
      statut: "stopped",
      detail: "pipeline arrêtée",
    };
  }
  if (
    doitAttendreValidation({
      mode: normaliserPipelineMode(master.pipeline_mode),
      hold: normaliserPipelineHold(master.pipeline_hold),
    })
  ) {
    return {
      ok: true,
      idle: true,
      done: false,
      kick: false,
      masterId,
      date: master.date_publication,
      statut: master.statut,
      detail: master.pipeline_hold === "topic" ? "en attente du sujet" : "en attente du script",
    };
  }

  const claimed = await claimMaster(supabase, masterId);
  if (!claimed) {
    return {
      ok: true,
      idle: true,
      done: false,
      kick: false,
      masterId,
      date: master.date_publication,
      statut: master.statut,
      detail: "tick déjà en cours",
    };
  }

  try {
    await etapeTopic(supabase, master);
    master = (await chargerMaster(supabase, masterId))!;
    if (master.annule || master.statut === "stopped") {
      return resumer(master, true, "pipeline arrêtée");
    }
    if (normaliserPipelineHold(master.pipeline_hold) === "topic") {
      return { ...resumer(master, false, "sujet à valider"), idle: true, kick: false };
    }
    if (outOfTime(t0)) {
      return resumer(master, false, "sujet ok — tick suivant");
    }

    await etapeScript(supabase, master);
    master = (await chargerMaster(supabase, masterId))!;
    if (master.annule || master.statut === "stopped") {
      return resumer(master, true, "pipeline arrêtée");
    }
    if (normaliserPipelineHold(master.pipeline_hold) === "script") {
      return { ...resumer(master, false, "script à valider"), idle: true, kick: false };
    }
    if (outOfTime(t0)) {
      return resumer(master, false, "script ok — tick suivant");
    }

    let scenes = await chargerScenes(supabase, masterId);
    const imagesOk = await etapeImages(supabase, master, scenes, t0);
    if (!imagesOk) {
      master = (await chargerMaster(supabase, masterId))!;
      scenes = await chargerScenes(supabase, masterId);
      return resumer(master, false, "images en cours", scenes);
    }

    scenes = await chargerScenes(supabase, masterId);
    const clipsOk = await etapeClips(supabase, master, scenes, t0);
    master = (await chargerMaster(supabase, masterId))!;
    scenes = await chargerScenes(supabase, masterId);
    if (!clipsOk) return resumer(master, false, "clips en cours", scenes);
    if (master.video_url) return resumer(master, true, "déjà en bibliothèque", scenes);
    return resumer(master, true, "clips ok — FR à assembler", scenes);
  } catch (error) {
    if (estErreurQuotaFal(error)) {
      const msg = messageErreur(error);
      return {
        ok: true,
        idle: true,
        kick: false,
        done: false,
        masterId,
        date: master.date_publication,
        statut: master.statut,
        detail: msg,
        error: msg,
      };
    }
    const msg = messageErreur(error);
    await patchMaster(
      supabase,
      masterId,
      { statut: "failed", etape: "failed", erreur: msg, busy: false },
      { etape: "erreur", detail: msg },
    );
    return {
      ok: false,
      done: true,
      masterId,
      date: master.date_publication,
      statut: "failed",
      error: msg,
    };
  } finally {
    await releaseMaster(supabase, masterId);
  }
}

function resumer(
  master: PapierMasterRow,
  done: boolean,
  detail: string,
  scenes: PapierSceneRow[] = [],
): PapierTickResultat {
  const statut =
    master.statut === "failed"
      ? "failed"
      : master.statut === "stopped" || master.annule
        ? "stopped"
        : statutDepuisAssets(master, scenes);
  return {
    ok: true,
    done: done || statut === "ready",
    masterId: master.id,
    date: master.date_publication,
    statut,
    progression: progressionDepuis(statut, scenes),
    detail,
  };
}

async function masterEstAnnule(supabase: Supabase, id: string): Promise<boolean> {
  const row = await chargerMaster(supabase, id);
  return Boolean(row?.annule || row?.statut === "stopped");
}

export async function arreterMaster(supabase: Supabase, id: string): Promise<PapierMasterRow> {
  const master = await chargerMaster(supabase, id);
  if (!master) throw new Error("Master papier introuvable");
  if (master.statut === "ready") return master;
  await patchMaster(
    supabase,
    id,
    { statut: "stopped", etape: "stopped", annule: true, busy: false, erreur: null },
    { etape: "stop", detail: "arrêté par l'admin" },
  );
  const next = await chargerMaster(supabase, id);
  if (!next) throw new Error("Master papier introuvable après arrêt");
  return next;
}

export async function validerEtapeMaster(
  supabase: Supabase,
  id: string,
  opts?: { topic?: string },
): Promise<PapierMasterRow> {
  const master = await chargerMaster(supabase, id);
  if (!master) throw new Error("Master papier introuvable");
  const hold = normaliserPipelineHold(master.pipeline_hold);
  const patch: Record<string, unknown> = {
    pipeline_hold: null,
    annule: false,
    erreur: null,
  };
  if (hold === "topic") {
    const topic = opts?.topic?.trim() || master.topic;
    if (!topic) throw new Error("Sujet manquant");
    patch.topic = topic;
    patch.statut = "scripting";
    patch.etape = "script";
  } else if (hold === "script") {
    if (!master.script) throw new Error("Script manquant");
    patch.statut = "images";
    patch.etape = "images";
  }
  await patchMaster(supabase, id, patch, {
    etape: "valider",
    detail: hold ?? "ok",
  });
  const next = await chargerMaster(supabase, id);
  if (!next) throw new Error("Master papier introuvable après validation");
  return next;
}

export async function tickPapierJour(
  supabase: Supabase,
  opts?: PapierMasterOpts & { masterId?: string },
): Promise<PapierTickResultat> {
  const master = opts?.masterId
    ? await chargerMaster(supabase, opts.masterId)
    : await masterEnCoursOuNouveau(supabase, {
        date: opts?.date,
        topic: opts?.topic,
        voice: opts?.voice,
      });
  if (!master) {
    return { ok: true, idle: true, done: true, detail: "aucun master" };
  }
  if (opts?.topic?.trim() && !master.topic) {
    await patchMaster(supabase, master.id, { topic: opts.topic.trim() });
  }
  return avancerMaster(supabase, master.id);
}

export function kickPapierCm(request: Request, body: Record<string, unknown> = {}): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/papier-cm`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  const p = fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "tick", ...body }),
  })
    .then(async (res) => {
      await res.text();
    })
    .catch(() => null);

  if (edge?.waitUntil) edge.waitUntil(p);
}
