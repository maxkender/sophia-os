/**
 * 31/10 — Quality Control : le texte des posts tirés au hasard, traduit en
 * anglais pour la relecture (CTA présent, traduction juste). Fonctions pures :
 * l'appel au modèle est dans la fonction ckd (action qc_traduire).
 */

export type SlideQc = { position?: string | number | null; texte: string; appli?: boolean };
export type PostQc = { id: string; langue: string | null; slides: SlideQc[] };

/** Anglais d'origine : pas de traduction, le texte est repris tel quel. */
export function estAnglais(langue: string | null | undefined): boolean {
  return /^en(\b|-|_|$)/i.test(String(langue ?? "").trim());
}

/** Un seul appel pour un lot de posts (un label) : JSON en entrée et en sortie. */
export function promptTraduction(posts: PostQc[]): string {
  const entree = posts.map((p) => ({ id: p.id, language: p.langue ?? "?", slides: p.slides.map((s) => s.texte) }));
  return [
    "You are checking TikTok slideshows posted in many languages. Translate every slide into English.",
    "Rules:",
    "- Translate faithfully, slide by slide, keeping the same number of slides and the same order.",
    "- Do NOT fix, improve or complete the text: if a sentence is broken, odd or untranslated, keep that visible.",
    "- Keep app names, @handles, emojis, numbers and line breaks as they are.",
    "- A slide already in English is copied unchanged. An empty slide stays an empty string.",
    'Answer with JSON only, no comment, in this exact shape: {"posts":[{"id":"…","slides":["…","…"]}]}',
    "",
    JSON.stringify({ posts: entree }),
  ].join("\n");
}

/** La réponse du modèle → id → slides en anglais. Un post mal rendu (nombre de slides différent) est ignoré. */
export function lireTraduction(reponse: string, posts: PostQc[]): Map<string, string[]> {
  const sortie = new Map<string, string[]>();
  const brut = reponse.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return sortie;
  let lu: unknown;
  try {
    lu = JSON.parse(brut.slice(debut, fin + 1));
  } catch {
    return sortie;
  }
  const liste = (lu as { posts?: unknown })?.posts;
  if (!Array.isArray(liste)) return sortie;
  const attendus = new Map(posts.map((p) => [p.id, p.slides.length]));
  for (const x of liste) {
    const id = typeof x?.id === "string" ? x.id : null;
    const slides = Array.isArray(x?.slides) ? x.slides.map((s: unknown) => (typeof s === "string" ? s : String(s ?? ""))) : null;
    if (!id || !slides || attendus.get(id) !== slides.length) continue;
    sortie.set(id, slides);
  }
  return sortie;
}
