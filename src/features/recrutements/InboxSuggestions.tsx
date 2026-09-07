import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { majStatutSuggestion } from "./api";
import type { RecrutementHm, RecrutementSuggestion } from "./types";

function nomHm(
  sug: RecrutementSuggestion,
  hms: RecrutementHm[],
): string {
  if (!sug.hm_id) return "—";
  const hm = hms.find((h) => h.id === sug.hm_id);
  return hm?.nom_affiche ?? sug.hm_id.slice(0, 8);
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

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-violet-100/80 bg-violet-50/50 p-3"
          : "rounded-2xl border border-violet-100 bg-violet-50/70 p-4"
      }
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-violet-950">
          {compact ? t("recrutements.inboxCarte") : t("recrutements.inboxTitre")}
        </h2>
        <span className="text-xs text-violet-700">{visibles.length}</span>
      </div>
      <ul className="space-y-3">
        {visibles.map((s) => (
          <li key={s.id} className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.titre}</p>
                <p className="text-xs text-muted-foreground">
                  {nomHm(s, hms)} · {t(`recrutements.phase${s.phase}`)} · {s.canal}
                </p>
              </div>
              <Badge variant={s.statut === "validee" ? "success" : "outline"}>
                {t(`recrutements.statut.${s.statut}`)}
              </Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {s.corps}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.statut !== "validee" && s.statut !== "executee" && (
                <Button
                  size="sm"
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ id: s.id, statut: "validee" })}
                >
                  <Check className="size-3.5" />
                  {t("recrutements.valider")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={mut.isPending}
                onClick={() => mut.mutate({ id: s.id, statut: "a_reproposer" })}
              >
                <RotateCcw className="size-3.5" />
                {t("recrutements.reproposer")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mut.isPending}
                onClick={() => mut.mutate({ id: s.id, statut: "ignoree" })}
              >
                <X className="size-3.5" />
                {t("recrutements.ignorer")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
