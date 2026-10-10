/**
 * Repli « label le moins utilisé » de manage-users : ne garder que les labels
 * qui servent VRAIMENT l'application du compte créé.
 *
 * `labels.application_id` ne le dit pas : un label créé depuis l'OS y reçoit
 * Sophia par défaut, même quand `label_applications` ne lui donne ensuite
 * qu'Unswipe. Sans ce filtre, un label « Unswipe seul » tout neuf (0 compte,
 * donc le moins utilisé) partait chez TOUTES les recrues Sophia dont la file
 * de langue est vide. La vérité est `label_applications`, avec la règle
 * d'héritage de `multi_app.ts` : un label sans aucune ligne sert Sophia.
 *
 * Seul le repli est filtré sur `label_applications`. La File des créateurs
 * n'est filtrée que par la colonne historique `labels.application_id`
 * (`idsLabelsFileSlideshow` de manage-users) : un label créé dans l'OS y a
 * Sophia par défaut et passe, même « Unswipe seul » — la File reste le choix
 * explicite de l'admin et ce label est donné au compte suivant. Un label dont
 * la colonne historique désigne une autre application est, lui, sauté et
 * retiré de la File.
 *
 * Module à part, importé par manage-users seul : le toucher ne redéploie
 * aucune autre fonction.
 */
import { applicationsDuLabel, ID_SOPHIA, type LienLabelApplication } from "./multi_app.ts";

/** Labels de `labelIds` qui servent `applicationId` (Sophia par défaut). Ordre conservé. */
export function labelsServantApplication(
  labelIds: readonly string[],
  liens: readonly LienLabelApplication[],
  applicationId?: string | null,
): string[] {
  const app = applicationId || ID_SOPHIA;
  return labelIds.filter((id) => applicationsDuLabel(id, liens).includes(app));
}

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

/**
 * Filtre un pool de repli sur `label_applications`. Une lecture ratée LÈVE :
 * repartir sans le filtre redonnerait le label d'une autre application, en
 * silence ; une création qui échoue se voit et se relance.
 */
export async function filtrerPoolParApplication(
  supabase: Supabase,
  pool: readonly string[],
  applicationId?: string | null,
): Promise<string[]> {
  const ids = [...new Set(pool.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("label_applications")
    .select("label_id, application_id")
    .in("label_id", ids);
  if (error) throw new Error(`Applications des labels : ${error.message}`);
  return labelsServantApplication(ids, data ?? [], applicationId);
}
