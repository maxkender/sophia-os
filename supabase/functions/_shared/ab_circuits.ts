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
 * texte collé), suivie du placement actuel. Il ne voit pas tout le post et ne
 * lit aucune fiche.
 *
 * `fiches` (05/11) est la réécriture native prévue au doc : un seul appel qui
 * voit tout le post et écrit le deck, slide d'appli comprise, à travers les
 * quatre fiches (CTA, appli, label, langue), sans banque ni remarques. C'est
 * lui que les duels jugent quand le lot le désigne comme candidat.
 *
 * `production` (05/11) rejoue la chaîne de la nuit telle qu'elle tourne
 * aujourd'hui, sans rien écrire en base : le deck « actuel » d'un duel est le
 * deck parti sur TikTok, souvent cuit avant les angles (24/10) ou un
 * changement de prompt. Ce candidat mesure la production du jour contre ce
 * qui est parti, et sert de référence à un même lot pour juger une correction
 * de la chaîne.
 */
import { citeConcurrent, positionConcurrent, sansConcurrent } from "./concurrents.ts";
import { chargerAnglePlacement } from "./applications_moteur.ts";
import { clePromptPlacement } from "./applications.ts";
import { baseDeTraduction, type SlideDeck } from "./deck_langue.ts";
import { callWithFallback, integrateSophia, LANGUES, normaliserHashtags, TEXT_MODELS, textOf } from "./gemini.ts";
import { correctionsPlacementNatives } from "./corrections_natives.ts";
import { traduireBaseDeck } from "./import_contenu.ts";
import { regleLocalisationScolaire } from "./localisation_scolaire.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { estContenuLivre } from "./pods.ts";
import { chargerPrompt, type serviceClient } from "./supabase.ts";
import { chargerAncresNatives, ecrireNatif, parseJsonModele } from "./traduction_native.ts";
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

const REMARQUES_LUES = 12;

const TYPES_ERREUR: Record<string, string> = {
  tournure_anglaise: "tournure calquée de l'anglais",
  registre: "registre (tutoiement, argot, formalité)",
  vocabulaire: "vocabulaire",
  cta_trop_pub: "mention de l'appli trop publicitaire",
  cta_mal_place: "mention de l'appli mal placée",
  longueur: "longueur des slides",
  autre: "autre",
};

/**
 * Les dernières remarques des relecteurs natifs de la langue (duels à
 * l'aveugle, 0626), celles qui visent la version du candidat ou les deux : le
 * circuit les passe au modèle en consignes, pour que les écarts relevés ne
 * reviennent pas. Vide tant qu'aucun relecteur n'a voté.
 */
