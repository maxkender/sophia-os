import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { semaineIso } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { localeDate } from "@/locales/localeDate";

import { listerDecisionsHm, listerRecrutementHm, marquerFaitHm, type DecisionHm } from "./api";
import { DiagnosticCompte } from "./DiagnosticCompte";

const CLE = ["accueil-hm", "samedi"] as const;

function LigneDecision({ d }: { d: DecisionHm }) {
  const { t, i18n } = useTranslation();
  // Double (0369) : le 2ᵉ compte démarre le lundi J+9 du samedi du contrôle.
  const lundiDouble = ajouterJours(d.jour, 9);
  const consigne = t(`ckd.decisionsHm.consignes.${d.decision}`, {
    handle: d.nouveau_handle ?? "?",
    date: new Intl.DateTimeFormat(localeDate(i18n.language), { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(`${lundiDouble}T12:00:00Z`)),
    semaine: semaineIso(lundiDouble),
  });
  const queryClient = useQueryClient();
  const fait = useMutation({
    mutationFn: () => marquerFaitHm(d.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0" data-testid={`decision-hm-${d.handle}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={d.decision === "doubler" ? "success" : d.decision === "recreer" ? "info" : "error"}>
          {t(`ckd.decisionsHm.decisions.${d.decision}`)}
        </Badge>
        {d.handle && (
          <a
            href={`https://www.tiktok.com/@${d.handle}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {drapeauPays(d.pays)} @{d.handle}
          </a>
        )}
        {d.nouveau_handle && (
          <span className="text-muted-foreground">{t("ckd.decisionsHm.nouveau", { handle: d.nouveau_handle })}</span>
        )}
        <span className="ml-auto">
          {d.fait_at ? (
            <Badge variant="success">
              <Check className="size-3" />
              {t("ckd.decisionsHm.fait")}
            </Badge>
          ) : (
            <Button size="sm" disabled={fait.isPending} onClick={() => fait.mutate()}>
              {t("ckd.decisionsHm.marquerFait")}
            </Button>
          )}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{consigne}</p>
      {d.note && <p className="text-xs italic text-muted-foreground">{d.note}</p>}
      <DiagnosticCompte diagnostic={d.diagnostic} />
      {fait.error && <p className="text-xs text-destructive">{(fait.error as Error).message}</p>}
    </div>
  );
}

/** Dashboard HM : les décisions du samedi à appliquer et la liste de recrutement (0364). */
export function SectionsSamediHm() {
  const { t, i18n } = useTranslation();
  const donnees = useQuery({
    queryKey: CLE,
    queryFn: async () => {
      const [decisions, recrues] = await Promise.all([listerDecisionsHm(), listerRecrutementHm()]);
      return { decisions, recrues };
    },
  });
  const date = (j: string) =>
    new Date(`${j}T12:00:00Z`).toLocaleDateString(localeDate(i18n.resolvedLanguage), { day: "numeric", month: "short" });
  const aFaire = (donnees.data?.decisions ?? []).filter((d) => !d.fait_at).length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {t("ckd.decisionsHm.titre")}
            {aFaire > 0 && ` · ${t("ckd.decisionsHm.aFaire", { n: aFaire })}`}
          </CardTitle>
          <CardDescription>{t("ckd.decisionsHm.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {donnees.error ? (
            <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>
          ) : (donnees.data?.decisions.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("ckd.decisionsHm.vide")}</p>
          ) : (
            <div className="divide-y">
              {donnees.data!.decisions.map((d) => (
                <LigneDecision key={d.id} d={d} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("ckd.recrutementHm.titre")}</CardTitle>
          <CardDescription>{t("ckd.recrutementHm.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {(donnees.data?.recrues.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("ckd.recrutementHm.vide")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {donnees.data!.recrues.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {drapeauPays(r.pays)} {nomPaysIso(r.pays)}
                  </span>
                  <span>{t("ckd.recrutementHm.nombre", { count: r.nombre })}</span>
                  <span className="text-muted-foreground">{t("ckd.recrutementHm.cohorte", { date: date(r.cohorte) })}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
