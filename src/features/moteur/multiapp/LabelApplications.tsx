import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  definirApplicationsLabel,
  definirSeuilPertinenceLabel,
  type ApplicationMulti,
  type LienLabelApplicationRow,
  type ReserveLabelApplication,
} from "@/features/moteur/apiMultiApp";
import { LogoApplication } from "@/components/brand/LogoApplication";
import { nomApplication } from "@/features/moteur/applications";
import { applicationsDuLabel, ID_SOPHIA } from "@/features/moteur/multiApp";
import { cn } from "@/lib/utils";

import { BadgeReserve } from "./BadgeReserve";
import { basculerApplicationLabel, labelImplicite } from "./logique";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * Applications servies par un label : une puce par application (cliquer
 * coche / décoche) et la réserve de chaque application servie. Les angles de
 * placement d'une paire (page Angles de placement, table `angles_placement`)
 * ne dépendent pas de cette ligne : décocher une application les garde.
 *
 * Sans aucune application cochée, le label n'est disponible pour personne
 * (21/10) : décocher la dernière demande confirmation. Pour chaque application
 * cochée autre que Sophia, le seuil de pertinence à l'import (0330).
 */
export function LabelApplications({
  labelId,
  labelNom,
  applications,
  liens,
  reserves,
  applicationSelectionneeId,
}: {
  labelId: string;
  /** Pour la confirmation avant de décocher la dernière application. */
  labelNom?: string;
  applications: readonly ApplicationMulti[];
  liens: readonly LienLabelApplicationRow[];
  reserves: Map<string, ReserveLabelApplication> | undefined;
  applicationSelectionneeId: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [refus, setRefus] = React.useState<string | null>(null);
  const servies = applicationsDuLabel(labelId, liens);
  const implicite = labelImplicite(labelId, liens);

  const definir = useMutation({
    mutationFn: (ids: string[]) => definirApplicationsLabel(labelId, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["label-applications"] });
      qc.invalidateQueries({ queryKey: ["label-application-reserve"] });
    },
  });

  const seuil = useMutation({
    mutationFn: (v: { applicationId: string; valeur: number }) =>
      definirSeuilPertinenceLabel(labelId, v.applicationId, v.valeur),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["label-applications"] }),
  });

  const basculer = (applicationId: string) => {
    const r = basculerApplicationLabel(labelId, liens, applicationId);
    if (!r.ok) {
      setRefus(t("multiApp.labels.derniereApplication"));
      return;
    }
    if (r.aucune && !window.confirm(t("multiApp.labels.confirmerAucune", { nom: labelNom ?? "" }))) return;
    setRefus(null);
    definir.mutate(r.applications);
  };

  const appsServies = applications.filter((a) => servies.includes(a.id));
  const seuilDe = (applicationId: string) =>
    liens.find((l) => l.label_id === labelId && l.application_id === applicationId)?.pertinence_min ?? 50;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {applications.map((app) => {
          const sert = servies.includes(app.id);
          const selectionnee = app.id === applicationSelectionneeId;
          return (
            <button
              key={app.id}
              type="button"
              disabled={definir.isPending}
              aria-pressed={sert}
              title={app.actif ? undefined : t("multiApp.labels.applicationInactive")}
              onClick={() => basculer(app.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px] transition-colors disabled:opacity-50",
                sert
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100",
                selectionnee && "font-semibold",
                !app.actif && "italic",
              )}
            >
              <LogoApplication slug={app.slug} taille="xs" decoratif className="rounded-full" />
              {nomApplication(app)}
            </button>
          );
        })}
        {appsServies.map((app) => (
          <BadgeReserve
            key={app.id}
            reserve={reserves?.get(app.id)}
            // Sans préfixe quand le label ne sert que l'application du
            // sélecteur : le cas Sophia seule garde exactement le badge d'avant.
            application={
              appsServies.length > 1 || app.id !== applicationSelectionneeId ? nomApplication(app) : undefined
            }
            attenue={Boolean(applicationSelectionneeId) && app.id !== applicationSelectionneeId}
          />
        ))}
      </div>
      {implicite && <p className="text-[11px] text-muted-foreground">{t("multiApp.labels.implicite")}</p>}
      {appsServies.some((a) => a.id !== ID_SOPHIA) && (
        <div className="flex flex-wrap items-center gap-2">
          {appsServies
            .filter((a) => a.id !== ID_SOPHIA)
            .map((app) => (
              <label
                key={`${app.id}-${seuilDe(app.id)}`}
                className="flex items-center gap-1 text-[10px] text-muted-foreground"
                title={t("multiApp.labels.seuilAide", { app: nomApplication(app) })}
              >
                {t("multiApp.labels.seuil", { app: nomApplication(app) })}
                <input
                  type="number"
                  min={50}
                  max={100}
                  defaultValue={seuilDe(app.id)}
                  disabled={seuil.isPending}
                  aria-label={t("multiApp.labels.seuil", { app: nomApplication(app) })}
                  className="h-5 w-12 rounded border border-input bg-background px-1 text-[10px]"
                  onBlur={(e) => {
                    const valeur = Number(e.target.value);
                    if (valeur !== seuilDe(app.id)) seuil.mutate({ applicationId: app.id, valeur });
                  }}
                />
              </label>
            ))}
        </div>
      )}
      {refus && <p className="text-[11px] text-destructive">{refus}</p>}
      {definir.isError && <p className="text-[11px] text-destructive">{messageErreur(definir.error)}</p>}
      {seuil.isError && <p className="text-[11px] text-destructive">{messageErreur(seuil.error)}</p>}
    </div>
  );
}
