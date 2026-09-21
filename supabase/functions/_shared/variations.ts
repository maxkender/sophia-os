import {
  applicationParId,
  clePromptPlacement,
  placementParDefaut,
} from "./applications.ts";
import {
  integrateSophia,
  translateSlideshow,
} from "./gemini.ts";
import { contenuIdsDesLabels } from "./assignation_contenu.ts";
import { LANGUES_CIBLES, type SlideLangue } from "./import_contenu.ts";
import { lireParLots } from "./lots.ts";
import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/**
 * Remonte une lecture/écriture ratée au lieu de la confondre avec un résultat
 * vide.
 *
 * Aucun `error` n'était relu dans ce fichier : une requête en échec rendait
 * `data = null`, que le code lisait comme « rien trouvé ». C'est exactement la
 * confusion du 20/08 — un pool plein pris pour un pool vide — appliquée ici aux
 * visuels frères, aux réglages de scoring et au test « une variation existe
 * déjà ». Ce dernier est le plus coûteux : lu comme « pas d'enfant », il fait
 * recréer une variation à chaque run, indéfiniment.
 */
function assertLu(quoi: string, error: unknown): void {
  if (error) throw new Error(`${quoi} : ${messageErreur(error)}`);
}

export interface VariationReglages {
  seuil_score: number;
  min_passages: number;
  age_jours: number;
  profondeur_max: number;
  score_prior: number;
}

export async function chargerVariationReglages(
  supabase: Supabase,
): Promise<VariationReglages> {
  // Une lecture ratée rendait ici les réglages PAR DÉFAUT, sans un mot : on
  // fabriquait alors des variations sur des seuils qui ne sont pas ceux de
  // l'admin (seuil de score, profondeur max). Mieux vaut ne pas varier du tout
  // que varier selon des règles inventées.
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "scoring")
    .maybeSingle();
  assertLu("Variations — réglages de scoring", error);
  const v = (data?.valeur ?? {}) as Record<string, number>;
  return {
    seuil_score: v.variation_seuil_score ?? 80,
    min_passages: v.variation_min_passages ?? 3,
    age_jours: v.variation_age_jours ?? 5,
    profondeur_max: v.variation_profondeur_max ?? 2,
    score_prior: v.score_prior ?? 50,
  };
}

function scoreDepartVariation(scoreParent: number, prior: number): number {
  // Au-dessus du prior (concept prouvé), clairement sous le parent.
  const cible = prior + 0.35 * Math.max(0, scoreParent - prior);
  return Math.min(Math.max(cible, prior + 5), Math.max(prior, scoreParent - 5));
}


interface Candidat {
  contenuId: string;
  langue: string;
  score: number;
  nb_passages: number;
  titre: string;
  profondeur: number;
  compte_reference_id: string | null;
  application_id: string | null;
  structure_slides: Array<{
    position: number;
    media_id: string | null;
    raw_url?: string | null;
    reference_url?: string | null;
  }>;
  slides: SlideLangue[];
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  created_at: string;
}

/** Trouve un contenu éligible à une variation (un seul). */
export async function trouverCandidatVariation(
  supabase: Supabase,
  reglages: VariationReglages,
): Promise<Candidat | null> {
  const ageIso = new Date(
    Date.now() - reglages.age_jours * 86400_000,
  ).toISOString();

  const { data: langues, error } = await supabase
    .from("contenu_langues")
    .select("contenu_id, langue, score, nb_passages, slides")
    .gte("score", reglages.seuil_score)
    .gte("nb_passages", reglages.min_passages)
    .order("score", { ascending: false })
    .limit(40);

  if (error) throw error;

  for (const cl of langues ?? []) {
    const { data: contenu, error: errContenu } = await supabase
      .from("contenus")
      .select(
        "id, titre, profondeur, compte_reference_id, application_id, structure_slides, musique_url, musique_titre, musique_plateforme, created_at, statut, import_statut, parent_id",
      )
      .eq("id", cl.contenu_id)
      .eq("statut", "valide")
      .eq("import_statut", "done")
      .maybeSingle();
    assertLu(`Variations — slideshow parent ${cl.contenu_id}`, errContenu);

    if (!contenu) continue;
    if ((contenu.profondeur ?? 0) >= reglages.profondeur_max) continue;
    if (contenu.created_at > ageIso) continue;

    const slides = (cl.slides ?? []) as SlideLangue[];
    if (slides.length === 0 || !slides.some((s) => s.texte_overlay)) continue;

    // Déjà une variation pour cette langue ? Lecture dont l'échec coûte le
    // plus cher du fichier : `data = null` non relu se lit « pas d'enfant », et
    // on refabrique alors la même variation à chaque run — traduction Gemini
    // comprise — sans que rien ne l'empêche, la table n'ayant pas de contrainte
    // d'unicité (parent_id, variation_langue).
    const { data: enfant, error: errEnfant } = await supabase
      .from("contenus")
      .select("id")
      .eq("parent_id", contenu.id)
      .eq("variation_langue", cl.langue)
      .maybeSingle();
    assertLu(`Variations — variation déjà créée pour ${contenu.id}/${cl.langue}`, errEnfant);
    if (enfant) continue;

    return {
      contenuId: contenu.id,
      langue: cl.langue,
      score: cl.score,
      nb_passages: cl.nb_passages,
      titre: contenu.titre,
      profondeur: contenu.profondeur ?? 0,
      compte_reference_id: contenu.compte_reference_id,
      application_id: (contenu as { application_id?: string | null }).application_id ?? null,
      structure_slides: contenu.structure_slides ?? [],
      slides,
      musique_url: contenu.musique_url,
      musique_titre: contenu.musique_titre,
      musique_plateforme: contenu.musique_plateforme,
      created_at: contenu.created_at,
    };
  }
  return null;
}

