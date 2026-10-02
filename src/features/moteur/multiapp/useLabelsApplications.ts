import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { listerReserveLabels } from "../api";
import {
  listerLiensLabels,
  listerReserveLabelsApplications,
  type LienLabelApplicationRow,
  type ReserveLabelApplication,
} from "../apiMultiApp";
import type { LabelReserve } from "../types";
import { estErreurSchemaAbsent } from "./logique";

/** Pas de seconde tentative sur un schéma absent : 0256 ne passera pas dans la seconde. */
function retrySaufSchema(n: number, err: unknown): boolean {
  return n < 1 && !estErreurSchemaAbsent(err);
}

export interface LabelsApplications {
  /** Liens label → application ; `null` tant qu'ils ne sont pas lisibles. */
  liens: LienLabelApplicationRow[] | null;
  /** Les puces d'applications sont utilisables (table `label_applications` lue). */
  multiDispo: boolean;
  /** 0256 absente : la gestion des labels retombe sur le comportement d'avant. */
  schemaAbsent: boolean;
  /** Erreur de lecture des liens qui n'est PAS un schéma absent. */
  erreurLiens: unknown;
  /** Réserve par label × application (vue 0256), indexée label → application. */
  reservesParLabel: Map<string, Map<string, ReserveLabelApplication>> | null;
  /** Repli pré-0256 : réserve `label_reserve` de l'application du sélecteur. */
  reservesHistoriques: Map<string, LabelReserve> | null;
}

/**
 * Données multi-app de la carte Labels, avec repli pré-0256.
 *
 * Les liens et la réserve par application sont des requêtes À PART de
 * `listerLabels` : si la migration n'est pas passée, la liste des labels, leur
 * création, leur genre et leur suppression doivent rester utilisables. On lit
 * alors l'ancienne vue `label_reserve` (badge de l'application du sélecteur,
 * comme avant) et on masque les puces d'applications.
 */
export function useLabelsApplications(applicationId: string | null): LabelsApplications {
  const liens = useQuery({
    queryKey: ["label-applications"],
    queryFn: listerLiensLabels,
    retry: retrySaufSchema,
  });
  const reservesMulti = useQuery({
    queryKey: ["label-application-reserve"],
    queryFn: listerReserveLabelsApplications,
    retry: retrySaufSchema,
  });
  const repliReserve = reservesMulti.isError;
  const reservesAnciennes = useQuery({
    queryKey: ["label-reserve", applicationId],
    queryFn: () => listerReserveLabels(applicationId),
    enabled: repliReserve && Boolean(applicationId),
  });

  const reservesParLabel = React.useMemo(() => {
    if (!reservesMulti.data) return null;
    const parLabel = new Map<string, Map<string, ReserveLabelApplication>>();
    for (const r of reservesMulti.data) {
      const parApp = parLabel.get(r.label_id) ?? new Map<string, ReserveLabelApplication>();
      parApp.set(r.application_id, r);
      parLabel.set(r.label_id, parApp);
    }
    return parLabel;
  }, [reservesMulti.data]);

  const reservesHistoriques = React.useMemo(
    () =>
      repliReserve && reservesAnciennes.data
        ? new Map(reservesAnciennes.data.map((r) => [r.label_id, r]))
        : null,
    [repliReserve, reservesAnciennes.data],
  );

  const schemaAbsent =
    (liens.isError && estErreurSchemaAbsent(liens.error)) ||
    (reservesMulti.isError && estErreurSchemaAbsent(reservesMulti.error));

  return {
    liens: liens.data ?? null,
    multiDispo: liens.isSuccess,
    schemaAbsent,
    erreurLiens: liens.isError && !estErreurSchemaAbsent(liens.error) ? liens.error : null,
    reservesParLabel,
    reservesHistoriques,
  };
}
