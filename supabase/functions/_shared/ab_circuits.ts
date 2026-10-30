/**
 * A/B de la traduction et du placement : les circuits candidats (migration 0620).
 *
 * Un circuit reçoit le post source en entier et rend le deck dans la langue
 * cible, slide d'appli comprise, AUX MÊMES POSITIONS que la source. Il est
 * servi à deux endroits :
 *   - le duel à l'aveugle de Tests (`ab-traduction`, action `duel_preparer`),
 *     sur des slideshows déjà publiés : son deck contre le deck parti ;
 *   - la cuisson des decks du bras `natif` (table `decks_natifs`), pour le
 *     circuit dont la `version` est `reglages.ab_traduction.circuit_production`.
 *
 * Brancher l'appel unique de la réécriture native : écrire un
 * `CircuitTraduction` (id `natif`, une `version` qui change à chaque
 * changement de prompt ou de fiche), l'ajouter à `CIRCUITS`, puis, quand le
 * duel est concluant, poser sa `version` dans `circuit_production`.
 *
 * Le CTA (décision d'Adrien du 30/10, 0624) : l'OS ne tire ni forme ni voie
 * `prouvee` / `essai`. Il n'impose que deux cas, dans `cta` : `reprise`
 * (l'original cite un concurrent : sa slide porte l'appli) et `marquee` (le
 * podz a marqué la slide). Sinon `cta` est null et le circuit choisit la slide
 * et la tournure avec les quatre fiches : appli (quoi dire), langue (comment
 * le dire), label (le format du deck, où va l'appli, des exemples) et CTA (les
 * règles communes). Un refus de la voie imposée se note dans `cta.refus`.
 *
 * `ancree` est un candidat d'attente : la traduction ancrée sur les exemples
 * natifs (`traduction_native.ts`, servie jusqu'ici par `traduire-test` sur du
 * texte collé), suivie du placement actuel. Il ne voit pas tout le post.
 */
import { citeConcurrent, positionConcurrent, sansConcurrent } from "./concurrents.ts";
import { chargerAnglePlacement } from "./applications_moteur.ts";
import { clePromptPlacement } from "./applications.ts";
import { baseDeTraduction, type SlideDeck } from "./deck_langue.ts";
import { integrateSophia } from "./gemini.ts";
import { regleLocalisationScolaire } from "./localisation_scolaire.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { estContenuLivre } from "./pods.ts";
import { chargerPrompt, type serviceClient } from "./supabase.ts";
import { chargerAncresNatives, ecrireNatif } from "./traduction_native.ts";
import { type CommandeCta, recalerDeck } from "./ab_traduction.ts";

type Supabase = ReturnType<typeof serviceClient>;

export interface ApplicationCircuit {
  id: string;
  slug: string;
  nom: string;
}

export interface EntreeCircuit {
  supabase: Supabase;
  contenuId: string;
  /** Titre (légende) de la vidéo source. */
  titre: string | null;
  langueSource: string;
  /** Langue cible du post. */
  langue: string;
  application: ApplicationCircuit;
  /** Le deck source, sans placement : la base de toute réécriture. */
  deckSource: SlideDeck[];
  /** Le CTA tiré par l'OS ; null tant que le tirage n'existe pas (le circuit fait comme aujourd'hui). */
  cta: CommandeCta | null;
}

export interface SortieCircuit {
  /** Mêmes positions que `deckSource`, une seule slide `position_sophia`. */
  slides: SlideDeck[];
  hashtags: string;
  /** Version de la fiche langue lue (`passages.deck_version`), si le circuit en lit une. */
  versionFiche: number | null;
  modele: string | null;
  /** Le CTA réellement écrit : la voie commandée, ou `reprise` avec la raison du refus. Null : pas de voie. */
  cta: (CommandeCta & { refus: string | null }) | null;
  controles?: unknown;
}

export interface CircuitTraduction {
  id: string;
  /** Change à chaque changement de prompt ou de fiche : les duels et les decks sont comptés par version. */
  version: string;
  nom: string;
  /** Slugs des applis que le circuit sait placer ; null : toutes. */
  applications: string[] | null;
  ecrire(entree: EntreeCircuit): Promise<SortieCircuit>;
}

/** Ce qu'il faut pour réécrire un contenu : son deck source et sa langue. */
export interface SourceContenu {
  contenuId: string;
  titre: string | null;
  langueSource: string;
  deckSource: SlideDeck[];
}

/**
 * Le deck source d'un contenu, ou la raison pour laquelle il n'en a pas de
 * réécrivable : contenu livré par un pod (images finies par langue, rien à
 * traduire), source vide.
 */
