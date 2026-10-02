import { useTranslation } from "react-i18next";

import { classeReserve, formaterReserve, niveauReserve } from "@/features/moteur/labelReserve";
import { cn } from "@/lib/utils";

/** Ce que le badge lit : une ligne de `label_reserve` ou de `label_application_reserve`. */
export interface MesureReserve {
  passages_restants: number;
  demande_jour: number;
  comptes: number;
  reserve_jours: number | null;
}

/**
 * Réserve du label, en jours, à même hauteur que son nom.
 *
 * C'est un PLANCHER : le stock se recharge à chaque requalification et à chaque
 * import, donc « 5 j » ne veut pas dire « mort dans 5 jours », mais « plus rien
 * en réserve si personne ne source ». Le titre au survol le dit, parce qu'un
 * chiffre nu dans un badge rouge se lit comme une prédiction.
 *
 * Silencieux quand la vue ne rend rien pour ce label : pas de badge plutôt
 * qu'un « ? » qui ferait douter de tous les autres.
 *
 * Multi-app : `application` préfixe le badge du nom de l'application (une
 * réserve par application servie) ; `attenue` grise celles qui ne sont pas
 * l'application du sélecteur, pour que l'œil tombe d'abord sur celle qu'on
 * pilote. Les passages restants sont PARTAGÉS (tierlist commune) : les
 * réserves de deux applications sur un même label se recouvrent.
 */
export function BadgeReserve({
  reserve,
  application,
  attenue,
}: {
  reserve?: MesureReserve;
  application?: string;
  attenue?: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (!reserve) return null;
  const niveau = niveauReserve(reserve.reserve_jours);
  const prefixe = application ? `${application} · ` : "";
  if (niveau === "inconnu") {
    return (
      <span
        className={cn(
          "rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground",
          attenue && "opacity-60",
        )}
        title={t("labels.reserveSansCompte")}
      >
        {prefixe}
        {t("labels.reserveAucunCompte")}
      </span>
    );
  }
  const jours = formaterReserve(reserve.reserve_jours, i18n.language);
  return (
    <span
      className={cn(
        "rounded border px-1 text-[10px] font-medium",
        classeReserve(niveau),
        attenue ? "opacity-60" : application && "ring-1 ring-current/40",
      )}
      title={t("labels.reserveAide", {
        restants: reserve.passages_restants,
        demande: reserve.demande_jour,
        comptes: reserve.comptes,
      })}
    >
      {prefixe}
      {t("labels.reserveJours", { jours })}
    </span>
  );
}
