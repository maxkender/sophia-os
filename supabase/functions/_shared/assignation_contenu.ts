import { assurerDeckPourLangue } from "./import_contenu.ts";
import { mapPool } from "./parallel.ts";
import { serviceClient } from "./supabase.ts";

/** Comptes traités en parallèle. Gemini (trad + Sophia) est dans assurerDeck —
 *  trop large → 429 ; trop petit → assignation lente. */
const LARGEUR_ASSIGNATION = 4;

export type Supabase = ReturnType<typeof serviceClient>;

export interface AssignationReglages {
  postsParJour: number;
  top_k: number;
  temperature: number;
  saturation_jours: number;
  saturation_penalite: number;
}

export async function chargerAssignationReglages(
  supabase: Supabase,
): Promise<AssignationReglages> {
  const { data } = await supabase.from("reglages").select("cle, valeur");
  const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));
  const frequence = (map.get("frequence") ?? { posts_par_jour: 1 }) as {
    posts_par_jour?: number;
  };
  const scoring = (map.get("scoring") ?? {}) as Record<string, number>;
  return {
    postsParJour: Math.min(3, Math.max(1, frequence.posts_par_jour ?? 1)),
    top_k: scoring.top_k ?? 5,
    temperature: scoring.temperature ?? 0.7,
    saturation_jours: scoring.saturation_jours ?? 7,
    saturation_penalite: scoring.saturation_penalite ?? 0.2,
  };
}

const HASHTAGS: Record<string, string[]> = {
  fr: ["#apprendre", "#culturegenerale", "#developpementpersonnel", "#booktok", "#pourtoi", "#savoir", "#fyp"],
  en: ["#learning", "#selfimprovement", "#booktok", "#foryou", "#knowledge", "#fyp"],
  de: ["#lernen", "#selbstverbesserung", "#booktok", "#fürdich", "#wissen", "#fyp"],
  it: ["#imparare", "#crescitapersonale", "#booktok", "#perte", "#cultura", "#fyp"],
  es: ["#aprender", "#desarrollopersonal", "#booktok", "#parati", "#cultura", "#fyp"],
  pt: ["#aprender", "#desenvolvimentopessoal", "#booktok", "#paravoce", "#cultura", "#fyp"],
};

function hashtagsPour(langue: string, seed: string): string {
  const pool = HASHTAGS[langue] ?? HASHTAGS.fr;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const debut = h % pool.length;
  return [0, 1, 2].map((i) => pool[(debut + i) % pool.length]).join(" ");
}

interface Candidat {
  contenuId: string;
  score: number;
  slides: unknown;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  dejaPoste: boolean;
  derniereDate: string | null;
}

/** Tirage top-K pondéré (softmax). */
export function echantillonnerTopK(
  candidats: Candidat[],
  topK: number,
  temperature: number,
): Candidat | null {
  if (candidats.length === 0) return null;
  const slice = candidats.slice(0, Math.max(1, topK));
  const t = Math.max(temperature, 0.05);
  const maxS = Math.max(...slice.map((c) => c.score));
  const poids = slice.map((c) => Math.exp((c.score - maxS) / t));
  const total = poids.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < slice.length; i += 1) {
    r -= poids[i];
    if (r <= 0) return slice[i];
  }
  return slice[slice.length - 1];
}

/**
 * Assignation v-next pour un compte : labels ∩, score langue, top-K,
 * pénalité saturation, non-écrasement, fallbacks.
 */