/** Visuels alternatifs : biblio des contenus partageant un label, hors parent. */
async function visuelsAlternatifsLabel(
  supabase: Supabase,
  parentId: string,
  parentSlides: Candidat["structure_slides"],
  labelIds: string[],
): Promise<Array<{
  position: number;
  media_id: string | null;
  raw_url: string | null;
  reference_url: string | null;
}>> {
  const exclus = new Set(
    parentSlides.map((s) => s.media_id).filter((id): id is string => Boolean(id)),
  );

  let poolIds: string[] = [];
  if (labelIds.length > 0) {
    // Requête JUMELLE de celle que l'assignation vient de corriger. Un
    // `in("label_id", …)` sur `contenu_labels` traverse une relation
    // many-to-many : deux labels populaires du parent (alpha_male, 965 liens ;
    // smart_girl, 951) matchent 1916 lignes, PostgREST en rend 1000 et répond
    // 200. Le pool de visuels frères était donc amputé de moitié en silence, et
    // la variation repiochait dans la même poignée d'images.
    //
    // Le garde-fou de complétude lève désormais sur cette forme — et
    // `visuelsAlternatifsLabel` n'a aucun try/catch, ni ses appelants jusqu'à
    // minuit-vnext. On ne se contente donc pas de rendre la troncature bruyante,
    // on l'élimine : `contenuIdsDesLabels` boucle label par label et pagine en
    // keyset avec `contenu_id` pour ancre — ancre qui n'est unique qu'À
    // L'INTÉRIEUR d'un label, d'où la boucle plutôt qu'un `in(...)` paginé.
    const contenusDuLabel = await contenuIdsDesLabels(
      supabase,
      labelIds,
      "Variations — slideshows frères du label",
    );
    const autresContenus = contenusDuLabel.filter((id) => id !== parentId);

    if (autresContenus.length > 0) {
      const medias = await lireParLots<{ id: string }>(
        autresContenus,
        "Visuels propres des contenus frères",
        (lot) =>
          supabase
            .from("media_library")
            .select("id, url, storage_path")
            .in("contenu_id", lot)
            .eq("texte_restant", false)
            .like("storage_path", "propre/%")
            .order("used_count")
            .limit(80),
      );
      poolIds = medias
        .map((m) => m.id)
        .filter((id) => !exclus.has(id))
        .slice(0, 80);
    }
  }

  // Repli : toute la biblio propre hors parent
  if (poolIds.length < parentSlides.length) {
    const { data: medias, error: errRepli } = await supabase
      .from("media_library")
      .select("id")
      .eq("texte_restant", false)
      .like("storage_path", "propre/%")
      .order("used_count")
      .limit(100);
    assertLu("Variations — repli bibliothèque propre", errRepli);
    for (const m of medias ?? []) {
      const id = m.id as string;
      if (!exclus.has(id) && !poolIds.includes(id)) poolIds.push(id);
    }
  }

  // `poolIds` plafonne à 180 (80 frères + 100 de repli) : sous le seuil du
  // garde-fou `in(...)`, et le filtre porte sur la clé primaire, donc la
  // réponse ne peut pas dépasser la longueur du filtre. Rien à paginer — mais
  // l'erreur, elle, se relit : sans URL, chaque slide retombe sur le visuel du
  // parent et la « variation » sort identique à son parent.
  const { data: details, error: errDetails } = poolIds.length > 0
    ? await supabase.from("media_library").select("id, url").in("id", poolIds)
    : { data: [] as Array<{ id: string; url: string }>, error: null };
  assertLu("Variations — URLs des visuels retenus", errDetails);
  const urlParId = new Map((details ?? []).map((m) => [m.id as string, m.url as string]));

  const libres = [...poolIds];
  return parentSlides.map((s) => {
    const mediaId = libres.shift() ?? null;
    const url = mediaId ? urlParId.get(mediaId) ?? null : null;
    return {
      position: s.position,
      media_id: mediaId,
      raw_url: url ?? s.raw_url ?? null,
      reference_url: s.reference_url ?? s.raw_url ?? null,
    };
  });
}

