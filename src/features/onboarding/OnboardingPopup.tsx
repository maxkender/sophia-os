import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";

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
import { etatOnboarding, marquerOnboardingVu, mesComptes } from "@/features/moteur/api";

import { OnboardingParcours } from "./OnboardingParcours";

/** Étapes de l'onboarding d'un créateur UGC vidéo (pod 3), dans l'ordre. */
const ETAPES_UGC = ["etape1", "etape2", "etape3", "etape4", "etape5", "etape6"] as const;

/**
 * Ce que voit un créateur à sa première connexion.
 *
 * Deux publics, deux accueils :
 *  - slideshow (le gros de la flotte) : le PARCOURS en six écrans + quiz,
 *    dont on ne sort qu'en ayant lu (`OnboardingParcours`) ;
 *  - UGC vidéo (pod 3) : sa liste d'étapes, inchangée. Le parcours ne parle
 *    que de slideshows, le servir à quelqu'un qui n'en poste pas serait pire
 *    que l'ancien écran.
 *
 * Rien à montrer (déjà vu) → rien ne se monte.
 */
export function OnboardingPopup() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: etat, isPending } = useQuery({
    queryKey: ["onboarding-etat"],
    queryFn: etatOnboarding,
  });

  const { data: comptes, isPending: comptesEnCours } = useQuery({
    queryKey: ["mes-comptes"],
    queryFn: mesComptes,
    enabled: etat?.vu === false,
  });
  const ugc = Boolean(comptes?.length) && (comptes ?? []).every((c) => c.videos_uniquement);

  const marquer = useMutation({
    mutationFn: marquerOnboardingVu,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["onboarding-etat"] }),
  });

  if (isPending || etat?.vu !== false || comptesEnCours) return null;

  if (ugc) {
    return (
      <Dialog open disablePointerDismissal>
        <DialogPopup showCloseButton={false} className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Video className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-base">{t("onboarding.ugc.titre")}</DialogTitle>
                <DialogDescription>{t("onboarding.ugc.sous")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogPanel>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {ETAPES_UGC.map((etape) => (
                <li key={etape}>{t(`onboarding.ugc.${etape}`)}</li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs">
              {t("onboarding.ugc.regles")}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button loading={marquer.isPending} onClick={() => marquer.mutate()}>
              {marquer.isPending ? t("common.saving") : t("onboarding.compris")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    );
  }

  return (
    <OnboardingParcours
      etapeInitiale={etat.etape}
      onTermine={() => queryClient.invalidateQueries({ queryKey: ["onboarding-etat"] })}
    />
  );
}
