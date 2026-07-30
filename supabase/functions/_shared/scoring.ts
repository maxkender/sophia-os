import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/**
 * PAUSE temporaire — ne plus faire évoluer `contenu_langues.score` / EWMA
 * comptes à partir des stats TikTok fetchées au minuit runtime.
 * L'assignation midnight continue d'utiliser les scores d'import (ELO cold-start).
 * Le rattrapage admin (`rattrapage-elo` / etape minuit `rattrapage`) contourne
 * cette pause volontairement.
 */
export const PAUSE_ELO_RUNTIME = true;

export interface ScoringReglages {
  ewma_alpha: number;
  regularisation_k: number;
  transfert_inter_langue: number;
  score_prior: number;
  /** Régularisation ELO compte / import (défaut 1 — faible pour laisser les vues parler). */
  elo_regularisation_k: number;
  /** Plafond vues (= score 100) pour l’échelle log^1.3. */
  elo_vues_plafond: number;
}

export async function chargerScoring(supabase: Supabase): Promise<ScoringReglages> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "scoring").maybeSingle();
  const v = (data?.valeur ?? {}) as Record<string, number>;
  return {
    ewma_alpha: v.ewma_alpha ?? 0.3,
    regularisation_k: v.regularisation_k ?? 5,
    transfert_inter_langue: v.transfert_inter_langue ?? 0.15,
    score_prior: v.score_prior ?? 50,
    elo_regularisation_k: v.elo_regularisation_k ?? 1,
    elo_vues_plafond: v.elo_vues_plafond ?? 80_000,
  };
}

/**
 * Performance brute d'un passage (0..100) depuis les vues.
 * Échelle log^1.3 alignée sur l'ELO import — 1–4 vues ≈ 3–8 (plus de plancher à 40).
 */
