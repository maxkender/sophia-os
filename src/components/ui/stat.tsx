import type React from "react";

import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Sparkline } from "@/components/charts/Sparkline";
import { cn } from "@/lib/utils";

/**
 * Les chiffres clés d'une page, dans UNE carte découpée en cases plutôt qu'en
 * quatre cartes : on les lit comme une ligne de tableau.
 */
export function StatGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="grid grid-cols-2 gap-px bg-border/70 lg:grid-cols-4">{children}</div>
    </Card>
  );
}

/**
 * Une case : intitulé en petites capitales, la valeur, une ligne de détail,
 * et une mini-tendance si on a l'historique. `alerte` met la valeur en rouge,
 * comme la page Allocation le fait pour un stock sous 7 jours.
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  info,
  trend,
  tone = "neutre",
}: {
  label: string;
  value: React.ReactNode;
  /** Après la valeur, en plus petit (« / 24 »). */
  unit?: React.ReactNode;
  detail?: React.ReactNode;
  /** Comment le chiffre est calculé : en infobulle. */
  info?: React.ReactNode;
  trend?: ReadonlyArray<number | null>;
  tone?: "neutre" | "alerte";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
      <p className={cn(MICRO_LABEL, "flex items-start gap-1")}>
        <span>{label}</span>
        {info ? <InfoTip label={label}>{info}</InfoTip> : null}
      </p>
      <p className={cn("text-2xl font-semibold leading-tight", tone === "alerte" && "text-destructive")}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {trend ? <Sparkline values={trend} className="mt-1" /> : null}
    </div>
  );
}
