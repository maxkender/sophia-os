/** Helpers statut warmup d'un compte de publication. */

export type StatutWarmup = "attente" | "en_cours" | "termine";

export function statutWarmup(compte: {
  warmup_started_at?: string | null;
  warmup_ends_at?: string | null;
}): StatutWarmup {
  if (!compte.warmup_started_at || !compte.warmup_ends_at) return "attente";
  if (new Date(compte.warmup_ends_at).getTime() > Date.now()) return "en_cours";
  return "termine";
}

/** Compte éligible au process (assignation, Pilotage, stats). */
export function compteEnProcessus(compte: {
  warmup_started_at?: string | null;
  warmup_ends_at?: string | null;
}): boolean {
  return statutWarmup(compte) === "termine";
}

/** ms restantes avant fin warmup (0 si terminé / pas démarré). */
export function warmupRestantMs(endsAt: string | null | undefined): number {
  if (!endsAt) return 0;
  return Math.max(0, new Date(endsAt).getTime() - Date.now());
}

export function formaterDuree(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
