import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Power, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";

import { changerModeBleo, type ModeBleo, type RunBleo } from "./api";
import { formaterJour, messageErreur } from "./format";

/** Le mode vers lequel le bouton mène : à blanc → actif, actif → retour à blanc (secours), coupé → à blanc. */
function cible(mode: string): ModeBleo {
  return mode === "ombre" ? "actif" : "ombre";
}

/**
 * BLEO, vue d'ensemble : l'interrupteur de mode (bascule du 2/11). En actif,
 * l'assignation de minuit suit le plan de 14 h ; revenir à blanc rend la nuit
 * suivante à l'ancien système. Admin seulement, avec confirmation.
 */
export function InterrupteurMode({ mode, plan }: { mode: string; plan: RunBleo | null }) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const vers = cible(mode);

  const changer = useMutation({
    mutationFn: () => changerModeBleo(vers),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bleo", "reglages"] });
      setOuvert(false);
    },
  });

  if (role !== "admin") return null;
  const Icone = vers === "actif" ? Power : Undo2;

  return (
    <>
      <Button
        type="button"
        variant={vers === "actif" ? "default" : "destructive-outline"}
        onClick={() => {
          changer.reset();
          setOuvert(true);
        }}
      >
        <Icone aria-hidden />
        {t(`bleo.interrupteur.bouton_${vers}`)}
      </Button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{t(`bleo.interrupteur.titre_${vers}`)}</DialogTitle>
            <DialogDescription>{t(`bleo.interrupteur.effet_${vers}`)}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2 text-sm">
            {vers === "actif" && (
              <p>
                {plan
                  ? t("bleo.interrupteur.plan", {
                      jour: formaterJour(plan.jour_vise, i18n.language),
                      n: plan.resume?.creneaux ?? 0,
                    })
                  : t("bleo.interrupteur.sansPlan")}
              </p>
            )}
            <p className="text-muted-foreground">{t("bleo.interrupteur.quand")}</p>
            {changer.error && <p className="text-destructive">{messageErreur(changer.error)}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant={vers === "actif" ? "default" : "destructive"}
              disabled={changer.isPending}
              onClick={() => changer.mutate()}
            >
              {t(`bleo.interrupteur.confirmer_${vers}`)}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
