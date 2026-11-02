import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OctagonX, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

import { CLE_PAUSE } from "./clesPause";
import { ecrirePause, lireEtatPause } from "./pauseApi";

const quand = (iso: string | null, langue: string) =>
  iso ? new Intl.DateTimeFormat(langue, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

/**
 * Prompt 22, partie 2 : « Deactivate automatic actions with API ». Bouton
 * rouge, confirmation obligatoire, admin seulement (vérifié en base). Passe
 * au-dessus de tous les interrupteurs, qui gardent leur valeur.
 */
export function GrandInterrupteur() {
  const { t, i18n } = useTranslation();
  const admin = useAuth().role === "admin";
  const qc = useQueryClient();
  const etat = useQuery({ queryKey: CLE_PAUSE, queryFn: lireEtatPause, refetchInterval: 60_000 });
  const changer = useMutation({
    mutationFn: (actif: boolean) => ecrirePause(actif),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLE_PAUSE });
      void qc.invalidateQueries({ queryKey: ["reglages-journal"] });
    },
  });
  const actif = etat.data?.actif === true;
  const basculer = () => {
    const question = actif ? t("auto.pause.confirmerReprise") : t("auto.pause.confirmerPause");
    if (window.confirm(question)) changer.mutate(!actif);
  };
  return (
    <Card className={cn(actif && "border-destructive bg-destructive/5")} data-testid="grand-interrupteur">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{t("auto.pause.titre")}</p>
          <p className="text-sm text-muted-foreground">
            {actif
              ? t("auto.pause.actif", { quand: quand(etat.data?.depuis ?? null, i18n.language), par: etat.data?.par_nom ?? "—" })
              : t("auto.pause.inactif")}
          </p>
          {!admin && <p className="text-xs text-muted-foreground">{t("reglagesOs.adminSeulement")}</p>}
          {changer.error ? <p className="text-sm text-destructive">{(changer.error as Error).message}</p> : null}
        </div>
        {admin && (
          <Button variant={actif ? "outline" : "destructive"} disabled={changer.isPending || etat.isPending} onClick={basculer}>
            {actif ? <Play /> : <OctagonX />}
            {actif ? t("auto.pause.reprendre") : t("auto.pause.bouton")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
