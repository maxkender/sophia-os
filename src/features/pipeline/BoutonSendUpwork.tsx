import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { envoyerSurUpwork } from "./api";

/**
 * « Send on Upwork » : le même texte, dans la conversation du contrat Upwork
 * du posteur (une confirmation d'abord). Noté comme relance (canal upwork).
 */
export function BoutonSendUpwork({ posterId, nom, texte, type }: { posterId: string; nom: string | null; texte: string; type?: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const envoi = useMutation({
    mutationFn: () => envoyerSurUpwork(posterId, texte, type),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nudges"] }),
  });
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={envoi.isPending || envoi.isSuccess || !texte.trim()}
        onClick={() => window.confirm(t("pipeline.upwork.confirm", { nom: nom ?? "—" })) && envoi.mutate()}
      >
        {t("pipeline.upwork.envoyer")}
      </Button>
      {envoi.isSuccess && <span className="text-xs text-success-foreground">{t("pipeline.upwork.ok")}</span>}
      {envoi.error && <span className="text-xs text-destructive">{(envoi.error as Error).message}</span>}
    </span>
  );
}
