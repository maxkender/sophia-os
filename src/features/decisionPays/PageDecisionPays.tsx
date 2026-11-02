import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Sparkline } from "@/components/charts/Sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { fixerObjectifPays, lireComptesPays, lireTableauPays } from "./api";
import {
  ciblesParHm,
  type LignePays,
  lignesPays,
  type Periode,
  PERIODES,
  type Recommandation,
  semainesCompletes,
  type TableauPays,
  totaux,
} from "./logique";

type Colonne =
  | "pays" | "vues" | "proceeds" | "rpm" | "rpm_new" | "roi" | "cout" | "cout_1000_vues" | "vues_par_compte"
  | "pct_sous_seuil" | "pipeline" | "objectif" | "manque";

const COLONNES: Colonne[] = [
  "pays", "vues", "proceeds", "rpm", "rpm_new", "roi", "cout", "cout_1000_vues", "vues_par_compte", "pct_sous_seuil",
  "pipeline", "objectif", "manque",
];

const VARIANTE: Record<Recommandation, "success" | "secondary" | "warning" | "destructive" | "outline"> = {
  recruter: "success",
  maintenir: "secondary",
  reduire: "warning",
  arreter: "destructive",
  exclu: "outline",
};

function nombre(n: number | null, langue: string, decimales = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(localeDate(langue), { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);
}

function euros(n: number | null, langue: string, devise: string): string {
  if (n === null) return "—";
  return new Intl.NumberFormat(localeDate(langue), { style: "currency", currency: devise || "EUR", maximumFractionDigits: 0 }).format(n);
}

function valeur(l: LignePays, c: Colonne): number | string {
  if (c === "pays") return l.pays;
  const v = l[c];
  return typeof v === "number" ? v : -Infinity;
}

function Chiffre({ titre, valeur: v, aide }: { titre: string; valeur: string; aide?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{titre}</p>
        <p className="text-2xl font-semibold tabular-nums">{v}</p>
        {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
      </CardContent>
    </Card>
  );
}

function DetailPays({ ligne, t: tab, devise }: { ligne: LignePays; t: TableauPays; devise: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const qc = useQueryClient();
  const comptes = useQuery({ queryKey: ["decision-pays", "comptes", ligne.pays], queryFn: () => lireComptesPays(ligne.pays) });
  const [objectif, setObjectif] = React.useState<string>(ligne.objectif_manuel ? String(ligne.objectif) : "");
  const enregistrer = useMutation({
    mutationFn: () => fixerObjectifPays(ligne.pays, objectif.trim() === "" ? null : Math.max(0, Math.round(Number(objectif))), ligne.info.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decision-pays"] }),
  });
  const semaines = semainesCompletes(tab.lundi, 12);
  const serie = semaines.map((w) => tab.semaines.find((s) => s.pays === ligne.pays && s.semaine === w));
  const vues = serie.map((s) => s?.vues ?? 0);
  const proceeds = serie.map((s) => s?.proceeds ?? 0);
  const rpm = serie.map((s) => (s && s.vues ? (s.proceeds / s.vues) * 1000 : null));
  const dernier = (xs: (number | null)[]) => xs[xs.length - 1] ?? null;

  return (
    <Card data-testid="detail-pays">
      <CardHeader>
        <CardTitle className="text-base">{t("decisionPays.detail.titre", { pays: ligne.pays })}</CardTitle>
        <CardDescription>{ligne.raison}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            ["vues", vues, nombre(dernier(vues), langue)],
            ["proceeds", proceeds, euros(dernier(proceeds), langue, devise)],
            ["rpm", rpm, nombre(dernier(rpm), langue, 2)],
          ] as const).map(([cle, xs, fin]) => (
            <div key={cle} className="space-y-1 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t(`decisionPays.detail.courbe.${cle}`)}</p>
              <p className="font-semibold tabular-nums">{fin}</p>
              <Sparkline values={xs as (number | null)[]} height={64} />
            </div>
          ))}
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>{t("decisionPays.detail.file", {
            actifs: ligne.actifs, cohorte: ligne.info.cohorte_en_cours, suivante: ligne.info.cohorte_suivante,
            offres: ligne.offres, mardi: ligne.info.start_tuesday, postpone: ligne.info.postpone,
          })}</p>
          <p>{t("decisionPays.detail.baseline", {
            baseline: ligne.baseline === null ? "—" : euros(ligne.baseline, langue, devise),
            premier: ligne.info.premier_post ?? "—",
          })}</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrer.mutate();
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">{t("decisionPays.detail.objectif", { suggere: ligne.objectif_suggere })}</span>
            <input
              type="number"
              min={0}
              className="h-9 w-28 rounded-md border bg-background px-2"
              value={objectif}
              placeholder={String(ligne.objectif_suggere)}
              onChange={(e) => setObjectif(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" disabled={enregistrer.isPending}>{t("decisionPays.detail.enregistrer")}</Button>
          {enregistrer.isError && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
        </form>
        <div>
          <p className="mb-1 text-sm font-medium">{t("decisionPays.detail.comptes", { n: comptes.data?.length ?? 0 })}</p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">{t("decisionPays.detail.compte")}</th>
                  <th className="px-2 py-1">{t("decisionPays.detail.posteur")}</th>
                  <th className="px-2 py-1 text-right">{t("decisionPays.detail.vuesSemaine")}</th>
                  <th className="px-2 py-1">{t("decisionPays.detail.tendance")}</th>
                </tr>
              </thead>
              <tbody>
                {(comptes.data ?? []).map((c) => {
                  const xs = semainesCompletes(tab.lundi, 8).map((w) => c.semaines.find((s) => s.semaine === w)?.vues ?? 0);
                  return (
                    <tr key={c.compte_id} className={cn("border-t", !c.actif && "text-muted-foreground")}>
                      <td className="px-2 py-1">@{c.handle ?? "—"}{!c.actif && ` · ${t("decisionPays.detail.inactif")}`}</td>
                      <td className="px-2 py-1">{c.poster_nom ?? "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{nombre(xs[xs.length - 1] ?? 0, langue)}</td>
                      <td className="w-32 px-2 py-1"><Sparkline values={xs} height={20} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Page « Pays » (2/11) : le tableau de décision par pays (vues, proceeds
 * RevenueCat, RPM, ROI de la paie, file de recrutement). Lecture seule, sauf
 * l'objectif de comptes réglé à la main. « Préparer les objectifs des HM »
 * prépare un texte, n'envoie rien.
 */
export function PageDecisionPays() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const lu = useQuery({ queryKey: ["decision-pays", "tableau"], queryFn: lireTableauPays });
  const [periode, setPeriode] = React.useState<Periode>("28j");
  const [zone, setZone] = React.useState<string>("tout");
  const [tri, setTri] = React.useState<{ c: Colonne; desc: boolean }>({ c: "proceeds", desc: true });
  const [choisi, setChoisi] = React.useState<string | null>(null);
  const [cibles, setCibles] = React.useState(false);

  if (lu.isLoading) return <p className="text-sm text-muted-foreground">{t("decisionPays.chargement")}</p>;
  if (lu.error || !lu.data) return <p className="text-sm text-destructive">{(lu.error as Error | undefined)?.message ?? "—"}</p>;

  const tab = lu.data;
  const devise = tab.devise ?? "EUR";
  const toutes = lignesPays(tab, periode);
  const lignes = toutes
    .filter((l) => zone === "tout" || l.zone === zone)
    .sort((a, b) => {
      const va = valeur(a, tri.c);
      const vb = valeur(b, tri.c);
      const ordre = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return tri.desc ? -ordre : ordre;
    });
  const tot = totaux(lignes);
  const detail = choisi ? toutes.find((l) => l.pays === choisi) ?? null : null;
  const prep = ciblesParHm(lignes, tab.hms);
  const texteCibles = [
    ...prep.cibles.map((c) => `${c.hm.nom ?? c.hm.id} : ${c.lignes.map((l) => `${l.pays} +${l.nombre}`).join(", ")} (${c.total})`),
    ...(prep.sansHm.length ? [`${t("decisionPays.cibles.sansHm")} : ${prep.sansHm.map((l) => `${l.pays} +${l.nombre}`).join(", ")}`] : []),
  ].join("\n");

  return (
    <div className="space-y-4" data-testid="page-decision-pays">
      <div>
        <h1 className="text-xl font-semibold">{t("decisionPays.titre")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("decisionPays.sous", {
            devise,
            taux: tab.reglages.taux_usd_eur ?? 0.86,
            seuil: tab.reglages.seuil_vues_semaine ?? 1000,
            lu: tab.lecture?.at ? new Date(tab.lecture.at).toLocaleString(localeDate(langue), { dateStyle: "short", timeStyle: "short" }) : "—",
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="group">
          {PERIODES.map((p) => (
            <button key={p} type="button" onClick={() => setPeriode(p)}
              className={cn("rounded px-3 py-1", periode === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t(`decisionPays.periode.${p}`)}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="group">
          {["tout", "A", "B", "C"].map((z) => (
            <button key={z} type="button" onClick={() => setZone(z)}
              className={cn("rounded px-3 py-1", zone === z ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {z === "tout" ? t("decisionPays.zones") : t("decisionPays.zone", { zone: z })}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setCibles((x) => !x)}>{t("decisionPays.cibles.bouton")}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <Chiffre titre={t("decisionPays.kpi.proceeds")} valeur={euros(tot.proceeds, langue, devise)} />
        <Chiffre titre={t("decisionPays.kpi.vues")} valeur={nombre(tot.vues, langue)} />
        <Chiffre titre={t("decisionPays.kpi.rpm")} valeur={nombre(tot.rpm, langue, 2)} />
        <Chiffre titre={t("decisionPays.kpi.roi")} valeur={nombre(tot.roi, langue, 2)} aide={t("decisionPays.kpi.roiAide")} />
        <Chiffre titre={t("decisionPays.kpi.recruter")} valeur={nombre(tot.a_recruter, langue)} />
      </div>

      {cibles && (
        <Card data-testid="cibles-hm">
          <CardHeader>
            <CardTitle className="text-base">{t("decisionPays.cibles.titre")}</CardTitle>
            <CardDescription>{t("decisionPays.cibles.aide")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{texteCibles || t("decisionPays.cibles.rien")}</pre>
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(texteCibles)}>{t("decisionPays.cibles.copier")}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="tableau-pays">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {COLONNES.map((c) => (
                  <th key={c} className={cn("cursor-pointer whitespace-nowrap px-2 py-2", c !== "pays" && "text-right")}
                    onClick={() => setTri((x) => ({ c, desc: x.c === c ? !x.desc : c !== "pays" }))}>
                    {t(`decisionPays.col.${c}`)}{tri.c === c ? (tri.desc ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="px-2 py-2">{t("decisionPays.col.tendance")}</th>
                <th className="px-2 py-2">{t("decisionPays.col.reco")}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.pays} onClick={() => setChoisi(l.pays === choisi ? null : l.pays)}
                  className={cn("cursor-pointer border-t hover:bg-muted/30", l.revenu_sans_posteurs && "text-muted-foreground", choisi === l.pays && "bg-muted/40")}>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{l.pays}{l.zone ? <span className="ml-1 text-xs text-muted-foreground">{l.zone}</span> : null}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.vues, langue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euros(l.proceeds, langue, devise)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.rpm, langue, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.rpm_new, langue, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.roi, langue, 1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euros(l.cout, langue, devise)}{l.cout_estime ? "*" : ""}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.cout_1000_vues, langue, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(l.vues_par_compte, langue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.pct_sous_seuil === null ? "—" : `${l.pct_sous_seuil} %`}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.pipeline}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.objectif}{l.objectif_manuel ? "" : "°"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.manque > 0 ? `+${l.manque}` : l.manque}</td>
                  <td className="w-28 px-2 py-1.5"><Sparkline values={l.sparkline} height={20} /></td>
                  <td className="px-2 py-1.5">
                    <Badge variant={VARIANTE[l.recommandation]} title={l.raison}>
                      {t(`decisionPays.reco.${l.recommandation}`, { n: Math.max(0, l.manque) })}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted-foreground">{t("decisionPays.legende")}</p>
        </CardContent>
      </Card>

      {detail && <DetailPays key={detail.pays} ligne={detail} t={tab} devise={devise} />}
    </div>
  );
}
