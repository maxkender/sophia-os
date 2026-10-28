import type { NudgeEnvoye } from "./api";

/** L'état d'une relance : résolue (étape faite), répondu, ou pas encore fait. */
export function etatNudge(n: Pick<NudgeEnvoye, "reponse_at" | "resolu_at">) {
  if (n.resolu_at) return "resolu" as const;
  if (n.reponse_at) return "repondu" as const;
  return "sans_reponse" as const;
}
