/**
 * BLEO — l'assignation de minuit suit le plan du tirage de 14 h (bascule du
 * 2/11, décision d'Adrien le 29/10 : pas d'A/B).
 *
 * Le tirage de 14 h (`bleo_tirage`, migration 0603) écrit le plan du lendemain
 * dans `bleo_ombre_passages` : un contenu, une langue et une application par
 * créneau de chaque compte. Quand `reglages.bleo.mode = 'actif'`,
 * `assignerCompteJour` prend chaque créneau dans ce plan au lieu de le piocher
 * dans la tierlist. Tout le reste ne bouge pas : rappels, quotas, decks, posts.
 *
 * Secours à deux niveaux :
 *   - par créneau : un contenu du plan qui n'est plus servable à minuit (deck en
 *     échec, application plus servie par le compte, contenu déjà posé) rend le
 *     créneau à la tierlist (`choisirContenu`), passage marqué `bras = 'temoin'` ;
 *   - global : `bleo.mode` repasse à `ombre` (interrupteur de l'OS), et la nuit
 *     suivante est l'ancienne.
 */
import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Un créneau du plan d'un compte, tel que le tirage l'a écrit. */
export interface LignePlanBleo {
  runId: string;
  creneau: number;
  contenuId: string;
  langue: string;
  applicationId: string | null;
  fileBleo: "juger" | "valeur" | "rappel";
  categorie: string | null;
  valeurTirage: number | null;
}

/** Le plan du jour pour la flotte : le run officiel, s'il faut le suivre. */
export interface PlanBleoJour {
  runId: string;
  jourVise: string;
}

/**
 * Mode `actif` et run officiel du jour (le dernier tirage fini sans erreur pour
 * ce jour). `null` : on ne suit pas de plan (mode `off` ou `ombre`, ou aucun
 * tirage fini), et l'assignation reste celle d'avant. `forcer` : le mode n'est
 * pas lu (répétition à blanc de la bascule).
 */
export async function lirePlanBleoJour(
  supabase: Supabase,
  jour: string,
  opts: { forcer?: boolean } = {},
): Promise<PlanBleoJour | null> {
  if (!opts.forcer) {
    const { data: reglage, error: errReglage } = await supabase
      .from("reglages")
      .select("valeur")
      .eq("cle", "bleo")
      .maybeSingle();
    if (errReglage) throw errReglage;
    const mode = (reglage?.valeur as { mode?: string } | null)?.mode ?? "off";
    if (mode !== "actif") return null;
  }
  const { data: run, error: errRun } = await supabase
    .from("bleo_runs")
    .select("id, jour_vise")
    .eq("jour_vise", jour)
    .not("fini_le", "is", null)
    .is("erreur", null)
    .order("demarre_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errRun) throw errRun;
  if (!run) return null;
  return { runId: run.id as string, jourVise: run.jour_vise as string };
}

/** Les créneaux du plan d'un compte (rappels exclus : ils sont déjà posés), dans l'ordre. */
export async function lirePlanBleoCompte(
  supabase: Supabase,
  plan: PlanBleoJour,
  compteId: string,
): Promise<LignePlanBleo[]> {
  const { data, error } = await supabase
    .from("bleo_ombre_passages")
    .select("run_id, creneau, contenu_id, langue, application_id, file_bleo, categorie, valeur_tirage")
    .eq("run_id", plan.runId)
    .eq("compte_id", compteId)
    .in("file_bleo", ["juger", "valeur"])
    .order("creneau", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? [])
    .filter((l) => l.contenu_id)
    .map((l) => ({
      runId: l.run_id as string,
      creneau: Number(l.creneau),
      contenuId: l.contenu_id as string,
      langue: l.langue as string,
      applicationId: (l.application_id as string | null) ?? null,
      fileBleo: l.file_bleo as LignePlanBleo["fileBleo"],
      categorie: (l.categorie as string | null) ?? null,
      valeurTirage: l.valeur_tirage == null ? null : Number(l.valeur_tirage),
    }));
}

/**
 * Le prochain créneau du plan à servir : le premier pas encore tenté, dans la
 * langue du compte, dont le contenu n'est pas déjà pris aujourd'hui. Les
 * créneaux sautés sont consommés : un créneau du plan n'est tenté qu'une fois.
 */
export function prochaineLignePlan(
  restantes: LignePlanBleo[],
  langueCompte: string,
  contenusPris: ReadonlyArray<string>,
): LignePlanBleo | null {
  while (restantes.length > 0) {
    const ligne = restantes.shift()!;
    if (ligne.langue !== langueCompte) continue;
    if (contenusPris.includes(ligne.contenuId)) continue;
    return ligne;
  }
  return null;
}

/** Colonnes BLEO d'un passage : servi par le plan (`bleo`) ou rendu à la tierlist en mode actif (`temoin`). */
export function colonnesBleoPassage(
  ligne: LignePlanBleo | null,
  planActif: boolean,
): Record<string, unknown> {
  if (ligne) {
    return {
      bras: "bleo",
      file_bleo: ligne.fileBleo,
      valeur_tirage: ligne.valeurTirage,
      bleo_run_id: ligne.runId,
    };
  }
  return planActif ? { bras: "temoin" } : {};
}
