/**
 * Schémas exacts des actions moteur (miroir du code Edge).
 * Affichés dans Réglages — documentation opérationnelle, pas de secrets.
 */

export type PipelineStepKind = "api" | "logic" | "fallback" | "gate" | "persist";

export interface PipelineStep {
  id: string;
  /** Rang affiché (① ② …) ou null pour un gate. */
  rang?: string;
  label: string;
  kind: PipelineStepKind;
  /** Provider / modèle / fonction. */
  api?: string;
  /** Variable d'env (nom seulement). */
  env?: string;
  /** Comportement si échec. */
  onFail?: string;
  detail?: string;
  /** Réglage DB qui influence cette étape. */
  reglage?: string;
}

export interface PipelineAction {
  id: "cleaning" | "update_elo" | "assignation";
  /** Cle reglages. */
  cle?: string;
  edge: string;
  description: string;
  steps: PipelineStep[];
  /** Constantes figées dans le code (non éditables ici). */
  constants?: Array<{ cle: string; valeur: string; detail?: string }>;
}

/** Cleaning — `cleanImage` (_shared/gemini.ts + fal/replicate). */
export function schemaCleaning(
  principal: "fal" | "replicate" = "fal",
): PipelineAction {
  const second = principal === "fal" ? "replicate" : "fal";
  const fal = {
    api: "fal-ai/image-editing/text-removal",
    env: "FAL_KEY | FAL_API_KEY",
  };
  const replicate = {
    api: "flux-kontext-apps/text-removal",
    env: "REPLICATE_API_TOKEN",
  };
  const a = principal === "fal" ? fal : replicate;
  const b = principal === "fal" ? replicate : fal;
  const nomA = principal === "fal" ? "Fal" : "Replicate";
  const nomB = second === "fal" ? "Fal" : "Replicate";

  return {
    id: "cleaning",
    cle: "nettoyage",
    edge: "cleanImage → nettoyer-media / import / renettoyer",
    description:
      "Retrait de texte sur les slides, puis strip C2PA. Ordre Fal↔Replicate configurable.",
    steps: [
      {
        id: "principal",
        rang: "①",
        label: `${nomA} text-removal (principal)`,
        kind: "api",
        api: a.api,
        env: a.env,
        onFail: `FALLBACK → ${nomB}`,
        detail: "Rejeté si clé absente, erreur, ou sortie noire/dégénérée",
        reglage: "nettoyage.provider_principal",
      },
      {
        id: "fallback",
        rang: "②",
        label: `${nomB} text-removal (fallback)`,
        kind: "fallback",
        api: b.api,
        env: b.env,
        onFail: "Échec nettoyage (image non nettoyée)",
        detail: "Sauté si ① OK",
      },
      {
        id: "c2pa",
        rang: "③",
        label: "Strip C2PA (Content Credentials)",
        kind: "logic",
        api: "_shared/c2pa.ts",
        onFail: "Image livrée quand même (mime depuis bytes)",
        detail: "Lossless — après text-removal réussi",
      },
      {
        id: "ready",
        rang: "④",
        label: "ready / stockage",
        kind: "persist",
        detail: "PNG propre → storage + media.nettoyage",
      },
    ],
    constants: [
      {
        cle: "Gemini verifyClean",
        valeur: "PAUSE (toujours true)",
        detail: "Ancienne vérif OCR — désactivée",
      },
      {
        cle: "Gemini inpaint / proxy Lovable",
        valeur: "hors chaîne",
        detail: "Code mort — non appelé par cleanImage",
      },
    ],
  };
}

