import { generateTextFast } from "../_shared/gemini.ts";
import { assertRole, json, messageErreur } from "../_shared/supabase.ts";

/**
 * Améliore une review admin (texte → texte) : mise en forme, phrases
 * complétées, orthographe/grammaire, toujours en anglais.
 *
 *   { texte }  → { ok, texte }
 */
const PROMPT = `You are an editor for short written feedback from an admin to a TikTok creator.

Rewrite the draft below.

Rules:
- Output English only, even if the draft is French or mixed.
- Fix spelling and grammar.
- Complete unfinished sentences without changing the meaning.
- Format into short, readable paragraphs.
- Keep the admin's intent, facts and tone. Do not invent details about the TikTok.
- Do not add a rigid template (what went well / to fix / next time) unless the draft already uses that structure.
- Do not add a greeting or signature unless the draft has one.
- Return only the improved review text. No quotes, no markdown, no preamble.

Draft:
`;

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;

  try {
    const body = await request.json();
    const texte = (body?.texte ?? "").toString();
    if (!texte.trim()) return json({ error: "Texte vide" }, 400);

    const brut = (await generateTextFast(`${PROMPT}${texte.trim()}`)).trim();
    const out = brut.replace(/^```(?:\w+)?\n?/, "").replace(/\n?```$/, "").trim();
    if (!out) return json({ error: "Amélioration vide" }, 502);
    return json({ ok: true, texte: out });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