export async function lireSourceContenu(
  supabase: Supabase,
  contenuId: string,
): Promise<SourceContenu | { raison: string }> {
  if (await estContenuLivre(supabase, contenuId)) return { raison: "contenu livré par un podz (images finies)" };
  const { data: contenu, error } = await supabase
    .from("contenus")
    .select("id, titre, langue_source")
    .eq("id", contenuId)
    .maybeSingle();
  if (error || !contenu) return { raison: "contenu introuvable" };
  const langueSource = (contenu.langue_source as string | null) ?? "fr";
  const { data: ligne } = await supabase
    .from("contenu_langues")
    .select("slides, slides_base")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  const deckSource = baseDeTraduction(ligne as { slides?: SlideDeck[]; slides_base?: SlideDeck[] } | null)
    .map((s) => ({ position: Number(s.position), texte_overlay: s.texte_overlay ?? null, position_sophia: false }))
    .sort((a, b) => a.position - b.position);
  if (!deckSource.some((s) => (s.texte_overlay ?? "").trim())) return { raison: "deck source vide" };
  return { contenuId, titre: (contenu.titre as string | null) ?? null, langueSource, deckSource };
}

/**
 * Le CTA imposé à un deck (contenu × langue × appli) : `reprise` quand
 * l'original cite un concurrent, `marquee` quand le podz a marqué la slide,
 * jamais de forme (0624). Null dans tous les autres cas, et pour l'instant
 * toujours : le repérage des deux cas se branchera avec l'appel unique.
 */
export function commanderCta(
  _supabase: Supabase,
  _commande: { contenuId: string; langue: string; application: ApplicationCircuit; deckSource: SlideDeck[] },
): Promise<CommandeCta | null> {
  return Promise.resolve(null);
}

/** Le circuit sait-il placer cette appli ? */
export function circuitServiceApplication(circuit: CircuitTraduction, slug: string): boolean {
  return circuit.applications === null || circuit.applications.includes(slug);
}

// ---------------------------------------------------------------------------
// Candidat d'attente : traduction ancrée + placement actuel (Sophia)
// ---------------------------------------------------------------------------

const ancree: CircuitTraduction = {
  id: "ancree",
  version: "ancree-1",
  nom: "Traduction ancrée sur les exemples natifs, puis placement actuel",
  applications: ["sophia"],
  async ecrire({ supabase, contenuId, titre, langue, deckSource }) {
    const sources = deckSource
      .filter((s) => (s.texte_overlay ?? "").trim())
      .map((s) => ({ position: s.position, original: s.texte_overlay ?? "" }));
    const dedie = await chargerPrompt(supabase, `traduction_${langue}`);
    const base = dedie ?? (langue === "fr" ? await chargerPrompt(supabase, "traduction") : undefined);
    const scolaire = await regleLocalisationScolaire(supabase, langue);
    const ancres = await chargerAncresNatives(supabase, langue);
    const ecrit = await ecrireNatif({
      slides: sources,
      sourceTitle: titre ?? "",
      langue,
      ancres,
      regles: [base, scolaire].filter(Boolean).join("\n\n") || undefined,
    });
    const textes = new Map(ecrit.slides.map((s) => [s.position, s.texte]));
    let deck: SlideDeck[] = deckSource.map((s) => ({
      position: s.position,
      texte_overlay: (s.texte_overlay ?? "").trim() ? (textes.get(s.position) ?? null) : null,
      position_sophia: false,
    }));

    // Comme le circuit actuel : la slide qui cite un concurrent est celle que
    // l'appli remplace, puis plus aucune mention ne part.
    const cible = positionConcurrent(deck) ?? positionConcurrent(deckSource);
    deck = sansConcurrent(deck).slides;
    const angle = await chargerAnglePlacement(supabase, contenuId, ID_SOPHIA);
    const placement = await integrateSophia({
      masterPrompt: (await chargerPrompt(supabase, clePromptPlacement("sophia"))) ?? "",
      corrections: [],
      slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
      caption: titre ?? "",
      langue,
      positionImposee: cible,
      ...(angle ? { angle } : {}),
    });
    if (!placement) throw new Error("placement Sophia sans réponse");
    const variante = placement.variants[placement.bestIndex] ?? placement.variants[0];
    if (!variante) throw new Error("placement Sophia sans variante");
    deck = deck.map((s) =>
      s.position === placement.chosenPosition ? { ...s, texte_overlay: variante, position_sophia: true } : s
    );
    if (deck.some((s) => citeConcurrent(s.texte_overlay))) throw new Error("un concurrent reste cité");

    const recale = recalerDeck(deckSource, deck);
    if ("erreur" in recale) throw new Error(recale.erreur);
    return {
      slides: recale.slides,
      hashtags: ecrit.hashtags,
      versionFiche: null,
      modele: null,
      // Placement actuel : il ne suit pas de voie.
      cta: null,
      controles: { fidelite: ecrit.controle, reprises: ecrit.reprises, ancres: ecrit.ancres },
    };
  },
};

/** Les circuits candidats, par id. L'appel unique s'ajoute ici sous l'id `natif`. */
export const CIRCUITS: Record<string, CircuitTraduction> = {
  [ancree.id]: ancree,
};

/** Le circuit d'une version donnée (celle de `circuit_production`), s'il est enregistré. */
export function circuitDeVersion(version: string | null): CircuitTraduction | null {
  if (!version) return null;
  return Object.values(CIRCUITS).find((c) => c.version === version) ?? null;
}
