import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { nomsHms } from "@/features/paie/api";
import { dollars } from "@/features/paie/logique";
import { Case } from "@/features/paie/TableauPaie";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import {
  enregistrerReglagesBonus,
  genererBonus,
  lireBonus,
  lireReglagesBonus,
  marquerBonusPaye,
  type ReglagesBonus,
  type StatutBonus,
} from "./api";
import { lundisBonus, totauxBonus } from "./logique";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const TH = "px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2.5 align-middle";

const VARIANTE: Record<StatutBonus, "success" | "warning" | "outline"> = {
  paye: "success",
  a_voir: "warning",
  a_payer: "outline",
};

/** Les réglages des bonus, modifiables par l'admin et le Head of Ops (reglages.bonus). */
function FormReglages({ reglages }: { reglages: ReglagesBonus }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [r, setR] = React.useState(reglages);
  React.useEffect(() => setR(reglages), [reglages]);
  const enregistrer = useMutation({
    mutationFn: () => enregistrerReglagesBonus(r),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reglages", "bonus"] });
      void queryClient.invalidateQueries({ queryKey: ["paie", "bonus"] });
    },
  });
  const pasLundi = new Date(`${r.premier_lundi}T12:00:00Z`).getUTCDay() !== 1;
  const champ = (cle: keyof ReglagesBonus, type: "number" | "date", pas?: string) => (
    <label key={cle} className="space-y-1 text-sm">
      <span className="block text-xs text-muted-foreground">{t(`bonus.reglages.${cle}`)}</span>
      <Input
        type={type}
        step={pas}
        min={type === "number" ? 0 : undefined}
        value={String(r[cle])}
        onChange={(e) =>
          setR({ ...r, [cle]: type === "number" ? Number(e.target.value) : e.target.value } as ReglagesBonus)
        }
        aria-label={t(`bonus.reglages.${cle}`)}
      />
      {(cle === "parrainage_montant" || cle === "comment_master_par_commentaire") && Number(r[cle]) <= 0 && (
        <span className="block text-xs text-warning-foreground">{t("bonus.reglages.montantVide")}</span>
      )}
      {cle === "premier_lundi" && pasLundi && (
        <span className="block text-xs text-destructive">{t("bonus.reglages.pasLundi")}</span>
      )}
    </label>
  );
  return (
    <details className="rounded-xl border px-3 py-2" data-testid="reglages-bonus">
      <summary className="cursor-pointer text-sm font-medium">{t("bonus.reglages.titre")}</summary>
      <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        {champ("parrainage_montant", "number", "0.01")}
        {champ("parrainage_semaines_min", "number", "1")}
        {champ("parrainage_posts_min_semaine", "number", "1")}
        {champ("comment_master_par_commentaire", "number", "0.01")}
        {champ("premier_lundi", "date")}
      </div>
      <div className="flex items-center gap-2 pt-3">
        <Button size="sm" disabled={enregistrer.isPending || pasLundi} onClick={() => enregistrer.mutate()}>
          {t("bonus.reglages.enregistrer")}
        </Button>
        {enregistrer.isSuccess && <span className="text-xs text-success-foreground">{t("bonus.reglages.enregistre")}</span>}
        {enregistrer.isError && <span className="text-xs text-destructive">{(enregistrer.error as Error).message}</span>}
      </div>
    </details>
  );
}

/**
 * La section « Bonus » de la paie (0374), pour l'admin et le Head of Ops : les
 * bonus d'un lundi bonus, la consigne de paiement, la case « Payé », les
 * réglages. Une ligne sans contrat Upwork est « À voir ».
 */
