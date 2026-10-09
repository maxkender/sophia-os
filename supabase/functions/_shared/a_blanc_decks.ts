/**
 * Test à blanc — les decks.
 *
 * `decksAssignation` (assignation_contenu.ts) est l'objet exporté, mutable,
 * par lequel la boucle d'assignation appelle la cuisson des decks — il existe
 * précisément pour être remplacé (les tests le font). L'enveloppe ci-dessous
 * n'est posée QUE dans l'isolate de la fonction `assignation-a-blanc`, au
 * chargement de son index : la nuit, l'assignation test et Sophia ont chacune
 * leur bundle et leur isolate, où rien ne change.
 *
 * Elle ne fait que deux choses :
 *  1. NOTER, pour chaque deck demandé, d'où il vient (existant, livré, cuit par
 *     l'IA, aperçu à fabriquer, refusé, en échec, budget) et ce qu'il a coûté
 *     en appels IA — c'est ce que l'écran du test montre ;
 *  2. case IA DÉCOCHÉE, remplacer la fabrication qui exigerait un modèle par
 *     un APERÇU, au lieu de lancer le vrai code pour rien :
 *     - Sophia : sans IA, `integrateSophia` ferait 4 essais espacés (~10 s)
 *       puis poserait `placementParDefaut`, un texte de repli trompeur. On
 *       vérifie donc les mêmes préconditions, avec les mêmes messages, et on
 *       montre le texte qui serait traduit / placé ;
 *     - autre application : on lance le VRAI `assurerDeckApplication` avec une
 *       échéance déjà passée. Il passe tous les refus sans IA (cache prêt,
 *       inéligible, échec récent, base polluée, concurrence, prompt manquant,
 *       base sans texte) et s'arrête en « budget » juste avant la traduction
 *       ou le placement, sans écrire de cache. Ce « budget »-là devient un
 *       aperçu prêt « à fabriquer ».
 * Hors contexte de test, l'enveloppe appelle la fonction d'origine (et tout y
 * est alors bloqué par l'intercepteur).
 */

import { decksAssignation } from "./assignation_contenu.ts";
import { type DeckApplicationResultat, RAISON_BUDGET } from "./deck_application.ts";
import { baseDeTraduction, estDeckPret, peutSauverBase } from "./deck_langue.ts";
import { LANGUES_CIBLES, type SlideLangue } from "./import_contenu.ts";
import { type ApplicationMoteur, SLUG_SOPHIA } from "./multi_app.ts";
import { avecSuivi, contexteABlanc, type NoteDeck, type SuiviIA } from "./a_blanc_intercepteur.ts";

export type { NoteDeck };

type Supabase = Parameters<typeof decksAssignation.sophia>[0];
type LigneDeck = { id?: string; slides?: SlideLangue[] | null; slides_base?: SlideLangue[] | null; hashtags?: string | null };

const ENVELOPPES = new WeakSet<object>();

const aDuTexte = (deck: readonly SlideLangue[]) => deck.length > 0 && deck.some((s) => (s.texte_overlay ?? "").trim());
const copier = (deck: readonly SlideLangue[], garderPub = false): SlideLangue[] =>
  deck.map((s) => ({
    position: s.position,
    texte_overlay: s.texte_overlay ?? "",
    position_sophia: garderPub ? Boolean(s.position_sophia) : false,
  }));

interface EtatSophia {
  contenu: { livre?: boolean | null; pod?: string | null; langue_source?: string | null } | null;
  ligne: LigneDeck | null;
  source: LigneDeck | null;
}

/** Ce que le deck Sophia a déjà en base (lu à travers le calque). null si illisible. */
async function lireEtatSophia(supabase: Supabase, contenuId: string, langue: string): Promise<EtatSophia | null> {
  const { data: contenu, error: e1 } = await supabase
    .from("contenus")
    .select("id, livre, pod, langue_source")
    .eq("id", contenuId)
    .maybeSingle();
  if (e1) return null;
  if (!contenu) return { contenu: null, ligne: null, source: null };
  const { data: ligne, error: e2 } = await supabase
    .from("contenu_langues")
    .select("id, slides, slides_base, hashtags")
    .eq("contenu_id", contenuId)
    .eq("langue", langue)
    .maybeSingle();
  if (e2) return null;
  const langueSource = (contenu as { langue_source?: string | null }).langue_source ?? "fr";
  const { data: source, error: e3 } = await supabase
    .from("contenu_langues")
    .select("id, slides, slides_base")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  if (e3) return null;
  return { contenu, ligne: (ligne ?? null) as LigneDeck | null, source: (source ?? null) as LigneDeck | null };
}

/**
 * Aperçu du deck Sophia à fabriquer, SANS IA. Mêmes préconditions et mêmes
 * messages que `assurerDeckPourLangue` (import_contenu.ts) ; le deck rendu est
 * le texte que la nuit traduirait / sur lequel elle placerait Sophia.
 */
