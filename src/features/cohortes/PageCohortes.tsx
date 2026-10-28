import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Link2, Link2Off, Mail, Minus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { drapeauPays } from "@/features/moteur/pays";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { arreterRecrue, lireCohortes, lireRecrues, reporterRecrue, type RecrueCohorte } from "./api";
import {
  caseEtape,
  cohortesParDefaut,
  entonnoir,
  estRouge,
  ETAPES_ENTONNOIR,
  filtrer,
  FOLLOWS_MIN,
  phaseCohorte,
  pretLundi,
  quatreDernieres,
  samediRecrue,
  tableauHm,
  type Case,
  type EtapeCohorte,
  type FiltresCohorte,
} from "./logique";

const CLE = ["cohortes"] as const;
const TH = "px-2 py-2 text-left text-xs font-medium text-muted-foreground";
const TD = "px-2 py-2 align-top text-sm";

function useDates() {
  const { i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const jour = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "UTC" });
  const instant = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  return {
    /** Un lundi (AAAA-MM-JJ). */
    jour: (d: string) => jour.format(new Date(`${d}T12:00:00Z`)),
    /** Un instant, jour à Paris. */
    le: (iso: string) => instant.format(new Date(iso)),
  };
}

// ---------------------------------------------------------------------------
// Une case : icône + mot, jamais la couleur seule
// ---------------------------------------------------------------------------

function CelluleEtape({ c }: { c: Case }) {
  const { t } = useTranslation();
  const { le } = useDates();
  const canal = (x: string | null) => (x ? t(`nudges.canaux.${x}`, { defaultValue: x }) : null);
  switch (c.etat) {
    case "fait":
      return (
        <span className="inline-flex items-center gap-1 text-success-foreground">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {c.le ? t("cohortes.case.faitLe", { date: le(c.le) }) : t("cohortes.case.fait")}
        </span>
      );
    case "rouge":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {t("cohortes.case.rouge", { date: le(c.le) })}
        </span>
      );
    case "relance":
      return (
        <span className="inline-flex items-center gap-1">
          <Mail className="size-3.5 shrink-0" aria-hidden />
          {t("cohortes.case.relance", { date: le(c.le), canal: canal(c.canal) })}
        </span>
      );
    case "prevu":
      return (
        <span className="inline-flex items-center gap-1 text-info-foreground">
          <Mail className="size-3.5 shrink-0" aria-hidden />
          {c.canal ? t("cohortes.case.prevuCanal", { canal: canal(c.canal) }) : t("cohortes.case.prevu")}
        </span>
      );
    case "bloque":
      return (
        <span className="inline-flex items-center gap-1 text-warning-foreground">
          <Link2Off className="size-3.5 shrink-0" aria-hidden />
          {t(`nudges.prevues.raisons.${c.raison ?? "contrat_non_relie"}`, { defaultValue: c.raison ?? "" })}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Minus className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">{t("cohortes.case.attente")}</span>
        </span>
      );
  }
}

function DetailWarmup({ r }: { r: RecrueCohorte }) {
  const { t } = useTranslation();
  const oui = (b: boolean) => (b ? "✓" : "✗");
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {t("cohortes.warmupDetail", {
        start: oui(Boolean(r.warmup_started_at)),
        follows: r.abonnements ?? 0,
        min: FOLLOWS_MIN,
        reposts: oui(Boolean(r.warmup_reposts_at)),
      })}
    </p>
  );
}