export async function chargerRemarquesRelecteurs(supabase: Supabase, langue: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("ab_traduction_votes")
    .select("remarque, remarque_sur, type_erreur")
    .eq("langue", langue)
    .not("remarque", "is", null)
    .in("remarque_sur", ["candidat", "les_deux"])
    .order("updated_at", { ascending: false })
    .limit(REMARQUES_LUES);
  if (error || !data) return [];
  const vues = new Set<string>();
  const conseils: string[] = [];
  for (const v of data as Array<{ remarque: string | null; type_erreur: string | null }>) {
    const texte = (v.remarque ?? "").trim();
    if (!texte || vues.has(texte.toLowerCase())) continue;
    vues.add(texte.toLowerCase());
    const type = v.type_erreur ? TYPES_ERREUR[v.type_erreur] ?? v.type_erreur : null;
    conseils.push(type ? `${type} : ${texte}` : texte);
  }
  return conseils;
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
    const conseils = await chargerRemarquesRelecteurs(supabase, langue);
    const ecrit = await ecrireNatif({
      slides: sources,
      sourceTitle: titre ?? "",
      langue,
      ancres,
      regles: [base, scolaire].filter(Boolean).join("\n\n") || undefined,
      conseils,
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
      controles: { fidelite: ecrit.controle, reprises: ecrit.reprises, ancres: ecrit.ancres, remarquesRelecteurs: conseils.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Candidat `fiches` : la réécriture native du doc, à travers les quatre fiches
// ---------------------------------------------------------------------------

interface FicheLue {
  cle: string;
  version: number;
  contenu: string;
}

/** La dernière version d'une fiche de `bleo_fiches` (langue, label ou CTA). */
async function chargerFicheVersionnee(supabase: Supabase, sorte: "langue" | "label" | "cta", cle: string): Promise<FicheLue | null> {
  const { data } = await supabase
    .from("bleo_fiches")
    .select("cle, version, contenu")
    .eq("sorte", sorte)
    .eq("cle", cle)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !String(data.contenu ?? "").trim()) return null;
  return { cle: String(data.cle), version: Number(data.version), contenu: String(data.contenu).trim() };
}

/** La fiche appli écrite par l'admin (`fiches_appli`). */
async function chargerFicheAppli(supabase: Supabase, applicationId: string): Promise<string | null> {
  const { data } = await supabase.from("fiches_appli").select("contenu").eq("application_id", applicationId).maybeSingle();
  const contenu = String(data?.contenu ?? "").trim();
  return contenu || null;
}

const LABELS_HORS_TON = new Set(["Hook"]);

/** Le label de ton d'un contenu : le premier hors `Hook`, comme le lot (0627). */
async function labelDuContenu(supabase: Supabase, contenuId: string): Promise<string | null> {
  const { data } = await supabase.from("contenu_labels").select("labels(nom)").eq("contenu_id", contenuId);
  const noms = ((data ?? []) as Array<{ labels: { nom?: string } | Array<{ nom?: string }> | null }>)
    .flatMap((l) => (Array.isArray(l.labels) ? l.labels : l.labels ? [l.labels] : []))
    .map((l) => String(l.nom ?? ""))
    .filter((n) => n && !LABELS_HORS_TON.has(n))
    .sort();
  return noms[0] ?? null;
}

function compterMentions(texte: string | null, nom: string): number {
  if (!texte || !nom) return 0;
  const re = new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (texte.match(re) ?? []).length;
}

const fiches: CircuitTraduction = {
  id: "fiches",
  version: "fiches-1",
  nom: "Réécriture native à travers les quatre fiches (langue, label, appli, CTA)",
  applications: ["sophia"],
  async ecrire({ supabase, contenuId, titre, langueSource, langue, application, deckSource, cta }) {
    const label = await labelDuContenu(supabase, contenuId);
    const [ficheLangue, ficheLabel, ficheCta, ficheAppli, scolaire] = await Promise.all([
      chargerFicheVersionnee(supabase, "langue", langue),
      label ? chargerFicheVersionnee(supabase, "label", label) : Promise.resolve(null),
      chargerFicheVersionnee(supabase, "cta", "commune"),
      chargerFicheAppli(supabase, application.id),
      regleLocalisationScolaire(supabase, langue),
    ]);
    if (!ficheLangue) throw new Error(`pas de fiche langue pour ${langue}`);
    if (!ficheCta) throw new Error("pas de fiche CTA");
    if (!ficheAppli) throw new Error(`pas de fiche appli pour ${application.nom}`);

    const positions = deckSource.map((s) => s.position).sort((a, b) => a - b);
    const couverture = positions[0];
    const minCta = positions[Math.min(3, positions.length - 1)];
    const cible = positionConcurrent(deckSource);
    const nomLangue = LANGUES[langue] ?? langue;
    const nomSource = LANGUES[langueSource] ?? langueSource;
    const deck = deckSource.map((s) => `Slide ${s.position} : "${(s.texte_overlay ?? "").trim() || "(aucun texte)"}"`).join("\n");

    const prompt = `LANGUE DE SORTIE : ${nomLangue.toUpperCase()}.
Tout le texte que tu produis doit être en ${nomLangue}, sans exception.

Tu es le créateur natif qui tient ce compte TikTok. Tu reçois un slideshow écrit en ${nomSource} et tu écris la version ${nomLangue} que tu posterais toi-même : pas une traduction mot à mot, une réécriture qui garde exactement le propos, l'ordre et le nombre de slides, mais qui sonne comme un natif de ton pays. Tu places aussi l'appli ${application.nom} sur une slide, comme tu le ferais naturellement.

Tu travailles avec quatre fiches. Elles font autorité. Quand elles se contredisent, l'ordre est : CTA (règles communes), appli (ce qu'on peut dire), label (le format de ce type de post et où va l'appli), langue (comment on écrit dans ta langue).

=== FICHE CTA (règles communes, version ${ficheCta.version}) ===
${ficheCta.contenu}

=== FICHE APPLI : ${application.nom} ===
${ficheAppli}

=== FICHE LABEL : ${label ?? "(aucun label)"}${ficheLabel ? ` (version ${ficheLabel.version})` : ""} ===
${ficheLabel?.contenu ?? "Aucune fiche pour ce label : suis la fiche CTA et la fiche langue."}

=== FICHE LANGUE : ${nomLangue} (version ${ficheLangue.version}) ===
${ficheLangue.contenu}
${scolaire ? `\n=== LOCALISATION SCOLAIRE ===\n${scolaire}\n` : ""}
Contraintes fixes, vérifiées par le code :
- une slide source = une slide écrite, même position ; les positions sont ${positions.join(", ")} ; la slide ${couverture} est la couverture (le hook) : elle garde son sens et ne porte jamais l'appli ;
- l'appli est nommée « ${application.nom} » sur UNE seule slide, ${cible ? `la slide ${cible} (l'original y citait un produit concurrent)` : `la slide ${minCta} ou une suivante`}, et nulle part ailleurs ; aucun autre produit, service ou appli n'est cité ;
- URLs, titres d'œuvres et sources citées sont gardés tels quels ; pas de tiret long (—) ni de demi-cadratin (–) ;
- hashtags : exactement 3, en ${nomLangue}, un mot chacun, collés au sujet.

Le post source (${nomSource}) :
Légende : "${(titre ?? "").trim()}"
${deck}

Réponds uniquement en JSON, sans bloc de code :
{"slides":[{"position":${couverture},"texte":"..."}],"slide_cta":${cible ?? minCta},"forme_cta":"étiquette courte de la tournure employée pour l'appli","hashtags":"#a #b #c","refus":null}
"refus" vaut {"motif":"..."} seulement si la slide imposée pour l'appli ne peut pas la porter ; place-la alors sur la meilleure slide à partir de la slide ${minCta} et dis pourquoi.`;

    const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: prompt }]));
    const sortie = parseJsonModele<{
      slides?: Array<{ position: number; texte: string }>;
      slide_cta?: number;
      forme_cta?: string;
      hashtags?: string;
      refus?: { motif?: string } | null;
    }>(brut);
    if (!sortie || !Array.isArray(sortie.slides)) throw new Error("réécriture illisible");
    const slideCta = Number(sortie.slide_cta);
    if (!Number.isFinite(slideCta)) throw new Error("slide d'appli non indiquée");
    const ecrit = sortie.slides.map((s) => ({
      position: Number(s.position),
      texte_overlay: String(s.texte ?? ""),
      position_sophia: Number(s.position) === slideCta,
    }));
    const recale = recalerDeck(deckSource, ecrit);
    if ("erreur" in recale) throw new Error(recale.erreur);
    const slides = recale.slides;

    const avecAppli = slides.filter((s) => compterMentions(s.texte_overlay, application.nom) > 0).map((s) => s.position);
    if (avecAppli.length !== 1 || avecAppli[0] !== slideCta) {
      throw new Error(`l'appli doit être nommée sur la seule slide ${slideCta} (nommée sur : ${avecAppli.join(", ") || "aucune"})`);
    }
    if (slideCta < minCta) throw new Error(`slide d'appli ${slideCta} avant la slide ${minCta}`);
    const concurrent = slides.find((s) => citeConcurrent(s.texte_overlay));
    if (concurrent) throw new Error(`un concurrent est cité (slide ${concurrent.position})`);

    const refus = sortie.refus?.motif ? String(sortie.refus.motif) : cible && slideCta !== cible ? `slide ${cible} imposée, appli en ${slideCta}` : null;
    const longueurPct = slides.map((s) => {
      const src = (deckSource.find((d) => d.position === s.position)?.texte_overlay ?? "").length;
      return src ? Math.round(((s.texte_overlay ?? "").length / src) * 100) : null;
    });
    return {
      slides,
      hashtags: normaliserHashtags(String(sortie.hashtags ?? "")),
      versionFiche: ficheLangue.version,
      modele: null,
      cta: cta ? { ...cta, refus } : null,
      controles: {
        fiches: { langue: ficheLangue.version, label: ficheLabel?.version ?? null, cta: ficheCta.version, appli: true },
        label,
        slide_cta: slideCta,
        forme_cta: sortie.forme_cta ? String(sortie.forme_cta) : null,
        position_imposee: cible,
        refus,
        longueur_pct: longueurPct,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Candidat `production` : la chaîne de la nuit rejouée aujourd'hui
// ---------------------------------------------------------------------------

/**
 * Même chemin que `assurerDeckPourLangue` (import_contenu.ts) pour un contenu
 * importé : la base source traduite par `traduireBaseDeck` (prompt de la
 * langue, localisation scolaire, voix de la source), la slide concurrente
 * retirée et imposée au placement, puis le placement Sophia actuel avec les 40
 * dernières corrections et l'angle actif du label. Un deck source qui porte
 * déjà sa slide d'appli (original de pod) est traduit tel quel, sans
 * placement, comme la nuit. Rien n'est persisté : ni deck, ni angle tracé.
 */
const production: CircuitTraduction = {
  id: "production",
  version: "production-1",
  nom: "Chaîne de production rejouée aujourd'hui (traduction, puis placement actuel avec l'angle du label)",
  applications: ["sophia"],
  async ecrire({ supabase, contenuId, titre, langue, deckSource }) {
    const { data: contenu } = await supabase
      .from("contenus")
      .select("id, titre, compte_reference_id")
      .eq("id", contenuId)
      .maybeSingle();
    const traductions = await traduireBaseDeck(
      supabase,
      { titre: contenu?.titre ?? titre, compte_reference_id: contenu?.compte_reference_id ?? null },
      deckSource,
      langue,
    );
    if (traductions.traduits === 0) throw new Error(`traduction ${langue} vide`);
    let deck: SlideDeck[] = traductions.slides;

    const cible = positionConcurrent(deck) ?? positionConcurrent(deckSource);
    deck = sansConcurrent(deck).slides;

    let angle: string | null = null;
    if (!deck.some((s) => s.position_sophia)) {
      const { data: corrections } = await supabase
        .from("corrections")
        .select("texte_origine, texte_corrige")
        .order("created_at", { ascending: false })
        .limit(40);
      angle = (await chargerAnglePlacement(supabase, contenuId, ID_SOPHIA)) ?? null;
      const natives = await correctionsPlacementNatives(supabase, langue);
      const placement = await integrateSophia({
        masterPrompt: (await chargerPrompt(supabase, clePromptPlacement("sophia"))) ?? "",
        corrections: [
          ...natives,
          ...(corrections ?? []).map((c) => ({
            original_text: c.texte_origine,
            corrected_text: c.texte_corrige,
          })),
        ],
        slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
        caption: contenu?.titre ?? titre ?? "",
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
    }
    if (deck.some((s) => citeConcurrent(s.texte_overlay))) throw new Error("un concurrent reste cité");

    const recale = recalerDeck(deckSource, deck);
    if ("erreur" in recale) throw new Error(recale.erreur);
    return {
      slides: recale.slides,
      hashtags: traductions.hashtags,
      versionFiche: null,
      modele: null,
      // Placement actuel : il ne suit pas de voie.
      cta: null,
      controles: { traduits: traductions.traduits, angle: Boolean(angle), position_imposee: cible ?? null },
    };
  },
};

/** Les circuits candidats, par id. */
export const CIRCUITS: Record<string, CircuitTraduction> = {
  [ancree.id]: ancree,
  [production.id]: production,
  [fiches.id]: fiches,
};

/** Le circuit d'une version donnée (celle de `circuit_production`), s'il est enregistré. */
export function circuitDeVersion(version: string | null): CircuitTraduction | null {
  if (!version) return null;
  return Object.values(CIRCUITS).find((c) => c.version === version) ?? null;
}
