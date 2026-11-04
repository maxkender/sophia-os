import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { apercuKill, executerKill, type Probleme } from "./api";

const P = "problemes";
const dollars = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(2)} $`);

/**
 * 3/11 : « Kill (formulaire pré-rempli) » sur une carte. Le contrat Upwork lié
 * est relu (lecture seule) ; la case « Fermer le contrat et récupérer le
 * milestone non payé » est cochée par défaut. Rien ne part au posteur ; rien
 * n'est exécuté en mode test.
 */
export function BoutonKill({ p, libelle }: { p: Pick<Probleme, "id" | "nom" | "poster_id">; libelle: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [fermer, setFermer] = React.useState(true);
  const apercu = useQuery({ queryKey: ["kill", p.id], queryFn: () => apercuKill(p.id), enabled: ouvert, retry: false, staleTime: 0 });
  const kill = useMutation({
    mutationFn: () => executerKill(p.id, fermer),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["problemes"] }),
  });
  const a = apercu.data;
  const plan = a?.plan;
  const couleur = plan?.decision === "fermer" ? "text-emerald-700 dark:text-emerald-400" : plan?.decision === "attendre" ? "text-amber-700" : "text-red-600";

  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)} disabled={!p.poster_id} data-testid="bouton-kill">{libelle}</Button>
      <Dialog open={ouvert} onOpenChange={(o) => { setOuvert(o); if (!o) kill.reset(); }}>
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">{t(`${P}.kill.titre`, { nom: p.nom ?? "—" })}</DialogTitle>
            <DialogDescription>{t(`${P}.kill.os`)}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3 pb-5 text-sm" data-testid="formulaire-kill">
            {a?.mode === "test" && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{t(`${P}.kill.modeTest`)}</p>}
            {apercu.isLoading && <p className="text-muted-foreground">{t(`${P}.kill.lecture`)}</p>}
            {apercu.error && <p className="text-destructive">{(apercu.error as Error).message}</p>}
            {a && (
              <div className="space-y-1 rounded-md bg-muted/30 p-2" data-testid="contrat-kill">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(`${P}.kill.contrat`)}</p>
                {a.contrat_id ? (
                  <>
                    <p>
                      <a href={`https://www.upwork.com/nx/wm/workroom/${a.contrat_id}/overview`} target="_blank" rel="noreferrer" className="font-medium underline">{a.contrat_id}</a>
                      {a.titre && <> · {a.titre}</>}{a.organisation && <span className="text-muted-foreground"> · {a.organisation}</span>}
                    </p>
                    <p>{t(`${P}.kill.enCours`)} {plan?.en_cours ? `« ${plan.en_cours.nom} » · ${plan.en_cours.etat} · ${dollars(plan.en_cours.depot)}` : "—"}</p>
                    <p className="font-medium">{t(`${P}.kill.financeNonPaye`, { montant: dollars(plan?.montant) })}</p>
                  </>
                ) : <p>{t(`${P}.kill.sansContrat`)}</p>}
                {plan && <p className={cn("text-xs", couleur)} data-testid="decision-kill">{t(`${P}.kill.decisions.${plan.decision}`, { montant: dollars(plan.montant), raison: plan.raison ?? "" })}</p>}
              </div>
            )}
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={fermer} onChange={(e) => setFermer(e.target.checked)} disabled={!a?.contrat_id} className="mt-0.5" data-testid="case-fermer" />
              <span>{t(`${P}.kill.case`)}</span>
            </label>
            {kill.data?.texte && <p className="rounded-md bg-muted/40 p-2 font-medium" data-testid="resultat-kill">{kill.data.texte}</p>}
            {kill.error && <p className="text-destructive">{(kill.error as Error).message}</p>}
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => kill.mutate()} disabled={!a || kill.isPending || Boolean(kill.data)} data-testid="confirmer-kill">
                {t(`${P}.kill.confirmer`)}
              </Button>
              <Button variant="outline" onClick={() => setOuvert(false)}>{t(`${P}.kill.fermerFenetre`)}</Button>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
