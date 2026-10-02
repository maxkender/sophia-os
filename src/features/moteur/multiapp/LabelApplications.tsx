import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Textarea } from "@/components/ui/textarea";
import {
  definirApplicationsLabel,
  majAngleLabel,
  type ApplicationMulti,
  type LienLabelApplicationRow,
  type ReserveLabelApplication,
} from "@/features/moteur/apiMultiApp";
import { nomApplication } from "@/features/moteur/applications";
import { applicationsDuLabel, ID_SOPHIA } from "@/features/moteur/multiApp";
import { cn } from "@/lib/utils";

import { BadgeReserve } from "./BadgeReserve";
import { angleDuLien, basculerApplicationLabel, labelImplicite } from "./logique";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * Angle d'un label pour une application, enregistré à la sortie du champ.
 *
 * Un label encore implicite (aucune ligne : il sert Sophia par héritage) n'a
 * pas de lien sur lequel poser l'angle : on matérialise d'abord son ensemble
 * explicite ({Sophia}), puis on écrit l'angle.
 */
function ChampAngle({
  labelId,
  application,
  liens,
}: {
  labelId: string;
  application: ApplicationMulti;
  liens: readonly LienLabelApplicationRow[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const enBase = angleDuLien(labelId, application.id, liens);
  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const valeur = brouillon ?? enBase;

  const sauver = useMutation({
    mutationFn: async (angle: string) => {
      if (labelImplicite(labelId, liens)) {
        await definirApplicationsLabel(labelId, applicationsDuLabel(labelId, liens));
      }
      await majAngleLabel(labelId, application.id, angle);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["label-applications"] });
      setBrouillon(null);
    },
  });

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" htmlFor={`angle-${labelId}-${application.id}`}>
        {t("multiApp.labels.angle", { nom: nomApplication(application) })}
      </label>
      <Textarea
        id={`angle-${labelId}-${application.id}`}
        rows={2}
        className="text-xs"
        placeholder={t("multiApp.labels.anglePlaceholder", { nom: nomApplication(application) })}
        value={valeur}
        disabled={sauver.isPending}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={() => {
          if (brouillon === null) return;
          if (brouillon.trim() === enBase.trim()) {
            setBrouillon(null);
            return;
          }
          sauver.mutate(brouillon);
        }}
      />
      {sauver.isError && <p className="text-[11px] text-destructive">{messageErreur(sauver.error)}</p>}
    </div>
  );
}

/**
 * Applications servies par un label : une puce par application (cliquer
 * coche / décoche), la réserve de chaque application servie, et les angles.
 *
 * Un label sans ligne affiche Sophia servie (héritage) ; la première
 * modification écrit l'ensemble EXPLICITE complet, Sophia comprise. La
 * dernière application ne se retire pas : le label retomberait sur Sophia.
 */
export function LabelApplications({
  labelId,
  applications,
  liens,
  reserves,
  applicationSelectionneeId,
}: {
  labelId: string;
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

  const basculer = (applicationId: string) => {
    const r = basculerApplicationLabel(labelId, liens, applicationId);
    if (!r.ok) {
      setRefus(t("multiApp.labels.derniereApplication"));
      return;
    }
    setRefus(null);
    definir.mutate(r.applications);
  };

  const appsServies = applications.filter((a) => servies.includes(a.id));

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
              title={
                implicite && app.id === ID_SOPHIA
                  ? t("multiApp.labels.implicite")
                  : app.actif
                    ? undefined
                    : t("multiApp.labels.applicationInactive")
              }
              onClick={() => basculer(app.id)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50",
                sert
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
                selectionnee && "font-semibold",
                implicite && sert && "border-dashed",
                !app.actif && "italic",
              )}
            >
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
      {refus && <p className="text-[11px] text-destructive">{refus}</p>}
      {definir.isError && <p className="text-[11px] text-destructive">{messageErreur(definir.error)}</p>}
      <details className="text-xs">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          {t("multiApp.labels.angles", {
            n: appsServies.filter((a) => angleDuLien(labelId, a.id, liens).trim()).length,
          })}
        </summary>
        <div className="mt-1.5 space-y-2">
          {appsServies.map((app) => (
            <ChampAngle key={app.id} labelId={labelId} application={app} liens={liens} />
          ))}
        </div>
      </details>
    </div>
  );
}
