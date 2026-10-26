import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { aujourdhuiParis, semaineIso } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { genererPaie, lirePaie, nomsHms } from "@/features/paie/api";
import { dollars, parHm, semaineAPayer, totaux } from "@/features/paie/logique";
import { TableauPaie } from "@/features/paie/TableauPaie";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Admin → Paie : toutes les HMs, filtre par HM, total par HM et total général (0362). */
export function AdminPaiePage() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const queryClient = useQueryClient();
  const [semaine, setSemaine] = React.useState(() => semaineAPayer(aujourdhuiParis()));
  const [filtreHm, setFiltreHm] = React.useState("");

  const donnees = useQuery({
    queryKey: ["paie", "admin", semaine],
    queryFn: async () => {
      const lignes = await lirePaie(semaine);
      const hms = [...new Set(lignes.map((l) => l.poster?.manager_id).filter((x): x is string => Boolean(x)))];
      return { lignes, noms: await nomsHms(hms) };
    },
  });
  const recalculer = useMutation({
    mutationFn: () => genererPaie(semaine),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });

  const groupes = parHm(donnees.data?.lignes ?? []);
  const visibles = filtreHm ? groupes.filter((g) => (g.hmId ?? "aucun") === filtreHm) : groupes;
  const general = totaux(donnees.data?.lignes ?? []);
  const nomHm = (id: string | null) => (id ? (donnees.data?.noms.get(id) ?? "—") : t("paie.sansHm"));
  const fin = ajouterJours(semaine, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("paie.titreAdmin")}</h1>
        <p className="text-sm text-muted-foreground">{t("paie.sousAdmin")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label={t("paie.semainePrecedente")} onClick={() => setSemaine((s) => ajouterJours(s, -7))}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium">
          {t("paie.semaine", { numero: semaineIso(semaine), debut: semaine, fin })}
        </span>
        <Button size="icon" variant="ghost" aria-label={t("paie.semaineSuivante")} onClick={() => setSemaine((s) => ajouterJours(s, 7))}>
          <ChevronRight />
        </Button>
        <select
          className={selectClass}
          value={filtreHm}
          onChange={(e) => setFiltreHm(e.target.value)}
          aria-label={t("paie.filtreHm")}
        >
          <option value="">{t("paie.toutesHms")}</option>
          {groupes.map((g) => (
            <option key={g.hmId ?? "aucun"} value={g.hmId ?? "aucun"}>
              {nomHm(g.hmId)}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" disabled={recalculer.isPending} onClick={() => recalculer.mutate()}>
          <RefreshCw />
          {t("paie.recalculer")}
        </Button>
        {recalculer.data !== undefined && (
          <span className="text-xs text-muted-foreground">{t("paie.recalcule", { n: recalculer.data })}</span>
        )}
        {recalculer.error && <span className="text-xs text-destructive">{(recalculer.error as Error).message}</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("paie.totalGeneral", { total: dollars(general.total, langue) })}</CardTitle>
          <CardDescription>
            {t("paie.resume", {
              reste: dollars(general.resteAPayer, langue),
              aPayer: general.aPayer,
              payees: general.payees,
              lignes: donnees.data?.lignes.length ?? 0,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm">
            {groupes.map((g) => (
              <span key={g.hmId ?? "aucun"} className="rounded-md border px-2 py-1">
                {nomHm(g.hmId)} : <strong>{dollars(g.totaux.total, langue)}</strong>
                {g.totaux.resteAPayer > 0 && (
                  <span className="text-muted-foreground"> ({t("paie.reste", { reste: dollars(g.totaux.resteAPayer, langue) })})</span>
                )}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <BarreChargement actif={donnees.isLoading} />
      {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
      {donnees.data && donnees.data.lignes.length === 0 && <p className="text-sm text-muted-foreground">{t("paie.videAdmin")}</p>}

      {visibles.map((g) => (
        <Card key={g.hmId ?? "aucun"}>
          <CardHeader>
            <CardTitle>
              {nomHm(g.hmId)} · {dollars(g.totaux.total, langue)}
            </CardTitle>
            <CardDescription>{t("paie.reste", { reste: dollars(g.totaux.resteAPayer, langue) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <TableauPaie lignes={g.lignes} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
