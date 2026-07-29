import {
  integrateSophia,
  translateSlideshow,
} from "./gemini.ts";
import { LANGUES_CIBLES, type SlideLangue } from "./import_contenu.ts";
import { chargerPrompt, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

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
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "scoring").maybeSingle();
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

function sophiaParDefaut(langue: string): string {
  const par: Record<string, string> = {
    fr: "Envie d'en apprendre plus chaque jour ? L'appli Sophia t'apprend une culture générale de dingue en quelques minutes. Teste-la 👀",
    en: "Want to learn something new every day? The Sophia app teaches you wild general knowledge in minutes. Give it a try 👀",
    es: "¿Quieres aprender algo nuevo cada día? La app Sophia te enseña cultura general increíble en minutos. Pruébala 👀",
    de: "Lust, jeden Tag etwas Neues zu lernen? Die Sophia-App bringt dir in wenigen Minuten richtig gutes Allgemeinwissen bei. Probier's aus 👀",
    it: "Vuoi imparare qualcosa di nuovo ogni giorno? L'app Sophia ti insegna una cultura generale pazzesca in pochi minuti. Provala 👀",
    pt: "Queres aprender algo novo todos os dias? A app Sophia ensina-te cultura geral incrível em poucos minutos. Experimenta 👀",
    cs: "Chceš se každý den naučit něco nového? Aplikace Sophia tě naučí skvělé všeobecné znalosti za pár minut. Vyzkoušej ji 👀",
    nl: "Wil je elke dag iets nieuws leren? De Sophia-app leert je in een paar minuten waanzinnige algemene kennis. Probeer het 👀",
    el: "Θέλεις να μαθαίνεις κάτι νέο κάθε μέρα; Η εφαρμογή Sophia σου μαθαίνει απίστευτη γενική γνώση σε λίγα λεπτά. Δοκίμασέ την 👀",
    hu: "Szeretnél minden nap valami újat tanulni? A Sophia app perceken belül vad általános műveltséget ad. Próbáld ki 👀",
    pl: "Chcesz codziennie uczyć się czegoś nowego? Aplikacja Sophia uczy szalonej wiedzy ogólnej w kilka minut. Wypróbuj 👀",
    ro: "Vrei să înveți ceva nou în fiecare zi? Aplicația Sophia te învață cultură generală tare în câteva minute. Încearc-o 👀",
    sv: "Vill du lära dig något nytt varje dag? Sophia-appen lär dig galen allmänbildning på några minuter. Testa den 👀",
    tr: "Her gün yeni bir şey öğrenmek ister misin? Sophia uygulaması dakikalar içinde efsane genel kültür öğretir. Dene 👀",
  };
  return par[langue] ?? par.en;
}

interface Candidat {
  contenuId: string;
  langue: string;
  score: number;
  nb_passages: number;
  titre: string;
  profondeur: number;
  compte_reference_id: string | null;
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
    const { data: contenu } = await supabase
      .from("contenus")
      .select(
        "id, titre, profondeur, compte_reference_id, structure_slides, musique_url, musique_titre, musique_plateforme, created_at, statut, import_statut, parent_id",
      )
      .eq("id", cl.contenu_id)
      .eq("statut", "valide")
      .eq("import_statut", "done")
      .maybeSingle();

    if (!contenu) continue;
    if ((contenu.profondeur ?? 0) >= reglages.profondeur_max) continue;
    if (contenu.created_at > ageIso) continue;

    const slides = (cl.slides ?? []) as SlideLangue[];
    if (slides.length === 0 || !slides.some((s) => s.texte_overlay)) continue;

    // Déjà une variation pour cette langue ?
    const { data: enfant } = await supabase
      .from("contenus")
      .select("id")
      .eq("parent_id", contenu.id)
      .eq("variation_langue", cl.langue)
      .maybeSingle();
    if (enfant) continue;

