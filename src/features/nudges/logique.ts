import type { NudgeEnvoye } from "./api";

/** L'état d'un nudge envoyé : résolu, répondu, relancé sur Upwork, ou sans réponse. */
export function etatNudge(n: Pick<NudgeEnvoye, "reponse_at" | "resolu_at" | "upwork_relance_at">) {
  if (n.resolu_at) return "resolu" as const;
  if (n.reponse_at) return "repondu" as const;
  if (n.upwork_relance_at) return "upwork" as const;
  return "sans_reponse" as const;
}
