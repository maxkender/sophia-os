import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { majStatutSuggestion } from "./api";
import { kindEstMessage } from "./phases";
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
          <p className="text-sm font-medium leading-snug">{s.titre}</p>
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
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
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

export function suggestionsVisibles(
  suggestions: RecrutementSuggestion[],
  opts: { paysFiltre?: string; variante?: "toutes" | "messages" | "actions" } = {},
): RecrutementSuggestion[] {
  return suggestions.filter((s) => {
    if (s.statut === "executee" || s.statut === "ignoree") return false;
    if (opts.paysFiltre && s.pays && s.pays !== opts.paysFiltre) return false;
    if (opts.variante === "messages") return kindEstMessage(s.kind);
    if (opts.variante === "actions") return s.kind === "action";
    return true;
  });
}

export function InboxSuggestions({
  suggestions,
  hms,
  paysFiltre,
  compact = false,
  variante = "toutes",
  alwaysShow = false,
}: {
  suggestions: RecrutementSuggestion[];
  hms: RecrutementHm[];
  paysFiltre?: string;
  compact?: boolean;
  variante?: "toutes" | "messages" | "actions";
  alwaysShow?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const visibles = suggestionsVisibles(suggestions, { paysFiltre, variante });

  const mut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: "validee" | "ignoree" | "a_reproposer" }) =>
      majStatutSuggestion(id, statut),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });

  if (visibles.length === 0 && !alwaysShow) return null;

  const onStatut = (id: string, statut: "validee" | "ignoree" | "a_reproposer") =>
    mut.mutate({ id, statut });

  const titre =
    variante === "messages"
      ? t("recrutements.messagesProposes")
      : variante === "actions"
        ? t("recrutements.actionsProposees")
        : compact
          ? t("recrutements.inboxCarte")
          : t("recrutements.inboxTitre");
  const vide =
    variante === "actions" ? t("recrutements.videActions") : t("recrutements.videMessages");

  if (compact) {
    return (
      <div className="space-y-3 rounded-xl border border-violet-200/70 bg-violet-50/40 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-violet-800/80">
          {titre}
          <span className="ms-1.5 tabular-nums text-violet-700/70">{visibles.length}</span>
        </p>
        {visibles.length === 0 ? (
          <p className="text-xs leading-snug text-muted-foreground">{vide}</p>
        ) : (
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
        )}
      </div>
    );
  }

  return (
    <Card className="border-violet-200/60 bg-violet-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between text-base">
          <span>{titre}</span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{visibles.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vide}</p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
