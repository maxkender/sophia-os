import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { drapeauPays } from "@/features/moteur/pays";

import { deciderCkd, type DecisionCkd } from "../api";
import { lireADecider, type ADecider } from "./api";
import { decisionDe, groupe, type Groupe } from "./logique";
import { useRaison } from "./useRaison";

/**
 * Prompt 22, partie 5 : une carte par compte, une phrase et 2 boutons. Rien
 * n'est coché par défaut : chaque compte attend un clic. Le « oui » (Kill,
 * Double, Recreate) passe par une confirmation ; le « non » envoie l'exception
 * permise (Garder, Pas maintenant, Rien), comme « À décider maintenant ».
 */
export function CartesDecision({ groupes, testid }: { groupes: readonly Groupe[]; testid: string }) {
  const { t } = useTranslation();
  const liste = useQuery({ queryKey: ["ckd", "a-decider"], queryFn: lireADecider });
  const lignes = (liste.data ?? []).filter((p) => groupes.includes(groupe(p)));
  return (
    <section className="space-y-3" data-testid={testid}>
      {liste.error && <p className="text-sm text-destructive">{(liste.error as Error).message}</p>}
      {liste.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {liste.data && lignes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("autoOnglets.decisions.cartes.vide")}</p>
      )}
      {groupes.map((g) => {
        const ps = lignes.filter((p) => groupe(p) === g);
        if (ps.length === 0) return null;
        return (
          <div key={g} className="space-y-2" data-groupe={g}>
            <h3 className="text-sm font-semibold">
              {t(`decisions.groupes.${g}`)} <Badge variant="secondary">{ps.length}</Badge>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {ps.map((p) => (
                <CarteCompte key={p.id} p={p} g={g} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CarteCompte({ p, g }: { p: ADecider; g: Groupe }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const texteRaison = useRaison();
  const nom = p.poster_nom ?? p.handle ?? "—";
  const decider = useMutation({
    mutationFn: (d: DecisionCkd) => deciderCkd(p.id, d, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ckd"] }),
  });
  const oui = () => {
    if (window.confirm(t(`autoOnglets.decisions.cartes.confirmer.${g}`, { nom }))) decider.mutate(p.action);
  };
  return (
    <Card data-proposition={p.id} data-testid={`carte-decision-${p.handle ?? p.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-1.5 text-base">
          <span>{nom}</span>
          {p.handle && <span className="text-sm font-normal text-muted-foreground">@{p.handle}</span>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {[p.pays ? `${drapeauPays(p.pays)} ${p.pays}` : null, p.hm_prenom].filter(Boolean).join(" · ")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{texteRaison(p)}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={g === "kill" ? "destructive" : "default"}
            disabled={decider.isPending}
            onClick={oui}
          >
            {t(`autoOnglets.decisions.cartes.oui.${g}`)}
          </Button>
          <Button size="sm" variant="outline" disabled={decider.isPending} onClick={() => decider.mutate(decisionDe(p, false))}>
            {t(`autoOnglets.decisions.cartes.non.${g}`)}
          </Button>
        </div>
        {decider.error && <p className="text-xs text-destructive">{(decider.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