export function performancePassage(
  vues: number | null | undefined,
  plafond = 80_000,
): number {
  const p = Math.max(1, plafond);
  const exp = 1.3;
  const num = Math.log(1 + (vues ?? 0)) ** exp;
  const den = Math.log(1 + p) ** exp;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

/**
 * Normalise par la « forme » du compte : une réussite sur un petit score
 * (peu attendu) pousse plus qu'une réussite sur un gros score.
 */
export function performanceNormalisee(perf: number, scoreCompte: number, prior: number): number {
  const forme = Math.max(scoreCompte, 1);
  const facteur = prior / forme;
  return Math.min(100, Math.max(0, prior + (perf - prior) * facteur));
}

/**
 * MAJ des scores après relevé de stats.
 * Recalcul idempotent par contenu×langue à partir de tous les passages publiés
 * mesurés (évite d'inflater nb_passages à chaque minuit).
 * Ordre : contenu[langue postée] → transfert léger → EWMA comptes.
 */
export async function majScoresDepuisPassages(
  supabase: Supabase,
  opts: { depuisHeures?: number; compteId?: string | null } = {},
): Promise<{ contenus: number; comptes: number; saute?: boolean; raison?: string }> {
  if (PAUSE_ELO_RUNTIME) {
    return {
      contenus: 0,
      comptes: 0,
      saute: true,
      raison: "PAUSE_ELO_RUNTIME — évolution ELO langue depuis stats désactivée",
    };
  }

  const scoring = await chargerScoring(supabase);
  const depuis = new Date(
    Date.now() - (opts.depuisHeures ?? 36) * 3600_000,
  ).toISOString();

  // Passages fraîchement relevés → quels contenus recalculer
  let q = supabase
    .from("passages")
    .select("contenu_id, compte_id")
    .eq("statut", "publie")
    .not("vues", "is", null)
    .gte("stats_maj_at", depuis);

  if (opts.compteId) q = q.eq("compte_id", opts.compteId);

  const { data: recents, error } = await q;
  if (error) throw error;
  if (!recents || recents.length === 0) return { contenus: 0, comptes: 0 };

  const contenuIds = [...new Set(recents.map((p) => p.contenu_id as string))];
  const compteIdsTouchés = [...new Set(recents.map((p) => p.compte_id as string))];

  const { data: comptesRows } = await supabase.from("comptes").select("id, score");
  const scoreCompte = new Map(
    (comptesRows ?? []).map((c) => [c.id as string, (c.score as number) ?? scoring.score_prior]),
  );

  // Tous les passages mesurés de ces contenus (recalcul complet)
  const { data: tous, error: errTous } = await supabase
    .from("passages")
    .select("contenu_id, compte_id, langue, vues")
    .in("contenu_id", contenuIds)
    .eq("statut", "publie")
    .not("vues", "is", null);
  if (errTous) throw errTous;

  type Agg = { perfs: number[] };
  const parContenuLangue = new Map<string, Agg>();
  for (const p of tous ?? []) {
    const key = `${p.contenu_id}::${p.langue}`;
    const perf = performanceNormalisee(
      performancePassage(p.vues, scoring.elo_vues_plafond),
      scoreCompte.get(p.compte_id) ?? scoring.score_prior,
      scoring.score_prior,
    );
    let agg = parContenuLangue.get(key);
    if (!agg) {
      agg = { perfs: [] };
      parContenuLangue.set(key, agg);
    }
    agg.perfs.push(perf);
  }

  let contenusMaj = 0;
  const transferJobs: Array<{ contenuId: string; langue: string; score: number }> = [];
  const k = scoring.regularisation_k;

  for (const [key, agg] of parContenuLangue) {
    const [contenuId, langue] = key.split("::");
    const n = agg.perfs.length;
    const sum = agg.perfs.reduce((a, b) => a + b, 0);
    const score = (k * scoring.score_prior + sum) / (k + n);

    const { data: cl } = await supabase
      .from("contenu_langues")
      .select("id")
      .eq("contenu_id", contenuId)
      .eq("langue", langue)
      .maybeSingle();
    if (!cl) continue;

    await supabase
      .from("contenu_langues")
      .update({
        score,
        nb_passages: n,
        score_maj_at: new Date().toISOString(),
      })
      .eq("id", cl.id);

    transferJobs.push({ contenuId, langue, score });
    contenusMaj += 1;
  }

  const coef = scoring.transfert_inter_langue;
  if (coef > 0) {
    for (const job of transferJobs) {
      const { data: autres } = await supabase
        .from("contenu_langues")
        .select("id, score, langue")
        .eq("contenu_id", job.contenuId)
        .neq("langue", job.langue);
      for (const a of autres ?? []) {
        const nudged = (a.score as number) + coef * (job.score - (a.score as number));
        await supabase
          .from("contenu_langues")
          .update({ score: nudged, score_maj_at: new Date().toISOString() })
          .eq("id", a.id);
      }
    }
  }

  // EWMA comptes : moyenne des perfs récentes de CE compte, puis lissage
  const { data: passagesCompte } = await supabase
    .from("passages")
    .select("compte_id, vues")
    .in("compte_id", compteIdsTouchés)
    .eq("statut", "publie")
    .not("vues", "is", null)
    .gte("stats_maj_at", depuis);

  const perfParCompte = new Map<string, number[]>();
  for (const p of passagesCompte ?? []) {
    const perf = performanceNormalisee(
      performancePassage(p.vues, scoring.elo_vues_plafond),
      scoreCompte.get(p.compte_id) ?? scoring.score_prior,
      scoring.score_prior,
    );
    const list = perfParCompte.get(p.compte_id) ?? [];
    list.push(perf);
    perfParCompte.set(p.compte_id, list);
  }

  let comptesMaj = 0;
  const alpha = scoring.ewma_alpha;
  for (const [cid, perfs] of perfParCompte) {
    const old = scoreCompte.get(cid) ?? scoring.score_prior;
    const moy = perfs.reduce((a, b) => a + b, 0) / perfs.length;
    const next = alpha * moy + (1 - alpha) * old;
    await supabase
      .from("comptes")
      .update({ score: next, score_maj_at: new Date().toISOString() })
      .eq("id", cid);
    comptesMaj += 1;
  }

  return { contenus: contenusMaj, comptes: comptesMaj };
}
