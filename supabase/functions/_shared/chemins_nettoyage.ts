/**
 * 24/11 (demande : « passe par Fal si ça marche pas sur Replicate, change de modèle ; ça sert à rien de retenter 5 fois
 * par le même chemin »). Les chemins du retrait de texte, et l'ordre dans lequel un essai les prend.
 *
 * Sur 24 h, les slides qui ratent butent surtout sur un FILTRE de sécurité (tableaux, nus, torse nu en salle) :
 * Replicate « flagged as sensitive » (E005), Fal 422 « content checker » ou image noire. Refaire le même couple
 * Replicate → Fal à chaque essai rate donc à chaque fois. Chaque essai commence maintenant par un autre chemin :
 *   essai 1 : principal → second      (réglage `nettoyage.provider_principal`, comme avant)
 *   essai 2 : second → édition IA     (Nano Banana Pro edit, autre modèle, autre filtre)
 *   essai 3 : édition IA → principal
 *   essai 4 : principal → second
 * Sans numéro d'essai (renettoyage manuel, préparation), rien ne change : principal → second.
 */
export type CheminNettoyage = "fal" | "replicate" | "nano_banana";

/** Combien de chemins un essai enchaîne (le mur Edge ~150 s n'en laisse pas passer plus de deux). */
export const CHEMINS_PAR_ESSAI = 2;

export function cheminsPourEssai(principal: "fal" | "replicate", essai?: number | null): CheminNettoyage[] {
  const second: CheminNettoyage = principal === "fal" ? "replicate" : "fal";
  if (!essai || essai < 1) return [principal, second];
  const tous: CheminNettoyage[] = [principal, second, "nano_banana"];
  const depart = (Math.floor(essai) - 1) % tous.length;
  return Array.from({ length: CHEMINS_PAR_ESSAI }, (_, i) => tous[(depart + i) % tous.length]!);
}

/** La consigne de l'édition IA : retirer le texte, ne rien changer d'autre. */
export const CONSIGNE_RETRAIT_TEXTE =
  "Remove every overlaid text element from this image: captions, subtitles, titles, stickers, emojis, usernames and watermarks. " +
  "Rebuild what was behind them so it looks untouched. Keep everything else exactly identical: same framing and crop, " +
  "same people, faces, bodies, clothing, objects, colors, lighting, grain and painting style. Do not add, remove or restyle anything else.";
