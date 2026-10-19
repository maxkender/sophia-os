import { ocrSlideImport } from "../_shared/gemini.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Test À BLANC de la règle « un TikTok avec un sticker n'est pas importé »
 * (`ocrSlideImport`, étapes OCR de `import_contenu.ts`) sur des slideshows
 * déjà importés. Rien n'est écrit.
 *
 *   { action: "tirer", n?: 100 }
 *     → { slideshows: [{ id, titre, created_at, slides: [{ position, url }] }] }
 *     n slideshows valides tirés au hasard parmi les POOL derniers imports qui
 *     ont gardé leurs images brutes (celles que l'OCR d'import lit).
 *   { action: "analyser", contenuId }
 *     → { id, sticker, slides: [{ position, url, sticker, texte, erreur? }] }
 *     l'OCR d'import sur chaque slide, en parallèle. L'import s'arrête au
 *     premier sticker ; ici toutes les slides sont lues, pour montrer lesquelles.
 *
 * Le parallélisme entre slideshows est piloté par le navigateur (un appel par
 * slideshow) : 100 slideshows dans un seul appel dépasseraient les 150 s d'une
 * Edge Function.
 */

const POOL = 2000;
const N_MAX = 200;

interface SlideBrute {
  position: number;
  raw_url?: string | null;
  reference_url?: string | null;
}

function slidesAvecImage(structure: unknown): Array<{ position: number; url: string }> {
  const slides = (Array.isArray(structure) ? structure : []) as SlideBrute[];
  return slides
    .map((s) => ({ position: Number(s.position), url: s.raw_url ?? s.reference_url ?? "" }))
    .filter((s) => s.url)
    .sort((a, b) => a.position - b.position);
}

function tirer<T>(liste: T[], n: number): T[] {
  const copie = [...liste];
  const k = Math.min(n, copie.length);
  for (let i = 0; i < k; i += 1) {
    const j = i + Math.floor(Math.random() * (copie.length - i));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, k);
}

async function tirerSlideshows(n: number) {
  const supabase = serviceClient();
  const { data: pool, error } = await supabase
    .from("contenus")
    .select("id")
    .eq("statut", "valide")
    .eq("import_statut", "done")
    .not("structure_slides->0->>raw_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(POOL);
  if (error) throw error;

  const ids = tirer((pool ?? []).map((r) => r.id as string), n);
  if (ids.length === 0) return { slideshows: [] };

  const { data, error: e2 } = await supabase
    .from("contenus")
    .select("id, titre, created_at, structure_slides")
    .in("id", ids);
  if (e2) throw e2;

  const slideshows = (data ?? [])
    .map((c) => ({
      id: c.id as string,
      titre: (c.titre as string | null) ?? null,
      created_at: c.created_at as string,
      slides: slidesAvecImage(c.structure_slides),
    }))
    .filter((c) => c.slides.length > 0);
  return { slideshows };
}

async function analyser(contenuId: string) {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("contenus")
    .select("id, structure_slides")
    .eq("id", contenuId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Contenu introuvable");

  const slides = await Promise.all(
    slidesAvecImage(data.structure_slides).map(async ({ position, url }) => {
      try {
        const texte = await ocrSlideImport(url);
        return { position, url, sticker: texte === null, texte: texte ?? "" };
      } catch (error) {
        return { position, url, sticker: false, texte: "", erreur: messageErreur(error) };
      }
    }),
  );
  return { id: contenuId, sticker: slides.some((s) => s.sticker), slides };
}

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { action?: string; n?: number; contenuId?: string } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }

  try {
    if (corps.action === "tirer") {
      const n = Math.max(1, Math.min(N_MAX, Math.round(Number(corps.n ?? 100)) || 100));
      return json(await tirerSlideshows(n));
    }
    if (corps.action === "analyser") {
      if (!corps.contenuId) return json({ error: "contenuId requis" }, 400);
      return json(await analyser(corps.contenuId));
    }
    return json({ error: "action inconnue (tirer | analyser)" }, 400);
  } catch (error) {
    return json({ error: messageErreur(error) }, 500);
  }
});
