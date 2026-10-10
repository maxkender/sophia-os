/** HM, DM et HO : mêmes droits recrutement de base. */
export function estRoleManager(role: string | null | undefined): boolean {
  return (
    role === "hiring_manager" ||
    role === "directing_manager" ||
    role === "head_of_ops"
  );
}

/**
 * À qui rattacher un recruteur qu'on vient de créer. `undefined` = ne pas
 * toucher au champ (l'admin ne rattache à personne, comme avant).
 *
 * LE CAS QUI COMPTE est le HM qui crée un HM : on le rattache au DM DU
 * CRÉATEUR, pas au créateur. Un HM sous un HM n'existe pas dans l'arbre
 * d'équipe — `equipesParDm` et `hmsSansDm` ne regardent que DM → HM — donc le
 * nouveau serait invisible de la page Posters, exactement le trou qui avait
 * fait disparaître le Head of Ops et ses 27 créateurs. Rattaché au même DM, il
 * devient le frère de son créateur et reste sous la même supervision.
 */
export function rattachementNouvelHm(
  roleCreateur: string,
  idCreateur: string,
  managerDuCreateur: string | null,
): string | null | undefined {
  if (idCreateur === "cron") return undefined;
  if (roleCreateur === "directing_manager") return idCreateur;
  if (roleCreateur === "hiring_manager" || roleCreateur === "head_of_ops") {
    return managerDuCreateur;
  }
  return undefined;
}

/**
 * Le rôle qu'on crée réellement, à partir du rôle demandé par l'appelant.
 *
 * C'EST LE PLAFOND DE SÉCURITÉ. Tout ce qui n'est pas un `hiring_manager`
 * demandé par quelqu'un qui a le droit d'en créer retombe sur `poster`.
 * Personne ne se fabrique un admin, un directing_manager ou un head_of_ops par
 * ce chemin, quoi qu'il envoie dans le corps de la requête.
 *
 * Le repli silencieux vers `poster` est volontaire et ancien : un front périmé
 * qui demanderait un rôle inconnu crée un créateur, il ne reçoit pas d'erreur.
 */
export function roleACreer(
  roleDemande: unknown,
  roleCreateur: string,
): "hiring_manager" | "poster" {
  const peutCreerHm = roleCreateur === "admin" || estRoleManager(roleCreateur);
  return roleDemande === "hiring_manager" && peutCreerHm ? "hiring_manager" : "poster";
}
