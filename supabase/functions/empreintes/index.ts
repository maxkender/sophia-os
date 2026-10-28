import { decoderImage, empreinteDepuisPixels, normaliserAccroche, urlMiniature } from "../_shared/doublons.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Empreintes des contenus (cron toutes les 10 minutes, 0389).
 *
 * Prépare À L'AVANCE ce que la règle des doublons d'accroche et de couverture
 * (décision d'Adrien du 28/10, `_shared/doublons.ts`) compare à l'assignation :
 *  - `accroche_norm` : le texte de la slide 1 dans la langue source, normalisé ;
 *  - `couverture_empreinte` : le dHash de l'image de la slide 1, calculé sur une
 *    miniature de 64 px (quelques Ko, jamais l'image entière).
 *
 * À chaque passage, un lot borné, les contenus les plus récents d'abord : un
 * import ou un original validé a ses empreintes dans les dix minutes. Une image
 * illisible (absente, format inconnu) est notée sans empreinte et n'est plus
 * retentée ; une limite du stockage (429) ou une panne réseau est retentée au
 * passage suivant. Idempotente. Un contenu sans empreinte ne change rien à
 * l'assignation : la règle ne relègue que sur une égalité prouvée.
 *
 * Labels 100 % podz (tous leurs contenus valides viennent d'un pod : page
 * blanche, remakes) : pas de règle, à la demande d'Adrien. Ces labels
 * reprennent à dessein une même photo ou une même statue sous des accroches
 * différentes. Leurs contenus restent sans signature : jamais relégués, jamais
 * cause d'une relégation. Décidé au premier passage du contenu, pas revu
 * ensuite.
 */
const LOT = 300;
/** Miniatures demandées en même temps : à 8, le stockage répond 429. */
const PARALLELE = 3;
/** Sous le mur de 150 s de l'Edge Function. */
const BUDGET_MS = 100_000;

type Supabase = ReturnType<typeof serviceClient>;

interface Contenu {
  id: string;
  langue_source: string | null;
  pod: string | null;
  structure_slides: Array<{ position?: number | string; media_id?: string | null }> | null;
}

interface SlideTexte {
  position?: number | string;
  texte_overlay?: string | null;
}

const couvertureDe = (c: Contenu) =>
  (c.structure_slides ?? []).find((s) => Number(s.position) === 1)?.media_id ?? null;

/** Empreinte d'une image du stockage, ou pourquoi il n'y en a pas. */
async function lireEmpreinte(url: string): Promise<{ empreinte: string | null; reessayer: boolean }> {
  const mini = urlMiniature(url);
  if (!mini) return { empreinte: null, reessayer: false };
  for (let essai = 1;; essai += 1) {
    let r: Response;
    try {
      r = await fetch(mini);
    } catch {
      return { empreinte: null, reessayer: true };
    }
    if (r.status === 429 || r.status >= 500) {
      await r.body?.cancel();
      if (essai >= 3) return { empreinte: null, reessayer: true };
      await new Promise((ok) => setTimeout(ok, 1500 * essai));
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      return { empreinte: null, reessayer: false };
    }
    try {
      const img = await decoderImage(new Uint8Array(await r.arrayBuffer()));
      if (!img) return { empreinte: null, reessayer: false };
      return { empreinte: empreinteDepuisPixels(img.data, img.largeur, img.hauteur, img.canaux), reessayer: false };
    } catch {
      return { empreinte: null, reessayer: false };
    }
  }
}

/**
 * Contenus de pod dont TOUS les labels sont « 100 % podz » (aucun contenu
 * valide du label sans `pod`). Un contenu sans label n'est pas exempté.
 */
async function exemptesPodz(supabase: Supabase, contenus: Contenu[]): Promise<Set<string>> {
  const exemptes = new Set<string>();
  const dePod = contenus.filter((c) => c.pod).map((c) => c.id);
  if (dePod.length === 0) return exemptes;
  const labelsDe = new Map<string, string[]>();
  for (let i = 0; i < dePod.length; i += 100) {
    const { data, error } = await supabase
      .from("contenu_labels")
      .select("contenu_id, label_id")
      .in("contenu_id", dePod.slice(i, i + 100));
    if (error) throw new Error(`contenu_labels : ${error.message}`);
    for (const l of (data ?? []) as Array<{ contenu_id: string; label_id: string }>) {
      labelsDe.set(l.contenu_id, [...(labelsDe.get(l.contenu_id) ?? []), l.label_id]);
    }
  }
  const toutPodz = new Map<string, boolean>();
  for (const labelId of new Set([...labelsDe.values()].flat())) {
    const { data, error } = await supabase
      .from("contenu_labels")
      .select("contenu_id, contenus!inner(id)")
      .eq("label_id", labelId)
      .eq("contenus.statut", "valide")
      .eq("contenus.import_statut", "done")
      .is("contenus.pod", null)
      .limit(1);
    if (error) throw new Error(`label ${labelId} : ${error.message}`);
    toutPodz.set(labelId, (data ?? []).length === 0);
  }
  for (const [id, labels] of labelsDe) {
    if (labels.every((l) => toutPodz.get(l))) exemptes.add(id);
  }
  return exemptes;
}

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  const debut = Date.now();
  const rapport = { traites: 0, empreintes: 0, accroches: 0, sans_image: 0, reportes: 0, podz: 0 };

  try {
    // Les contenus rejetés aussi : un post déjà publié compte pour ses voisins
    // même si son contenu a été rejeté depuis. Les valides d'abord.
    const { data, error } = await supabase
      .from("contenus")
      .select("id, langue_source, pod, structure_slides")
      .eq("import_statut", "done")
      .is("empreintes_le", null)
      .order("statut", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LOT);
    if (error) throw new Error(`contenus : ${error.message}`);
    const contenus = (data ?? []) as Contenu[];
    if (contenus.length === 0) return json({ ok: true, ...rapport, restants: 0 });

    const exemptes = await exemptesPodz(supabase, contenus);

    // Slide 1 de la langue source : une requête par langue, pour que chaque
    // réponse reste sous `max-rows` (un contenu a jusqu'à 27 langues).
    const slidesDe = new Map<string, SlideTexte[]>();
    const parLangue = new Map<string, string[]>();
    for (const c of contenus) {
      if (exemptes.has(c.id) || !c.langue_source) continue;
      parLangue.set(c.langue_source, [...(parLangue.get(c.langue_source) ?? []), c.id]);
    }
    for (const [langue, ids] of parLangue) {
      const { data: lignes, error: lErr } = await supabase
        .from("contenu_langues")
        .select("contenu_id, slides, slides_base")
        .eq("langue", langue)
        .in("contenu_id", ids);
      if (lErr) throw new Error(`contenu_langues : ${lErr.message}`);
      for (const l of (lignes ?? []) as Array<{ contenu_id: string; slides: SlideTexte[] | null; slides_base: SlideTexte[] | null }>) {
        slidesDe.set(l.contenu_id, (l.slides_base?.length ? l.slides_base : l.slides) ?? []);
      }
    }

    const mediaIds = [
      ...new Set(contenus.filter((c) => !exemptes.has(c.id)).map(couvertureDe).filter((m): m is string => Boolean(m))),
    ];
    const urlDe = new Map<string, string>();
    for (let i = 0; i < mediaIds.length; i += 100) {
      const { data: medias, error: mErr } = await supabase
        .from("media_library")
        .select("id, url")
        .in("id", mediaIds.slice(i, i + 100));
      if (mErr) throw new Error(`media_library : ${mErr.message}`);
      for (const m of (medias ?? []) as Array<{ id: string; url: string | null }>) {
        if (m.url) urlDe.set(m.id, m.url);
      }
    }

    let suivant = 0;
    const travailler = async () => {
      while (suivant < contenus.length && Date.now() - debut < BUDGET_MS) {
        const c = contenus[suivant++];
        const exempte = exemptes.has(c.id);
        const slides = slidesDe.get(c.id) ?? [];
        const s1 = slides.find((s) => Number(s.position) === 1) ?? slides[0];
        const accroche = exempte ? null : normaliserAccroche(s1?.texte_overlay);
        const url = exempte ? undefined : urlDe.get(couvertureDe(c) ?? "");
        const { empreinte, reessayer } = url ? await lireEmpreinte(url) : { empreinte: null, reessayer: false };
        const { error: uErr } = await supabase
          .from("contenus")
          .update({
            accroche_norm: accroche,
            couverture_empreinte: empreinte,
            ...(reessayer ? {} : { empreintes_le: new Date().toISOString() }),
          })
          .eq("id", c.id);
        if (uErr) throw new Error(`contenu ${c.id} : ${uErr.message}`);
        rapport.traites += 1;
        if (exempte) rapport.podz += 1;
        else if (accroche) rapport.accroches += 1;
        if (empreinte) rapport.empreintes += 1;
        else if (reessayer) rapport.reportes += 1;
        else if (!exempte) rapport.sans_image += 1;
      }
    };
    await Promise.all(Array.from({ length: PARALLELE }, travailler));

    const { count } = await supabase
      .from("contenus")
      .select("id", { count: "exact", head: true })
      .eq("import_statut", "done")
      .is("empreintes_le", null);
    return json({ ok: true, ...rapport, restants: count ?? null });
  } catch (e) {
    return json({ ok: false, ...rapport, error: messageErreur(e) }, 500);
  }
});
