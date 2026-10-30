import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";

import { lireAFinancer, relireAFinancer } from "./api";

/**
 * 0467 : « To fund by hand ». La semaine est payée par l'API ; la milestone
 * suivante, Upwork ne la finance pas par l'API (compte non enterprise : le
 * financement attend une confirmation sur Upwork). Posteur, montant, lien ;
 * relue toutes les heures, elle sort de la liste dès qu'elle est financée.
 */
export function ListeAFinancer() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["paie", "a-financer"], queryFn: lireAFinancer });
  const relire = useMutation({
    mutationFn: relireAFinancer,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["paie", "a-financer"] }),
  });
  const liste = lu.data ?? [];
  if (!lu.isPending && liste.length === 0 && !lu.error) return null;
  const total = liste.reduce((n, l) => n + Number(l.montant ?? 0), 0);
  return (
    <Card data-testid="a-financer-main">
      <CardHeader>
        <CardTitle className="text-base">{t("paie.aFinancer.titre", { n: liste.length, total: Math.round(total * 100) / 100 })}</CardTitle>
        <CardDescription>{t("paie.aFinancer.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {(role === "admin" || role === "head_of_ops") && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" loading={relire.isPending} onClick={() => relire.mutate()}>
              {t("paie.aFinancer.relire")}
            </Button>
            {relire.data && <span className="text-xs text-muted-foreground">{t("paie.aFinancer.relu", relire.data)}</span>}
            {relire.error && <span className="text-xs text-destructive">{(relire.error as Error).message}</span>}
          </div>
        )}
        <ul className="divide-y rounded-md border">
          {liste.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-2" data-a-financer={l.jalon_id}>
              <span className="font-medium">{l.poster_nom ?? "—"}</span>
              <span>{l.nom ?? "milestone"}</span>
              <span className="tabular-nums">{l.montant ?? "?"} $</span>
              <a className="underline" href={l.lien} target="_blank" rel="noreferrer">
                {t("paie.aFinancer.ouvrir", { contrat: l.contrat_id })}
              </a>
              <span className="text-xs text-muted-foreground">{t("paie.aFinancer.etat", { etat: l.etat_lu ?? "?" })}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
