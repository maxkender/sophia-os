import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { listerReplisApplications } from "@/features/moteur/apiMultiApp";
import { nomApplication } from "@/features/moteur/applications";

import { estErreurSchemaAbsent, grouperReplis, jourParisIlYa } from "./logique";

/** Une semaine : assez pour voir un label s'épuiser, assez court pour rester lisible. */
const JOURS_REPLIS = 7;

/**
 * Créneaux où la répartition demandait une autre application que Sophia et où
 * elle n'a pas pu être servie (réserve vide, deck inéligible ou en échec) : le
 * post est parti en Sophia. Regroupés par compte et par motif — c'est le label
 * à sourcer ou le prompt à revoir qu'on cherche, pas chaque créneau.
 *
 * Masquée quand il n'y a rien, et aussi tant que 0256 n'est pas passée (les
 * colonnes de repli n'existent pas encore) : ce n'est pas une panne.
 */
export function ReplisCard() {
  const { t, i18n } = useTranslation();
  const { applications } = useApplication();
  const depuis = React.useMemo(() => jourParisIlYa(JOURS_REPLIS), []);
  const replis = useQuery({
    queryKey: ["replis-applications", depuis],
    queryFn: () => listerReplisApplications(depuis),
    retry: (n, err) => n < 1 && !estErreurSchemaAbsent(err),
  });
  const groupes = React.useMemo(() => grouperReplis(replis.data ?? []), [replis.data]);

  if (replis.isError) {
    if (estErreurSchemaAbsent(replis.error)) return null;
    return (
      <p className="text-xs text-destructive">
        {t("multiApp.replis.erreur", { message: (replis.error as Error).message })}
      </p>
    );
  }
  if (groupes.length === 0) return null;

  const nomApp = (id: string) => {
    const app = applications.find((a) => a.id === id);
    return app ? nomApplication(app) : id.slice(0, 8);
  };
  const fmtJour = (jour: string) =>
    new Date(`${jour}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("multiApp.replis.titre")}</CardTitle>
        <CardDescription>{t("multiApp.replis.desc", { jours: JOURS_REPLIS })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {groupes.map((g) => (
          <div key={g.compte_id} className="rounded-md border px-2.5 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/admin/createurs/${g.compte_id}`} className="truncate font-medium hover:underline">
                {g.handle ? `@${g.handle}` : (g.persona ?? g.compte_id.slice(0, 8))}
                {g.langue ? <span className="ml-1.5 text-xs text-muted-foreground">{g.langue}</span> : null}
              </Link>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("multiApp.replis.total", { n: g.total })}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {g.motifs.map((m) => (
                <li
                  key={`${m.application_visee_id}:${m.motif ?? ""}`}
                  className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"
                >
                  <span className="text-foreground">{nomApp(m.application_visee_id)}</span>
                  <span>
                    {m.motif
                      ? t(`multiApp.replis.motifs.${m.motif}`, { defaultValue: m.motif })
                      : t("multiApp.replis.sansMotif")}
                  </span>
                  <span className="tabular-nums">×{m.n}</span>
                  {m.dernier && <span>{t("multiApp.replis.dernier", { jour: fmtJour(m.dernier) })}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
