import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { prochaineVerification } from "./cinqEtapes";
import { declarerEtape, type EtapeDeclarable } from "./cinqEtapesApi";

/**
 * « I did this step » / « I've joined » / « I've started the warm-up » : au cas où l'OS se trompe (0497).
 * Le clic est enregistré (etape_declarations) ; Slack est relié tout de suite quand on retrouve la
 * personne. 13/11 (Max) : un retour visible à chaque clic (✅ relié, ou « Thanks! We're checking it »
 * avec l'heure de la prochaine vérification).
 */
export function BoutonDeclarer({ etape, libelle }: { etape: EtapeDeclarable; libelle: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [resultat, setResultat] = React.useState<"relie" | "en_attente" | null>(null);
  const declarer = useMutation({
    mutationFn: () => declarerEtape(etape),
    onSuccess: (r) => {
      setResultat(r);
      void qc.invalidateQueries({ queryKey: ["ma-premiere-semaine"] });
      void qc.invalidateQueries({ queryKey: ["mes-declarations"] });
      // La checklist Ruul (« Before you start ») se met à jour tout de suite.
      void qc.invalidateQueries({ queryKey: ["ruul-mon-onboarding"] });
    },
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="mt-1 h-7"
        disabled={declarer.isPending || resultat !== null}
        onClick={() => declarer.mutate()}
        data-testid={`declarer-${etape}`}
      >
        {libelle}
      </Button>
      {resultat === "relie" && <span className="text-success text-xs">{t("calendrier.cinq.declarer.relie")}</span>}
      {resultat === "en_attente" && (
        <span className="text-success text-xs" data-testid={`declarer-merci-${etape}`}>
          {t("calendrier.cinq.declarer.merci", { heure: prochaineVerification(etape) })}
        </span>
      )}
      {declarer.isError && <span className="text-destructive text-xs">{t("calendrier.cinq.declarer.erreur")}</span>}
    </span>
  );
}
