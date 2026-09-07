import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { InboxSuggestions } from "@/features/recrutements/InboxSuggestions";
import { PASTEL_PAYS } from "@/features/recrutements/constantes";
import { hmConcernePays, phasesHmPourPays } from "@/features/recrutements/phases";
import { useRecrutements } from "@/features/recrutements/useRecrutements";
import { drapeauLangue, nomPays, PAYS_OS } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

export function AdminRecrutementsPage() {
  const { t, i18n } = useTranslation();
  const { hms, createurs, suggestions, run, isPending, error } = useRecrutements();

  const cartes = PAYS_OS.map((pays) => {
    const hmsPays = hms.filter((h) => hmConcernePays(h, pays));
    let phase0 = 0;
    let phase1 = 0;
    let phase2 = 0;
    for (const hm of hmsPays) {
      const cre = createurs.filter((c) => c.hm_id === hm.id && c.pays === pays);
      const phases = phasesHmPourPays(hm, cre, pays);
      if (phases.includes(0)) phase0 += 1;
      if (phases.includes(1)) phase1 += 1;
      if (phases.includes(2)) phase2 += 1;
    }
    const nCreateurs = createurs.filter((c) => c.pays === pays).length;
    return { pays, nHms: hmsPays.length, phase0, phase1, phase2, nCreateurs };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">{t("recrutements.title")}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">{t("recrutements.subtitle")}</p>
        </div>
        {run?.finished_at && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("recrutements.dernierRun", {
              date: new Date(run.finished_at).toLocaleString(i18n.language, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Europe/Paris",
              }),
            })}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="error">
          <AlertTitle>{t("recrutements.erreurCharge")}</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <InboxSuggestions suggestions={suggestions} hms={hms} createurs={createurs} />

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t("common.loading")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cartes.map((c) => (
            <Link
              key={c.pays}
              to={`/admin/recrutements/${c.pays}`}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border border-black/5 p-4 shadow-xs/5 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-sm",
                PASTEL_PAYS[c.pays] ?? "bg-muted/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none">{drapeauLangue(c.pays)}</span>
                  <p className="font-medium leading-tight">{nomPays(c.pays)}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("recrutements.resumePays", { hms: c.nHms, createurs: c.nCreateurs })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="gap-1 bg-white/60 font-normal">
                  {t("recrutements.pill0")}
                  <span className="tabular-nums font-medium">{c.phase0}</span>
                </Badge>
                <Badge variant="outline" className="gap-1 bg-white/60 font-normal">
                  {t("recrutements.pill1")}
                  <span className="tabular-nums font-medium">{c.phase1}</span>
                </Badge>
                <Badge variant="outline" className="gap-1 bg-white/60 font-normal">
                  {t("recrutements.pill2")}
                  <span className="tabular-nums font-medium">{c.phase2}</span>
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
