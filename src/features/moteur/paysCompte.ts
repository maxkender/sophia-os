import { paysParDefaut } from "@/features/moteur/pays";

/**
 * Le pays doit-il être SAISI pour cette langue ?
 *
 * Non pour les 24 langues qui ne désignent qu'un marché : le trigger
 * `comptes_pays_defaut` (migration 0281) s'en charge à l'insert, et faire
 * ressaisir « suédois → Suède » n'apprendrait rien à personne.
 *
 * Oui pour `en` (Royaume-Uni, États-Unis, Australie, Nouvelle-Zélande, Irlande,
 * Canada), `ar` (Émirats, Égypte), `es-419` (toute l'Amérique latine) et `ru`
 * (Kazakhstan, Ukraine, Biélorussie). Là, personne ne peut deviner à la place
 * du HM, et un compte sans pays n'apparaît dans AUCUNE ligne de la table de
 * recrutement : il manque sans que le chiffre ait l'air faux. C'est arrivé
 * quatre fois en deux jours, d'où ce champ.
 */
export function paysRequis(langue: string): boolean {
  return Boolean(langue) && paysParDefaut(langue) === null;
}

/**
 * Pays à envoyer à la création. `undefined` quand la langue suffit : on laisse
 * alors le trigger trancher, plutôt que d'avoir deux sources de vérité qui
 * peuvent diverger.
 */
export function paysAEnvoyer(langue: string, choisi: string): string | undefined {
  if (!paysRequis(langue)) return undefined;
  return choisi || undefined;
}