// deno-lint-ignore no-explicit-any
export async function assignerCompteJour(
  supabase: Supabase,
  compte: any,
  jour: string,
  reglages: AssignationReglages,
  forcer = false,
): Promise<string[]> {
  const brut = Number(compte.posts_par_jour ?? reglages.postsParJour ?? 1);
  const quota = Math.min(3, Math.max(1, Number.isFinite(brut) ? brut : 1));
  const langue: string = compte.langue ?? "fr";

  // Purge les coquilles legacy recycle/remanie/nouveau du jour (non publiées,
  // sans passage) — sinon « Assigner » empile du Recyclé à côté du v-next.
  if (!forcer) {
    const { data: legacy } = await supabase
      .from("posts")
      .select("id, type, statut")
      .eq("compte_id", compte.id)
      .eq("date_publication_prevue", jour)
      .eq("est_test", false)
      .in("type", ["recycle", "remanie", "nouveau"])
      .in("statut", ["brouillon", "assigne"]);
    for (const lp of legacy ?? []) {
      const { data: lie } = await supabase
        .from("passages")
        .select("id")
        .eq("post_id", lp.id)
        .maybeSingle();
      if (!lie) {
        await supabase.from("posts").delete().eq("id", lp.id);
      }
    }
  }

  const { data: existants } = await supabase
    .from("passages")
    .select("id")
    .eq("compte_id", compte.id)
    .eq("date_publication_prevue", jour);

  const dejaLa = existants?.length ?? 0;
  // Non-écrasement : on ne touche pas aux passages déjà là, on complète
  // seulement jusqu'au quota (1–3) du compte.
  const manquants = forcer ? 1 : Math.max(0, quota - dejaLa);
  if (manquants <= 0) return [];

  const { data: labelsCompte } = await supabase
    .from("compte_labels")
    .select("label_id")
    .eq("compte_id", compte.id);
  const labelIds = (labelsCompte ?? []).map((l) => l.label_id as string);
  // Sans labels : impossible d'intersecter → compte vide ce jour.
  if (labelIds.length === 0) return [];

  const crees: string[] = [];
  for (let i = 0; i < manquants; i += 1) {
    const choisi = await choisirContenu(
      supabase,
      compte.id,
      langue,
      labelIds,
      jour,
      reglages,
      crees,
    );
    if (!choisi) break;

    // Traduction + Sophia à la demande (hors langue source) — pas à l'import.
    const slides = await assurerDeckPourLangue(supabase, choisi.contenuId, langue);
    const hashtags = hashtagsPour(langue, `${compte.id}-${jour}-${i}`);

    const { data: passage, error } = await supabase
      .from("passages")
      .insert({
        contenu_id: choisi.contenuId,
        compte_id: compte.id,
        langue,
        date_publication_prevue: jour,
        statut: "assigne",
        slides,
        musique_url: choisi.musique_url,
        musique_titre: choisi.musique_titre,
        musique_plateforme: choisi.musique_plateforme,
        hashtags,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Pont poster : le calendrier / détail créateur lit encore `posts` +
    // `post_slides`. On matérialise un post déjà cuit (pipeline done) et on
    // le lie via passages.post_id — plus de type recycle/remanie/nouveau.
    await materialiserPostDepuisPassage(supabase, {
      passageId: passage.id,
      compteId: compte.id as string,
      contenuId: choisi.contenuId,
      jour,
      slides,
      musique_url: choisi.musique_url,
      musique_titre: choisi.musique_titre,
      musique_plateforme: choisi.musique_plateforme,
      hashtags,
    });

    crees.push(passage.id);
  }
  return crees;
}

interface SlideStructure {
  position: number;
  media_id?: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
}

interface SlideLangue {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/**
 * Crée le `posts` + `post_slides` que le poster consomme, liés au passage.
 * Deck déjà traduit + Sophia (assurerDeckPourLangue) → pipeline_statut = done.
 */
async function materialiserPostDepuisPassage(
  supabase: Supabase,
  args: {
    passageId: string;
    compteId: string;
    contenuId: string;
    jour: string;
    slides: SlideLangue[];
    musique_url: string | null;
    musique_titre: string | null;
    musique_plateforme: string | null;
    hashtags: string;
  },
): Promise<void> {
  const { data: contenu, error: errC } = await supabase
    .from("contenus")
    .select("id, sujet_id, structure_slides, titre")
    .eq("id", args.contenuId)
    .single();
  if (errC || !contenu) throw errC ?? new Error("Contenu introuvable pour pont post");

  const structure = (contenu.structure_slides ?? []) as SlideStructure[];
  const parPos = new Map(structure.map((s) => [s.position, s]));

  const { data: post, error: errP } = await supabase
    .from("posts")
    .insert({
      compte_id: args.compteId,
      sujet_id: contenu.sujet_id ?? null,
      type: "contenu",
      statut: "assigne",
      date_publication_prevue: args.jour,
      musique_url: args.musique_url,
      musique_titre: args.musique_titre,
      musique_plateforme: args.musique_plateforme,
      hashtags: args.hashtags,
      pipeline_statut: "done",
      pipeline_etape: null,
      pipeline_erreur: null,
      est_test: false,
    })
    .select("id")
    .single();
  if (errP || !post) throw errP ?? new Error("Création post pont échouée");

  const rows = args.slides.map((s) => {
    const visuel = parPos.get(s.position);
    return {
      post_id: post.id,
      position: s.position,
      media_id: visuel?.media_id ?? null,
      texte_overlay: s.texte_overlay ?? "",
      position_sophia: Boolean(s.position_sophia),
      reference_url: visuel?.reference_url ?? visuel?.raw_url ?? null,
    };
  });
  if (rows.length > 0) {
    const { error: errS } = await supabase.from("post_slides").insert(rows);
    if (errS) throw errS;
  }

  const { error: errL } = await supabase
    .from("passages")
    .update({ post_id: post.id })
    .eq("id", args.passageId);
  if (errL) throw errL;
}

async function choisirContenu(
  supabase: Supabase,
  compteId: string,
  langue: string,
  labelIds: string[],
  jour: string,
  reglages: AssignationReglages,
  dejaCreesCetteSession: string[],
): Promise<Candidat | null> {
  // Contenu IDs portant au moins un label du compte
  const { data: liens } = await supabase
    .from("contenu_labels")
    .select("contenu_id")
    .in("label_id", labelIds);
  const contenusLabel = [...new Set((liens ?? []).map((l) => l.contenu_id as string))];
  if (contenusLabel.length === 0) return null;

  const { data: contenus } = await supabase
    .from("contenus")
    .select("id, musique_url, musique_titre, musique_plateforme")
    .eq("statut", "valide")
    .eq("import_statut", "done")
    .in("id", contenusLabel);
  if (!contenus || contenus.length === 0) return null;

  const contenuIds = contenus.map((c) => c.id as string);
  const meta = new Map(contenus.map((c) => [c.id as string, c]));

  const { data: langues } = await supabase
    .from("contenu_langues")
    .select("contenu_id, score, slides")
    .eq("langue", langue)
    .in("contenu_id", contenuIds);

  // Historique passages de CE compte
  const { data: hist } = await supabase
    .from("passages")
    .select("contenu_id, date_publication_prevue")
    .eq("compte_id", compteId)
    .in("contenu_id", contenuIds);
  const derniere = new Map<string, string>();
  for (const h of hist ?? []) {
    const d = h.date_publication_prevue ?? "";
    const prev = derniere.get(h.contenu_id);
    if (!prev || d > prev) derniere.set(h.contenu_id, d);
  }

  // Saturation réseau : nb de comptes distincts ayant posté ce contenu récemment
  const depuis = new Date(`${jour}T00:00:00Z`);
  depuis.setUTCDate(depuis.getUTCDate() - reglages.saturation_jours);
  const seuil = depuis.toISOString().slice(0, 10);
  const { data: recents } = await supabase
    .from("passages")
    .select("contenu_id, compte_id")
    .in("contenu_id", contenuIds)
    .gte("date_publication_prevue", seuil)
    .in("statut", ["assigne", "valide_par_poster", "publie"]);
  const saturation = new Map<string, Set<string>>();
  for (const r of recents ?? []) {
    let set = saturation.get(r.contenu_id);
    if (!set) {
      set = new Set();
      saturation.set(r.contenu_id, set);
    }
    set.add(r.compte_id);
  }

  const frais: Candidat[] = [];
  const deja: Candidat[] = [];

  for (const cl of langues ?? []) {
    const cid = cl.contenu_id as string;
    if (dejaCreesCetteSession.includes(cid)) continue;
    // Ligne `contenu_langues` = ELO ≥ seuil à l'import. Le deck peut être vide
    // (traduction lazy à l'assignation) — on ne filtre plus sur slides pleines.

    const m = meta.get(cid);
    if (!m) continue;
    const sat = saturation.get(cid)?.size ?? 0;
    const score = (cl.score ?? 50) - reglages.saturation_penalite * sat * 10;
    const candidat: Candidat = {
      contenuId: cid,
      score,
      slides: cl.slides,
      musique_url: m.musique_url,
      musique_titre: m.musique_titre,
      musique_plateforme: m.musique_plateforme,
      dejaPoste: derniere.has(cid),
      derniereDate: derniere.get(cid) ?? null,
    };
    if (candidat.dejaPoste) deja.push(candidat);
    else frais.push(candidat);
  }

  frais.sort((a, b) => b.score - a.score);
  const pickFrais = echantillonnerTopK(frais, reglages.top_k, reglages.temperature);
  if (pickFrais) return pickFrais;

  // Fallback 1 : déjà posté, le moins récemment
  deja.sort((a, b) => (a.derniereDate ?? "").localeCompare(b.derniereDate ?? ""));
  if (deja.length > 0) return deja[0];

  // Fallback final : laisse vide (pas de bouche-trou)
  return null;
}

/** Assigne tous les comptes actifs pour un jour. */
export async function assignerTousComptes(
  supabase: Supabase,
  jour: string,
  compteId: string | null = null,
  forcer = false,
): Promise<Array<{ compteId: string; crees: number; passageIds?: string[]; erreur?: string }>> {
  const reglages = await chargerAssignationReglages(supabase);
  let query = supabase.from("comptes").select("*").eq("is_active", true);
  if (compteId) query = query.eq("id", compteId);
  const { data: comptes, error } = await query;
  if (error) throw error;

  return await mapPool(comptes ?? [], LARGEUR_ASSIGNATION, async (compte) => {
    try {
      const ids = await assignerCompteJour(supabase, compte, jour, reglages, forcer);
      return { compteId: compte.id as string, crees: ids.length, passageIds: ids };
    } catch (e) {
      return {
        compteId: compte.id as string,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
