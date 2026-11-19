import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { messageErreur } from "@/features/bleo/format";
import { nomLangue } from "@/features/moteur/langues";

import { CLE_BOUCLE, etatBoucle } from "./apiBoucle";
import { compterProposees, retenirProposees } from "./apiCorrections";

/**
 * Tout retenir d'un clic : les corrections proposées de toutes les langues
 * passent « retenue », sans tri une à une. Elles entrent alors dans la
 * traduction (corrections de langue) ou dans le placement de leur application
 * dès le prochain post. Le bandeau dit combien attendent, langue par langue,
 * et n'apparaît que s'il y en a.
 *
 * Les clés « corrections-natives », « boucle-etat » et « regles-natives »
 * sont relues après coup : compteurs, blocs et listes de la page suivent.
 */
export function ToutRetenir() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const total = useQuery({ queryKey: ["corrections-natives", "a-trier-total"], queryFn: compterProposees });
  const boucle = useQuery({ queryKey: CLE_BOUCLE, queryFn: etatBoucle });
  const [retenues, setRetenues] = React.useState<number | null>(null);
  const retenir = useMutation({
    mutationFn: () => retenirProposees(),
    onSuccess: (n) => {
      setRetenues(n);
      void qc.invalidateQueries({ queryKey: ["corrections-natives"] });
      void qc.invalidateQueries({ queryKey: CLE_BOUCLE });
      void qc.invalidateQueries({ queryKey: ["regles-natives"] });
    },
  });

  const n = total.data ?? 0;
  const erreur = total.error ?? retenir.error;
  if (n === 0 && retenues === null && !erreur) return null;

  // Le détail par langue vient de l'état de la boucle (langues qui ont un relecteur).
  const parLangue = (boucle.data ?? []).filter((l) => l.proposees > 0).sort((a, b) => b.proposees - a.proposees);
  const autres = n - parLangue.reduce((s, l) => s + l.proposees, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/20 p-3" data-testid="tout-retenir">
      <div className="min-w-0 flex-1 space-y-0.5">
        {n > 0 ? (
          <>
            <p className="text-sm font-medium">{t("relectureNative.toutRetenir.titre", { count: n })}</p>
            <p className="text-xs text-muted-foreground" data-testid="tout-retenir-detail">
              {[
                ...parLangue.map((l) => `${nomLangue(l.langue)} ${l.proposees}`),
                ...(autres > 0 && parLangue.length > 0 ? [t("relectureNative.toutRetenir.autres", { n: autres })] : []),
              ].join(" · ")}
              {parLangue.length > 0 ? ". " : ""}
              {t("relectureNative.toutRetenir.aide")}
            </p>
          </>
        ) : (
          retenues !== null && <p className="text-sm text-success">{t("relectureNative.toutRetenir.fait", { count: retenues })}</p>
        )}
        {n > 0 && retenues !== null && <p className="text-xs text-success">{t("relectureNative.toutRetenir.fait", { count: retenues })}</p>}
        {erreur && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(erreur)}
          </p>
        )}
      </div>
      {n > 0 && (
        <Button
          size="sm"
          disabled={retenir.isPending}
          onClick={() => {
            if (window.confirm(t("relectureNative.toutRetenir.confirmer", { count: n }))) retenir.mutate();
          }}
        >
          <CheckCheck />
          {retenir.isPending ? t("relectureNative.toutRetenir.enCours") : t("relectureNative.toutRetenir.bouton", { count: n })}
        </Button>
      )}
    </div>
  );
}
