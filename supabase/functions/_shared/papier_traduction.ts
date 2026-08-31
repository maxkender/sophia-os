import { generateTextCreative } from "./gemini.ts";
import { extraireJson, type PapierScript } from "./papier_script_core.ts";
import {
  finaliserTraductionPapier,
  nomLangueModele,
  type PapierScriptTraduit,
} from "./papier_locales_core.ts";

export async function traduireScriptPapier(
  script: PapierScript,
  langue: string,
  rules?: string,
): Promise<PapierScriptTraduit> {
  const cible = nomLangueModele(langue);
  const prompt = `LANGUE DE SORTIE : ${cible.toUpperCase()}.
Traduis ce script de vidéo courte TikTok (papercraft / culture générale) en ${cible}.
Idiomatique, oral, tutoiement / registre familier de la langue cible.
Pas de traduction mot à mot. Pas d'anglais résiduel sauf noms propres.

${rules?.trim() ? `Règles supplémentaires :\n${rules.trim()}\n` : ""}
RÈGLE SOPHIA : le mot « Sophia » (nom de l'appli, NE PAS traduire, JAMAIS « Sofia ») apparaît EXACTEMENT UNE FOIS, uniquement dans le CTA. Ailleurs dis l'équivalent local de « l'appli ».
Le champ overlay fait 3 à 6 mots, percutant.
hashtags : exactement 3 tags natifs TikTok, préfixe #.

Script source (JSON) :
${JSON.stringify({
  title: script.title,
  hook: script.hook,
  cta: script.cta,
  hashtags: script.hashtags,
  scenes: script.scenes.map((s) => ({
    index: s.index,
    narration: s.narration,
    overlay: s.overlay,
  })),
})}

Réponds uniquement en JSON :
{"title":string,"hook":string,"cta":string,"hashtags":["#a","#b","#c"],"scenes":[{"index":number,"narration":string,"overlay":string}]}`;

  const texte = await generateTextCreative(prompt, 0.4);
  const brut = extraireJson<Partial<PapierScriptTraduit>>(texte);
  return finaliserTraductionPapier(brut, script.scenes.length);
}
