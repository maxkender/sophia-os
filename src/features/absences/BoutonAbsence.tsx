import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/features/moteur/cohortes";

import { declarerAbsence, lireMonAbsence, terminerAbsence } from "./api";

const CLE = ["mon-absence"] as const;

function jour(d: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
}

/**
 * Prompt 27 : « I'll be away » sur le dashboard. Une petite fenêtre (From,
 * How many days?, Reason), puis « You're away until {date} » avec « I'm
 * back ». Rien ne part, rien n'est mis en pause : l'OS note seulement.
 */
export function BoutonAbsence() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "en";
  const qc = useQueryClient();
  const absence = useQuery({ queryKey: CLE, queryFn: lireMonAbsence });
  const [ouvert, setOuvert] = React.useState(false);
  const [debut, setDebut] = React.useState(aujourdhuiParis());
  const [jours, setJours] = React.useState("1");
  const [raison, setRaison] = React.useState("");
  const [merci, setMerci] = React.useState(false);
  const declarer = useMutation({
    mutationFn: () => declarerAbsence(debut, Number(jours), raison),
    onSuccess: () => {
      setMerci(true);
      void qc.invalidateQueries({ queryKey: CLE });
    },
  });
  const revenir = useMutation({ mutationFn: terminerAbsence, onSuccess: () => void qc.invalidateQueries({ queryKey: CLE }) });
  const n = Number(jours);
  const valide = Number.isInteger(n) && n >= 1 && n <= 14 && Boolean(debut);
  const a = absence.data;
  const fermer = () => {
    setOuvert(false);
    setMerci(false);
    declarer.reset();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="absence">
      {a ? (
        <p data-testid="absent-jusqua">
          {a.debut > aujourdhuiParis()
            ? t("absence.aVenir", { du: jour(a.debut, langue), au: jour(a.fin, langue) })
            : t("absence.jusqua", { date: jour(a.fin, langue) })}{" "}
          <button type="button" className="text-primary underline" disabled={revenir.isPending} onClick={() => revenir.mutate()} data-testid="je-reviens">
            {t("absence.retour")}
          </button>
        </p>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOuvert(true)} data-testid="je-serai-absent">
          {t("absence.bouton")}
        </Button>
      )}
      {revenir.error && <span className="text-xs text-destructive">{(revenir.error as Error).message}</span>}
      <Dialog open={ouvert} onOpenChange={(o) => (o ? setOuvert(true) : fermer())}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{t("absence.bouton")}</DialogTitle>
            <DialogDescription>{t("absence.aide")}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3 pb-5">
            {merci ? (
              <>
                <p data-testid="absence-notee">{t("absence.merci")}</p>
                <Button size="sm" onClick={fermer}>{t("absence.fermer")}</Button>
              </>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{t("absence.du")}</span>
                  <Input type="date" value={debut} min={aujourdhuiParis()} onChange={(e) => setDebut(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{t("absence.jours")}</span>
                  <Input type="number" min={1} max={14} value={jours} onChange={(e) => setJours(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{t("absence.raison")}</span>
                  <Input maxLength={200} value={raison} onChange={(e) => setRaison(e.target.value)} />
                </label>
                {declarer.error && <p className="text-xs text-destructive">{(declarer.error as Error).message}</p>}
                <Button size="sm" disabled={!valide} loading={declarer.isPending} onClick={() => declarer.mutate()} data-testid="confirmer-absence">
                  {t("absence.confirmer")}
                </Button>
              </>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