    return {
      contenuId: contenu.id,
      langue: cl.langue,
      score: cl.score,
      nb_passages: cl.nb_passages,
      titre: contenu.titre,
      profondeur: contenu.profondeur ?? 0,
      compte_reference_id: contenu.compte_reference_id,
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
    const { data: liens } = await supabase
      .from("contenu_labels")
      .select("contenu_id")
      .in("label_id", labelIds);
    const autresContenus = [...new Set((liens ?? []).map((l) => l.contenu_id as string))]
      .filter((id) => id !== parentId);

    if (autresContenus.length > 0) {
      const { data: medias } = await supabase
        .from("media_library")
        .select("id, url, storage_path")
        .in("contenu_id", autresContenus)
        .eq("texte_restant", false)
        .like("storage_path", "propre/%")
        .order("used_count")
        .limit(80);
      poolIds = (medias ?? [])
        .map((m) => m.id as string)
        .filter((id) => !exclus.has(id));
    }
  }

  // Repli : toute la biblio propre hors parent
  if (poolIds.length < parentSlides.length) {
    const { data: medias } = await supabase
      .from("media_library")
      .select("id")
      .eq("texte_restant", false)
      .like("storage_path", "propre/%")
      .order("used_count")
      .limit(100);
    for (const m of medias ?? []) {
      const id = m.id as string;
      if (!exclus.has(id) && !poolIds.includes(id)) poolIds.push(id);
    }
  }

  const { data: details } = poolIds.length > 0
    ? await supabase.from("media_library").select("id, url").in("id", poolIds)
    : { data: [] };
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
  const { data: labels } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", candidat.contenuId);
  const labelIds = (labels ?? []).map((l) => l.label_id as string);

  const structure = await visuelsAlternatifsLabel(
    supabase,
    candidat.contenuId,
    candidat.structure_slides,
    labelIds,
  );

  // Reformulation (flag variation) dans la langue déclencheuse
  const voix = candidat.compte_reference_id
    ? (
      await supabase
        .from("comptes_reference")
        .select("style_profile")
        .eq("id", candidat.compte_reference_id)
        .maybeSingle()
    ).data?.style_profile
    : null;

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
  const parPos = new Map(traductions.map((t) => [t.position, t.translated]));
  let deck: SlideLangue[] = candidat.slides.map((s) => ({
    position: s.position,
    texte_overlay: parPos.get(s.position) ?? s.texte_overlay,
    position_sophia: false,
  }));

  // Sophia sur le deck reformulé
  const { data: corrections } = await supabase
    .from("corrections")
    .select("texte_origine, texte_corrige")
    .order("created_at", { ascending: false })
    .limit(40);

  const placement = await integrateSophia({
    masterPrompt: (await chargerPrompt(supabase, "placement_sophia")) ?? "",
    corrections: (corrections ?? []).map((c) => ({
      original_text: c.texte_origine,
      corrected_text: c.texte_corrige,
    })),
    slides: deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
    caption: candidat.titre,
    langue: candidat.langue,
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
      derniere.texte_overlay = sophiaParDefaut(candidat.langue);
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
    await supabase.from("contenu_labels").upsert(
      labelIds.map((label_id) => ({ contenu_id: nouveau.id, label_id })),
      { onConflict: "contenu_id,label_id" },
    );
  }

  // Lier médias
  for (const s of structure) {
    if (!s.media_id) continue;
    await supabase
      .from("media_library")
      .update({ contenu_id: nouveau.id })
      .eq("id", s.media_id)
      .is("contenu_id", null);
  }

  // Contenu_langues : langue déclencheuse complète ; autres → vides (backfill)
  const rows = LANGUES_CIBLES.map((langue) => ({
    contenu_id: nouveau.id,
    langue,
    slides: langue === candidat.langue ? deck : [],
    score: langue === candidat.langue
      ? scoreVar
      : reglages.score_prior + 0.15 * (scoreVar - reglages.score_prior),
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  }));
  const { error: errLang } = await supabase.from("contenu_langues").insert(rows);
  if (errLang) throw errLang;

  // Incrémente used_count des médias choisis
  for (const s of structure) {
    if (!s.media_id) continue;
    const { data: m } = await supabase
      .from("media_library")
      .select("used_count")
      .eq("id", s.media_id)
      .maybeSingle();
    if (m) {
      await supabase
        .from("media_library")
        .update({ used_count: (m.used_count ?? 0) + 1 })
        .eq("id", s.media_id);
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
