import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      const phases = phasesHmPourPays(hm, cre);
      if (phases.includes(0)) phase0 += 1;
      if (phases.includes(1)) phase1 += 1;
      if (phases.includes(2)) phase2 += 1;
    }
    return { pays, phase0, phase1, phase2, total: hmsPays.length };
  });

  return (
    <div className="space-y-6">
      <Card className="border-violet-100 bg-gradient-to-br from-violet-50/80 via-rose-50/50 to-sky-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="size-5" />
            {t("recrutements.title")}
          </CardTitle>
          <CardDescription>{t("recrutements.subtitle")}</CardDescription>
          {run?.finished_at && (
            <p className="text-xs text-muted-foreground">
              {t("recrutements.dernierRun", {
                date: new Date(run.finished_at).toLocaleString(i18n.language, {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Europe/Paris",
                }),
              })}
            </p>
          )}
        </CardHeader>
      </Card>

      {error && (
        <p className="text-sm text-destructive">
          {t("recrutements.erreurCharge")} {(error as Error).message}
        </p>
      )}

      <InboxSuggestions suggestions={suggestions} hms={hms} />

      {isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cartes.map((c) => (
            <Link
              key={c.pays}
              to={`/admin/recrutements/${c.pays}`}
              className={cn(
                "rounded-2xl border border-black/5 p-4 shadow-xs transition-colors",
                PASTEL_PAYS[c.pays] ?? "bg-muted/40",
              )}
            >
              <p className="text-4xl leading-none">{drapeauLangue(c.pays)}</p>
              <p className="mt-3 font-medium">{nomPays(c.pays)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("recrutements.compteursPays", {
                  p0: c.phase0,
                  p1: c.phase1,
                  p2: c.phase2,
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
