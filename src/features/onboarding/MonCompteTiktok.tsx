import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { proposerHandle } from "./monCompteTiktokApi";

/**
 * 0444 : « My TikTok account ». Le @ attendu par l'OS, et « My account has a
 * different name » : la recrue tape son @ exact, l'OS le lit sur TikTok.
 * Trouvé : il remplace celui du compte (les dates du warm-up restent) ;
 * introuvable : « please check the spelling » ; TikTok illisible : relu dans
 * l'heure. Jamais de @ enregistré sans être trouvé.
 */
export function MonCompteTiktok({ compteId, handle }: { compteId: string; handle: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [saisie, setSaisie] = React.useState("");
  const verifier = useMutation({
    mutationFn: () => proposerHandle(saisie, compteId),
    onSuccess: (r) => {
      if (r.ok && r.statut === "trouve") {
        setOuvert(false);
        void qc.invalidateQueries({ queryKey: ["mes-comptes"] });
      }
    },
  });
  const r = verifier.data;
  const message = !r
    ? null
    : !r.ok
      ? t(r.error === "handle_invalide" ? "monCompteTiktok.invalide" : "monCompteTiktok.erreur")
      : r.statut === "illisible"
        ? t("monCompteTiktok.plusTard", { handle: r.handle })
        : r.message ?? null;
  return (
    <div className="space-y-1.5" data-testid="mon-compte-tiktok">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("monCompteTiktok.titre")}</p>
      <p className="text-sm">
        {t("monCompteTiktok.attendu")} <span className="font-semibold">@{handle ?? "—"}</span>
      </p>
      {ouvert ? (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (saisie.trim()) verifier.mutate();
          }}
        >
          <span className="text-sm text-muted-foreground">@</span>
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={handle ?? "your.exact.handle"}
            aria-label={t("monCompteTiktok.saisie")}
            className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button type="submit" size="sm" loading={verifier.isPending} disabled={!saisie.trim()}>
            {t("monCompteTiktok.verifier")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
            {t("common.cancel")}
          </Button>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSaisie("");
            verifier.reset();
            setOuvert(true);
          }}
        >
          {t("monCompteTiktok.autreNom")}
        </Button>
      )}
      {message && (
        <p className={r?.ok && r.statut === "trouve" ? "text-sm text-success" : "text-sm text-warning"} role="status">
          {message}
        </p>
      )}
      {verifier.error && <p className="text-sm text-destructive">{(verifier.error as Error).message}</p>}
    </div>
  );
}