/** Update ELO — rattrapage (chemin actif) + runtime (pause). */
export const SCHEMA_UPDATE_ELO: PipelineAction = {
  id: "update_elo",
  edge: "rattrapage-elo · minuit-vnext { etapes: ['rattrapage'] }",
  description:
    "Update ELO actif = rattrapage (contourne PAUSE_ELO_RUNTIME). Le chemin minuit « scores » est en pause.",
  steps: [
    {
      id: "gate_pause",
      label: "PAUSE_ELO_RUNTIME",
      kind: "gate",
      api: "_shared/scoring.ts → majScoresDepuisPassages",
      detail: "true → no-op sur l'étape minuit « scores »",
      onFail: "Utiliser rattrapage (ci-dessous)",
    },
    {
      id: "scrape",
      rang: "①",
      label: "Scrape stats TikTok (profil)",
      kind: "api",
      api: "Apify scrapeStats(handle, 30 posts)",
      env: "APIFY_TOKEN (ou équivalent)",
      detail: "Match passage.publie_url → id vidéo",
      onFail: "② scrapePost(url) puis ③ cohérence ±36h",
    },
    {
      id: "fallback_url",
      rang: "②",
      label: "Fallback scrapePost(publie_url)",
      kind: "fallback",
      api: "Apify scrapePost",
      onFail: "③ cohérence temporelle",
    },
    {
      id: "fallback_coh",
      rang: "③",
      label: "Fallback cohérence (±36h)",
      kind: "fallback",
      detail: "Dernier post profil vs date_publication_prevue",
      onFail: "Passage sans match (stats non relevées)",
    },
    {
      id: "elo_langue",
      rang: "④",
      label: "ELO langue — deltas ↑/↓ (vues seules)",
      kind: "logic",
      api: "rattrapage_elo.appliquerEloLangue",
      detail: "Idempotent via passages.elo_maj_at",
      reglage: "scoring (performanceNormalisee / plafond vues)",
    },
    {
      id: "elo_compte",
      rang: "⑤",
      label: "ELO compte — moyenne pondérée ≤10 derniers posts",
      kind: "logic",
      api: "rattrapage_elo.appliquerEloComptes",
      detail:
        "perf = log^1.3(vues)/plafond · k=elo_regularisation_k (défaut 1) · decay 0.85 · −5 / jour actif sans post (jours passés) · skip warmup",
      reglage: "scoring.elo_vues_plafond · elo_regularisation_k",
    },
    {
      id: "snapshot",
      rang: "⑥",
      label: "Snapshot vues_globales_jour",
      kind: "persist",
      detail: "Δ = total j0 − total j1 (Pilotage)",
    },
  ],
  constants: [
    { cle: "RATTRAPAGE_JOURS_DEFAUT", valeur: "4", detail: "Jours Paris (fenêtre)" },
    { cle: "LR_LANGUE", valeur: "0.4", detail: "Learning rate deltas langue" },
    { cle: "MAX_DELTA_LANGUE", valeur: "±18", detail: "Plafond |Δ| par passage" },
    { cle: "COMPTE_MAX_POSTS", valeur: "10", detail: "Derniers posts mesurés seulement" },
    { cle: "COMPTE_DECAY", valeur: "0.85" },
    {
      cle: "ELO_PENALITE_NOPOST",
      valeur: "−5 / jour",
      detail: "Compte actif sans publication (jours passés de la fenêtre, hors aujourd’hui)",
    },
    { cle: "perf(1 vue)", valeur: "~2.7 / 100", detail: "ex-plancher 40 — corrigé" },
    { cle: "perf(4 vues)", valeur: "~8 / 100" },
    { cle: "COHERENCE_HEURES", valeur: "36" },
    { cle: "POSTS_RELEVES", valeur: "30", detail: "Posts scrapés par profil" },
  ],
};

