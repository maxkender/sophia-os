import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formaterDuree,
  statutWarmup,
  warmupRestantMs,
} from "@/features/moteur/warmup";

/** Badge + timer (tick 1s) pour l'état warmup d'un compte. */
export function WarmupBadge({
  startedAt,
  endsAt,
  onStart,
  startPending,
  showStart,
}: {
  startedAt: string | null;
  endsAt: string | null;
  onStart?: () => void;
  startPending?: boolean;
  /** Affiche le bouton Start warmup (HM / admin). */
  showStart?: boolean;
}) {
  const { t } = useTranslation();
  const statut = statutWarmup({ warmup_started_at: startedAt, warmup_ends_at: endsAt });
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (statut !== "en_cours") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [statut]);

  if (statut === "termine") return null;

  if (statut === "attente") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t("warmup.attente")}</Badge>
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
      {t("warmup.enCours", { temps: formaterDuree(restant) })}
    </Badge>
  );
}
