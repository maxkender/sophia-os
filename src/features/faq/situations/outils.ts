import { useQuery } from "@tanstack/react-query";

import { CLE_SITUATIONS, listerSituations, type Situation } from "./api";

/** Prompt 21, Q : les lectures et petits outils partagés de la FAQ par situation. */

export function useSituations() {
  return useQuery({ queryKey: [...CLE_SITUATIONS, "liste"], queryFn: listerSituations });
}

export function libelleSituation(cle: string | null, situations: Situation[] | undefined): string {
  if (!cle) return "";
  return situations?.find((s) => s.cle === cle)?.libelle ?? cle;
}

export function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
