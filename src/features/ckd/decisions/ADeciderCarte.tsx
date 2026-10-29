import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { drapeauPays } from "@/features/moteur/pays";

import { deciderCkd } from "../api";
import { lireADecider } from "./api";
import { decisionDe, GROUPES, groupe, type Groupe } from "./logique";
import { useRaison } from "./useRaison";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";

/**
 * « To decide now » (28 oct.) : un seul bloc, trois groupes (Kill, Double,
 * Recréer). Tout est coché par défaut ; on décoche les exceptions puis
 * « Validate all ». Une case décochée part en Garder / Pas maintenant / Rien.
 */
export function ADeciderCarte() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["ckd", "a-decider"], queryFn: lireADecider });
  const texteRaison = useRaison();
  const [decoches, setDecoches] = React.useState<ReadonlySet<string>>(new Set());
  const [faits, setFaits] = React.useState(0);
  const lignes = liste.data ?? [];
  const valider = useMutation({
    mutationFn: async () => {
      setFaits(0);
      const erreurs: string[] = [];
      // Une à la fois : Recréer et Double passent par la fonction ckd (création de compte, offre).
      for (const p of lignes) {
        try {
          await deciderCkd(p.id, decisionDe(p, !decoches.has(p.id)), null);
        } catch (e) {
          erreurs.push(`${p.poster_nom ?? p.handle ?? p.id} : ${(e as Error).message}`);
        }
        setFaits((x) => x + 1);
      }
      if (erreurs.length) throw new Error(erreurs.join(" · "));
    },
    onSettled: () => {
      setDecoches(new Set());
      void qc.invalidateQueries({ queryKey: ["ckd"] });
    },
  });

  const parGroupe = (g: Groupe) => lignes.filter((p) => groupe(p) === g);
  const coches = lignes.filter((p) => !decoches.has(p.id));
  const compte = (g: Groupe) => coches.filter((p) => groupe(p) === g).length;
  const basculer = (id: string) =>
    setDecoches((avant) => {
      const n = new Set(avant);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const surValider = () => {
    const texte = t("decisions.confirmer", {
      kill: compte("kill"),
      double: compte("double"),
      recreate: compte("recreate"),
      exceptions: decoches.size,
    });
    if (window.confirm(texte)) valider.mutate();
  };

  return (
    <Card data-testid="a-decider">
      <CardHeader>
        <CardTitle>{t("decisions.aDecider.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("decisions.aDecider.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {liste.error && <p className="text-sm text-destructive">{(liste.error as Error).message}</p>}
        {liste.data && lignes.length === 0 && <p className="text-sm text-muted-foreground">{t("decisions.aDecider.vide")}</p>}
        {GROUPES.map((g) => {
          const ps = parGroupe(g);
          if (ps.length === 0) return null;
          return (
            <section key={g} className="space-y-1.5" data-groupe={g}>
              <h3 className="text-sm font-semibold">
                {t(`decisions.groupes.${g}`)} <Badge variant="secondary">{ps.length}</Badge>
              </h3>
              <ul className="divide-y rounded-lg border">
                {ps.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 px-3 py-2 text-sm" data-proposition={p.id}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!decoches.has(p.id)}
                      onChange={() => basculer(p.id)}
                      aria-label={t("decisions.aDecider.cocher", { nom: p.poster_nom ?? p.handle ?? "—" })}
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-1.5">
                        <span className="font-medium">{p.poster_nom ?? "—"}</span>
                        {p.handle && <HandleTiktok handle={p.handle} className="font-normal text-muted-foreground" />}
                        {p.pays && <span className="text-muted-foreground">{drapeauPays(p.pays)} {p.pays}</span>}
                        {p.hm_prenom && <span className="text-muted-foreground">· {p.hm_prenom}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{texteRaison(p)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {lignes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={valider.isPending} onClick={surValider}>
              {t("decisions.aDecider.valider", { n: lignes.length })}
            </Button>
            {valider.isPending && <span className="text-sm text-muted-foreground">{t("decisions.aDecider.progres", { n: faits, total: lignes.length })}</span>}
            {valider.error && <span className="text-sm text-destructive">{(valider.error as Error).message}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
