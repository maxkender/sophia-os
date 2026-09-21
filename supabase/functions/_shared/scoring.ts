import { LOT_IDS, decouperEnLots, lireTout } from "./lots.ts";
import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/**
 * PAUSE temporaire — ne plus faire évoluer `contenu_langues.score` à partir des
 * stats TikTok fetchées au minuit runtime.
 * L'assignation midnight continue d'utiliser les scores d'import (ELO cold-start).
 * Le rattrapage admin (`rattrapage-elo` / etape minuit `rattrapage`) contourne
 * cette pause volontairement.
 */
export const PAUSE_ELO_RUNTIME = true;

export interface ScoringReglages {
  /** Ex-lissage de la forme du compte — plus utilisé depuis le classement (0238). */
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
 * MAJ des scores après relevé de stats.
 * Recalcul idempotent par contenu×langue à partir de tous les passages publiés
 * mesurés (évite d'inflater nb_passages à chaque minuit).
 * Ordre : contenu[langue postée] → transfert léger inter-langue.
 */
export async function majScoresDepuisPassages(
  supabase: Supabase,
  opts: { depuisHeures?: number; compteId?: string | null } = {},
): Promise<{ contenus: number; saute?: boolean; raison?: string }> {
  if (PAUSE_ELO_RUNTIME) {
    return {
      contenus: 0,
      saute: true,
      raison: "PAUSE_ELO_RUNTIME — évolution ELO langue depuis stats désactivée",
    };
  }

  const scoring = await chargerScoring(supabase);
  const depuis = new Date(
    Date.now() - (opts.depuisHeures ?? 36) * 3600_000,
  ).toISOString();

  // Passages fraîchement relevés → quels contenus recalculer.
  //
  // Lecture paginée et non plafonnée : `rattrapage_elo` rafraîchit une fenêtre
  // de 4 jours ≈ 4 × 255 créneaux, et deux runs tombent dans les 36 h — on est
  // à ~2000 lignes pour un plafond PostgREST à 1000. Aggravant, et c'est ce qui
  // rendait la perte invisible : ces lignes sont précisément celles qu'`ecrireStats`
  // vient d'UPDATE, donc celles que MVCC réécrit en fin de tas. La fenêtre lue
  // gardait le vieux et jetait le frais, et `recents.length === 0` ne se
  // déclenchant jamais, « moins de contenus à recalculer » passait pour un fait.
  //
  // Ancre `id` : immuable, donc l'ordre ne bouge pas sous les UPDATE de stats,
  // là où un `offset` sur un tas réécrit saute et répète des pages.
  const recents = await lireTout<{ id: string; contenu_id: string; compte_id: string }>(
    "Passages fraîchement relevés",
    (curseur, taille) => {
      let q = supabase
        .from("passages")
        .select("id, contenu_id, compte_id")
        .eq("statut", "publie")
        .not("vues", "is", null)
        .gte("stats_maj_at", depuis);
      if (opts.compteId) q = q.eq("compte_id", opts.compteId);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (p) => p.id },
  );
  if (recents.length === 0) return { contenus: 0 };

  const contenuIds = [...new Set(recents.map((p) => p.contenu_id))];

  // Tous les passages mesurés de ces contenus (recalcul complet).
  //
  // Deux découpages, parce qu'ils ne protègent pas de la même chose. Le lot de
  // 100 `contenu_id` borne l'URL (le 400 du 20/08) ; la pagination borne la
  // RÉPONSE. Sans elle, 100 contenus × tous leurs passages mesurés depuis
  // toujours dépassent le plafond, et comme ce bloc RÉÉCRIT `score` et
  // `nb_passages` dans `contenu_langues`, une lecture amputée ne se contente
  // pas de fausser un affichage : elle persiste en base un ELO faux,
  // indiscernable d'un ELO juste.
  type PassageMesure = {
    id: string;
    contenu_id: string;
    compte_id: string;
    langue: string;
    vues: number | null;
  };
  const tous: PassageMesure[] = [];
  for (const lot of decouperEnLots(contenuIds, LOT_IDS)) {
    const page = await lireTout<PassageMesure>(
      `Passages mesurés (${lot.length} contenus)`,
      (curseur, taille) => {
        let q = supabase
          .from("passages")
          .select("id, contenu_id, compte_id, langue, vues")
          .in("contenu_id", lot)
          .eq("statut", "publie")
          .not("vues", "is", null);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id", { ascending: true }).limit(taille);
      },
      { ancre: (p) => p.id },
    );
    tous.push(...page);
  }

  type Agg = { perfs: number[] };
  const parContenuLangue = new Map<string, Agg>();
  for (const p of tous ?? []) {
    const key = `${p.contenu_id}::${p.langue}`;
    const perf = performancePassage(p.vues, scoring.elo_vues_plafond);
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

  // La « forme » du compte ne se mesure plus ici : un compte porte une case de
  // classement (INACTIF → STAR), requalifiée après le relevé des vues de la nuit
  // (`_shared/classement_comptes.ts`).
  return { contenus: contenusMaj };
}
