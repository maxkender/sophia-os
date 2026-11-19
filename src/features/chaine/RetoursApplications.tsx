import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { messageErreur } from "@/features/bleo/format";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { listerRetoursApplications } from "./api";
import { groupesRetours, MAX_RETOURS_APPLICATION } from "./retoursApplication";

/**
 * Les retours des relecteurs natifs propres à une application (0751), tels que
 * le placement les reçoit : un bloc par langue et par application, à la suite
 * du prompt de placement de cette application dans cette langue seulement.
 * Avec `langue` : un bloc par application (onglet Langues). Avec
 * `applicationId` : un bloc par langue (onglet Placement).
 *
 * La clé de requête commence par « corrections-natives » : retenir, écarter
 * ou ranger une correction relit les blocs.
 */
export function RetoursApplications({ langue, applicationId }: { langue?: string; applicationId?: string }) {
  const { t } = useTranslation();
  const { applications } = useApplication();
  const retours = useQuery({
    queryKey: ["corrections-natives", "retours-applications", langue?.toLowerCase() ?? null, applicationId ?? null],
    queryFn: () => listerRetoursApplications({ langue, applicationId }),
  });
  const groupes = React.useMemo(() => groupesRetours(retours.data ?? []), [retours.data]);
  const nomAppli = (id: string) => {
    const app = applications.find((a) => a.id === id);
    return app ? nomApplication(app) : t("chaine.retours.applicationInconnue");
  };

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
        <li key={`${g.langue}:${g.applicationId}`} className="space-y-1.5" data-testid="retours-application" data-langue={g.langue} data-application={g.applicationId}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">
              {t("chaine.retours.titre", { nom: nomAppli(g.applicationId), drapeau: drapeauLangue(g.langue), langue: nomLangue(g.langue) })}
            </span>
            <Badge variant="outline">{t("chaine.retours.n", { count: g.n })}</Badge>
            {g.horsBloc > 0 && <Badge variant="warning">{t("chaine.retours.horsBloc", { count: g.horsBloc, max: MAX_RETOURS_APPLICATION })}</Badge>}
          </div>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{g.bloc}</pre>
        </li>
      ))}
    </ul>
  );
}
