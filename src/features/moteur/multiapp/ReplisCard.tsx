import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { EtiquetteApplication } from "@/components/brand/LogoApplication";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { listerReplisApplications } from "@/features/moteur/apiMultiApp";
import { Tableau } from "@/features/moteur/repartition/Tableau";

import { estErreurSchemaAbsent, grouperReplis, jourParisIlYa } from "./logique";
import { localeDate } from "@/locales/localeDate";

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

  const appDe = (id: string) => applications.find((a) => a.id === id);
  const fmtJour = (jour: string) =>
    new Date(`${jour}T12:00:00`).toLocaleDateString(localeDate(i18n.language), { day: "numeric", month: "short" });
  // Une ligne par compte et par motif, les comptes les plus touchés d'abord
  // (l'ordre de `grouperReplis`).
  const lignes = groupes.flatMap((g) => g.motifs.map((m, i) => ({ g, m, premier: i === 0 })));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("multiApp.replis.titre")}</CardTitle>
        <CardDescription>{t("multiApp.replis.desc", { jours: JOURS_REPLIS })}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Tableau
          lignes={lignes}
          cleLigne={({ g, m }) => `${g.compte_id}:${m.application_visee_id}:${m.motif ?? ""}`}
          colonnes={[
            {
              cle: "compte",
              titre: t("multiApp.replis.colCompte"),
              rendu: ({ g, premier }) =>
                premier ? (
                  <Link to={`/admin/createurs/${g.compte_id}`} className="font-medium hover:underline">
                    {g.handle ? `@${g.handle}` : (g.persona ?? g.compte_id.slice(0, 8))}
                    {g.langue ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{g.langue}</span> : null}
                  </Link>
                ) : null,
            },
            {
              cle: "visee",
              titre: t("multiApp.replis.colVisee"),
              rendu: ({ m }) => {
                const app = appDe(m.application_visee_id);
                return app ? (
                  <EtiquetteApplication slug={app.slug} />
                ) : (
                  <span className="font-mono text-xs">{m.application_visee_id.slice(0, 8)}</span>
                );
              },
            },
            {
              cle: "motif",
              titre: t("multiApp.replis.colMotif"),
              classe: "text-muted-foreground",
              rendu: ({ m }) =>
                m.motif ? t(`multiApp.replis.motifs.${m.motif}`, { defaultValue: m.motif }) : t("multiApp.replis.sansMotif"),
            },
            { cle: "n", titre: t("multiApp.replis.colFois"), align: "droite", rendu: ({ m }) => m.n },
            {
              cle: "dernier",
              titre: t("multiApp.replis.colDernier"),
              align: "droite",
              classe: "whitespace-nowrap text-muted-foreground",
              rendu: ({ m }) => (m.dernier ? fmtJour(m.dernier) : "—"),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
