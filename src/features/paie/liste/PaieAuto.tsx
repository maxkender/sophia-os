import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { lancerPaieAuto, lireEtatPaieAuto, lireReglagesPaiementApi } from "@/features/paie/api-upwork/api";
import { cn } from "@/lib/utils";

/**
 * Prompt 21, B3 à B6 : la paie automatique de la semaine, en tête de la liste.
 * Le lundi à 9 h (Paris), l'OS paie seul : un canari d'abord, puis le reste
 * par lots de 10. « Pay now » lance plus tôt (admin, Head of Ops). Rien ne part
 * si paie_api n'est pas sur « on » ou si le grand interrupteur est en pause.
 */
export function PaieAuto({ semaine }: { semaine: string }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const etat = useQuery({ queryKey: ["paie", "auto", semaine], queryFn: () => lireEtatPaieAuto(semaine), refetchInterval: 30_000 });
  const reglages = useQuery({ queryKey: ["paie", "api-reglages"], queryFn: lireReglagesPaiementApi });
  const lancer = useMutation({
    mutationFn: lancerPaieAuto,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["paie"] });
    },
  });
  const mode = reglages.data?.mode ?? "off";
  const e = etat.data;
  const peutLancer = role === "admin" || role === "head_of_ops";
  const b = e?.dernier_bilan ?? null;
  const arrete = e?.statut === "arrete";

  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        arrete ? "border-destructive/50 bg-destructive/5" : "bg-muted/20",
      )}
      data-testid="paie-auto"
    >
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {mode !== "on" ? t("paie.auto.modeOff", { mode }) : t(`paie.auto.statuts.${e?.statut ?? "attente"}`)}
        </p>
        {mode === "on" && !e?.canari_ok && !arrete && <p className="text-muted-foreground">{t("paie.auto.aide")}</p>}
        {e?.canari_ok && e.canari_detail?.poster && (
          <p className="text-muted-foreground">{t("paie.auto.canariOk", { nom: e.canari_detail.poster })}</p>
        )}
        {arrete && <p className="text-destructive" data-testid="paie-auto-arret">{t("paie.auto.arrete", { raison: e?.arret_raison ?? "" })}</p>}
        {b && (
          <p className="text-muted-foreground tabular-nums">
            {t("paie.auto.bilan", { payees: b.payees ?? 0, reessais: b.reessais ?? 0, verifier: (b.a_verifier ?? 0) + (b.refusees ?? 0) })}
          </p>
        )}
        {lancer.data?.ignore && <p className="text-muted-foreground">{lancer.data.ignore}</p>}
        {lancer.error && <p className="text-destructive">{(lancer.error as Error).message}</p>}
      </div>
      {peutLancer && (
        <Button
          size="sm"
          disabled={mode !== "on" || lancer.isPending || e?.statut === "fini"}
          data-testid="paie-auto-lancer"
          onClick={() => {
            if (window.confirm(t("paie.auto.confirmer"))) lancer.mutate();
          }}
        >
          <Play />
          {t("paie.auto.payerMaintenant")}
        </Button>
      )}
    </div>
  );
}
