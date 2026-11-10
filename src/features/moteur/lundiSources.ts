import type { DecisionSourceLundi, SourceLundi } from "@/features/moteur/api";

/** Ordre d'affichage : celles mises à jour d'abord, puis les sources neuves, puis les autres. */
const RANG: Record<DecisionSourceLundi, number> = { maj: 0, peu_de_mesures: 1, pas_maj: 2 };

export const VARIANTE_DECISION: Record<DecisionSourceLundi, "success" | "info" | "secondary"> = {
  maj: "success",
  peu_de_mesures: "info",
  pas_maj: "secondary",
};

export function trierSourcesLundi(sources: readonly SourceLundi[]): SourceLundi[] {
  return [...sources].sort(
    (a, b) => RANG[a.decision] - RANG[b.decision] || (b.r ?? -1) - (a.r ?? -1) || a.handle.localeCompare(b.handle),
  );
}
