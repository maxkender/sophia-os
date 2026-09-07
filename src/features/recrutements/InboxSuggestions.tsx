import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { majStatutSuggestion } from "./api";
import type { RecrutementHm, RecrutementSuggestion } from "./types";

function nomHm(sug: RecrutementSuggestion, hms: RecrutementHm[]): string {
  if (!sug.hm_id) return "—";
  const hm = hms.find((h) => h.id === sug.hm_id);
  return hm?.nom_affiche ?? sug.hm_id.slice(0, 8);
}

function LigneSuggestion({
  s,
  hms,
  compact,
  pending,
  onStatut,
}: {
  s: RecrutementSuggestion;
  hms: RecrutementHm[];
  compact: boolean;
  pending: boolean;
  onStatut: (id: string, statut: "validee" | "ignoree" | "a_reproposer") => void;
}) {
  const { t } = useTranslation();
  return (
    <li className={cn(compact ? "space-y-2" : "space-y-3 rounded-xl border bg-background/80 p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{s.titre}</p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {nomHm(s, hms)}
              <span className="mx-1.5 text-border">·</span>
              {s.canal}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {t("recrutements.phaseCourt", { n: s.phase })}
          </Badge>
          <Badge variant={s.statut === "validee" ? "success" : "secondary"}>
            {t(`recrutements.statut.${s.statut}`)}
          </Badge>
        </div>
      </div>
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          compact && "line-clamp-3",
        )}
      >
        {s.corps}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {s.statut !== "validee" && s.statut !== "executee" && (
          <Button size="xs" disabled={pending} onClick={() => onStatut(s.id, "validee")}>
            <Check className="size-3" />
            {t("recrutements.valider")}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() => onStatut(s.id, "a_reproposer")}
        >
          <RotateCcw className="size-3" />
          {t("recrutements.reproposer")}
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => onStatut(s.id, "ignoree")}>
          <X className="size-3" />
          {t("recrutements.ignorer")}
        </Button>
      </div>
    </li>
  );
}

export function InboxSuggestions({
  suggestions,
  hms,
  paysFiltre,
  compact = false,
}: {
  suggestions: RecrutementSuggestion[];
  hms: RecrutementHm[];
  paysFiltre?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const visibles = suggestions.filter((s) => {
    if (s.statut === "executee" || s.statut === "ignoree") return false;
    if (paysFiltre && s.pays && s.pays !== paysFiltre) return false;
    return true;
  });

  const mut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: "validee" | "ignoree" | "a_reproposer" }) =>
      majStatutSuggestion(id, statut),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });

  if (visibles.length === 0) return null;

  const onStatut = (id: string, statut: "validee" | "ignoree" | "a_reproposer") =>
    mut.mutate({ id, statut });

  if (compact) {
    return (
      <div className="space-y-3 rounded-xl border border-violet-200/70 bg-violet-50/40 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-violet-800/80">
          {t("recrutements.inboxCarte")}
          <span className="ms-1.5 tabular-nums text-violet-700/70">{visibles.length}</span>
        </p>
        <ul className="space-y-3">
          {visibles.map((s) => (
            <LigneSuggestion
              key={s.id}
              s={s}
              hms={hms}
              compact
              pending={mut.isPending}
              onStatut={onStatut}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Card className="border-violet-200/60 bg-violet-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between text-base">
          <span>{t("recrutements.inboxTitre")}</span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{visibles.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {visibles.map((s) => (
            <LigneSuggestion
              key={s.id}
              s={s}
              hms={hms}
              compact={false}
              pending={mut.isPending}
              onStatut={onStatut}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
