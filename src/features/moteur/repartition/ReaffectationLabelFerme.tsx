import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { reaffecterLabelFerme, reaffecterLabelFermeEnEntier } from "./apiRepartition";

function messageErreur(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 0794 : les comptes d'un label fermé sont réaffectés tout de suite, dans le
 * même thème d'abord (études vers études, running vers running), sans attendre
 * la nuit. L'aperçu d'abord, rien n'est écrit avant le clic ; chaque
 * déplacement est journalisé et s'annule depuis la page Podz.
 *
 * Deux usages : la page Allocation, où le label vient d'être fermé, et la page
 * Labels (20/11), où « Arrêter le label » montre d'abord les propositions :
 * `avantAppliquer` ferme alors le label au moment de valider, pas avant.
 */
export function ReaffectationLabelFerme({ labelId, nom, onFini, avantAppliquer, titre }: {
  labelId: string;
  nom: string;
  onFini: () => void;
  /** Ce qui doit être écrit juste avant de déplacer les comptes (fermer le label). */
  avantAppliquer?: () => Promise<void>;
  /** Le titre tant que rien n'est fait ; absent : « … est fermé ». */
  titre?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const apercu = useQuery({
    queryKey: ["reaffectation-label", labelId],
    queryFn: () => reaffecterLabelFerme(labelId, true),
    staleTime: 0,
    gcTime: 0,
  });
  const appliquer = useMutation({
    mutationFn: async () => {
      await avantAppliquer?.();
      return reaffecterLabelFermeEnEntier(labelId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repartition-marches"] });
      void queryClient.invalidateQueries({ queryKey: ["repartition-reglages"] });
      void queryClient.invalidateQueries({ queryKey: ["detail-label", labelId] });
    },
  });
  const fait = appliquer.data ?? null;
  const vu = fait ?? apercu.data ?? null;
  const aFaire = (apercu.data?.deplaces.length ?? 0) + (apercu.data?.retires.length ?? 0) + (apercu.data?.reportes ?? 0);
  // Sur la page Labels, valider ferme aussi le label : permis même sans compte à déplacer.
  const rienAFaire = aFaire === 0 && !avantAppliquer;
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-3" data-testid="reaffectation-label">
      <p className="text-sm font-medium">
        {fait ? t("repartition.reaffFait", { nom, n: fait.deplaces.length }) : (titre ?? t("repartition.reaffTitre", { nom }))}
      </p>
      {apercu.isPending && <p className="text-xs text-muted-foreground">{t("common.loading")}</p>}
      {apercu.isError && <p className="text-xs text-destructive-foreground">{messageErreur(apercu.error)}</p>}
      {appliquer.isError && <p className="text-xs text-destructive-foreground">{messageErreur(appliquer.error)}</p>}
      {vu && vu.deplaces.length === 0 && vu.manuels.length === 0 && vu.retires.length === 0 && !fait && (
        <p className="text-xs text-muted-foreground">{t("repartition.reaffAucun")}</p>
      )}
      {vu && vu.deplaces.length > 0 && (
        <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
          {vu.deplaces.map((d) => (
            <li key={d.compte_id} className="flex items-baseline gap-1.5">
              <span className="font-mono">{d.handle ?? d.compte_id.slice(0, 8)}</span>
              {d.langue && <span className="text-muted-foreground">{d.langue}</span>}
              <span className="text-muted-foreground" aria-hidden>→</span>
              <span className="font-medium">{d.vers}</span>
              {d.meme_theme === false && <Badge variant="outline">{t("repartition.reaffHorsTheme")}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {vu && vu.reportes > 0 && !fait && (
        <p className="text-xs text-muted-foreground">{t("repartition.reaffSuite", { n: vu.reportes })}</p>
      )}
      {vu && vu.manuels.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("repartition.reaffManuels", { liste: vu.manuels.map((m) => `${m.handle ?? "?"} (${m.raison})`).join(" · ") })}
        </p>
      )}
      {fait && fait.erreurs.length > 0 && (
        <p className="text-xs text-destructive-foreground">{fait.erreurs.join(" · ")}</p>
      )}
      {fait && fait.reportes > 0 && (
        <p className="text-xs text-destructive-foreground">{t("repartition.reaffReste", { n: fait.reportes })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!fait && (
          <Button
            size="sm"
            loading={appliquer.isPending}
            disabled={apercu.isPending || apercu.isError || rienAFaire}
            onClick={() => appliquer.mutate()}
          >
            {avantAppliquer ? t("repartition.reaffBoutonArret", { n: aFaire }) : t("repartition.reaffBouton", { n: aFaire })}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={appliquer.isPending} onClick={onFini}>
          {fait ? t("repartition.reaffFermer") : t("repartition.reaffPlusTard")}
        </Button>
      </div>
    </div>
  );
}
