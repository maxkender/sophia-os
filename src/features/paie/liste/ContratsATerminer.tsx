import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ban, ChevronDown, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CelluleContrat } from "@/features/paie/TableauPaie";

import { lireContratsATerminer, marquerContratTermine, type ContratATerminer } from "./contratsATerminer";

/** Un contrat : qui, pourquoi (Kill du dimanche ou Stop), le lien, « Ended ». */
function Ligne({ c, lundi }: { c: ContratATerminer; lundi: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const basculer = useMutation({
    mutationFn: (termine: boolean) => marquerContratTermine(c.poster_id, lundi, termine),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie", "contrats-a-terminer", lundi] }),
  });
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-contrat-fin={c.poster_nom ?? c.poster_id}>
      <div className="min-w-0 space-y-0.5 text-sm">
        <p>
          <span className="font-medium">{c.poster_nom}</span>
          {c.hm_prenom && <span className="text-muted-foreground"> · {c.hm_prenom}</span>}
          <Badge variant={c.source === "kill" ? "error" : "warning"} className="ml-2">
            {t(`paie.contratsFin.source.${c.source}`)}
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          {c.source === "kill" && c.handles.length > 0
            ? t("paie.contratsFin.comptes", { handles: c.handles.map((h) => `@${h}`).join(", ") })
            : t("paie.contratsFin.decide", { date: fmt.format(new Date(c.decide_at)) })}
        </p>
        {c.autres_actifs > 0 && (
          <p className="text-xs font-medium text-warning-foreground">
            {t("paie.contratsFin.autresActifs", { count: c.autres_actifs })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {c.contrat_url ? (
          <a
            href={c.contrat_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            {t("paie.contrat")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <CelluleContrat posterId={c.poster_id} lien={null} />
        )}
        {c.termine_at ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="font-medium text-success-foreground" data-termine>
              {t("paie.contratsFin.termine", {
                qui: c.termine_par ?? "—",
                date: fmt.format(new Date(c.termine_at)),
              })}
            </span>
            <Button size="sm" variant="ghost" className="h-7" disabled={basculer.isPending} onClick={() => basculer.mutate(false)}>
              {t("paie.contratsFin.annuler")}
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" className="h-7" disabled={basculer.isPending} onClick={() => basculer.mutate(true)}>
            {t("paie.contratsFin.ended")}
          </Button>
        )}
      </div>
      {basculer.isError && <p className="w-full text-xs text-destructive">{(basculer.error as Error).message}</p>}
    </li>
  );
}

/**
 * « Contracts to end » (chantier du 28 oct., F3) : chaque Kill du dimanche et
 * chaque Stop de Cohorts de la semaine payée, avec le lien du contrat et
 * « Ended » (qui, quand). Ouvert tant qu'il en reste un à terminer.
 */
export function ContratsATerminer({ lundi }: { lundi: string }) {
  const { t } = useTranslation();
  const contrats = useQuery({
    queryKey: ["paie", "contrats-a-terminer", lundi],
    queryFn: () => lireContratsATerminer(lundi),
  });
  const liste = contrats.data ?? [];
  if (liste.length === 0) return null;
  const restants = liste.filter((c) => !c.termine_at).length;
  return (
    <details
      open={restants > 0}
      className="group rounded-xl border border-destructive/30 bg-destructive/5"
      data-testid="paie-contrats-a-terminer"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <ChevronDown className="size-4 transition-transform group-[:not([open])]:-rotate-90" aria-hidden />
        <Ban className="size-4 text-destructive" aria-hidden />
        <span className="font-medium">{t("paie.contratsFin.titre", { reste: restants, total: liste.length })}</span>
      </summary>
      <div className="space-y-2 px-4 pb-4">
        <p className="text-xs text-muted-foreground">{t("paie.contratsFin.desc")}</p>
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((c) => (
            <Ligne key={c.poster_id} c={c} lundi={lundi} />
          ))}
        </ul>
      </div>
    </details>
  );
}
