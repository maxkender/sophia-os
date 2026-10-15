/**
 * Relecture automatique des posts publiés : drain de la file `relectures_auto`.
 *
 * Compare la mise en forme du texte retapé par le créateur à celle de
 * l'original (forme du paragraphe, taille, titre / corps, style, placement),
 * plus le nombre de slides et le son. Écrit les défauts et un brouillon de
 * review. N'ENVOIE RIEN au créateur.
 *
 *   {}                                              → un passage de drain
 *   { enfiler: { jour?, limite?, aleatoire? } }     → met un lot de test en file, puis draine
 *
 * Déclenché par le cron `relecture-drain` (toutes les 2 min, 01:00-05:58 UTC) ;
 * la file est remplie par `relecture-enfiler` (01:00 UTC, posts de la veille).
 * Trois étapes, chacune reprise au passage suivant si le temps manque :
 *   1. lancer un run Apify pour les posts en attente (un run pour 40 posts) ;
 *   2. relever les runs terminés : slides publiées, son, légende ;
 *   3. mesurer (Gemini, original et publié dans le même appel) puis juger avec
 *      les règles de `_shared/relecture.ts`.
 */

import { downloadMedia } from "../_shared/apify.ts";
import { callWithFallback, type Part, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import { dimensionsImage } from "../_shared/inpaint.ts";
import {
  agreger,
  choisirPositions,
  controlesPost,
  idMusique,
  type JugementPaire,
  jugerPaire,
  type MesureSlide,
  parserMesure,
  PROMPT_MESURE,
  redigerBrouillon,
  type RemarqueType,
} from "../_shared/relecture.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Client = ReturnType<typeof serviceClient>;

const ACTEUR = "clockworks~tiktok-scraper";
const APIFY = "https://api.apify.com/v2";
/** Posts par run Apify : un run est facturé au résultat, son démarrage coûte du temps. */
const LOT_SCRAPE = 40;
/** Au-delà, la ligne passe en échec (réservations cumulées, scrape + analyse). */
const MAX_TENTATIVES = 5;
/** Un run Apify encore en cours après ce délai est abandonné et relancé. */
const RUN_PERIME_MS = 20 * 60 * 1000;
/** On ne commence plus d'analyse au-delà : un passage doit finir avant le timeout du cron (280 s). */
const BUDGET_MS = 150_000;

interface LigneRelecture {
  id: string;
  passage_id: string;
  publie_url: string;
  tentatives: number;
  reserve_at: string | null;
  apify_run_id: string | null;
  slides_publiees: unknown;
  musique_publiee_id: string | null;
}

interface ItemApify {
  id?: string;
  text?: string;
  isSlideshow?: boolean;
  slideshowImageLinks?: Array<string | { downloadLink?: string; tiktokLink?: string }>;
  musicMeta?: { musicId?: string };
}

function jetonApify(): string {
  const jeton = Deno.env.get("APIFY_TOKEN");
  if (!jeton) throw new Error("APIFY_TOKEN manquant");
  return jeton;
}

/** Appels asynchrones (run, statut, dataset) : un scrape de 40 posts ne tient pas dans un run-sync. */
async function apify<T>(chemin: string, corps?: unknown): Promise<T> {
  const sep = chemin.includes("?") ? "&" : "?";
  const reponse = await fetch(
    `${APIFY}${chemin}${sep}token=${jetonApify()}`,
    corps === undefined ? {} : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    },
  );
  if (!reponse.ok) throw new Error(`Apify ${reponse.status}: ${(await reponse.text()).slice(0, 200)}`);
  return (await reponse.json()) as T;
}

/** ID numérique du post : `webVideoUrl` revient en /video/ même pour un post photo. */
function idPost(url: string): string | null {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? null;
}

async function reserver(
  supabase: Client,
  de: string,
  vers: string,
  n: number,
  reprendre: boolean,
): Promise<LigneRelecture[]> {
  const { data, error } = await supabase.rpc("relecture_reserver", {
    p_de: de,
    p_vers: vers,
    p_n: n,
    p_reprendre: reprendre,
  });
  if (error) throw error;
  return (data ?? []) as LigneRelecture[];
}