function apercuSophia(
  etat: EtatSophia,
  langue: string,
): { slides: SlideLangue[]; hashtags: string; besoin: string; fabrication: string[] } {
  if (!etat.contenu) throw new Error("Contenu introuvable");
  if (!etat.ligne && !(LANGUES_CIBLES as readonly string[]).includes(langue)) {
    throw new Error(`Langue ${langue} hors langues cibles`);
  }
  const langueSource = etat.contenu.langue_source ?? "fr";
  const deckSource = baseDeTraduction(etat.source) as SlideLangue[];
  if (deckSource.length === 0 || !deckSource.some((s) => s.texte_overlay)) {
    throw new Error("Deck langue source vide — impossible de traduire");
  }
  const fabrication: string[] = [];
  if (!etat.ligne) fabrication.push(`INSERT contenu_langues (ligne ${langue})`);
  const hashtags = (etat.ligne?.hashtags ?? "").trim();
  const deckLigne = (etat.ligne?.slides ?? []) as SlideLangue[];

  let slides: SlideLangue[];
  let besoin: string;
  if (langue === langueSource) {
    if (peutSauverBase(etat.source)) fabrication.push("UPDATE contenu_langues.slides_base (base mise à l'abri)");
    slides = copier(deckSource);
    besoin = "placement Sophia";
    fabrication.push("UPDATE contenu_langues.slides (slide Sophia)");
  } else if (deckLigne.length > 0 && deckLigne.some((s) => s.texte_overlay)) {
    slides = copier(deckLigne);
    besoin = "placement Sophia";
    fabrication.push("UPDATE contenu_langues.slides (slide Sophia)");
  } else {
    // Original de pod : la nuit TRADUIT son deck, slide Sophia comprise
    // (deckSophiaDuPod, import_contenu.ts) — aucun placement derrière.
    const slidesSource = (etat.source?.slides ?? []) as SlideLangue[];
    const deckPod = etat.contenu.pod &&
        slidesSource.filter((s) => s.position_sophia).length === 1 &&
        slidesSource.some((s) => !s.position_sophia && s.texte_overlay)
      ? slidesSource
      : null;
    if (deckPod) {
      slides = copier(deckPod, true);
      besoin = `traduction ${langue} (deck du pod, slide Sophia comprise)`;
      fabrication.push("UPDATE contenu_langues.slides + hashtags (traduction)");
    } else {
      slides = copier(deckSource);
      besoin = `traduction ${langue} + placement Sophia`;
      fabrication.push("UPDATE contenu_langues.slides + hashtags (traduction)");
      fabrication.push("UPDATE contenu_langues.slides (slide Sophia)");
    }
  }
  if (!hashtags) fabrication.push("UPDATE contenu_langues.hashtags (si la traduction n'en donne pas)");
  return { slides, hashtags, besoin, fabrication };
}

/**
 * Aperçu du deck d'une autre application quand la cuisson s'est arrêtée en
 * « budget » (IA décochée) : la base cible sans pub — `slides_base` de la
 * langue si elle existe, sinon la base source.
 */
async function apercuApplication(
  supabase: Supabase,
  contenuId: string,
  langue: string,
  app: ApplicationMoteur,
): Promise<{ resultat: DeckApplicationResultat; besoin: string; fabrication: string[] } | null> {
  const { data: contenu } = await supabase
    .from("contenus")
    .select("langue_source")
    .eq("id", contenuId)
    .maybeSingle();
  const langueSource = (contenu as { langue_source?: string | null } | null)?.langue_source ?? "fr";
  const lire = async (l: string) => {
    const { data } = await supabase
      .from("contenu_langues")
      .select("slides, slides_base, hashtags")
      .eq("contenu_id", contenuId)
      .eq("langue", l)
      .maybeSingle();
    return (data ?? null) as LigneDeck | null;
  };
  const source = await lire(langueSource);
  const cible = langue === langueSource ? source : await lire(langue);
  const baseCible = (cible?.slides_base ?? []) as SlideLangue[];
  const traduction = langue !== langueSource && baseCible.length === 0;
  const base = langue === langueSource || traduction
    ? (baseDeTraduction(source) as SlideLangue[])
    : baseCible;
  if (!aDuTexte(base)) return null;
  const fabrication: string[] = [];
  if (traduction) fabrication.push(`UPDATE contenu_langues.slides_base (base ${langue} traduite)`);
  fabrication.push(`UPSERT contenu_langue_decks (cache du deck ${app.slug} ${langue})`);
  if (!(cible?.hashtags ?? "").trim()) fabrication.push("UPDATE contenu_langues.hashtags");
  return {
    resultat: { statut: "pret", slides: copier(base), hashtags: null, cuit: false },
    besoin: traduction ? `traduction ${langue} + placement ${app.nom}` : `placement ${app.nom}`,
    fabrication,
  };
}

function hashtagsIA(suivi: SuiviIA, manquaient: boolean): NoteDeck["hashtagsIA"] {
  if (suivi.bloques > 0) return "bloques";
  if (manquaient && suivi.autorises > 0) return "generes";
  return "inutile";
}

