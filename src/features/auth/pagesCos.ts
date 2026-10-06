/**
 * L'espace du Chief of Staff : la coquille de l'admin, restreinte à ses pages.
 *
 * SOURCE DE VÉRITÉ UNIQUE, lue à la fois par le routeur et par la barre de
 * navigation. Les deux doivent dire la même chose : un menu qui cache une page
 * que la route laisse passer n'est pas une restriction, c'est un mensonge
 * d'interface, et c'est exactement ce qui arrive quand la liste est recopiée à
 * deux endroits. Un test vérifie que le routeur lit bien cette liste.
 *
 * ATTENTION, CE N'EST PAS UNE FRONTIÈRE DE SÉCURITÉ. Le COS a les mêmes droits
 * de données que l'admin en base (`is_admin()` le reconnaît, voir la migration
 * 0260) : il peut donc lire et écrire via l'API ce que ces pages ne lui
 * montrent pas. La restriction est volontairement cosmétique, c'est le choix
 * qui a été fait. Pour en faire une vraie frontière il faudrait des policies
 * RLS distinctes table par table.
 *
 * À NE PAS CONFONDRE avec le directing manager, qui est un autre rôle, plus
 * ancien, et qui n'a RIEN de tout ceci : il garde son seul espace recrutement.
 */

/** Les pages de l'espace admin ouvertes au Chief of Staff. */
export const ROUTES_COS: readonly string[] = [
  "/admin/calendrier", // Schedule
  "/admin/posters", // Posters
  "/admin/surveillance", // Account watch
  "/admin/reviews", // Reviews
  "/admin/file-reviews", // Today's queue
  "/admin/parrainages", // Referrals
  "/admin/documents", // Documents, en écriture
  "/admin/assistant", // Assistant
  // Sans ces deux-là, Schedule et Account watch sont des culs-de-sac : elles
  // renvoient toutes les deux vers la fiche d'un créateur, qui renvoie vers le
  // détail d'un post.
  "/admin/createurs/:compteId",
  "/admin/posts/:id",
];

/** Où atterrit un COS : sa première page, pas le pilotage qui lui est fermé. */
export const ACCUEIL_COS = "/admin/calendrier";

/** Une entrée de menu est-elle visible pour un COS ? */
export function cosVoitLien(to: string): boolean {
  return ROUTES_COS.includes(to);
}
