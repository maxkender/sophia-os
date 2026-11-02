import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { proposerHandle } from "./monCompteTiktokApi";

/**
 * Étape « Create your TikTok account » : le @ donné est déjà pris ? La recrue
 * donne celui qu'elle a créé. Même circuit que la correction (handles_proposes,
 * source dashboard) : l'OS le lit sur TikTok avant de l'enregistrer.
 */
export function ChangerHandle({ compteId, onEnregistre }: { compteId: string | null; onEnregistre?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [handle, setHandle] = React.useState("");
  const envoyer = useMutation({
    mutationFn: () => proposerHandle(handle.trim().replace(/^@+/, ""), compteId),
    onSuccess: (r) => {
      if (r.ok && r.statut === "trouve") {
        setHandle("");
        void qc.invalidateQueries();
        onEnregistre?.();
      }
    },
  });
  const r = envoyer.data;
  const propre = handle.trim().replace(/^@+/, "");
  return (
    <form
      className="mt-1 space-y-1"
      data-testid="changer-handle"
      onSubmit={(e) => {
        e.preventDefault();
        if (propre) envoyer.mutate();
      }}
    >
      <p>{t("handleChange.deja")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-48" value={handle} placeholder="@" aria-label={t("handleChange.champ")} onChange={(e) => setHandle(e.target.value)} />
        <Button type="submit" size="sm" className="h-8" disabled={!propre} loading={envoyer.isPending}>
          {t("handleChange.enregistrer")}
        </Button>
      </div>
      {r?.ok && r.statut === "trouve" && <p className="text-success-foreground">{t("handleChange.ok", { handle: r.handle })}</p>}
      {r?.ok && r.statut === "introuvable" && <p className="text-destructive">{t("handleChange.introuvable", { handle: r.handle ?? propre })}</p>}
      {r?.ok && r.statut === "illisible" && <p className="text-muted-foreground">{t("handleChange.illisible")}</p>}
      {(envoyer.error || (r && !r.ok)) && <p className="text-destructive">{(envoyer.error as Error | null)?.message ?? r?.error}</p>}
    </form>
  );
}