/**
 * Pose l'enveloppe sur `cible` (par défaut `decksAssignation`). Rend la
 * fonction qui remet les originaux (pour les tests). Idempotente.
 */
export function envelopperDecksABlanc(cible: typeof decksAssignation = decksAssignation): () => void {
  if (ENVELOPPES.has(cible.sophia) && ENVELOPPES.has(cible.application)) return () => {};
  const sophiaOrigine = cible.sophia;
  const applicationOrigine = cible.application;

  const sophia: typeof decksAssignation.sophia = async (supabase, contenuId, langue) => {
    const ctx = contexteABlanc();
    if (!ctx) return await sophiaOrigine(supabase, contenuId, langue);
    const suivi: SuiviIA = { autorises: 0, bloques: 0 };
    const note: NoteDeck = {
      contenuId,
      langue,
      application: SLUG_SOPHIA,
      origine: "existant",
      hashtagsIA: "inutile",
      appelsIA: suivi,
    };
    const etat = await lireEtatSophia(supabase, contenuId, langue);
    const livre = Boolean(etat?.contenu?.livre);
    const pretSansIA = livre || estDeckPret(etat?.ligne?.slides ?? null);
    const manquaient = !(etat?.ligne?.hashtags ?? "").trim();
    try {
      if (ctx.etat.ia || pretSansIA || etat === null) {
        const r = await avecSuivi(suivi, () => sophiaOrigine(supabase, contenuId, langue));
        note.origine = livre ? "livre" : pretSansIA ? "existant" : "cuit_ia";
        note.hashtagsIA = hashtagsIA(suivi, manquaient);
        ctx.etat.decks.push(note);
        return r;
      }
      const apercu = apercuSophia(etat, langue);
      note.origine = "a_fabriquer";
      note.besoin = apercu.besoin;
      note.fabrication = apercu.fabrication;
      note.hashtagsIA = apercu.hashtags ? "inutile" : "bloques";
      ctx.etat.decks.push(note);
      return { slides: apercu.slides, hashtags: apercu.hashtags };
    } catch (e) {
      note.origine = "echec";
      note.raison = e instanceof Error ? e.message : String(e);
      ctx.etat.decks.push(note);
      throw e;
    }
  };

  const application: typeof decksAssignation.application = async (supabase, contenuId, langue, app, opts = {}) => {
    const ctx = contexteABlanc();
    if (!ctx) return await applicationOrigine(supabase, contenuId, langue, app, opts);
    const suivi: SuiviIA = { autorises: 0, bloques: 0 };
    const note: NoteDeck = {
      contenuId,
      langue,
      application: app.slug,
      origine: "existant",
      hashtagsIA: "inutile",
      appelsIA: suivi,
    };
    try {
      const budgetReel = opts.echeance !== undefined && Date.now() > opts.echeance;
      if (ctx.etat.ia || budgetReel) {
        const r = await avecSuivi(suivi, () => applicationOrigine(supabase, contenuId, langue, app, opts));
        return noter(r);
      }
      // Échéance déjà passée : la cuisson va au bout de tous les refus SANS IA,
      // puis s'arrête avant la traduction ou le placement, sans cache.
      const r = await avecSuivi(
        suivi,
        () => applicationOrigine(supabase, contenuId, langue, app, { ...opts, echeance: Date.now() - 1 }),
      );
      if (r.statut === "echec" && r.raison === RAISON_BUDGET) {
        const apercu = await apercuApplication(supabase, contenuId, langue, app);
        if (apercu) {
          note.origine = "a_fabriquer";
          note.besoin = apercu.besoin;
          note.fabrication = apercu.fabrication;
          note.hashtagsIA = "bloques";
          ctx.etat.decks.push(note);
          return apercu.resultat;
        }
      }
      return noter(r);
    } catch (e) {
      note.origine = "echec";
      note.raison = e instanceof Error ? e.message : String(e);
      ctx.etat.decks.push(note);
      throw e;
    }

    function noter(r: DeckApplicationResultat): DeckApplicationResultat {
      if (r.statut === "pret") {
        note.origine = suivi.autorises > 0 ? "cuit_ia" : "existant";
      } else {
        note.origine = r.statut === "ineligible" ? "refuse" : r.raison === RAISON_BUDGET ? "budget" : "echec";
        note.raison = r.raison;
      }
      note.hashtagsIA = suivi.bloques > 0 ? "bloques" : suivi.autorises > 0 ? "generes" : "inutile";
      ctx!.etat.decks.push(note);
      return r;
    }
  };

  ENVELOPPES.add(sophia);
  ENVELOPPES.add(application);
  cible.sophia = sophia;
  cible.application = application;
  return () => {
    if (cible.sophia === sophia) cible.sophia = sophiaOrigine;
    if (cible.application === application) cible.application = applicationOrigine;
  };
}