function Recrue({ r }: { r: RecrueCohorte }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-medium">
        <span className="truncate">{r.nom ?? "—"}</span>
        {r.contrat ? (
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("cohortes.contratRelie")} />
        ) : (
          <Link2Off className="size-3.5 shrink-0 text-warning-foreground" aria-label={t("cohortes.contratNonRelie")} />
        )}
        {!r.is_active && <Badge variant="secondary">{t("cohortes.arrete")}</Badge>}
      </p>
      <p className="text-xs text-muted-foreground">
        {[r.pays ? `${drapeauPays(r.pays)} ${r.pays}` : null, r.hm_prenom, r.handle ? `@${r.handle}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le tableau des recrues (page Cohortes, et en lecture seule sur l'accueil HM)
// ---------------------------------------------------------------------------

export function TableauRecrues({ recrues, lectureSeule }: { recrues: readonly RecrueCohorte[]; lectureSeule?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { jour, le } = useDates();
  const aujourdhui = aujourdhuiParis();
  const finir = () => qc.invalidateQueries({ queryKey: CLE });
  const reporter = useMutation({ mutationFn: (id: string) => reporterRecrue(id), onSuccess: finir });
  const arreter = useMutation({ mutationFn: (id: string) => arreterRecrue(id), onSuccess: finir });
  const erreur = (reporter.error ?? arreter.error) as Error | null;
  const occupe = reporter.isPending || arreter.isPending;

  const surReporter = (r: RecrueCohorte) => {
    const nouveau = (() => {
      const d = new Date(`${r.cohorte_lundi}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7);
      const iso = d.toISOString().slice(0, 10);
      return iso > aujourdhui ? iso : null;
    })();
    const texte = nouveau
      ? t("cohortes.reporterConfirm", { nom: r.nom ?? "—", date: jour(nouveau) })
      : t("cohortes.reporterConfirmProchain", { nom: r.nom ?? "—" });
    if (window.confirm(texte)) reporter.mutate(r.poster_id);
  };
  const surArreter = (r: RecrueCohorte) => {
    if (window.confirm(t("cohortes.arreterConfirm", { nom: r.nom ?? "—" }))) arreter.mutate(r.poster_id);
  };

  const etapes: EtapeCohorte[] = ["acces", "tiktok", "warmup"];
  return (
    <div className="space-y-2">
      {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[960px] border-collapse" data-testid="tableau-recrues">
          <thead className="bg-muted/40">
            <tr>
              <th className={TH}>{t("cohortes.col.recrue")}</th>
              <th className={TH}>{t("cohortes.col.offre")}</th>
              <th className={TH}>{t("cohortes.col.acces")}</th>
              <th className={TH}>{t("cohortes.col.tiktok")}</th>
              <th className={TH}>{t("cohortes.col.warmup")}</th>
              <th className={TH}>{t("cohortes.col.pret")}</th>
              <th className={TH}>{t("cohortes.col.semaine1")}</th>
              <th className={TH}>{t("cohortes.col.samedi")}</th>
              {!lectureSeule && <th className={TH} />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {recrues.map((r) => {
              const rouge = estRouge(r);
              const samedi = samediRecrue(r, aujourdhui);
              const commence = aujourdhui >= r.cohorte_lundi;
              return (
                <tr key={r.poster_id} data-recrue={r.poster_id} data-rouge={rouge || undefined} className={cn(rouge && "bg-destructive/5")}>
                  <td className={TD}>
                    <Recrue r={r} />
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>{le(r.offre_at)}</td>
                  {etapes.map((e) => (
                    <td key={e} className={TD}>
                      <CelluleEtape c={caseEtape(r, e)} />
                      {e === "warmup" && <DetailWarmup r={r} />}
                    </td>
                  ))}
                  <td className={TD}>
                    {pretLundi(r) ? (
                      <CelluleEtape c={{ etat: "fait", le: null }} />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Minus className="size-3.5" aria-hidden />
                        {t("cohortes.pasPret")}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {commence ? (
                      <>
                        <CelluleEtape c={caseEtape(r, "mercredi")} />
                        <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                          {r.semaine1.map((c) => (
                            <li key={c.compte_id}>
                              {t("cohortes.postsCompte", {
                                compte: c.handle ? `@${c.handle}` : "—",
                                publies: c.publies,
                                prevus: c.prevus,
                              })}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <CelluleEtape c={{ etat: "attente" }} />
                    )}
                  </td>
                  <td className={TD}>
                    {samedi === "attente" ? (
                      <CelluleEtape c={{ etat: "attente" }} />
                    ) : (
                      <Badge variant={samedi === "kill" || samedi === "arrete" ? "error" : samedi === "a_decider" ? "warning" : "success"}>
                        {t(`cohortes.samedi.${samedi}`)}
                      </Badge>
                    )}
                  </td>
                  {!lectureSeule && (
                    <td className={cn(TD, "whitespace-nowrap text-right")}>
                      {rouge && r.is_active && (
                        <span className="inline-flex gap-1">
                          <Button size="sm" variant="outline" disabled={occupe} onClick={() => surReporter(r)}>
                            {t("cohortes.reporter")}
                          </Button>
                          <Button size="sm" variant="destructive" disabled={occupe} onClick={() => surArreter(r)}>
                            {t("cohortes.arreter")}
                          </Button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {recrues.length === 0 && (
              <tr>
                <td className={cn(TD, "text-muted-foreground")} colSpan={lectureSeule ? 8 : 9}>
                  {t("cohortes.aucune")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------

/**
 * Cohortes (prompt 17, partie B, 0392). Une cohorte = les offres acceptées du
 * vendredi au jeudi ; elle commence à poster le lundi qui suit. En haut une
 * puce par cohorte, puis l'entonnoir, une ligne par recrue (Reporter /
 * Arrêter sur les rouges), et un petit tableau par HM. Les décisions du
 * samedi restent dans Check, Kill or Double.
 */
export function PageCohortes() {
  const { t } = useTranslation();
  const { jour } = useDates();
  const aujourdhui = aujourdhuiParis();
  const cohortes = useQuery({ queryKey: [...CLE, "liste"], queryFn: lireCohortes });
  const lundis = React.useMemo(() => (cohortes.data ?? []).map((c) => c.lundi), [cohortes.data]);
  const [choix, setChoix] = React.useState<string[] | null>(null);
  const [anciennes, setAnciennes] = React.useState(false);
  const choisies = choix ?? cohortesParDefaut(lundis, aujourdhui);
  const [filtres, setFiltres] = React.useState<FiltresCohorte>({ rouges: false, hm: "", pays: "" });

  const recrues = useQuery({
    queryKey: [...CLE, "recrues", [...choisies].sort()],
    queryFn: () => lireRecrues(choisies),
    enabled: choisies.length > 0,
  });
  const dernieres = quatreDernieres(lundis, aujourdhui);
  const parHm = useQuery({
    queryKey: [...CLE, "recrues", dernieres],
    queryFn: () => lireRecrues(dernieres),
    enabled: dernieres.length > 0,
  });

  const basculer = (l: string) =>
    setChoix((avant) => {
      const x = avant ?? choisies;
      return x.includes(l) ? x.filter((y) => y !== l) : [...x, l];
    });

  // Les 6 plus récentes, les autres repliées.
  const visibles = anciennes ? cohortes.data ?? [] : (cohortes.data ?? []).slice(0, 6);
  const toutes = recrues.data ?? [];
  const lignes = filtrer(toutes, filtres);
  const hms = [...new Map(toutes.filter((r) => r.hm_id).map((r) => [r.hm_id!, r.hm_prenom ?? "—"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const pays = [...new Set(toutes.map((r) => r.pays).filter((p): p is string => Boolean(p)))].sort();
  const libelle = (l: string) => {
    const p = phaseCohorte(l, aujourdhui);
    return p.prepa ? t("cohortes.prepa") : t("cohortes.semaine", { n: p.semaine });
  };

  return (
    <div className="space-y-6" data-testid="page-cohortes">
      <PageHeader title={t("cohortes.titre")} description={t("cohortes.description")} />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("cohortes.puces")}>
        {visibles.map((c) => {
          const actif = choisies.includes(c.lundi);
          return (
            <button
              key={c.lundi}
              type="button"
              aria-pressed={actif}
              onClick={() => basculer(c.lundi)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                actif ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {t("cohortes.puce", { date: jour(c.lundi), n: c.recrues, phase: libelle(c.lundi) })}
              {c.rouges > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium">
                  <AlertTriangle className="size-3" aria-hidden />
                  {t("cohortes.rougesPuce", { n: c.rouges })}
                </span>
              )}
            </button>
          );
        })}
        {(cohortes.data?.length ?? 0) > 6 && (
          <Button size="sm" variant="ghost" onClick={() => setAnciennes((x) => !x)}>
            {anciennes ? t("cohortes.replier") : t("cohortes.anciennes", { n: (cohortes.data?.length ?? 0) - 6 })}
          </Button>
        )}
      </div>

      {cohortes.error && <p className="text-sm text-destructive">{(cohortes.error as Error).message}</p>}
      {recrues.error && <p className="text-sm text-destructive">{(recrues.error as Error).message}</p>}

      {choisies.length > 0 && (
        <Card data-testid="entonnoir">
          <CardHeader>
            <CardTitle>{t("cohortes.entonnoir.titre")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("cohortes.entonnoir.cohorte")}</th>
                  {ETAPES_ENTONNOIR.map((e) => (
                    <th key={e} className={TH}>
                      {t(`cohortes.entonnoir.${e}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...choisies].sort().reverse().map((l) => {
                  const n = entonnoir(toutes.filter((r) => r.cohorte_lundi === l), aujourdhui);
                  return (
                    <tr key={l} data-entonnoir={l}>
                      <td className={cn(TD, "whitespace-nowrap font-medium")}>
                        {jour(l)} · {libelle(l)}
                      </td>
                      {ETAPES_ENTONNOIR.map((e) => (
                        <td key={e} className={cn(TD, "tabular-nums")}>
                          {n[e]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filtres.rouges}
            onChange={(e) => setFiltres({ ...filtres, rouges: e.target.checked })}
          />
          {t("cohortes.filtres.rouges")}
        </label>
        <select
          aria-label={t("cohortes.filtres.hm")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.hm}
          onChange={(e) => setFiltres({ ...filtres, hm: e.target.value })}
        >
          <option value="">{t("cohortes.filtres.toutesHm")}</option>
          {hms.map(([id, prenom]) => (
            <option key={id} value={id}>
              {prenom}
            </option>
          ))}
        </select>
        <select
          aria-label={t("cohortes.filtres.pays")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.pays}
          onChange={(e) => setFiltres({ ...filtres, pays: e.target.value })}
        >
          <option value="">{t("cohortes.filtres.tousPays")}</option>
          {pays.map((p) => (
            <option key={p} value={p}>
              {drapeauPays(p)} {p}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">{t("cohortes.nbLignes", { n: lignes.length })}</span>
      </div>

      <TableauRecrues recrues={lignes} />

      <Card data-testid="tableau-hm">
        <CardHeader>
          <CardTitle>{t("cohortes.parHm.titre")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("cohortes.parHm.aide", { cohortes: dernieres.map(jour).join(", ") || "—" })}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>{t("cohortes.parHm.hm")}</th>
                <th className={TH}>{t("cohortes.parHm.recrues")}</th>
                <th className={TH}>{t("cohortes.parHm.pretes")}</th>
                <th className={TH}>{t("cohortes.parHm.gardees")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tableauHm(parHm.data ?? [], aujourdhui).map((l) => (
                <tr key={l.hm_id ?? "sans"}>
                  <td className={TD}>{l.hm_prenom ?? t("cohortes.parHm.sansHm")}</td>
                  <td className={cn(TD, "tabular-nums")}>{l.recrues}</td>
                  <td className={cn(TD, "tabular-nums")}>{l.pretes === null ? "—" : `${l.pretes} %`}</td>
                  <td className={cn(TD, "tabular-nums")}>{l.gardees === null ? "—" : `${l.gardees} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * L'accueil HM (prompt 17, partie B) : le même tableau, en lecture seule, sur
 * ses recrues de la cohorte en préparation et de celle en semaine 1. La base
 * ne rend à une HM que les siennes ; le Head of Ops choisit la HM (`hm`).
 */
export function MesRecrues({ hm }: { hm?: string }) {
  const { t } = useTranslation();
  const aujourdhui = aujourdhuiParis();
  const cohortes = useQuery({ queryKey: [...CLE, "liste"], queryFn: lireCohortes });
  const lundis = cohortesParDefaut((cohortes.data ?? []).map((c) => c.lundi), aujourdhui);
  const recrues = useQuery({
    queryKey: [...CLE, "recrues", [...lundis].sort()],
    queryFn: () => lireRecrues(lundis),
    enabled: lundis.length > 0,
  });
  const lignes = (recrues.data ?? []).filter((r) => !hm || r.hm_id === hm);
  return (
    <Card data-testid="mes-recrues">
      <CardHeader>
        <CardTitle>{t("cohortes.mesRecrues")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cohortes.mesRecruesAide")}</p>
      </CardHeader>
      <CardContent>
        {(recrues.error || cohortes.error) && (
          <p className="text-sm text-destructive">{((recrues.error ?? cohortes.error) as Error).message}</p>
        )}
        <TableauRecrues recrues={lignes} lectureSeule />
      </CardContent>
    </Card>
  );
}
