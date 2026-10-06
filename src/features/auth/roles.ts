/** Rôles applicatifs (table `user_roles`). */
export type Role =
  | "admin"
  | "poster"
  | "hiring_manager"
  | "directing_manager"
  | "head_of_ops";

/**
 * HM, DM et HO : même espace recrutement, mêmes créateurs.
 *
 * Le Head of Ops est un HM qui a été élargi : il garde ses créateurs et son espace
 * recrutement, et gagne en plus la coquille admin restreinte (voir pagesHeadOfOps).
 */
export function estRoleManager(role: string | null | undefined): boolean {
  return (
    role === "hiring_manager" ||
    role === "directing_manager" ||
    role === "head_of_ops"
  );
}

/** Badge court : HO / DM / HM. */
export function badgeManager(
  role: string | null | undefined,
): "HO" | "DM" | "HM" | null {
  if (role === "head_of_ops") return "HO";
  if (role === "directing_manager") return "DM";
  if (role === "hiring_manager") return "HM";
  return null;
}
