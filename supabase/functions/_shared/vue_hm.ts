/** Rôles qu'on peut ouvrir en « Voir la vue HM » (Lucia est Head of Ops). */
export const ROLES_VUE_HM = ["hiring_manager", "head_of_ops"];

/** `session_id` d'un JWT Supabase, décodé sans vérifier la signature. */
export function sessionDuJeton(jeton: string): string | null {
  try {
    const charge = jeton.split(".")[1];
    const valeur = JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/"))).session_id;
    return typeof valeur === "string" && /^[0-9a-f-]{36}$/i.test(valeur) ? valeur : null;
  } catch {
    return null;
  }
}