/**
 * Crée une variation d'un contenu gagnant dans une langue.
 * Autres langues : lignes créées (score modeste, slides vides) → backfill import.
 */
export async function creerVariation(
  supabase: Supabase,
  candidat: Candidat,
  reglages: VariationReglages,
): Promise<string> {
  // Lecture inverse de la précédente : les labels D'UN slideshow, donc bornée
  // par le nombre de labels du dépôt (quelques dizaines) et non par la
  // popularité d'un label. Pas de pagination à prévoir ici ; l'erreur, si. Lue
  // comme « aucun label », elle prive la variation de ses labels — elle sort
  // alors invisible pour le pool d'assignation, et donc jamais assignée.
  const { data: labels, error: errLabels } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", candidat.contenuId);
  assertLu(`Variations — labels du parent ${candidat.contenuId}`, errLabels);
  const labelIds = (labels ?? []).map((l) => l.label_id as string);

  const structure = await visuelsAlternatifsLabel(
    supabase,
    candidat.contenuId,
    candidat.structure_slides,
    labelIds,
  );

  // Reformulation (flag variation) dans la langue déclencheuse
  let voix: string | null = null;
  if (candidat.compte_reference_id) {
    const { data: source, error: errVoix } = await supabase
      .from("comptes_reference")
      .select("style_profile")
      .eq("id", candidat.compte_reference_id)
      .maybeSingle();
    assertLu(`Variations — voix de la source ${candidat.compte_reference_id}`, errVoix);
    voix = (source?.style_profile as string | null) ?? null;
  }

  const dedie = await chargerPrompt(supabase, `traduction_${candidat.langue}`);
  const base = dedie ??
    (candidat.langue === "fr" ? await chargerPrompt(supabase, "traduction") : undefined);
  const consignes = await chargerPrompt(supabase, "composition_remanie");
  const regles = [base, consignes, voix ? `Voix propre à cette source :\n${voix}` : null]
    .filter(Boolean)
    .join("\n\n");

  const traductions = await translateSlideshow({
    slides: candidat.slides.map((s) => ({
      position: s.position,
      original: s.texte_overlay ?? "",
    })),
    sourceTitle: candidat.titre,
    rules: regles || undefined,
    langue: candidat.langue,
    variation: true,
  });
  const parPos = new Map(traductions.slides.map((t) => [t.position, t.translated]));
  let deck: SlideLangue[] = candidat.slides.map((s) => ({
    position: s.position,
    texte_overlay: parPos.get(s.position) ?? s.texte_overlay,
    position_sophia: false,
  }));
  const hashtagsTraduits = traductions.hashtags;

  // Sophia sur le deck reformulé
  const { data: corrections, error: errCorrections } = await supabase
    .from("corrections")
    .select("texte_origine, texte_corrige")
    .order("created_at", { ascending: false })
    .limit(40);
  assertLu("Variations — corrections Sophia", errCorrections);

  const appVar = await applicationParId(supabase, candidat.application_id);
  const slugApp = appVar?.slug ?? "sophia";
  const placement = await integrateSophia({
    masterPrompt: (await chargerPrompt(supabase, clePromptPlacement(slugApp))) ?? "",
    corrections: (corrections ?? []).map((c) => ({
      original_text: c.texte_origine,
      corrected_text: c.texte_corrige,
    })),
    slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
    caption: candidat.titre,
    langue: candidat.langue,
    marque: slugApp,
  });

  if (placement) {
    const idx = deck.findIndex((s) => s.position === placement.chosenPosition);
    if (idx >= 0) {
      deck[idx] = {
        ...deck[idx],
        texte_overlay: placement.variants[placement.bestIndex],
        position_sophia: true,
      };
    }
  } else {
    const derniere = deck[deck.length - 1];
    if (derniere) {
      derniere.texte_overlay = placementParDefaut(candidat.langue, slugApp);
      derniere.position_sophia = true;
    }
  }

  const scoreVar = scoreDepartVariation(candidat.score, reglages.score_prior);

  const { data: nouveau, error } = await supabase
    .from("contenus")
    .insert({
      titre: `${candidat.titre} (var. ${candidat.langue})`.slice(0, 160),
      structure_slides: structure,
      compte_reference_id: candidat.compte_reference_id,
      application_id: candidat.application_id,
      langue_source: candidat.langue,
      musique_url: candidat.musique_url,
      musique_titre: candidat.musique_titre,
      musique_plateforme: candidat.musique_plateforme,
      statut: "valide",
      import_statut: "done",
      import_etape: "variation",
      parent_id: candidat.contenuId,
      profondeur: candidat.profondeur + 1,
      variation_langue: candidat.langue,
      pertinence_score: 100,
      pertinence_raison: `Variation auto depuis score ${candidat.score.toFixed(1)} (${candidat.nb_passages} passages)`,
    })
    .select("id")
    .single();
  if (error || !nouveau) throw error ?? new Error("Création variation échouée");

  if (labelIds.length > 0) {
    // Écriture FONCTIONNELLE, pas décorative : sans ses labels la variation
    // n'entre dans aucun pool d'assignation. Un upsert raté et ignoré
    // fabriquait un slideshow que personne ne posterait jamais.
    const { error: errUpsert } = await supabase.from("contenu_labels").upsert(
      labelIds.map((label_id) => ({ contenu_id: nouveau.id, label_id })),
      { onConflict: "contenu_id,label_id" },
    );
    assertLu(`Variations — labels de la variation ${nouveau.id}`, errUpsert);
  }

  // Lier médias. Ici on TRACE au lieu de lever : le slideshow porte déjà le
  // `media_id` dans `structure_slides`, il s'affiche donc correctement même si
  // le rattachement échoue. Lever après l'insert laisserait un contenu orphelin
  // à moitié construit, pire que le défaut qu'on signale.
  for (const s of structure) {
    if (!s.media_id) continue;
    const { error: errLien } = await supabase
      .from("media_library")
      .update({ contenu_id: nouveau.id })
      .eq("id", s.media_id)
      .is("contenu_id", null);
    if (errLien) {
      console.warn(
        `[variations] rattachement média ${s.media_id} → ${nouveau.id} : ${messageErreur(errLien)}`,
      );
    }
  }

  // Contenu_langues : langue déclencheuse complète ; autres → vides (backfill)
  const rows = LANGUES_CIBLES.map((langue) => ({
    contenu_id: nouveau.id,
    langue,
    slides: langue === candidat.langue ? deck : [],
    hashtags: langue === candidat.langue ? (hashtagsTraduits || null) : null,
    score: langue === candidat.langue
      ? scoreVar
      : reglages.score_prior + 0.15 * (scoreVar - reglages.score_prior),
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  }));
  const { error: errLang } = await supabase.from("contenu_langues").insert(rows);
  if (errLang) throw errLang;

  // Incrémente used_count des médias choisis. Compteur d'usage servant au tri
  // `order("used_count")` du pool : le fausser dégrade la rotation des visuels,
  // il ne casse rien. Même arbitrage que ci-dessus — on trace, on ne lève pas,
  // la variation étant déjà créée et complète à ce stade.
  for (const s of structure) {
    if (!s.media_id) continue;
    const { data: m, error: errLu } = await supabase
      .from("media_library")
      .select("used_count")
      .eq("id", s.media_id)
      .maybeSingle();
    if (errLu) {
      console.warn(`[variations] used_count ${s.media_id} (lecture) : ${messageErreur(errLu)}`);
      continue;
    }
    if (m) {
      const { error: errMaj } = await supabase
        .from("media_library")
        .update({ used_count: (m.used_count ?? 0) + 1 })
        .eq("id", s.media_id);
      if (errMaj) {
        console.warn(`[variations] used_count ${s.media_id} (écriture) : ${messageErreur(errMaj)}`);
      }
    }
  }

  return nouveau.id;
}

/** Un pas : trouve un candidat et crée sa variation. */
export async function avancerVariations(
  supabase: Supabase,
): Promise<{ idle?: boolean; contenuId?: string; parentId?: string; langue?: string }> {
  const reglages = await chargerVariationReglages(supabase);
  const candidat = await trouverCandidatVariation(supabase, reglages);
  if (!candidat) return { idle: true };

  const id = await creerVariation(supabase, candidat, reglages);
  return {
    contenuId: id,
    parentId: candidat.contenuId,
    langue: candidat.langue,
  };
}
