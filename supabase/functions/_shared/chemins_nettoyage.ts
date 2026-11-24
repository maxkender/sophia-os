/**
 * 24/11 (demandes : « passe par Fal si ça marche pas sur Replicate, change de modèle ; ça sert à rien de retenter 5 fois
 * par le même chemin » ; puis, après le test sur 20 slides, « l'effaceur est nul, laisse-le en dernier recours »).
 * Les chemins du retrait de texte, et l'ordre dans lequel un essai les prend.
 *
 * Sur 24 h, les slides qui ratent butent surtout sur un FILTRE de sécurité (tableaux, nus, torse nu en salle) :
 * Replicate « flagged as sensitive » (E005), Fal 422 « content checker » ou image noire. Les essais alternent donc le
 * moteur qui passe en premier, et l'effaceur ne sert qu'au DERNIER essai :
 *   essai 1 : principal → second      (réglage `nettoyage.provider_principal`, comme avant)
 *   essai 2 : second → principal
 *   essai 3 : principal → second
 *   essai 4 : effaceur                (dernier recours : Gemini Flash repère les rectangles de texte, LaMa les efface ;
 *                                      ~0,0004 $, sans modération, mais il laisse une tache floue dès que le texte
 *                                      passe sur quelqu'un ou sur un objet ; test du 24/11 : 4 slides sur 20 aussi
 *                                      bonnes que Replicate)
 * Sans numéro d'essai (renettoyage manuel, préparation), rien ne change : principal → second.
 */
import { MAX_TENTATIVES_NETTOYAGE } from "./nettoyage_file.ts";

export type CheminNettoyage = "fal" | "replicate" | "effaceur";

/** Combien de chemins un essai enchaîne (le mur Edge ~150 s n'en laisse pas passer plus de deux). */
export const CHEMINS_PAR_ESSAI = 2;

export function cheminsPourEssai(
  principal: "fal" | "replicate",
  essai?: number | null,
  dernier = MAX_TENTATIVES_NETTOYAGE,
): CheminNettoyage[] {
  const second: CheminNettoyage = principal === "fal" ? "replicate" : "fal";
  if (!essai || essai < 1) return [principal, second];
  if (Math.floor(essai) >= dernier) return ["effaceur"];
  return Math.floor(essai) % 2 === 1 ? [principal, second] : [second, principal];
}
