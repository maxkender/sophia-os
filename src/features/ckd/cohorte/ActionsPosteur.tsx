import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarClock, MoreHorizontal, PowerOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { activerPoster, supprimerPoster } from "@/features/moteur/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { reporterCompte } from "./reporter";

type Action = "reporter" | "desactiver" | "supprimer";

/**
 * Les actions sur un posteur de la cohorte, depuis le dashboard HM :
 *   - Postpone : à la cohorte suivante (0367), tant qu'il n'a rien publié ;
 *   - Deactivate : le posteur et ses comptes passent dans l'Archive (0366) ;
 *   - Delete : définitif, historique compris — admin et Head of Ops seulement,
 *     comme manage-users.
 * Chaque action se confirme d'un second clic.
 *
 * v3 point 8 : le dashboard HM n'a plus d'action qui contrôle. Une HM (ou un
 * directing manager) ne voit pas ce menu ; l'admin et le Head of Ops oui.
 */
type ProprietesActions = {
  posteurId: string;
  nom: string;
  compteId: string;
  warmupLance: boolean;
  aPublie: boolean;
};

export function ActionsPosteur(props: ProprietesActions) {
  const { role } = useAuth();
  if (role !== "admin" && role !== "head_of_ops") return null;
  return <MenuActions {...props} />;
}

function MenuActions({ posteurId, nom, compteId, warmupLance, aPublie }: ProprietesActions) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [choix, setChoix] = React.useState<Action | null>(null);
  const [fait, setFait] = React.useState<string | null>(null);
  const peutSupprimer = role === "admin" || role === "head_of_ops";

  const action = useMutation({
    mutationFn: async (a: Action): Promise<string> => {
      if (a === "reporter") {
        const lundi = await reporterCompte(compteId);
        const date = new Intl.DateTimeFormat(localeDate(i18n.language), {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${lundi}T12:00:00Z`));
        return t("accueilHm.actions.reporte", { date });
      }
      if (a === "desactiver") {
        await activerPoster(posteurId, false);
        return t("accueilHm.actions.desactive");
      }
      await supprimerPoster(posteurId);
      return t("accueilHm.actions.supprime");
    },
    onSuccess: (message) => {
      setFait(message);
      setChoix(null);
      void queryClient.invalidateQueries({ queryKey: ["accueil-hm"] });
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["etapes-comptes"] });
    },
  });

  const fermer = (o: boolean) => {
    setOuvert(o);
    if (!o) {
      setChoix(null);
      setFait(null);
      action.reset();
    }
  };

  const raisonReport = aPublie
    ? t("accueilHm.actions.reporterDejaPublie")
    : !warmupLance
    ? t("accueilHm.actions.reporterPasLance")
    : null;

  const lignes: { cle: Action; icone: React.ReactNode; bloque?: string | null; danger?: boolean }[] = [
    { cle: "reporter", icone: <CalendarClock className="size-4" />, bloque: raisonReport },
    { cle: "desactiver", icone: <PowerOff className="size-4" />, danger: true },
    ...(peutSupprimer ? [{ cle: "supprimer" as const, icone: <Trash2 className="size-4" />, danger: true }] : []),
  ];

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={t("accueilHm.actions.titre", { nom })}
        onClick={() => setOuvert(true)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      <Dialog open={ouvert} onOpenChange={fermer}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{nom}</DialogTitle>
            <DialogDescription>{t("accueilHm.actions.desc")}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2 pb-5">
            {fait ? (
              <p className="rounded-lg border border-success/40 bg-success/8 px-3 py-2 text-sm">{fait}</p>
            ) : (
              lignes.map((l) => {
                const actif = choix === l.cle;
                return (
                  <div
                    key={l.cle}
                    className={cn(
                      "rounded-xl border p-3 transition-colors",
                      actif && (l.danger ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"),
                    )}
                  >
                    <button
                      type="button"
                      disabled={Boolean(l.bloque) || action.isPending}
                      onClick={() => setChoix(actif ? null : l.cle)}
                      className="flex w-full items-start gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          l.danger ? "bg-destructive/10 text-destructive-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        {l.icone}
                      </span>
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-sm font-medium">{t(`accueilHm.actions.${l.cle}`)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {l.bloque ?? t(`accueilHm.actions.${l.cle}Aide`)}
                        </span>
                      </span>
                    </button>
                    {actif && (
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setChoix(null)}>
                          {t("accueilHm.actions.annuler")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={l.danger ? "destructive" : "default"}
                          disabled={action.isPending}
                          onClick={() => action.mutate(l.cle)}
                        >
                          {action.isPending ? t("accueilHm.actions.enCours") : t(`accueilHm.actions.${l.cle}Confirmer`)}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {action.isError && (
              <p className="text-sm text-destructive">{(action.error as Error).message}</p>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
