import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { marquerNudgeLu, mesNudges } from "@/features/moteur/api";

/**
 * Nudge côté créateur : le message déposé depuis la page de surveillance
 * s'affiche à sa connexion. « Compris » le marque lu et enchaîne sur le suivant.
 * Rien à afficher → rien ne se monte (même contrat que `ReviewPopup`).
 */
export function NudgePopup() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["mes-nudges"], queryFn: mesNudges });

  const marquer = useMutation({
    mutationFn: marquerNudgeLu,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mes-nudges"] }),
  });

  const courant = (data ?? [])[0];
  if (!courant) return null;

  return (
    <Dialog open disablePointerDismissal>
      <DialogPopup showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <BellRing className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-base">{courant.titre}</DialogTitle>
              <DialogDescription>{t("nudgeCreateur.titre")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogPanel className="space-y-3">
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">
            {courant.corps}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(courant.created_at).toLocaleString(i18n.language)}
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            size="lg"
            loading={marquer.isPending}
            onClick={() => marquer.mutate(courant.id)}
          >
            {marquer.isPending ? t("common.saving") : t("nudgeCreateur.ok")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
