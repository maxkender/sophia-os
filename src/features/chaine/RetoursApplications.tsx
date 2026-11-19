import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { messageErreur } from "@/features/bleo/format";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { cleRetoursApplications, listerRetoursApplications } from "./api";
import { groupesRetours, MAX_RETOURS_APPLICATION, type GroupeRetours } from "./retoursApplication";

/** Un bloc tel que le modèle le lit, avec ce qu'il contient et ce qui n'y entre plus. */
export function BlocRetours({ g, titre }: { g: GroupeRetours; titre?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5" data-testid="retours-application" data-langue={g.langue} data-application={g.applicationId}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {titre ? <span className="font-medium">{titre}</span> : null}
        <Badge variant="outline">{t("chaine.retours.n", { count: g.n })}</Badge>
        {g.horsBloc > 0 && <Badge variant="warning">{t("chaine.retours.horsBloc", { count: g.horsBloc, max: MAX_RETOURS_APPLICATION })}</Badge>}
      </div>
      <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{g.bloc}</pre>
    </div>
  );
}

/**
 * Onglet Placement : les retours des relecteurs natifs propres à
 * l'application (0751), un bloc par langue, tels que son placement les reçoit
 * à la suite de son prompt dans cette langue seulement. Le panneau d'une
 * langue montre les mêmes blocs par application (`PlacementLangue`).
 */
export function RetoursApplications({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation();
  const { applications } = useApplication();
  const retours = useQuery({
    queryKey: cleRetoursApplications({ applicationId }),
    queryFn: () => listerRetoursApplications({ applicationId }),
  });
  const groupes = React.useMemo(() => groupesRetours(retours.data ?? []), [retours.data]);
  const app = applications.find((a) => a.id === applicationId);
  const nom = app ? nomApplication(app) : t("chaine.retours.applicationInconnue");

  if (retours.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {messageErreur(retours.error)}
      </p>
    );
  }
  if (retours.isPending) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  if (groupes.length === 0) return <p className="text-xs text-muted-foreground">{t("chaine.retours.aucun")}</p>;

  return (
    <ul className="space-y-3" data-testid="retours-applications">
      {groupes.map((g) => (
        <li key={`${g.langue}:${g.applicationId}`}>
          <BlocRetours g={g} titre={t("chaine.retours.titre", { nom, drapeau: drapeauLangue(g.langue), langue: nomLangue(g.langue) })} />
        </li>
      ))}
    </ul>
  );
}
