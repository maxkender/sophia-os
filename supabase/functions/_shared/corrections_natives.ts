/**
 * La boucle de correction (0630) : les remarques des relecteurs natifs,
 * découpées en corrections atomiques (`corrections_natives`), puis, une fois
 * retenues par l'admin, rendues à la chaîne de production.
 *
 *  - `chargerBlocCorrectionsNatives` : le bloc ajouté aux règles de
 *    traduction d'une langue (fonction SQL `corrections_natives_bloc`, une
 *    seule source pour le moteur et l'aperçu de l'admin) ;
 *  - `correctionsPlacementNatives` : celles de type `placement`, en exemples
 *    « au lieu de / écris plutôt » du placement de l'appli ;
 *  - `extraireCorrections` : le découpage des remarques non traitées, vote
 *    par vote, par Gemini (action `corrections_extraire` d'`ab-traduction`,
 *    cron `ab-corrections` ou bouton de Relecture native → Corrections).
 */
import { callWithFallback, LANGUES, TEXT_MODELS, textOf } from "./gemini.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";
import { parseJsonModele } from "./traduction_native.ts";

type Supabase = ReturnType<typeof serviceClient>;

export const TYPES_CORRECTION = ["calque", "registre", "vocabulaire", "placement", "longueur", "casse", "sens", "autre"] as const;
export type TypeCorrection = (typeof TYPES_CORRECTION)[number];

const BUDGET_MS = 55_000;
const MAX_PAR_APPEL = 8;
const FAUTIF_MAX = 400;
const TEXTE_MAX = 600;

/** Le bloc des corrections retenues de la langue, ou null s'il n'y en a pas. */
export async function chargerBlocCorrectionsNatives(supabase: Supabase, langue: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("corrections_natives_bloc", { p_langue: langue });
  if (error) {
    console.warn(`[corrections natives] bloc ${langue} : ${messageErreur(error)}`);
    return null;
  }
  return typeof data === "string" && data.trim() ? data : null;
}

/** Les corrections retenues de type `placement`, au format des exemples du placement. */
export async function correctionsPlacementNatives(
  supabase: Supabase,
  langue: string,
  max = 12,
): Promise<Array<{ original_text: string | null; corrected_text: string }>> {
  const { data, error } = await supabase
    .from("corrections_natives")
    .select("fautif, corrige")
    .eq("langue", langue.toLowerCase())
    .eq("statut", "retenue")
    .eq("type", "placement")
    .not("corrige", "is", null)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error || !data) return [];
  return (data as Array<{ fautif: string; corrige: string | null }>)
    .filter((c) => (c.corrige ?? "").trim())
    .map((c) => ({ original_text: c.fautif, corrected_text: String(c.corrige) }));
}

interface Slide {
  position: number;
  texte_overlay: string | null;
  position_sophia?: boolean;
}

interface VoteATraiter {
  id: string;
  duel_id: string;
  relecteur_id: string;
  langue: string;
  remarque: string;
  note_actuel: number | null;
  note_candidat: number | null;
  ab_traduction_duels: { gauche: "actuel" | "candidat"; slides_actuel: Slide[]; slides_candidat: Slide[] } | Array<{
    gauche: "actuel" | "candidat";
    slides_actuel: Slide[];
    slides_candidat: Slide[];
  }> | null;
}

interface CorrectionModele {
  version?: string;
  slide?: number | string | null;
  type?: string;
  fautif?: string;
  corrige?: string | null;
  explication?: string | null;
}

function deckTexte(slides: Slide[]): string {
  return [...slides]
    .sort((a, b) => a.position - b.position)
    .map((s) => `Slide ${s.position}${s.position_sophia ? " (slide d'appli)" : ""} : "${(s.texte_overlay ?? "").trim() || "(vide)"}"`)
    .join("\n");
}

/** Le prompt du découpage d'une remarque. Exporté pour le lire dans les tests. */
export function promptExtraction(entree: {
  langue: string;
  version1: Slide[];
  version2: Slide[];
  note1: number | null;
  note2: number | null;
  remarque: string;
}): string {
  const nomLangue = LANGUES[entree.langue] ?? entree.langue;
  return `Tu lis la remarque d'un relecteur natif (${nomLangue}) sur un duel : le même slideshow TikTok écrit deux fois en ${nomLangue} par deux méthodes. Le relecteur a vu « Version 1 » et « Version 2 », sans la source, a noté chaque version de 1 (sonne traduit) à 5 (sonne natif) et a écrit une remarque, slide par slide, sur ce qui ne sonne pas natif et ce qu'il aurait écrit.

Ta tâche : découper cette remarque en corrections atomiques, réutilisables pour les prochaines traductions en ${nomLangue}. Une correction = un fragment EXACT d'une des deux versions, court (15 mots au plus, recopié tel quel), ce que le relecteur aurait écrit à la place, et un type.

Types : calque (tournure calquée d'une autre langue), registre (trop formel, trop écrit, argot forcé), vocabulaire (mot inventé, faux, rare), placement (la slide d'appli sonne pub, mal placée, mal amenée), longueur (trop long pour une slide), casse (majuscules, ponctuation), sens (le sens a changé), autre.

Règles :
- Uniquement ce que le relecteur dit ou cite. N'invente aucune faute. Une remarque qui dit que tout est bon donne une liste vide.
- « fautif » est copié mot pour mot depuis la version visée. Si le relecteur parle d'une slide sans la citer, prends le fragment de cette slide qu'il vise.
- « corrige » est en ${nomLangue}, dans les mots du relecteur s'il les donne ; sinon une proposition fidèle à son explication ; sinon null.
- « explication » : une ligne, en français, qui dit pourquoi, dans les mots du relecteur.
- Une remarque qui vaut pour les deux versions (même faute des deux côtés) : version "les_deux".
- Pas de doublon : une faute, une correction.

Version 1 :
${deckTexte(entree.version1)}

Version 2 :
${deckTexte(entree.version2)}

Notes du relecteur : Version 1 = ${entree.note1 ?? "?"}/5, Version 2 = ${entree.note2 ?? "?"}/5.
Remarque du relecteur :
"""
${entree.remarque.trim()}
"""

Réponds uniquement en JSON, sans bloc de code :
{"corrections":[{"version":"1","slide":3,"type":"calque","fautif":"…","corrige":"…","explication":"…"}]}`;
}

