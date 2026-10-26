import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Clock, CornerDownRight, ExternalLink, Info, RefreshCw, Smartphone, UserPlus, X } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { Sparkline } from "@/components/charts/Sparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { StatGroup, StatTile } from "@/components/ui/stat";
import type { PersonneCkd } from "@/features/ckd/api";
import { lienTiktok } from "@/features/ckd/logique";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { EtapeBadge } from "@/features/moteur/EtapeBadge";
import { drapeauPays } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

import { etatCohorte } from "./etapeCohorte";
import type { CompteCohorte, ResultatReleve } from "./api";
import { useFormats } from "./formats";
import { BLEUS, CourbesCumul } from "./graphes";
import {
  type EtatWarmup,
  etatWarmup,
  FILTRES_WARMUP,
  type FiltreWarmup,
  garderWarmup,
  grouperParHmCohorte,
  jourParis,
  joursDeWarmup,
  libelleCohorte,
  minuitParis,
  paireDuJour,
  resteAvant,
  serieWarmup,
  type StatutWarmup,
} from "./logique";
import { Puce } from "./OngletPoste";

const TH = "pb-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2.5 pr-3 align-middle last:pr-0";

const PILULE_STATUT: Record<StatutWarmup, string> = {
  pret: "border-success/35 bg-success/10 text-success-foreground",
  en_cours: "border-info/35 bg-info/10 text-info-foreground",
  nouveau: "border-border bg-muted text-muted-foreground",
  a_relancer: "border-destructive/35 bg-destructive/10 text-destructive-foreground",
};

function nomPersonne(p: PersonneCkd | undefined): string {
  return p ? [p.prenom, p.nom].filter(Boolean).join(" ").trim() : "";
}

/**
 * L'onglet de la cohorte en warm-up : la semaine où les comptes arrivent dans
 * l'OS, créent leur compte TikTok et le font vivre (abonnements, likes), puis
 * cliquent « Start warmup » avant dimanche minuit pour poster le lundi. On
 * regarde seulement : rien ne part aux HMs depuis ici.
 */
