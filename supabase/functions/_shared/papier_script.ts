import { generateTextCreative } from "./gemini.ts";
import {
  CLE_PROMPT_CTA,
  CLE_PROMPT_IMAGE,
  CLE_PROMPT_SCRIPT,
  CLE_PROMPT_VOIX,
  promptPapierOuDefaut,
} from "./papier_prompt_defauts.ts";
import {
  chargerPromptsPapier,
  scriptSystemPrompt,
  scriptUserPrompt,
  topicSystemPrompt,
  type PapierPromptsAdmin,
} from "./papier_prompts.ts";
import {
  budgetScript,
  extraireJson,
  finaliserScript,
  type PapierKind,
  type PapierNarrationStyle,
  type PapierScript,
} from "./papier_script_core.ts";
import { normaliserCategorie, type PapierCategorie } from "./papier_sujets.ts";
import { serviceClient } from "./supabase.ts";

const TARGET_SECONDS = 48;
type Supabase = ReturnType<typeof serviceClient>;

export async function proposerTopicPapier(opts: {
  style?: PapierNarrationStyle;
  recents?: string[];
  categorie?: PapierCategorie | string;
  supabase?: Supabase;
}): Promise<string> {
  const style = opts.style ?? "revelation";
  const categorie = normaliserCategorie(opts.categorie);
  const seed = Math.random().toString(36).slice(2, 10);
  const doctrine = opts.supabase
    ? (await chargerPromptsPapier(opts.supabase)).script_generation
    : undefined;
  const texte = await generateTextCreative(
    `${topicSystemPrompt(style, opts.recents ?? [], seed, categorie, doctrine)}\n\nPropose un sujet.`,
    1.1,
  );
  const parsed = extraireJson<{ topic?: string }>(texte);
  const topic = String(parsed.topic ?? "").trim();
  if (!topic) throw new Error("Sujet papier vide");
  return topic;
}

export async function ecrireScriptPapier(opts: {
  topic: string;
  kind?: PapierKind;
  style?: PapierNarrationStyle;
  targetSeconds?: number;
  categorie?: PapierCategorie | string;
  supabase?: Supabase;
}): Promise<PapierScript> {
  const kind = opts.kind ?? "culture";
  const style = opts.style ?? "revelation";
  const budget = budgetScript(opts.targetSeconds ?? TARGET_SECONDS);
  const prompts = opts.supabase
    ? await chargerPromptsPapier(opts.supabase)
    : promptsPapierDefaut();
  const prompt = [
    scriptSystemPrompt(kind, budget.sceneCount, style, budget.wordsPerScene, budget.totalWords, {
      doctrine: prompts.script_generation,
      cta: prompts.cta_sophia,
      voix: prompts.voice_delivery,
      imageStyle: prompts.image_style,
      categorie: normaliserCategorie(opts.categorie),
    }),
    "",
    scriptUserPrompt(kind, opts.topic),
    "Écris tout le script en français de France.",
  ].join("\n");
  const texte = await generateTextCreative(prompt, 0.85);
  const brut = extraireJson<Partial<PapierScript>>(texte);
  const script = finaliserScript(brut, budget.sceneCount);
  if (!script.scenes.length) throw new Error("Script papier vide");
  return script;
}

function promptsPapierDefaut(): PapierPromptsAdmin {
  return {
    script_generation: promptPapierOuDefaut(CLE_PROMPT_SCRIPT),
    voice_delivery: promptPapierOuDefaut(CLE_PROMPT_VOIX),
    cta_sophia: promptPapierOuDefaut(CLE_PROMPT_CTA),
    image_style: promptPapierOuDefaut(CLE_PROMPT_IMAGE),
  };
}