/** Assignation minuit v-next. */
export const SCHEMA_ASSIGNATION: PipelineAction = {
  id: "assignation",
  cle: "moteur_vnext + assignation_auto + frequence + scoring",
  edge: "minuit-vnext → assignation_contenu.assignerTousComptes",
  description:
    "À minuit (ou manuel) : complète le quota de chaque compte actif via labels ∩ score + softmax.",
  steps: [
    {
      id: "gate_vnext",
      label: "Gate moteur_vnext.actif",
      kind: "gate",
      reglage: "moteur_vnext.actif",
      onFail: "saute (sauf forcer)",
    },
    {
      id: "gate_auto",
      label: "Gate assignation_auto.actif",
      kind: "gate",
      reglage: "assignation_auto.actif",
      onFail: "saute cron (manuel OK avec forcer/manuel)",
    },
    {
      id: "stats",
      rang: "①",
      label: "Fetch stats passages publiés",
      kind: "api",
      api: "Apify scrapeStats + match publie_url",
      detail: "Étape minuit « stats » (défaut avec assignation)",
      onFail: "Compte ignoré pour le relevé ; assignation continue",
    },
    {
      id: "scores",
      rang: "—",
      label: "MAJ ELO runtime (scores)",
      kind: "gate",
      detail: "PAUSE_ELO_RUNTIME = true → no-op",
      api: "majScoresDepuisPassages",
    },
    {
      id: "pool",
      rang: "②",
      label: "Pool candidats",
      kind: "logic",
      detail:
        "labels compte ∩ contenu · valide · import done · contenu_langues[langue]",
    },
    {
      id: "rank",
      rang: "③",
      label: "Score = ELO langue − pénalité saturation",
      kind: "logic",
      reglage: "scoring.saturation_jours · saturation_penalite",
      detail: "pénalité × (#comptes récents) × 10",
    },
    {
      id: "pick",
      rang: "④",
      label: "Tirage softmax top-K",
      kind: "logic",
      reglage: "scoring.top_k · temperature",
      detail: "Préfère jamais posté sur ce compte ; sinon plus ancien",
      onFail: "Aucun candidat → trou (pas de filler)",
    },
    {
      id: "deck",
      rang: "⑤",
      label: "Deck lazy : traduction + Sophia",
      kind: "api",
      api: "assurerDeckPourLangue (Gemini)",
      env: "GEMINI_API_KEY",
      onFail: "Passage non créé pour ce slot",
    },
    {
      id: "persist",
      rang: "⑥",
      label: "Créer passage statut=assigne",
      kind: "persist",
      detail: "musique + hashtags · quota = comptes.posts_par_jour ?? frequence",
      reglage: "frequence.posts_par_jour",
    },
    {
      id: "ugc_swap",
      rang: "⑦",
      label: "UGC AI — identité persona Nano Banana",
      kind: "api",
      api: "fal-ai/nano-banana-pro/edit (scène + 4 angles persona)",
      env: "FAL_KEY",
      detail:
        "Si compte.ugc_ai : pool ugc_compatible · slides visage_premier_plan → regen · ugc_face_regen (pas d’upscale)",
      onFail: "Slide d’origine conservée",
    },
    {
      id: "upscale",
      rang: "⑧",
      label: "Upscale SeedVR (Fal) des photos assignées",
      kind: "api",
      api: "upscale-assignes drain (SeedVR ×1 + auto-chaîne)",
      env: "FAL_KEY",
      detail:
        "Médias du jour avec upscale_le NULL (hors ugc_face_regen) → SeedVR ×2 JPEG → strip C2PA en fin",
      onFail: "Média sauté ; le drain reprend les suivants",
    },
    {
      id: "ugc_ai_video",
      rang: "⑨",
      label: "UGC AI VIDEO — assignation (EN DERNIER)",
      kind: "api",
      api: "assignation-ugc-video (kick drain streamé)",
      env: "FAL_KEY · GEMINI_API_KEY",
      detail:
        "Comptes ugc_ai_video : reaction (même label, no reuse sauf fallback) → nettoyage frame10 (text-removal) → Nano Banana face ref → Kling motion-control → concat utilisation → caption traduite",
      onFail: "Post statut=echec ; les autres comptes continuent",
    },
  ],
  constants: [
    { cle: "Cron minuit", valeur: "0 22 * * * UTC", detail: "≈ minuit Paris (été)" },
    { cle: "quota défaut", valeur: "1–3", detail: "par compte, sinon reglages.frequence" },
    { cle: "repartition / semaine1", valeur: "legacy ignoré", detail: "cutover v-next" },
    {
      cle: "upscale drain",
      valeur: "SeedVR ×1 + cron * * * * *",
      detail: "kick post-assignation + file de secours",
    },
    {
      cle: "ugc_ai_video",
      valeur: "après upscale",
      detail: "Kling + merge via Fal ; logs NDJSON",
    },
  ],
};
