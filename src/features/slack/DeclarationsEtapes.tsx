import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { deciderDeclaration, lireDeclarationsEtapes, type DeclarationEtape } from "./api";
import { slackMotsProches } from "./logique";

/**
 * 0497 : les étapes que les recrues disent avoir faites (« I've joined »,
 * « I did this step ») et que l'OS ne voit pas. Slack : on choisit le membre
 * (les plus proches du nom en premier) ; les autres : Confirm ou Refuse.
 */
export function DeclarationsEtapes() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["slack-relier", "declarations"], queryFn: lireDeclarationsEtapes });
  const decider = useMutation({
    mutationFn: (v: { d: DeclarationEtape; valide: boolean; slack?: string }) =>
      deciderDeclaration(v.d.poster_id, v.d.etape, v.valide, v.slack),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["slack-relier"] }),
  });
  const lignes = liste.data ?? [];
  if (lignes.length === 0) return null;
  return (
    <Card data-testid="declarations-etapes">
      <CardContent className="space-y-2 p-3">
        <p className="font-semibold text-sm">{t("slackRelier.declarations.titre", { count: lignes.length })}</p>
        {decider.error && <p className="text-destructive text-sm">{(decider.error as Error).message}</p>}
        <ul className="divide-y">
          {lignes.map((d) => {
            const candidats = [...(d.candidats ?? [])].sort(
              (a, b) => Number(slackMotsProches(b.nom, d.nom)) - Number(slackMotsProches(a.nom, d.nom)),
            );
            return (
              <li key={`${d.poster_id}:${d.etape}`} className="space-y-1.5 py-2 text-sm" data-declaration={d.etape}>
                <p>
                  <span className="font-medium">{d.nom ?? "—"}</span>
                  <span className="text-muted-foreground"> · {t(`slackRelier.declarations.etape.${d.etape}`)}</span>
                  {d.note && <span className="text-muted-foreground"> · « {d.note} »</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {d.etape === "slack" &&
                    candidats.slice(0, 6).map((c) => (
                      <Button
                        key={c.slack_user_id}
                        size="sm"
                        variant={slackMotsProches(c.nom, d.nom) ? "secondary" : "outline"}
                        disabled={decider.isPending}
                        onClick={() => {
                          if (window.confirm(t("slackRelier.confirmRelier", { nom: d.nom ?? "—", slack: c.nom ?? c.slack_user_id })))
                            decider.mutate({ d, valide: true, slack: c.slack_user_id });
                        }}
                      >
                        <Link2 className="size-3.5" />
                        {c.nom ?? c.slack_user_id}
                      </Button>
                    ))}
                  {d.etape !== "slack" && (
                    <Button size="sm" disabled={decider.isPending} onClick={() => decider.mutate({ d, valide: true })}>
                      <Check className="size-3.5" />
                      {t("slackRelier.declarations.confirmer")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={decider.isPending} onClick={() => decider.mutate({ d, valide: false })}>
                    <X className="size-3.5" />
                    {t("slackRelier.declarations.refuser")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
