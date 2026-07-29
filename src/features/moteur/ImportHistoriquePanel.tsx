import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  forcerImportEloContenu,
  listerHistoriqueImports,
  type ImportHistoriqueLigne,
} from "@/features/moteur/api";
import { cn } from "@/lib/utils";

function resumeStatut(ligne: ImportHistoriqueLigne): {
  labelKey: string;
  variant: "success" | "warning" | "destructive" | "secondary" | "outline";
} {
  if (ligne.fileStatut === "failed") {
    return { labelKey: "sources.histScrapeEchec", variant: "destructive" };
  }
  if (ligne.fileStatut === "pending" || ligne.fileStatut === "running") {
    return { labelKey: "sources.histEnCours", variant: "warning" };
  }
  if (ligne.importEtape === "elo_insuffisant" || ligne.contenuStatut === "rejete") {
    return { labelKey: "sources.histEloSousSeuil", variant: "warning" };
  }
  if (ligne.importStatut === "done" && ligne.contenuStatut === "valide") {
    return { labelKey: "sources.histOk", variant: "success" };
  }
  if (ligne.importStatut === "failed") {
    return { labelKey: "sources.histPipelineEchec", variant: "destructive" };
  }
  if (ligne.importStatut === "pending" || ligne.importStatut === "running") {
    return { labelKey: "sources.histPipeline", variant: "warning" };
  }
  return { labelKey: "sources.histAutre", variant: "secondary" };
}

function LigneHistorique({
  ligne,
  ouvert,
  onToggle,
}: {
  ligne: ImportHistoriqueLigne;
  ouvert: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const statut = resumeStatut(ligne);
  const peutForcer =
    Boolean(ligne.contenuId) &&
    (ligne.importEtape === "elo_insuffisant" || ligne.contenuStatut === "rejete");

  const forcer = useMutation({
    mutationFn: () => forcerImportEloContenu(ligne.contenuId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["historique-imports"] });
      await queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      await queryClient.invalidateQueries({ queryKey: ["contenus"] });
    },
  });

  const eloMax = ligne.elo?.lignes?.length
    ? Math.max(...ligne.elo.lignes.map((l) => l.elo))
    : null;

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-start gap-2 px-3 py-2">
        <button
          type="button"
          className="min-w-0 flex-1 space-y-0.5 text-left"
          onClick={onToggle}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statut.variant}>{t(statut.labelKey)}</Badge>
            {ligne.forceSeuil && (
              <Badge variant="outline">{t("sources.histForce")}</Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {new Date(ligne.createdAt).toLocaleString(undefined, {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="truncate text-sm font-medium">
            {ligne.titre || ligne.postUrl}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ligne.vues != null ? `${ligne.vues.toLocaleString()} vues` : "—"}
            {" · "}
            {ligne.pertinence != null
              ? `pertinence ${Math.round(ligne.pertinence)}`
              : "—"}
            {eloMax != null
              ? ` · ELO max ${eloMax.toFixed(1)} / seuil ${ligne.elo?.seuil ?? "?"}`
              : ""}
          </p>
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
            <a href={ligne.postUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3" />
              TikTok
            </a>
          </Button>
          {peutForcer && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              disabled={forcer.isPending}
              onClick={() => forcer.mutate()}
              title={t("sources.histForcerAide")}
            >
              <Rocket className="size-3" />
              {forcer.isPending
                ? t("sources.histForcerEnCours")
                : t("sources.histForcer")}
            </Button>
          )}
        </div>
      </div>
      {forcer.isError && (
        <p className="px-3 pb-2 text-[11px] text-destructive">
          {(forcer.error as Error).message}
        </p>
      )}
      {forcer.isSuccess && (
        <p className="px-3 pb-2 text-[11px] text-emerald-700 dark:text-emerald-400">
          {t("sources.histForcerOk")}
        </p>
      )}
      {ouvert && (
        <div className="space-y-2 border-t bg-muted/30 px-3 py-2">
          {ligne.importErreur || ligne.fileErreur ? (
            <p className="text-[11px] text-destructive">
              {ligne.importErreur || ligne.fileErreur}
            </p>
          ) : null}
          {ligne.elo ? (
            <pre
              className={cn(
                "max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground",
              )}
            >
              {ligne.elo.texte}
            </pre>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t("sources.histEloAbsent")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE = 15;

/** Historique durable des imports : lien TT, ELO, forçage sous-seuil. */
export function ImportHistoriquePanel() {
  const { t } = useTranslation();
  const [ouvertId, setOuvertId] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE);
  const hist = useQuery({
    queryKey: ["historique-imports", limit],
    queryFn: () => listerHistoriqueImports(limit),
    refetchInterval: 8_000,
  });

  const lignes = hist.data?.lignes ?? [];
  const hasMore = Boolean(hist.data?.hasMore);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("sources.histTitre")}</p>
          <p className="text-xs text-muted-foreground">{t("sources.histAide")}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void hist.refetch()}
          disabled={hist.isFetching}
        >
          {t("sources.histRafraichir")}
        </Button>
      </div>
      {hist.isPending && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      {!hist.isPending && lignes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("sources.histVide")}</p>
      )}
      <div className="space-y-2">
        {lignes.map((ligne) => (
          <LigneHistorique
            key={ligne.fileId}
            ligne={ligne}
            ouvert={ouvertId === ligne.fileId}
            onToggle={() =>
              setOuvertId((id) => (id === ligne.fileId ? null : ligne.fileId))
            }
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={hist.isFetching}
            onClick={() => setLimit((n) => n + PAGE)}
          >
            {t("sources.histVoirPlus")}
          </Button>
        </div>
      )}
    </div>
  );
}
