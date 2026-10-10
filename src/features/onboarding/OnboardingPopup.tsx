import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PlayCircle, Video } from "lucide-react";

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
import { marquerOnboardingVu, mesComptes, onboardingVu } from "@/features/moteur/api";

/** Étapes de l'onboarding d'un créateur UGC vidéo (pod 3), dans l'ordre. */
const ETAPES_UGC = ["etape1", "etape2", "etape3", "etape4", "etape5", "etape6"] as const;

/** Lien de partage Loom → lien d'intégration (iframe). */
const LOOM_EMBED = "https://www.loom.com/embed/56715ee66ffc42d0ab15f8a2a179c770";

/**
 * Pop-up de bienvenue : à sa PREMIÈRE connexion, le poster voit une vidéo qui
 * explique comment poster. « J'ai compris » la marque vue — le pop-up ne
 * réapparaît plus ensuite. Rien à montrer (déjà vue) → rien ne se monte.
 * Un créateur dont tous les comptes sont UGC vidéo (pod 3) ne poste pas de
 * slideshows : il reçoit ses étapes à lui à la place de la vidéo Loom.
 */
export function OnboardingPopup() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: vu, isPending } = useQuery({
    queryKey: ["onboarding-vu"],
    queryFn: onboardingVu,
  });

  const { data: comptes, isPending: comptesEnCours } = useQuery({
    queryKey: ["mes-comptes"],
    queryFn: mesComptes,
    enabled: vu === false,
  });
  const ugc = Boolean(comptes?.length) && (comptes ?? []).every((c) => c.videos_uniquement);

  const marquer = useMutation({
    mutationFn: marquerOnboardingVu,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["onboarding-vu"] }),
  });

  if (isPending || vu || comptesEnCours) return null;

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
    <Dialog open disablePointerDismissal>
      <DialogPopup showCloseButton={false} className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <PlayCircle className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-base">{t("onboarding.titre")}</DialogTitle>
              <DialogDescription>{t("onboarding.sous")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogPanel>
          <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
            <iframe
              src={LOOM_EMBED}
              title={t("onboarding.titre")}
              allowFullScreen
              className="size-full"
            />
          </div>
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
