/**
 * Requête react-query de la liste des applications, partagée par le contexte
 * (sélecteur de la barre latérale) et la carte Pilotage → Applications : même
 * clé, donc un interrupteur basculé dans Pilotage se voit aussitôt partout, sans
 * recharger la page.
 *
 * Clé `["applications", "multi", <utilisateur>]` et pas `["applications"]` tout
 * court : Posters et l'espace recruteur lisent déjà `["applications"]` avec
 * `listerApplications` (sans `langues` ni `actif`). Deux fonctions sous une même
 * clé se remplacent l'une l'autre au gré des rafraîchissements, et l'interrupteur
 * d'Unswipe s'afficherait « actif » après un passage sur Posters. Le préfixe
 * reste `["applications"]` : invalider cette clé rafraîchit aussi celle-ci.
 *
 * L'utilisateur fait partie de la clé : la RLS ne rend rien à un visiteur non
 * connecté, et sans elle la liste resterait vide après la connexion.
 */
import { listerApplicationsMulti } from "../apiMultiApp";

export function cleRequeteApplications(userId: string | null | undefined) {
  return ["applications", "multi", userId ?? "anonyme"] as const;
}

export function optionsRequeteApplications(userId: string | null | undefined) {
  return {
    queryKey: cleRequeteApplications(userId),
    queryFn: listerApplicationsMulti,
    enabled: Boolean(userId),
    staleTime: 60_000,
  };
}