async function maj(supabase: Client, ids: string[], champs: Record<string, unknown>) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("relectures_auto")
    .update({ ...champs, maj_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 1. Lancer les scrapes
// ---------------------------------------------------------------------------

async function lancerScrapes(supabase: Client): Promise<number> {
  const lot = await reserver(supabase, "a_scraper", "scrape", LOT_SCRAPE, false);
  const usees = lot.filter((l) => l.tentatives > MAX_TENTATIVES);
  await maj(supabase, usees.map((l) => l.id), { statut: "echec", erreur: "trop de tentatives de scrape" });
  const aLancer = lot.filter((l) => l.tentatives <= MAX_TENTATIVES);
  if (aLancer.length === 0) return 0;
  const ids = aLancer.map((l) => l.id);
  try {
    const run = await apify<{ data: { id: string } }>(`/acts/${ACTEUR}/runs`, {
      postURLs: aLancer.map((l) => l.publie_url),
      resultsPerPage: 1,
      shouldDownloadSlideshowImages: true,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      proxyCountryCode: "None",
    });
    await maj(supabase, ids, { apify_run_id: run.data.id, erreur: null });
    return aLancer.length;
  } catch (error) {
    await maj(supabase, ids, { statut: "a_scraper", erreur: `lancement Apify : ${messageErreur(error)}` });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. Relever les runs terminés
// ---------------------------------------------------------------------------

function liensImages(item: ItemApify): string[] {
  return (item.slideshowImageLinks ?? [])
    .map((l) => (typeof l === "string" ? l : l.downloadLink ?? l.tiktokLink ?? null))
    .filter((u): u is string => Boolean(u));
}

async function releverScrapes(supabase: Client): Promise<number> {
  const { data, error } = await supabase
    .from("relectures_auto")
    .select("id, publie_url, apify_run_id, reserve_at, tentatives")
    .eq("statut", "scrape")
    .limit(400);
  if (error) throw error;
  const lignes = (data ?? []) as LigneRelecture[];

  // Réservée mais run jamais lancé (passage mort entre les deux) : on remet en file.
  const orphelines = lignes.filter(
    (l) => !l.apify_run_id && Date.parse(l.reserve_at ?? "") < Date.now() - 15 * 60 * 1000,
  );
  await maj(supabase, orphelines.map((l) => l.id), { statut: "a_scraper" });

  const parRun = new Map<string, LigneRelecture[]>();
  for (const l of lignes) {
    if (!l.apify_run_id) continue;
    parRun.set(l.apify_run_id, [...(parRun.get(l.apify_run_id) ?? []), l]);
  }

  let releves = 0;
  for (const [runId, groupe] of parRun) {
    const ids = groupe.map((l) => l.id);
    const run = (await apify<{ data: { status: string; defaultDatasetId: string } }>(`/actor-runs/${runId}`)).data;
    if (run.status === "READY" || run.status === "RUNNING") {
      const lance = Math.min(...groupe.map((l) => Date.parse(l.reserve_at ?? "") || Date.now()));
      if (Date.now() - lance > RUN_PERIME_MS) {
        await maj(supabase, ids, { statut: "a_scraper", apify_run_id: null, erreur: `run Apify ${runId} trop long` });
      }
      continue;
    }
    if (run.status !== "SUCCEEDED") {
      await maj(supabase, ids, { statut: "a_scraper", apify_run_id: null, erreur: `run Apify ${runId} : ${run.status}` });
      continue;
    }

    const items = await apify<ItemApify[]>(`/datasets/${run.defaultDatasetId}/items?clean=true`);
    const parId = new Map(items.filter((i) => i.id).map((i) => [String(i.id), i]));
    for (const l of groupe) {
      const item = parId.get(idPost(l.publie_url) ?? "");
      if (!item) {
        await maj(supabase, [l.id], { statut: "echec", erreur: "post introuvable sur TikTok (supprimé ou privé ?)" });
        continue;
      }
      const images = liensImages(item);
      if (!item.isSlideshow || images.length === 0) {
        await maj(supabase, [l.id], {
          statut: "ignore",
          erreur: "publié en vidéo, pas en diaporama : rien à comparer slide par slide",
          legende: item.text ?? null,
          musique_publiee_id: item.musicMeta?.musicId ?? null,
        });
        continue;
      }
      await maj(supabase, [l.id], {
        statut: "a_analyser",
        slides_publiees: images,
        musique_publiee_id: item.musicMeta?.musicId ?? null,
        legende: item.text ?? null,
        erreur: null,
      });
      releves += 1;
    }
  }
  return releves;
}

// ---------------------------------------------------------------------------
// 3. Mesurer et juger
// ---------------------------------------------------------------------------

function mimeDe(octets: Uint8Array): string {
  if (octets[0] === 0x89 && octets[1] === 0x50) return "image/png";
  if (octets[0] === 0x52 && octets[1] === 0x49 && octets[8] === 0x57) return "image/webp";
  return "image/jpeg";
}

async function chargerImage(url: string): Promise<{ part: Part; largeur: number; hauteur: number }> {
  const octets = await downloadMedia(url);
  const dims = dimensionsImage(octets);
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < octets.length; i += CHUNK) {
    binaire += String.fromCharCode(...octets.subarray(i, i + CHUNK));
  }
  return {
    part: { inline_data: { mime_type: mimeDe(octets), data: btoa(binaire) } },
    // Format inconnu (webp) : 9:16, le format TikTok ; la taille relative reste comparable.
    largeur: dims?.w ?? 1080,
    hauteur: dims?.h ?? 1920,
  };
}

interface SlideTexte {
  position: number;
  texte_overlay?: string | null;
  position_sophia?: boolean;
}

interface SlideStructure {
  position: number;
  raw_url?: string | null;
}

async function mesurerPaire(position: number, urlOriginal: string, urlPublie: string) {
  const [a, b] = await Promise.all([chargerImage(urlOriginal), chargerImage(urlPublie)]);
  const reponse = textOf(
    await callWithFallback(TEXT_MODELS, [
      { text: "Image A — ORIGINAL :" },
      a.part,
      { text: "Image B — PUBLIÉE :" },
      b.part,
      { text: PROMPT_MESURE },
    ]),
  );
  const mesure = parserMesure(reponse);
  if (!mesure) throw new Error(`slide ${position} : réponse Gemini illisible`);
  const original: MesureSlide = { blocs: mesure.a, largeurPx: a.largeur, hauteurPx: a.hauteur };
  const publie: MesureSlide = { blocs: mesure.b, largeurPx: b.largeur, hauteurPx: b.hauteur };
  return { position, original, publie };
}

async function analyserLigne(
  supabase: Client,
  ligne: LigneRelecture,
  remarquesTypes: RemarqueType[],
): Promise<"fait" | "ignore" | "reessai" | "echec"> {
  try {
    const { data: passage, error } = await supabase
      .from("passages")
      .select("slides, musique_url, contenus(structure_slides)")
      .eq("id", ligne.passage_id)
      .single();
    if (error) throw error;

    const slides = ((passage.slides ?? []) as SlideTexte[]).sort((p, q) => p.position - q.position);
    const contenu = Array.isArray(passage.contenus) ? passage.contenus[0] : passage.contenus;
    const structure = ((contenu as { structure_slides?: SlideStructure[] } | null)?.structure_slides ?? []);
    const brutDe = new Map(structure.map((s) => [s.position, s.raw_url?.trim() || null]));
    const publiees = (Array.isArray(ligne.slides_publiees) ? ligne.slides_publiees : []) as string[];

    const candidates = slides
      .filter((s) => !s.position_sophia && (s.texte_overlay ?? "").trim() && brutDe.get(s.position) && publiees[s.position - 1])
      .map((s) => ({ position: s.position, longueur: (s.texte_overlay ?? "").trim().length }));
    const positions = choisirPositions(candidates);

    const controles = controlesPost({
      slidesAttendues: slides.length,
      slidesPubliees: publiees.length,
      musiqueAttendueId: idMusique(passage.musique_url as string | null),
      musiquePublieeId: ligne.musique_publiee_id,
    });

    if (positions.length === 0) {
      await maj(supabase, [ligne.id], {
        statut: "ignore",
        erreur: "aucune slide comparable (original sans image brute)",
        defauts: controles,
        analyse_at: new Date().toISOString(),
      });
      return "ignore";
    }

    const resultats = await Promise.allSettled(
      positions.map((p) => mesurerPaire(p, brutDe.get(p)!, publiees[p - 1])),
    );
    const jugements: JugementPaire[] = [];
    const comparaisons: unknown[] = [];
    const echecs: string[] = [];
    for (const r of resultats) {
      if (r.status === "rejected") {
        echecs.push(messageErreur(r.reason));
        continue;
      }
      const j = jugerPaire(r.value.position, r.value.original, r.value.publie);
      jugements.push(j);
      comparaisons.push({
        position: r.value.position,
        original: r.value.original,
        publie: r.value.publie,
        constats: j.constats,
      });
    }
    if (jugements.length === 0) throw new Error(echecs.join(" | ") || "aucune mesure");

    const defauts = [...agreger(jugements), ...controles];
    const brouillon = redigerBrouillon(defauts, remarquesTypes);
    await maj(supabase, [ligne.id], {
      statut: "fait",
      comparaisons,
      defauts,
      brouillon: brouillon.texte || null,
      remarques: brouillon.remarques,
      erreur: echecs.length ? `mesures partielles : ${echecs.join(" | ").slice(0, 500)}` : null,
      analyse_at: new Date().toISOString(),
    });
    return "fait";
  } catch (error) {
    const fin = ligne.tentatives >= MAX_TENTATIVES;
    await maj(supabase, [ligne.id], {
      statut: fin ? "echec" : "a_analyser",
      erreur: messageErreur(error).slice(0, 800),
    });
    return fin ? "echec" : "reessai";
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { enfiler?: { jour?: unknown; limite?: unknown; aleatoire?: unknown } } = {};
  try {
    corps = (await request.json()) ?? {};
  } catch {
    // corps vide : un passage de drain
  }

  const debut = Date.now();
  const supabase = serviceClient();
  const bilan = { enfiles: 0, scrapesLances: 0, releves: 0, faits: 0, ignores: 0, reessais: 0, echecs: 0, erreurs: [] as string[] };

  try {
    if (corps.enfiler) {
      const jour = String(corps.enfiler.jour ?? aujourdhuiParis());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ error: "jour attendu au format AAAA-MM-JJ" }, 400);
      const limite = Math.min(50, Math.max(1, Number(corps.enfiler.limite ?? 10) || 10));
      const { data, error } = await supabase.rpc("relecture_enfiler", {
        p_jour: jour,
        p_limite: limite,
        p_aleatoire: corps.enfiler.aleatoire !== false,
        p_origine: "test",
      });
      if (error) throw error;
      bilan.enfiles = Number(data) || 0;
    }

    for (const etape of [
      async () => (bilan.scrapesLances = await lancerScrapes(supabase)),
      async () => (bilan.releves = await releverScrapes(supabase)),
    ]) {
      try {
        await etape();
      } catch (error) {
        bilan.erreurs.push(messageErreur(error));
      }
    }

    const { data: remarques } = await supabase.from("review_remarques").select("id, titre, corps");
    const remarquesTypes = (remarques ?? []) as RemarqueType[];
    while (Date.now() - debut < BUDGET_MS) {
      const lot = await reserver(supabase, "a_analyser", "analyse", 2, true);
      if (lot.length === 0) break;
      const issues = await Promise.all(lot.map((l) => analyserLigne(supabase, l, remarquesTypes)));
      for (const issue of issues) {
        if (issue === "fait") bilan.faits += 1;
        else if (issue === "ignore") bilan.ignores += 1;
        else if (issue === "reessai") bilan.reessais += 1;
        else bilan.echecs += 1;
      }
    }

    if (bilan.enfiles + bilan.scrapesLances + bilan.releves + bilan.faits + bilan.ignores + bilan.reessais + bilan.echecs > 0) {
      console.log(
        `[relecture-auto] ${bilan.enfiles} en file · ${bilan.scrapesLances} scrape(s) lancé(s) · ${bilan.releves} relevé(s)` +
          ` · ${bilan.faits} relu(s) · ${bilan.ignores} ignoré(s) · ${bilan.reessais} à reprendre · ${bilan.echecs} échec(s)`,
      );
    }
    for (const e of bilan.erreurs) console.log(`[relecture-auto] ERR ${e}`);
    return json({ ok: true, ...bilan, duree_ms: Date.now() - debut });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error), ...bilan }, 500);
  }
});
