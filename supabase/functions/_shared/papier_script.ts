import { generateTextCreative } from "./gemini.ts";
import { scriptSystemPrompt, scriptUserPrompt, topicSystemPrompt } from "./papier_prompts.ts";
import {
  budgetScript,
  extraireJson,
  finaliserScript,
  type PapierKind,
  type PapierNarrationStyle,
  type PapierScript,
} from "./papier_script_core.ts";
import { normaliserCategorie, type PapierCategorie } from "./papier_sujets.ts";

const TARGET_SECONDS = 48;

export async function proposerTopicPapier(opts: {
  style?: PapierNarrationStyle;
  recents?: string[];
  categorie?: PapierCategorie | string;
}): Promise<string> {
  const style = opts.style ?? "revelation";
  const categorie = normaliserCategorie(opts.categorie);
  const seed = Math.random().toString(36).slice(2, 10);
  const texte = await generateTextCreative(
    `${topicSystemPrompt(style, opts.recents ?? [], seed, categorie)}\n\nPropose un sujet.`,
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
}): Promise<PapierScript> {
  const kind = opts.kind ?? "culture";
  const style = opts.style ?? "revelation";
  const budget = budgetScript(opts.targetSeconds ?? TARGET_SECONDS);
  const prompt = [
    scriptSystemPrompt(kind, budget.sceneCount, style, budget.wordsPerScene, budget.totalWords),
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
