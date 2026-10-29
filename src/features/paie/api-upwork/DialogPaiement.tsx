import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarreChargement } from "@/components/ui/progress";
import { dollars } from "@/features/paie/logique";
import { cn } from "@/lib/utils";

import { apercuPaiement, libererPaiementApi, payer, type EtatPaiementApi, type PlanLigne } from "./api";

const VARIANTE: Record<string, "success" | "warning" | "error" | "info" | "secondary"> = {
  pret: "info",
  paye: "success",
  deja_payee: "success",
  a_verifier: "warning",
  reessai: "warning",
  refuse: "error",
  rien: "secondary",
  lien: "warning",
};

/** Ce que fera (ou a fait) une ligne, en une phrase. */
function Plan({ l, langue }: { l: PlanLigne; langue: string }) {
  const { t } = useTranslation();
  const usd = (n: number) => dollars(n, langue);
  if (l.statut === "pret" && l.approuver) {
    return (
      <div className="space-y-0.5 text-xs">
        <p>
          {t("paie.api.approuver", { nom: l.approuver.nom || "—", montant: usd(l.approuver.montant) })}
          {l.approuver.sous_paiement && (
            <span className="text-muted-foreground"> · {t("paie.api.sousPaiement", { raison: l.approuver.sous_paiement })}</span>
          )}
        </p>
        {l.financer && (
          <p>
            {t(l.financer.mode === "creer" ? "paie.api.financerCreer" : l.financer.editer ? "paie.api.financerEditer" : "paie.api.financer", {
              nom: l.financer.nom,
              montant: usd(l.financer.montant),
            })}
          </p>
        )}
        {l.lien === "fermer" && <p className="text-warning-foreground">{t("paie.api.fermer")}</p>}
      </div>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {l.statut === "deja_payee" && l.montant_trouve !== null ? `${l.raison} (${usd(l.montant_trouve)})` : (l.raison ?? "—")}
    </p>
  );
}

/**
 * « Pay » / « Pay team » (prompt 14, point 3) : l'aperçu relu chez Upwork
 * (lignes, montant de chaque ligne, total, refus et leur raison), puis
 * « Confirm ». Le serveur relit tout au moment de payer ; chaque erreur met la
 * ligne « à vérifier », sans nouvel essai.
 */
export function DialogPaiement({
  semaine,
  ids,
  titre,
  ouvert,
  onOpenChange,
}: {
  semaine: string;
  ids: string[];
  titre: string;
  ouvert: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const queryClient = useQueryClient();
  const apercu = useQuery({
    queryKey: ["paie", "api-apercu", semaine, ids],
    queryFn: () => apercuPaiement(semaine, ids),
    enabled: ouvert && ids.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const confirmer = useMutation({
    mutationFn: () => payer(semaine, ids),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  React.useEffect(() => {
    if (!ouvert) confirmer.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const lignes = confirmer.data ?? apercu.data?.lignes ?? [];
  const prets = (apercu.data?.lignes ?? []).filter((l) => l.statut === "pret" && !l.bloque);
  const mode = apercu.data?.mode;
  return (
    <Dialog open={ouvert} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{titre}</DialogTitle>
          <DialogDescription>{t("paie.api.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 pb-5" data-testid="dialog-paiement">
          {apercu.isFetching && <BarreChargement actif />}
          {apercu.error && <p className="text-sm text-destructive">{(apercu.error as Error).message}</p>}
          {mode && mode !== "on" && (
            <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs" data-testid="paiement-mode">
              {t(`paie.api.modes.${mode}`)}
            </p>
          )}
          {lignes.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {lignes.map((l) => {
                const etat = l.resultat ?? l.statut;
                return (
                  <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2" data-plan={l.poster_nom ?? l.id}>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{l.poster_nom}</p>
                      <Plan l={l} langue={langue} />
                      {l.bloque && !l.resultat && <p className="text-xs text-warning-foreground">{t("paie.api.bloque", { raison: l.bloque })}</p>}
                      {l.resultat && l.resultat !== l.statut && l.raison && (
                        <p className="text-xs text-warning-foreground">{l.raison}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {l.statut === "pret" && <span className="text-sm font-semibold tabular-nums">{dollars(l.total, langue)}</span>}
                      <Badge variant={VARIANTE[etat] ?? "secondary"}>{t(`paie.api.statuts.${etat}`)}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {apercu.data && !confirmer.data && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm tabular-nums">
                {t("paie.api.total", {
                  n: prets.length,
                  total: dollars(apercu.data.total, langue),
                  plafond: dollars(apercu.data.plafond_jour, langue),
                })}
              </p>
              <Button
                disabled={prets.length === 0 || confirmer.isPending}
                onClick={() => confirmer.mutate()}
                data-testid="paiement-confirmer"
              >
                <Send />
                {confirmer.isPending ? t("paie.api.envoi") : t("paie.api.confirmer", { n: prets.length })}
              </Button>
            </div>
          )}
          {confirmer.data && (
            <p className="text-sm font-medium" data-testid="paiement-bilan">
              {t("paie.api.bilan", {
                payes: confirmer.data.filter((l) => l.resultat === "paye").length,
                verifier: confirmer.data.filter((l) => l.resultat === "a_verifier").length,
              })}
            </p>
          )}
          {confirmer.isError && <p className="text-sm text-destructive">{(confirmer.error as Error).message}</p>}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

/** Le bouton « Pay » d'une ligne, ou « Pay team » d'un bloc. */
export function BoutonPayer({ semaine, ids, titre, libelle, petit }: { semaine: string; ids: string[]; titre: string; libelle: string; petit?: boolean }) {
  const [ouvert, setOuvert] = React.useState(false);
  if (ids.length === 0) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(petit ? "h-7 px-2 text-xs" : "h-7")}
        onClick={(e) => {
          e.preventDefault();
          setOuvert(true);
        }}
      >
        <Send className="size-3.5" />
        {libelle}
      </Button>
      {ouvert && <DialogPaiement semaine={semaine} ids={ids} titre={titre} ouvert={ouvert} onOpenChange={setOuvert} />}
    </>
  );
}

/**
 * L'état API d'une ligne de paie : payée par l'API, déjà payée à la main, ou
 * « à vérifier » avec la raison ; l'admin la libère après avoir vérifié sur
 * Upwork (raison obligatoire). Jamais de nouvel essai automatique.
 */
export function EtatPaiementLigne({ etat, admin }: { etat: EtatPaiementApi; admin: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const liberer = useMutation({
    mutationFn: (raison: string) => libererPaiementApi(etat.id, raison),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  return (
    <div className="mt-1 space-y-0.5" data-etat-api={etat.statut}>
      <Badge variant={VARIANTE[etat.statut] ?? "secondary"}>{t(`paie.api.statuts.${etat.statut}`)}</Badge>
      {etat.statut === "a_verifier" && etat.erreur && <p className="max-w-72 text-[11px] text-warning-foreground">{etat.erreur}</p>}
      {etat.statut === "a_verifier" && admin && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          disabled={liberer.isPending}
          onClick={() => {
            const raison = window.prompt(t("paie.api.libererRaison"));
            if (raison?.trim()) liberer.mutate(raison.trim());
          }}
        >
          {t("paie.api.liberer")}
        </Button>
      )}
      {liberer.isError && <p className="text-[11px] text-destructive">{(liberer.error as Error).message}</p>}
    </div>
  );
}
