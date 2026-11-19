import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Replie } from "@/components/ui/replie";
import { messageErreur } from "@/features/bleo/format";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { clePromptPlacement, nomApplication } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import { langueCiblee } from "@/features/moteur/multiapp/logique";

import { cleRetoursApplications, listerRetoursApplications } from "./api";
import { EditeurPrompt } from "./EditeurPrompt";
import { BlocRetours } from "./RetoursApplications";
import { groupesRetours } from "./retoursApplication";

/**
 * Le placement, vu depuis une langue : pour chaque application qui sert la
 * langue, ce que son placement lit, dans l'ordre du moteur. D'abord son prompt
 * de placement (le même dans toutes les langues, éditable ici comme dans
 * l'onglet Placement), puis les retours des relecteurs natifs de CETTE langue
 * sur sa slide (0751), tels que le modèle les reçoit. Les angles par label
 * restent dans l'onglet Placement.
 *
 * Une application inactive ou hors de la langue n'est listée que si elle a
 * des retours retenus ici. Le contenu d'une application n'est monté qu'à son
 * ouverture.
 */
export function PlacementLangue({ langue }: { langue: string }) {
  const { t } = useTranslation();
  const { applications, isPending } = useApplication();
  const retours = useQuery({
    queryKey: cleRetoursApplications({ langue }),
    queryFn: () => listerRetoursApplications({ langue }),
  });
  const parApplication = React.useMemo(
    () => new Map(groupesRetours(retours.data ?? []).map((g) => [g.applicationId, g])),
    [retours.data],
  );
  const servies = applications.filter(
    (a) => (a.actif !== false && langueCiblee(a.langues ?? null, langue)) || parApplication.has(a.id),
  );
  const nomDeLangue = nomLangue(langue);

  return (
    <div className="space-y-3" data-testid="placement-langue">
      {retours.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(retours.error)}
        </p>
      )}
      {servies.length === 0 && (
        <p className="text-xs text-muted-foreground">{isPending ? t("common.loading") : t("chaine.langues.placementAppli.aucune")}</p>
      )}
      {servies.map((a) => {
        const nom = nomApplication(a);
        const g = parApplication.get(a.id);
        return (
          <div key={`${langue}:${a.id}`} data-testid="placement-appli" data-application={a.id}>
            <Replie
              paresseux
              titre={
                <span className="flex flex-wrap items-center gap-2">
                  {t("chaine.langues.placementAppli.titre", { nom })}
                  <Badge variant={g ? "info" : "outline"}>{t("chaine.langues.placementAppli.retours", { count: g?.n ?? 0, langue: nomDeLangue })}</Badge>
                </span>
              }
            >
              <div className="space-y-1">
                <p className="text-xs font-medium">{t("chaine.langues.placementAppli.promptTitre", { nom })}</p>
                <p className="text-xs text-muted-foreground">{t("chaine.langues.placementAppli.promptAide")}</p>
              </div>
              <EditeurPrompt cle={clePromptPlacement(a.slug)} rows={14} nu />
              <p className="pt-1 text-xs font-medium">{t("chaine.langues.placementAppli.retoursTitre", { langue: nomDeLangue })}</p>
              {g ? (
                <BlocRetours g={g} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("chaine.langues.placementAppli.retoursVide", { langue: nomDeLangue, nom })}</p>
              )}
            </Replie>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {t("chaine.langues.placementAppli.angles")}{" "}
        <Link to="/admin/chaine?onglet=placement" className="underline">
          {t("chaine.langues.placementAppli.lienAngles")}
        </Link>
      </p>
    </div>
  );
}
