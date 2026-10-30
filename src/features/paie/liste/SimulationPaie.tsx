import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { lireDerniereSimulation, type SimulationPaie as TSimulation, simulerPaie } from "@/features/paie/api-upwork/api";

const CATEGORIES = ["payer", "double", "rien", "renommer", "pause", "legacy", "a_la_main", "kill", "kill_sans_paie", "annuler", "warmup", "hors_upwork"] as const;

/**
 * Prompt 26 : la paie du lundi, simulée (rien n'est payé ni financé) : les
 * lignes par action, le total en dollars et ce qui irait dans Needs you, avec
 * la raison. Les milestones sont celles que l'OS a lues (dimanche 20 h, lundi 4 h 30).
 */
export function SimulationPaie() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const derniere = useQuery({ queryKey: ["paie", "simulation"], queryFn: lireDerniereSimulation });
  const simuler = useMutation({
    mutationFn: () => simulerPaie(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["paie", "simulation"] }),
  });
  const s: TSimulation | null = simuler.data ?? derniere.data ?? null;
  const peut = role === "admin" || role === "head_of_ops";
  return (
    <details className="rounded-xl border px-4 py-3 text-sm" data-testid="simulation-paie" open>
      <summary className="cursor-pointer font-medium">
        {t("paie.simulation.titre")}
        {s && <span className="text-muted-foreground"> · {t("paie.simulation.semaine", { semaine: s.semaine })}</span>}
      </summary>
      <div className="space-y-3 pt-3">
        <p className="text-xs text-muted-foreground">{t("paie.simulation.aide")}</p>
        {peut && (
          <Button size="sm" variant="secondary" loading={simuler.isPending} onClick={() => simuler.mutate()} data-testid="simuler-paie">
            {t("paie.simulation.lancer")}
          </Button>
        )}
        {simuler.error && <p className="text-destructive">{(simuler.error as Error).message}</p>}
        {s && (
          <>
            <div className="flex flex-wrap gap-1.5" data-testid="simulation-categories">
              {CATEGORIES.filter((c) => (s.par_categorie[c] ?? 0) > 0).map((c) => (
                <Badge key={c} variant={c === "a_la_main" ? "warning" : "secondary"} data-categorie={c}>
                  {t(`paie.simulation.categories.${c}`)} : {s.par_categorie[c]}
                </Badge>
              ))}
            </div>
            <p className="tabular-nums" data-testid="simulation-total">
              {t("paie.simulation.total", { approuve: s.total.approuve, finance: s.total.finance, total: s.total.total, lignes: s.lignes })}
            </p>
            {s.depasse_plafond_jour && <p className="font-medium text-destructive">{t("paie.simulation.plafondJour", { plafond: s.plafonds.jour })}</p>}
            {s.milestones_lues_le && (
              <p className="text-xs text-muted-foreground">
                {t("paie.simulation.lues", { quand: new Date(s.milestones_lues_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) })}
              </p>
            )}
            {(s.ecarts_comptes ?? []).length > 0 && (
              <div className="space-y-1" data-testid="simulation-ecarts">
                <p className="font-medium text-amber-700 dark:text-amber-400">{t("paie.simulation.ecarts", { n: s.ecarts_comptes!.length })}</p>
                <ul className="divide-y rounded-md border text-xs">
                  {s.ecarts_comptes!.map((e, i) => (
                    <li key={`${e.contrat ?? e.poster}-${i}`} className="flex flex-wrap items-center gap-2 p-2">
                      <span className="font-medium">{e.poster}</span>
                      {e.contrat && (
                        <a className="underline" href={`https://www.upwork.com/nx/wm/workroom/${e.contrat}/overview`} target="_blank" rel="noreferrer">
                          {e.contrat}
                        </a>
                      )}
                      <span className="text-muted-foreground">
                        {t("paie.simulation.ecartLigne", { actifs: e.comptes_actifs, milestone: e.milestone, finances: e.comptes_finances, depot: e.depot })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(s.hors_upwork ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="simulation-hors-upwork">
                {t("paie.simulation.horsUpwork", { n: s.hors_upwork!.length })} : {s.hors_upwork!.join(", ")}
              </p>
            )}
            <p className="font-medium">{t("paie.simulation.needsYou", { n: s.needs_you.length })}</p>
            {s.needs_you.length > 0 && (
              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border text-xs" data-testid="simulation-needs-you">
                {s.needs_you.map((n, i) => (
                  <li key={`${n.contrat ?? n.poster}-${i}`} className="flex flex-wrap items-center gap-2 p-2">
                    <span className="font-medium">{n.poster}</span>
                    {n.lien ? (
                      <a className="underline" href={n.lien} target="_blank" rel="noreferrer">
                        {n.contrat}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{t("paie.simulation.sansContrat")}</span>
                    )}
                    <span className="tabular-nums">{n.montant} $</span>
                    <span className="text-muted-foreground">{n.raison}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </details>
  );
}
