/** Rôles applicatifs (table `user_roles`). */
export type Role =
  | "admin"
  | "poster"
  | "hiring_manager"
  | "directing_manager"
  | "chief_of_staff";

/**
 * HM, DM et COS : même espace recrutement, mêmes créateurs.
 *
 * Le COS est un HM qui a été élargi : il garde ses créateurs et son espace
 * recrutement, et gagne en plus la coquille admin restreinte (voir pagesCos).
 */
export function estRoleManager(role: string | null | undefined): boolean {
  return (
    role === "hiring_manager" ||
    role === "directing_manager" ||
    role === "chief_of_staff"
  );
}

/** Badge court : COS / DM / HM. */
export function badgeManager(
  role: string | null | undefined,
): "COS" | "DM" | "HM" | null {
  if (role === "chief_of_staff") return "COS";
  if (role === "directing_manager") return "DM";
  if (role === "hiring_manager") return "HM";
  return null;
}