export function SectionBonus() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const queryClient = useQueryClient();
  const aujourdhui = aujourdhuiParis();
  const reglages = useQuery({ queryKey: ["reglages", "bonus"], queryFn: lireReglagesBonus });
  const lundis = reglages.data ? lundisBonus(aujourdhui, reglages.data.premier_lundi) : [];
  const [choix, setChoix] = React.useState<string | null>(null);
  const lundi = choix && lundis.includes(choix) ? choix : (lundis[0] ?? null);

  const bonus = useQuery({
    queryKey: ["paie", "bonus", lundi],
    enabled: Boolean(lundi),
    queryFn: async () => {
      const lignes = await lireBonus(lundi!);
      return { lignes, noms: await nomsHms([...new Set(lignes.map((l) => l.poster_id))]) };
    },
  });
  const recalculer = useMutation({
    mutationFn: () => genererBonus(lundi!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["paie", "bonus"] }),
  });

  const fmt = (d: string) =>
    new Intl.DateTimeFormat(localeDate(langue), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const lignes = bonus.data?.lignes ?? [];
  const tot = totauxBonus(lignes);
  const passe = lundi !== null && lundi <= aujourdhui;

  return (
    <Card data-testid="section-bonus">
      <CardHeader>
        <CardTitle>{lundi ? t("bonus.titre", { date: fmt(lundi) }) : t("bonus.reglages.titre")}</CardTitle>
        {lundi && (
          <CardDescription>
            {t("bonus.desc", { debut: fmt(ajouterJours(lundi, -28)), fin: fmt(ajouterJours(lundi, -1)) })}
          </CardDescription>
        )}
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium">
          {t("bonus.consigne")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {lundis.length > 1 && (
            <select
              className={selectClass}
              value={lundi ?? ""}
              onChange={(e) => setChoix(e.target.value)}
              aria-label={t("bonus.lundi")}
            >
              {lundis.map((l) => (
                <option key={l} value={l}>
                  {fmt(l)}
                </option>
              ))}
            </select>
          )}
          {passe && (
            <Button variant="outline" size="sm" disabled={recalculer.isPending} onClick={() => recalculer.mutate()}>
              <RefreshCw />
              {t("bonus.recalculer")}
            </Button>
          )}
          {recalculer.data !== undefined && (
            <span className="text-xs text-muted-foreground">{t("bonus.recalcule", { n: recalculer.data })}</span>
          )}
          {recalculer.isError && <span className="text-xs text-destructive">{(recalculer.error as Error).message}</span>}
          {lignes.length > 0 && (
            <span className="ml-auto text-sm tabular-nums">
              {t("bonus.total", { total: dollars(tot.total, langue), aPayer: dollars(tot.aPayer, langue) })}
            </span>
          )}
        </div>
        {tot.aVoir > 0 && (
          <p className="rounded-md border border-warning/50 bg-warning/8 px-3 py-2 text-sm">
            {t("bonus.aVoirN", { count: tot.aVoir })}
          </p>
        )}

        {bonus.error && <p className="text-sm text-destructive">{(bonus.error as Error).message}</p>}
        {bonus.data && lignes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {passe ? t("bonus.aucun") : t("bonus.pasEncore", { date: fmt(lundi!) })}
          </p>
        )}
        {lignes.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  {(["posteur", "type", "detail", "montant", "contrat", "paye"] as const).map((c) => (
                    <th key={c} className={TH}>
                      {t(`bonus.cols.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {lignes.map((l) => (
                  <tr key={l.id} data-bonus={l.id} className={cn(l.statut === "a_voir" && "bg-warning/5")}>
                    <td className={cn(TD, "font-medium")}>{bonus.data!.noms.get(l.poster_id) ?? "—"}</td>
                    <td className={TD}>{t(`bonus.types.${l.type}`)}</td>
                    <td className={TD}>
                      <p>{l.detail}</p>
                      {l.type === "comment_master" && l.verifies !== null && (
                        <p className="text-xs text-muted-foreground">{t("bonus.verifies", { n: l.verifies })}</p>
                      )}
                    </td>
                    <td className={cn(TD, "font-semibold tabular-nums")}>{dollars(l.montant, langue)}</td>
                    <td className={TD}>
                      {l.contrat_url ? (
                        <a
                          href={l.contrat_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                        >
                          {t("bonus.contrat")}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <Badge variant="warning">{t("bonus.sansContrat")}</Badge>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <Case
                          coche={l.statut === "paye"}
                          libelle={t("bonus.statuts.paye")}
                          aideAnnuler={t("bonus.statuts.paye")}
                          basculer={(paye) => marquerBonusPaye(l.id, paye)}
                        />
                        {l.statut !== "paye" && <Badge variant={VARIANTE[l.statut]}>{t(`bonus.statuts.${l.statut}`)}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reglages.data && <FormReglages reglages={reglages.data} />}
      </CardContent>
    </Card>
  );
}
