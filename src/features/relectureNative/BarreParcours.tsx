import { useTranslation } from "react-i18next";
import { Check, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";

export type EtapeParcours = "pays" | "posts";

/**
 * La barre du parcours, collée en haut de l'écran : les trois étapes, la
 * barre d'avancement de l'étape en cours, et le rappel qu'on ne demande
 * jamais une traduction mot à mot.
 */
export function BarreParcours({
  etape,
  questionnaire,
  posts,
  postsOuverts,
  onEtape,
}: {
  etape: EtapeParcours;
  questionnaire: { fait: number; total: number; envoye: boolean };
  posts: { fait: number; total: number };
  postsOuverts: boolean;
  onEtape: (etape: EtapeParcours) => void;
}) {
  const { t } = useTranslation();
  const courant = etape === "pays" ? questionnaire : posts;
  const pct = courant.total > 0 ? Math.round((courant.fait / courant.total) * 100) : 0;
  const etapes = [
    { cle: "pays" as const, fini: questionnaire.envoye, ouverte: true },
    { cle: "posts" as const, fini: posts.total > 0 && posts.fait >= posts.total, ouverte: postsOuverts },
  ];

  return (
    <div
      className="sticky top-[4.25rem] z-20 space-y-2.5 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur"
      data-testid="barre-parcours"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {etapes.map((e, i) => (
          <li key={e.cle} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!e.ouverte}
              onClick={() => onEtape(e.cle)}
              aria-current={etape === e.cle ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 font-medium transition-colors disabled:cursor-not-allowed",
                etape === e.cle ? "bg-primary/8 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  e.fini ? "bg-success text-white" : etape === e.cle ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {e.fini ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {t(`relectureNative.parcours.etapes.${e.cle}`)}
            </button>
            <span className="h-px w-4 bg-border" aria-hidden />
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">3</span>
          {t("relectureNative.parcours.etapes.quotidien")}
          <span className="text-[11px]">· {t("relectureNative.parcours.bientot")}</span>
        </li>
      </ol>

      <div className="flex items-center gap-3">
        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t(`relectureNative.parcours.etapes.${etape}`)}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-info transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct}%</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {etape === "pays"
            ? t("relectureNative.parcours.progressionPays", { fait: courant.fait, total: courant.total })
            : t("relectureNative.parcours.progressionPosts", { fait: courant.fait, total: courant.total })}
        </span>
        <span className="flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-300">
          <PenLine className="size-3.5" aria-hidden />
          {t("relectureNative.parcours.rappel")}
        </span>
      </div>
    </div>
  );
}
