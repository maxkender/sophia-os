import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BellRing, Check, Copy } from "lucide-react";

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
import { useAuth } from "@/features/auth/AuthContext";
import { etatOnboarding, marquerNudgeLu, mesNudges, mesReviewsNonVues } from "@/features/moteur/api";

/**
 * Nudge côté créateur : le message déposé depuis la page de surveillance (ou
 * par le contrôle « lien à 1 000 abonnés ») s'affiche à sa connexion.
 * « Compris » le marque lu et enchaîne sur le suivant. Rien à afficher → rien
 * ne se monte (même contrat que `ReviewPopup`).
 *
 * Un pop-up à la fois : il attend que l'onboarding soit fini et que les
 * retours (reviews) soient vus. Sinon les dialogues s'empilent, et aucun ne se
 * ferme d'un clic à côté.
 *
 * Réservé au VRAI poster : la RLS laisse l'admin et le Head of Ops lire tous les
 * nudges, et ils traversent `PosterLayout` en ouvrant un post (`/posts/:id`).
 * Sans ce garde-fou, ils voyaient le message d'un poster et le marquaient lu à
 * sa place.
 */
export function NudgePopup() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <NudgesPoster />;
}

function NudgesPoster() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["mes-nudges"], queryFn: mesNudges });
  const onboarding = useQuery({ queryKey: ["onboarding-etat"], queryFn: etatOnboarding });
  const reviews = useQuery({ queryKey: ["mes-reviews"], queryFn: mesReviewsNonVues });
  const [copie, setCopie] = React.useState(false);

  const marquer = useMutation({
    mutationFn: marquerNudgeLu,
    onSuccess: () => {
      setCopie(false);
      queryClient.invalidateQueries({ queryKey: ["mes-nudges"] });
    },
  });

  const courant = (data ?? [])[0];
  const apres =
    onboarding.isPending || onboarding.data?.vu === false || reviews.isPending || (reviews.data?.length ?? 0) > 0;
  if (!courant || apres) return null;

  const copier = async () => {
    if (!courant.lien) return;
    try {
      await navigator.clipboard.writeText(courant.lien);
      setCopie(true);
    } catch {
      // Presse-papiers refusé (navigateur, iframe) : le lien reste lisible à l'écran.
    }
  };

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
          {courant.lien && (
            <div className="flex items-center gap-2 rounded-lg border p-2 pl-3">
              <code className="flex-1 truncate text-sm font-medium">{courant.lien}</code>
              <Button variant="outline" size="sm" onClick={copier}>
                {copie ? <Check /> : <Copy />}
                {copie ? t("nudgeCreateur.copie") : t("nudgeCreateur.copier")}
              </Button>
            </div>
          )}
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
