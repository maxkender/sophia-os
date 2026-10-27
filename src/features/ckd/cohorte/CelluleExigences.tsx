import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { exigencesWarmup, FOLLOWS_MIN } from "./exigences";
import type { EtatWarmup } from "./logique";

/** « Au moins 5 follows et 2 reposts » : OK seulement si les deux, sinon ce qui manque (0365). */
export function CelluleExigences({ etat, repostsAt }: { etat: Pick<EtatWarmup, "abonnements">; repostsAt: string | null | undefined }) {
  const { t } = useTranslation();
  const x = exigencesWarmup(etat, repostsAt);
  if (x.ok) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-success-foreground" data-exigences="ok">
        <Check className="size-3.5" aria-hidden />
        {t("ckd.exigences.ok")}
      </span>
    );
  }
  const manques = [
    !x.followsOk &&
      (x.follows === null
        ? t("ckd.exigences.followsInconnus", { min: FOLLOWS_MIN })
        : t("ckd.exigences.follows", { n: x.follows, min: FOLLOWS_MIN })),
    !x.repostsOk && t("ckd.exigences.reposts"),
  ].filter(Boolean);
  return (
    <span className={cn("text-xs text-warning-foreground")} data-exigences="manque">
      {manques.join(" · ")}
    </span>
  );
}