/** Les corrections du modèle, validées et ramenées aux colonnes de la table. */
export function normaliserCorrections(
  brutes: CorrectionModele[] | undefined,
  gauche: "actuel" | "candidat",
): Array<{ version: "actuel" | "candidat" | "les_deux"; slide: number | null; type: TypeCorrection; fautif: string; corrige: string | null; explication: string | null }> {
  const droite = gauche === "actuel" ? "candidat" : "actuel";
  const vues = new Set<string>();
  const sortie: ReturnType<typeof normaliserCorrections> = [];
  for (const c of brutes ?? []) {
    const fautif = String(c.fautif ?? "").trim().slice(0, FAUTIF_MAX);
    if (!fautif) continue;
    const type = (TYPES_CORRECTION as readonly string[]).includes(String(c.type)) ? (String(c.type) as TypeCorrection) : "autre";
    const v = String(c.version ?? "").trim();
    const version = v === "1" ? gauche : v === "2" ? droite : "les_deux";
    const cle = `${version}|${fautif.toLowerCase()}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    const slide = Number(c.slide);
    const corrige = c.corrige == null ? null : String(c.corrige).trim().slice(0, TEXTE_MAX) || null;
    const explication = c.explication == null ? null : String(c.explication).trim().slice(0, TEXTE_MAX) || null;
    sortie.push({ version, slide: Number.isFinite(slide) && slide > 0 ? slide : null, type, fautif, corrige, explication });
  }
  return sortie;
}

export interface BilanExtraction {
  traites: number;
  corrections: number;
  echecs: Array<{ vote_id: string; raison: string }>;
  restants: number;
}

/**
 * Découpe les remarques non traitées (toutes langues, ou `langue`), au plus
 * `max` votes et 55 s par appel ; un vote est marqué traité même si le
 * modèle ne rend rien de lisible (l'erreur est gardée sur le vote), pour ne
 * pas le retenter à chaque tour.
 */
export async function extraireCorrections(
  supabase: Supabase,
  options: { langue?: string | null; max?: number } = {},
): Promise<BilanExtraction> {
  const debut = Date.now();
  const max = Math.max(1, Math.min(options.max ?? MAX_PAR_APPEL, 20));
  let requete = supabase
    .from("ab_traduction_votes")
    .select("id, duel_id, relecteur_id, langue, remarque, note_actuel, note_candidat, ab_traduction_duels(gauche, slides_actuel, slides_candidat)")
    .not("remarque", "is", null)
    .is("corrections_extraites_le", null)
    .order("created_at", { ascending: true })
    .limit(max + 1);
  if (options.langue) requete = requete.eq("langue", options.langue.toLowerCase());
  const { data, error } = await requete;
  if (error) throw error;
  const votes = (data ?? []) as unknown as VoteATraiter[];
  const bilan: BilanExtraction = { traites: 0, corrections: 0, echecs: [], restants: Math.max(0, votes.length - max) };

  for (const vote of votes.slice(0, max)) {
    if (Date.now() - debut > BUDGET_MS) {
      bilan.restants++;
      continue;
    }
    const duel = Array.isArray(vote.ab_traduction_duels) ? vote.ab_traduction_duels[0] : vote.ab_traduction_duels;
    const marquer = async (erreur: string | null) => {
      await supabase
        .from("ab_traduction_votes")
        .update({ corrections_extraites_le: new Date().toISOString(), corrections_extraction_erreur: erreur })
        .eq("id", vote.id);
    };
    if (!duel || !(vote.remarque ?? "").trim()) {
      await marquer("duel introuvable ou remarque vide");
      bilan.echecs.push({ vote_id: vote.id, raison: "duel introuvable ou remarque vide" });
      continue;
    }
    try {
      const gaucheActuel = duel.gauche === "actuel";
      const prompt = promptExtraction({
        langue: vote.langue.toLowerCase(),
        version1: gaucheActuel ? duel.slides_actuel : duel.slides_candidat,
        version2: gaucheActuel ? duel.slides_candidat : duel.slides_actuel,
        note1: gaucheActuel ? vote.note_actuel : vote.note_candidat,
        note2: gaucheActuel ? vote.note_candidat : vote.note_actuel,
        remarque: vote.remarque,
      });
      const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
      const sortie = parseJsonModele<{ corrections?: CorrectionModele[] }>(textOf(parts));
      if (!sortie || !Array.isArray(sortie.corrections)) throw new Error("réponse du modèle illisible");
      const lignes = normaliserCorrections(sortie.corrections, duel.gauche);
      if (lignes.length > 0) {
        const { error: errI } = await supabase.from("corrections_natives").insert(
          lignes.map((l) => ({
            ...l,
            langue: vote.langue.toLowerCase(),
            vote_id: vote.id,
            duel_id: vote.duel_id,
            relecteur_id: vote.relecteur_id,
          })),
        );
        if (errI) throw errI;
      }
      await marquer(null);
      bilan.traites++;
      bilan.corrections += lignes.length;
    } catch (e) {
      const raison = messageErreur(e);
      await marquer(raison);
      bilan.echecs.push({ vote_id: vote.id, raison });
    }
  }
  return bilan;
}
