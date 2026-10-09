import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { lireTiersApplicationsDernierRun } from "../apiMultiApp";
import { nomApplication } from "../applications";
import { CLE_RUN_TIERS_APPLICATIONS, resumeRunTiersApplications } from "./logique";

/**
 * Page Minuit : une ligne « Tierlist par application » pour le jour affiché,
 * lue dans `reglages.tierlist_applications_dernier_run` (0270). Ne rend RIEN
 * tant qu'il n'y a rien à dire (aucun cycle examiné, aucune alerte) — le cas
 * de toutes les nuits tant qu'aucune autre application ne tourne.
 */
export function LigneTiersApplicationsMinuit({ jour }: { jour: string }) {
  const { t } = useTranslation();
  const run = useQuery({
    queryKey: CLE_RUN_TIERS_APPLICATIONS,
    queryFn: lireTiersApplicationsDernierRun,
    retry: false,
  });
  const resume = resumeRunTiersApplications(run.data, jour);
  if (!resume) return null;
  return (
    <div className="space-y-0.5">
      <p>
        <span className="font-medium text-foreground">{t("minuit.tiersApplications.titre")}</span>{" "}
        {resume.lignes.map((l) => (
          <span
            key={l.slug}
            className={cn(
              "mr-2 whitespace-nowrap",
              (l.alerte || l.erreur) && "text-destructive",
              !l.alerte && !l.erreur && l.interrompu && "text-warning",
            )}
          >
            {t("minuit.tiersApplications.ligne", {
              app: nomApplication({ slug: l.slug }),
              examines: l.examines,
              requalifies: l.requalifies,
            })}
            {l.interrompu ? ` · ${t("minuit.tiersApplications.interrompue")}` : ""}
            {l.erreur ? ` · ${t("minuit.tiersApplications.erreur", { message: l.erreur })}` : ""}
            {l.alerte ? ` · ${l.alerte}` : ""}
          </span>
        ))}
      </p>
      {resume.illisible && (
        <p className="text-warning">{t("minuit.tiersApplications.illisible")}</p>
      )}
      {resume.erreur && (
        <p className="text-destructive">
          {t("minuit.tiersApplications.erreur", { message: resume.erreur })}
        </p>
      )}
    </div>
  );
}
