import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { demarrerAvecHandle } from "./warmupApi";

/**
 * Prompt 25 MAJ, point 7b : « Start warmup » demande d'abord le @ exact (pré-rempli
 * avec celui de l'OS). L'OS le lit tout de suite sur TikTok : « ✓ Account found »
 * (le @ est mis à jour s'il diffère) et le warm-up démarre ; introuvable : « We
 * can't find this account, check the spelling » et le warm-up ne démarre pas.
 */
export function StartWarmupHandle({ compteId, handle, onFerme }: { compteId: string; handle: string | null; onFerme: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saisie, setSaisie] = React.useState(handle ?? "");
  const demarrer = useMutation({
    mutationFn: () => demarrerAvecHandle(compteId, saisie),
    onSuccess: (r) => {
      if (r.issue === "trouve" || r.issue === "illisible") void qc.invalidateQueries({ queryKey: ["mes-comptes"] });
    },
  });
  const r = demarrer.data;
  const ok = r?.issue === "trouve" || r?.issue === "illisible";
  return (
    <div className="w-full space-y-1.5" data-testid="start-warmup-handle">
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (saisie.trim()) demarrer.mutate();
        }}
      >
        <label className="text-sm" htmlFor="start-warmup-handle">{t("warmup.handleQuestion")}</label>
        <span className="text-sm text-muted-foreground">@</span>
        <input
          id="start-warmup-handle"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="your.exact.handle"
          className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          disabled={ok}
        />
        {!ok && (
          <>
            <Button type="submit" size="sm" loading={demarrer.isPending} disabled={!saisie.trim()}>
              {t("warmup.start")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onFerme}>
              {t("common.cancel")}
            </Button>
          </>
        )}
      </form>
      {r && (
        <p className={ok ? "text-sm text-success" : "text-sm text-warning"} role="status">
          {r.issue === "trouve" && t("warmup.handleTrouve", { handle: r.handle })}
          {r.issue === "illisible" && t("warmup.handleIllisible", { handle: r.handle })}
          {r.issue === "introuvable" && t("warmup.handleIntrouvable", { handle: r.handle })}
          {r.issue === "invalide" && t("warmup.handleInvalide")}
        </p>
      )}
      {demarrer.isError && <p className="text-sm text-destructive">{(demarrer.error as Error).message}</p>}
    </div>
  );
}
