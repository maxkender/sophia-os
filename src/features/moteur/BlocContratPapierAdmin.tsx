import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  envoyerContratPapier,
  listerContratsPapier,
  type PapierCmContrat,
} from "@/features/moteur/api";
import { estCompteCm } from "@/features/moteur/comptesCm";
import { nomLangue } from "@/features/moteur/langues";
import { contratPapierSigne } from "@/features/moteur/papierCmCompte";

export function BlocContratPapierAdmin({
  posterId,
  comptes,
}: {
  posterId: string;
  comptes: Array<{ id: string; langue: string; type_compte: string }>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cms = comptes.filter(estCompteCm);
  const q = useQuery({
    queryKey: ["papier-cm-contrats", posterId],
    queryFn: () => listerContratsPapier(posterId),
    enabled: Boolean(posterId),
  });

  const envoyer = useMutation({
    mutationFn: (input: { langue: string; compteId?: string }) =>
      envoyerContratPapier({ posterId, langue: input.langue, compteId: input.compteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["papier-cm-contrats"] });
    },
  });

  if (cms.length === 0) return null;

  const parLangue = new Map((q.data ?? []).map((c) => [c.langue, c]));
  const err =
    envoyer.error instanceof Error
      ? envoyer.error.message === "CONTRAT_DEJA_ENVOYE"
        ? t("papierContrat.deja")
        : envoyer.error.message === "CONTRAT_HANDLE_PRIS"
          ? t("papierContrat.dejaHandle")
          : envoyer.error.message
      : null;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t("papierContrat.adminTitre")}</p>
      <p className="text-xs text-muted-foreground">{t("papierContrat.adminAide")}</p>
      <ul className="space-y-2">
        {cms.map((c) => {
          const contrat = parLangue.get(c.langue);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {nomLangue(c.langue)}
                {contrat ? <StatutContrat row={contrat} /> : null}
              </span>
              {contrat ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {contrat.instagram_handle}
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={envoyer.isPending}
                  onClick={() => envoyer.mutate({ langue: c.langue, compteId: c.id })}
                >
                  {t("papierContrat.envoyer")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function StatutContrat({ row }: { row: PapierCmContrat }) {
  const { t } = useTranslation();
  if (contratPapierSigne(row.statut)) {
    return (
      <Badge variant="secondary" className="ml-2">
        {t("papierContrat.badgeSigne")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-2">
      {t("papierContrat.badgeAttente")}
    </Badge>
  );
}
