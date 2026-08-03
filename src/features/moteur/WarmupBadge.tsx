import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formaterDuree,
  phaseCreateur,
  statutWarmup,
  warmupRestantMs,
} from "@/features/moteur/warmup";

/**
 * Badge des 3 phases créateur : compte pas créé → warmup → actif.
 * Le bouton Start est côté créateur (calendrier) ; admin peut aussi le montrer.
 */
export function WarmupBadge({
  compteId,
  startedAt,
  endsAt,
  onStart,
  startPending,
  showStart,
}: {
  /** Null / absent = phase « compte pas créé ». */
  compteId?: string | null;
  startedAt: string | null;
  endsAt: string | null;
  onStart?: () => void;
  startPending?: boolean;
  /** Affiche le bouton « Commencer le warmup » (créateur / admin). */
  showStart?: boolean;
}) {
  const { t } = useTranslation();
  const phase = phaseCreateur({
    compteId,
    warmup_started_at: startedAt,
    warmup_ends_at: endsAt,
  });
  const statut = statutWarmup({ warmup_started_at: startedAt, warmup_ends_at: endsAt });
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (phase !== "warmup" || statut !== "en_cours") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase, statut]);

  if (phase === "pas_cree") {
    return <Badge variant="outline">{t("warmup.phasePasCree")}</Badge>;
  }

  if (phase === "actif") {
    return <Badge variant="success">{t("warmup.phaseActif")}</Badge>;
  }

  // phase === "warmup"
  if (statut === "attente") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge variant="warning">{t("warmup.phaseWarmupAttente")}</Badge>
        {showStart && onStart && (
          <Button size="sm" disabled={startPending} onClick={onStart}>
            {startPending ? t("warmup.demarrage") : t("warmup.start")}
          </Button>
        )}
      </span>
    );
  }

  const restant = warmupRestantMs(endsAt);
  return (
    <Badge variant="warning" title={endsAt ? new Date(endsAt).toLocaleString() : undefined}>
      {t("warmup.phaseWarmup", { temps: formaterDuree(restant) })}
    </Badge>
  );
}
