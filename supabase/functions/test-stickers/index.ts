import { ocrSlideImport } from "../_shared/gemini.ts";
import { lireParLots, lireTout } from "../_shared/lots.ts";
import { avecReprise, slidesAvecImage } from "../_shared/nettoyage_stickers.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Test À BLANC de la règle « un TikTok avec un sticker n'est pas importé »
 * (`ocrSlideImport`, étapes OCR de `import_contenu.ts`) sur des slideshows
 * déjà importés. Rien n'est écrit.
 *
 *   { action: "tirer", n?: 100 }
 *     → { slideshows: [{ id, titre, created_at, slides: [{ position, url }] }] }
 *     n slideshows tirés au hasard parmi TOUS les imports valides qui ont
 *     gardé leurs images brutes (celles que l'OCR d'import lit), hors pods
 *     (passe-droit : la règle ne les vise pas) — lecture paginée, PostgREST
 *     plafonnant une réponse à 1 000 lignes.
 *   { action: "analyser", contenuId }
 *     → { id, rejete, contenu, slides: [{ position, url, sticker, texte, erreur? }] }
 *     l'OCR d'import sur chaque slide, en parallèle ; `sticker` vaut "pub",
 *     "contenu" ou null. `rejete` : au moins une pub (le TikTok ne serait pas
 *     importé) ; `contenu` : au moins un sticker de contenu (importé quand
 *     même). L'import s'arrête à la première pub ; ici toutes les slides sont
 *     lues, pour montrer lesquelles.
 *
 * Une slide dont l'image n'a pas pu être téléchargée est rejouée
 * (`avecReprise`) ; si elle échoue encore, elle porte `erreur`.
 * Le nettoyage d'un label, lui, tourne côté serveur : `nettoyer-stickers`.
 *
 * Le parallélisme entre slideshows est piloté par le navigateur (un appel par
 * slideshow) : 100 slideshows dans un seul appel dépasseraient les 150 s d'une
 * Edge Function.
 */

const N_MAX = 200;

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
  const pool = await lireTout<{ id: string }>(
    "Slideshows importés à images brutes",
    (curseur, taille) => {
      let q = supabase
        .from("contenus")
        .select("id")
        .eq("statut", "valide")
        .eq("import_statut", "done")
        .is("pod", null)
        .not("structure_slides->0->>raw_url", "is", null);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (c) => c.id },
  );

  const ids = tirer(pool.map((r) => r.id), n);
  if (ids.length === 0) return { slideshows: [] };

  const data = await lireParLots<Record<string, unknown>>(
    ids,
    "Slideshows tirés",
    (lot) => supabase.from("contenus").select("id, titre, created_at, structure_slides").in("id", lot),
  );

  const slideshows = data
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
        const { texte, sticker } = await avecReprise(() => ocrSlideImport(url));
        return { position, url, sticker, texte };
      } catch (error) {
        return { position, url, sticker: null, texte: "", erreur: messageErreur(error) };
      }
    }),
  );
  return {
    id: contenuId,
    rejete: slides.some((s) => s.sticker === "pub"),
    contenu: slides.some((s) => s.sticker === "contenu"),
    slides,
  };
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
