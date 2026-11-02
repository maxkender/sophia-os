import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { tonPerf, tonVsLabel, type PerfSource } from "./perfSource";

const COULEUR = {
  bon: "text-emerald-700 dark:text-emerald-400",
  moyen: "text-foreground",
  faible: "text-amber-700 dark:text-amber-400",
  incertain: "text-muted-foreground",
  aucun: "text-muted-foreground",
} as const;

/**
 * Le r d'une source. `compact` (liste de mise à jour) : « r 1,15 » sur une
 * ligne ; sinon (tableau) le r et, dessous, le nombre de posts qui le portent.
 */
export function RSource({ perf, compact = false }: { perf: PerfSource | undefined; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const ton = tonPerf(perf);
  const r =
    perf?.r != null ? perf.r.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const bulle =
    perf && r
      ? t("sources.perfBulle", { r, count: perf.posts, vues: (perf.vuesMediane ?? 0).toLocaleString(i18n.language) })
      : t("sources.perfAucun");

  if (compact) {
    return (
      <span className={cn("text-xs tabular-nums", COULEUR[ton], ton !== "aucun" && ton !== "incertain" && "font-medium")} title={bulle}>
        {r ? `r ${r}` : "r —"}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={bulle}>
      <span className={cn("tabular-nums", COULEUR[ton], (ton === "bon" || ton === "faible") && "font-semibold")}>{r ?? "—"}</span>
      <span className="text-[11px] text-muted-foreground">
        {perf && perf.posts > 0 ? t("sources.perfPosts", { count: perf.posts }) : t("sources.perfAucunCourt")}
      </span>
    </span>
  );
}

/**
 * La source face à son label : « ×1,19 » (r de la source ÷ r de tous les
 * slideshows de son label), et dessous le label et son r. `compact` : une ligne.
 */
export function RVsLabel({ perf, compact = false }: { perf: PerfSource | undefined; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const ton = tonVsLabel(perf);
  const fmt = (n: number) => n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rapport = perf?.rVsLabel != null ? `×${fmt(perf.rVsLabel)}` : null;
  const bulle =
    perf && rapport && perf.rLabel != null && perf.r != null
      ? t("sources.vsLabelBulle", {
          rapport,
          r: fmt(perf.r),
          label: perf.labelNom ?? "",
          rLabel: fmt(perf.rLabel),
          count: perf.postsLabel ?? 0,
        })
      : t("sources.vsLabelAucun");

  if (compact) {
    return (
      <span className={cn("text-xs tabular-nums", COULEUR[ton], ton !== "aucun" && ton !== "incertain" && "font-medium")} title={bulle}>
        {rapport ? t("sources.vsLabelCourt", { rapport }) : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={bulle}>
      <span className={cn("tabular-nums", COULEUR[ton], (ton === "bon" || ton === "faible") && "font-semibold")}>{rapport ?? "—"}</span>
      {perf?.labelNom && (
        <span className="max-w-[9rem] truncate text-[11px] text-muted-foreground">
          {perf.rLabel != null ? t("sources.vsLabelSous", { label: perf.labelNom, r: fmt(perf.rLabel) }) : perf.labelNom}
        </span>
      )}
    </span>
  );
}
