import { assurerDeckPourLangue } from "./import_contenu.ts";
import { serviceClient } from "./supabase.ts";

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
  const frequence = (map.get("frequence") ?? { posts_par_jour: 2 }) as {
    posts_par_jour?: number;
  };
  const scoring = (map.get("scoring") ?? {}) as Record<string, number>;
  return {
    postsParJour: frequence.posts_par_jour ?? 2,
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
  const quota = compte.posts_par_jour ?? reglages.postsParJour;
  const langue: string = compte.langue ?? "fr";

  const { data: existants } = await supabase
    .from("passages")
    .select("id")
    .eq("compte_id", compte.id)
    .eq("date_publication_prevue", jour);

  const dejaLa = existants?.length ?? 0;
  // Non-écrasement : si déjà un passage ce jour, on ne touche à rien.
  if (!forcer && dejaLa > 0) return [];

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
        hashtags: hashtagsPour(langue, `${compte.id}-${jour}-${i}`),
      })
      .select("id")
      .single();
    if (error) throw error;
    crees.push(passage.id);
  }
  return crees;
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

  const resultats: Array<{
    compteId: string;
    crees: number;
    passageIds?: string[];
    erreur?: string;
  }> = [];

  for (const compte of comptes ?? []) {
    try {
      const ids = await assignerCompteJour(supabase, compte, jour, reglages, forcer);
      resultats.push({ compteId: compte.id, crees: ids.length, passageIds: ids });
    } catch (e) {
      resultats.push({
        compteId: compte.id,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return resultats;
}