export function OngletWarmup({
  lundi,
  aujourdhui,
  maintenant,
  comptes,
  chargement,
  personnes,
  relever,
  releveEnCours,
  resultatReleve,
  erreurReleve,
}: {
  lundi: string;
  aujourdhui: string;
  maintenant: Date;
  comptes: CompteCohorte[];
  chargement: boolean;
  personnes: Map<string, PersonneCkd>;
  relever: () => void;
  releveEnCours: boolean;
  resultatReleve: ResultatReleve | null;
  erreurReleve: unknown;
}) {
  const { t } = useTranslation();
  const { date, duree } = useFormats();
  const [filtre, setFiltre] = React.useState<FiltreWarmup>("tous");
  const s = libelleCohorte(lundi);
  const sSuivante = libelleCohorte(paireDuJour(lundi).warmup);
  const enCours = paireDuJour(aujourdhui).warmup === lundi;
  const reste = resteAvant(minuitParis(lundi), maintenant);

  const lignes = comptes.map((compte) => ({ compte, etat: etatWarmup(compte, aujourdhui) }));
  const n = lignes.length;
  const compter = (f: (e: EtatWarmup) => boolean) => lignes.filter((l) => f(l.etat)).length;
  const surTiktok = compter((e) => e.tiktok === "cree");
  const introuvables = compter((e) => e.tiktok === "introuvable");
  const actifs = compter((e) => e.warmup);
  const starts = compter((e) => e.start);
  const prets = compter((e) => e.statut === "pret");
  const creesAujourdhui = comptes.filter((c) => jourParis(c.cree_le) === aujourdhui).length;
  const glisses = comptes.filter((c) => c.glisse_de).length;
  const dates = comptes.flatMap((c) => c.releves.map((r) => r.at)).sort();
  const dernierReleve = dates[dates.length - 1];

  const serie = serieWarmup(comptes, lundi, aujourdhui);
  const groupes = grouperParHmCohorte(lignes.filter((l) => garderWarmup(filtre, l.compte, l.etat)));

  return (
    <div className="space-y-5" data-testid="onglet-warmup">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("ckd.cohorte.warmup.titre", { s })}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("ckd.cohorte.warmup.aide", {
              du: date(joursDeWarmup(lundi)[0], { weekday: "long", day: "numeric" }),
              au: date(joursDeWarmup(lundi)[6], { weekday: "long", day: "numeric", month: "long" }),
            })}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-xs">
          <Clock className="size-5 text-warning-foreground" aria-hidden />
          <div>
            <p className={MICRO_LABEL}>
              {t("ckd.cohorte.warmup.premiersPosts", { date: date(lundi, { weekday: "long", day: "numeric", month: "long" }) })}
            </p>
            <p className="text-base font-semibold tabular-nums">
              {reste ? t("ckd.cohorte.dans", { duree: duree(reste) }) : t("ckd.cohorte.warmup.demarre")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="size-4" aria-hidden />
          {dernierReleve
            ? t("ckd.cohorte.releve.dernier", {
                date: date(dernierReleve, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
              })
            : t("ckd.cohorte.releve.aucun")}
          {" · "}
          {t("ckd.cohorte.releve.horaires")}
        </span>
        {enCours && (
          <Button size="sm" variant="outline" loading={releveEnCours} onClick={relever}>
            <RefreshCw />
            {t("ckd.cohorte.releve.bouton")}
          </Button>
        )}
        {resultatReleve && (
          <span role="status" className="text-foreground">
            {t("ckd.cohorte.releve.resultat", {
              count: resultatReleve.comptes,
              existent: resultatReleve.existent,
              introuvables: resultatReleve.introuvables,
              illisibles: resultatReleve.illisibles,
            })}
          </span>
        )}
        {Boolean(erreurReleve) && (
          <span role="alert" className="text-destructive">
            {erreurReleve instanceof Error ? erreurReleve.message : String(erreurReleve)}
          </span>
        )}
      </div>

      {chargement ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : n === 0 ? (
        <EmptyState title={t("ckd.cohorte.warmup.aucunDetail", { s })} />
      ) : (
        <>
          {reste && n - starts > 0 && (
            <div role="note" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/8 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden />
              <div>
                <p className="font-semibold">{t("ckd.cohorte.warmup.alerteStart", { count: n - starts })}</p>
                <p className="text-sm text-muted-foreground">{t("ckd.cohorte.warmup.alerteStartDetail", { s: sSuivante })}</p>
              </div>
            </div>
          )}

          <StatGroup>
            <StatTile
              label={t("ckd.cohorte.warmup.crees")}
              value={n}
              detail={[
                creesAujourdhui > 0 ? t("ckd.cohorte.warmup.creesAujourdhui", { n: creesAujourdhui }) : null,
                glisses > 0 ? t("ckd.cohorte.warmup.dontGlisses", { count: glisses }) : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined}
              trend={serie.map((p) => p.crees)}
            />
            <StatTile
              label={t("ckd.cohorte.warmup.surTiktok")}
              value={surTiktok}
              unit={`/ ${n}`}
              detail={
                introuvables > 0
                  ? t("ckd.cohorte.warmup.introuvables", { count: introuvables })
                  : t("ckd.cohorte.warmup.surTiktokDetail")
              }
              trend={serie.map((p) => p.tiktok)}
            />
            <StatTile
              label={t("ckd.cohorte.warmup.actif")}
              value={actifs}
              unit={`/ ${n}`}
              detail={t("ckd.cohorte.warmup.actifDetail")}
              trend={serie.map((p) => p.warmup)}
            />
            <StatTile
              label={t("ckd.cohorte.warmup.start")}
              value={starts}
              unit={`/ ${n}`}
              tone={reste && n - starts > 0 ? "alerte" : "neutre"}
              detail={reste ? t("ckd.cohorte.warmup.startDetail", { count: n - starts }) : t("ckd.cohorte.warmup.startFini")}
              trend={serie.map((p) => p.start)}
            />
          </StatGroup>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("ckd.cohorte.warmup.cumul")}</CardTitle>
                <CardDescription>{t("ckd.cohorte.warmup.cumulAide")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(["crees", "tiktok", "warmup"] as const).map((k, i) => (
                    <li key={k} className="inline-flex items-center gap-1.5">
                      <span className="h-[3px] w-4 rounded-full" style={{ background: BLEUS[i] }} aria-hidden />
                      {t(`ckd.cohorte.series.${k}`)}
                    </li>
                  ))}
                </ul>
                <CourbesCumul
                  aujourdhui={aujourdhui}
                  libelleAVenir={t("ckd.cohorte.warmup.aVenir")}
                  ariaLabel={t("ckd.cohorte.warmup.cumul")}
                  jours={serie.map((p) => ({
                    cle: p.jour,
                    libelle: date(p.jour, { weekday: "short", day: "numeric" }),
                    court: date(p.jour, { weekday: "narrow", day: "numeric" }),
                    libelleLong: date(p.jour, { weekday: "long", day: "numeric", month: "long" }),
                  }))}
                  series={(["crees", "tiktok", "warmup"] as const).map((k, i) => ({
                    cle: k,
                    libelle: t(`ckd.cohorte.series.${k}`),
                    court: t(`ckd.cohorte.seriesCourtes.${k}`),
                    couleur: BLEUS[i]!,
                    valeurs: serie.map((p) => (k === "crees" ? p.crees : k === "tiktok" ? p.tiktok : p.warmup)),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("ckd.cohorte.warmup.etapes")}</CardTitle>
                <CardDescription>{t("ckd.cohorte.warmup.etapesAide", { count: n })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3.5">
                {(
                  [
                    ["crees", n],
                    ["tiktok", surTiktok],
                    ["warmup", actifs],
                    ["start", starts],
                    ["prets", prets],
                  ] as const
                ).map(([k, v], i) => (
                  <div key={k} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className="truncate">{t(`ckd.cohorte.series.${k}`)}</span>
                    <div className="h-3 rounded-[3px] bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-r-[4px]"
                        style={{ width: `${n > 0 ? (100 * v) / n : 0}%`, background: k === "prets" ? "var(--success)" : BLEUS[Math.min(i, 2)] }}
                      />
                    </div>
                    <span className="tabular-nums">
                      <span className="font-semibold">{v}</span>{" "}
                      <span className="text-muted-foreground">· {n > 0 ? Math.round((100 * v) / n) : 0} %</span>
                    </span>
                  </div>
                ))}
                <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("ckd.cohorte.warmup.mesure")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("ckd.cohorte.warmup.tableau")}</CardTitle>
              <CardDescription>{t("ckd.cohorte.warmup.tableauAide")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div role="group" aria-label={t("ckd.cohorte.filtresAria")} className="flex flex-wrap gap-1.5">
                {FILTRES_WARMUP.map((f) => (
                  <Puce
                    key={f}
                    actif={filtre === f}
                    onClick={() => setFiltre(f)}
                    n={lignes.filter((l) => garderWarmup(f, l.compte, l.etat)).length}
                  >
                    {t(`ckd.cohorte.warmup.filtres.${f}`)}
                  </Puce>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={TH}>{t("ckd.cohorte.colonnes.compte")}</th>
                      <th className={TH}>{t("ckd.cohorte.colonnes.creeOs")}</th>
                      <th className={TH}>{t("ckd.cohorte.colonnes.tiktok")}</th>
                      <th className={TH}>{t("ckd.cohorte.colonnes.warmup")}</th>
                      <th className={TH}>{t("ckd.cohorte.colonnes.start")}</th>
                      <th className={cn(TH, "text-right")}>{t("ckd.cohorte.colonnes.statut")}</th>
                    </tr>
                  </thead>
                  {groupes.map((g) => {
                    const hm = g.hmId ? personnes.get(g.hmId) : undefined;
                    const pretsGroupe = g.lignes.filter((l) => l.etat.statut === "pret").length;
                    return (
                      <tbody key={g.hmId ?? "sans-hm"} data-testid={`groupe-warmup-${g.hmId ?? "aucun"}`}>
                        <tr>
                          <th colSpan={6} scope="colgroup" className="pt-4 pb-1.5 text-left font-normal">
                            <span className="font-semibold">{hm ? nomPersonne(hm) : t("ckd.sansHm")}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {[hm?.zone_recrutement, t("ckd.cohorte.warmup.resumeHm", { count: g.lignes.length, prets: pretsGroupe })]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </th>
                        </tr>
                        {g.lignes.map(({ compte: c, etat: e }) => (
                          <LigneWarmup key={c.compte_id} compte={c} etat={e} poster={personnes.get(c.poster_id)} />
                        ))}
                      </tbody>
                    );
                  })}
                </table>
                {groupes.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("ckd.cohorte.videFiltre")}</p>}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
                {(["pret", "en_cours", "nouveau", "a_relancer"] as const).map((st) => (
                  <li key={st} className="inline-flex items-center gap-1.5">
                    <PiluleStatut statut={st} />
                    {t(`ckd.cohorte.statutsAide.${st}`)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

}

function LigneWarmup({ compte: c, etat: e, poster }: { compte: CompteCohorte; etat: EtatWarmup; poster?: PersonneCkd }) {
  const { t } = useTranslation();
  const { date, nombre } = useFormats();
  const tiktok = lienTiktok(c.handle);
  return (
    <tr className="border-t border-border/40" data-testid={`ligne-warmup-${c.handle}`}>
      <td className={TD}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <Link to={`/admin/createurs/${c.compte_id}`} className="truncate font-medium underline-offset-2 hover:underline">
              {drapeauPays(c.pays)} @{c.handle}
            </Link>
            {c.application && <LogoApplication slug={c.application} taille="xs" />}
            <EtapeBadge etat={etatCohorte(c, aujourdhuiParis())} />
            {tiktok && (
              <a
                href={tiktok}
                target="_blank"
                rel="noreferrer"
                aria-label={t("ckd.cohorte.ouvrirTiktok", { handle: c.handle })}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {nomPersonne(poster)}
            {c.glisse_de && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 text-[10.5px] font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                <CornerDownRight className="size-3" aria-hidden />
                {t("ckd.cohorte.glisse", { s: libelleCohorte(c.glisse_de) })}
              </span>
            )}
          </span>
        </div>
      </td>
      <td className={cn(TD, "whitespace-nowrap")}>
        {e.ageJours === 0 ? t("ckd.cohorte.aujourdhui") : date(c.cree_le, { weekday: "short", day: "numeric" })}{" "}
        <span className="text-muted-foreground">· J+{e.ageJours}</span>
      </td>
      <td className={TD}>
        <Indicateur
          ok={e.tiktok === "cree"}
          ton={e.statut === "a_relancer" ? "rouge" : "gris"}
          texte={
            e.tiktok === "cree"
              ? e.creeTiktokLe
                ? t("ckd.cohorte.cellules.tiktokCree", { date: date(e.creeTiktokLe) })
                : t("ckd.cohorte.cellules.tiktokSans")
              : e.tiktok === "introuvable"
                ? e.ageJours >= 2
                  ? t("ckd.cohorte.cellules.introuvable")
                  : t("ckd.cohorte.cellules.pasEncore")
                : t("ckd.cohorte.cellules.inconnu")
          }
        />
      </td>
      <td className={TD}>
        <div className="flex items-center gap-2">
          <Indicateur
            ok={e.warmup}
            ton="gris"
            texte={
              e.tiktok !== "cree"
                ? "—"
                : e.warmup
                  ? t("ckd.cohorte.cellules.warmup", {
                      abonnements: nombre(e.abonnements ?? 0),
                      likes: nombre(e.likes ?? 0),
                    })
                  : t("ckd.cohorte.cellules.warmupRien")
            }
          />
          {e.serieAbonnements.length >= 2 && (
            <div className="ml-auto w-14 shrink-0 text-info">
              <Sparkline values={e.serieAbonnements} height={18} />
            </div>
          )}
        </div>
      </td>
      <td className={TD}>
        <Indicateur
          ok={e.start}
          ton="orange"
          texte={
            e.start && c.warmup_lance_le
              ? t("ckd.cohorte.cellules.start", { date: date(c.warmup_lance_le, { weekday: "short", day: "numeric" }) })
              : t("ckd.cohorte.cellules.startNon")
          }
        />
      </td>
      <td className={cn(TD, "text-right")}>
        <PiluleStatut statut={e.statut} />
      </td>
    </tr>
  );
}

function Indicateur({ ok, ton, texte }: { ok: boolean; ton: "gris" | "rouge" | "orange"; texte: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "inline-flex size-5.5 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-success/12 text-success-foreground"
            : ton === "rouge"
              ? "bg-destructive/10 text-destructive-foreground"
              : ton === "orange"
                ? "bg-warning/12 text-warning-foreground"
                : "bg-muted text-muted-foreground",
        )}
      >
        {ok ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <X className="size-3.5" strokeWidth={3} aria-hidden />}
      </span>
      <span
        className={cn(
          "truncate",
          !ok && ton === "rouge" && "font-medium text-destructive-foreground",
          !ok && ton === "orange" && "font-medium text-warning-foreground",
          !ok && ton === "gris" && "text-muted-foreground",
        )}
      >
        {texte}
      </span>
    </span>
  );
}

function PiluleStatut({ statut }: { statut: StatutWarmup }) {
  const { t } = useTranslation();
  const Icone = statut === "pret" ? Check : statut === "en_cours" ? Clock : statut === "nouveau" ? UserPlus : AlertTriangle;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", PILULE_STATUT[statut])}>
      <Icone className="size-3" aria-hidden />
      {t(`ckd.cohorte.statuts.${statut}`)}
    </span>
  );
}
