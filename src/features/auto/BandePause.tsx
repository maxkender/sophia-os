import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OctagonX } from "lucide-react";

import { CLE_PAUSE } from "./clesPause";
import { lireEtatPause } from "./pauseApi";

/** Prompt 22 : la bande rouge en haut de toutes les pages admin quand la pause est active. */
export function BandePause() {
  const { t, i18n } = useTranslation();
  const etat = useQuery({ queryKey: CLE_PAUSE, queryFn: lireEtatPause, refetchInterval: 60_000 });
  if (etat.data?.actif !== true) return null;
  const depuis = etat.data.depuis
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(etat.data.depuis))
    : "—";
  return (
    <div role="alert" data-testid="bande-pause" className="mb-4 flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground">
      <OctagonX className="size-4 shrink-0" />
      {t("auto.pause.bande", { depuis, par: etat.data.par_nom ?? "—" })}
    </div>
  );
}
