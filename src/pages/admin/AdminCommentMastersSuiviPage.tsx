import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarreChargement } from "@/components/ui/progress";
import {
  derniereSynchro,
  lireDemandesCm,
  lireReglagesBonus,
  synchroniserSlack,
  validerAutre,
  type DemandeCm,
} from "@/features/commentMasters/suivi/api";
import { csvDemandes, delaiLisible, lienSlack, parCommentMaster, totaux, type LigneCm } from "@/features/commentMasters/suivi/logique";
import { lundiBonus, periodeDe, periodesChoix } from "@/features/commentMasters/suivi/periodes";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { dollars } from "@/features/paie/logique";
import { localeDate } from "@/locales/localeDate";
import { telechargerCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const TH = "px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2.5 align-middle tabular-nums";

function Chiffre({ libelle, valeur, detail, ton }: { libelle: string; valeur: string; detail?: string; ton?: "alerte" }) {
  return (
    <div className={cn("rounded-xl border p-3", ton === "alerte" && "border-warning/50 bg-warning/8")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{libelle}</p>
      <p className="text-xl font-semibold tabular-nums">{valeur}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/**
 * Admin → Comment Masters · suivi (0373) : les Done de chaque Comment Master,
 * synchronisés depuis Slack chaque jour à 7 h, sur la période choisie. Le
 * total de la période de 4 semaines fait le bonus Comment Master.
 */
export function AdminCommentMastersSuiviPage() {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const queryClient = useQueryClient();
  const aujourdhui = aujourdhuiParis();
  const reglages = useQuery({ queryKey: ["reglages", "bonus"], queryFn: lireReglagesBonus });
  const premierLundi = reglages.data?.premier_lundi ?? "2026-11-30";
  const periodes = periodesChoix(aujourdhui, premierLundi);
  const [cle, setCle] = React.useState<string | null>(null);
  const periode = periodes.find((p) => p.cle === cle) ?? periodes.find((p) => p.type === "en_cours")!;
  const [ouvert, setOuvert] = React.useState<LigneCm | null>(null);

  const demandes = useQuery({
    queryKey: ["cm-suivi", periode.debut, periode.fin],
    queryFn: () => lireDemandesCm(periode.debut, periode.fin),
    enabled: reglages.isSuccess,
  });
  const synchro = useQuery({ queryKey: ["cm-suivi", "synchro"], queryFn: derniereSynchro });
  const synchroniser = useMutation({
    mutationFn: synchroniserSlack,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cm-suivi"] }),
  });
  const valider = useMutation({
    mutationFn: ({ id, valide }: { id: string; valide: boolean }) => validerAutre(id, valide),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cm-suivi"] }),
  });

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat(localeDate(langue), { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const fmtHeure = (iso: string) =>
    new Intl.DateTimeFormat(localeDate(langue), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(new Date(iso));

  const lignes = parCommentMaster(demandes.data ?? []);
  const parCommentaire = reglages.data?.comment_master_par_commentaire ?? 0;
  const total = totaux(lignes, parCommentaire);
  const enCours = periodeDe(aujourdhui, premierLundi);
  const ligneOuverte = ouvert ? (lignes.find((l) => l.cle === ouvert.cle) ?? ouvert) : null;
  const derniere = synchro.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("cmSuivi.titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("cmSuivi.sous")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={periode.cle}
          onChange={(e) => setCle(e.target.value)}
          aria-label={t("cmSuivi.periode")}
        >
          {periodes.map((p) => (
            <option key={p.cle} value={p.cle}>
              {t(`cmSuivi.periodes.${p.type}`, { debut: fmtDate(p.debut), fin: fmtDate(p.fin) })}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" disabled={synchroniser.isPending} onClick={() => synchroniser.mutate()}>
          <RefreshCw className={cn(synchroniser.isPending && "animate-spin")} />
          {synchroniser.isPending ? t("cmSuivi.synchroEnCours") : t("cmSuivi.synchroniser")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!demandes.data?.length}
          onClick={() =>
            telechargerCsv(`comment_masters_${periode.debut}_${periode.fin}.csv`, csvDemandes(demandes.data ?? []))
          }
        >
          <Download />
          {t("cmSuivi.exporter")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="cm-synchro">
        {synchroniser.data
          ? t("cmSuivi.synchroFaite", { lues: synchroniser.data.lues, maj: synchroniser.data.mises_a_jour })
          : derniere
            ? t("cmSuivi.derniereSynchro", { date: fmtHeure(derniere.debut), lues: derniere.lues, maj: derniere.mises_a_jour })
            : t("cmSuivi.jamaisSynchro")}
        {(() => {
          const erreurs = synchroniser.data?.erreurs ?? derniere?.erreurs ?? [];
          return erreurs.length > 0 ? (
            <span className="ml-2 text-destructive">
              {t("cmSuivi.erreursSynchro", { count: erreurs.length, premiere: erreurs[0]!.erreur })}
            </span>
          ) : null;
        })()}
        {synchroniser.isError && <span className="ml-2 text-destructive">{(synchroniser.error as Error).message}</span>}
      </p>

      {demandes.isLoading && <BarreChargement actif />}
      {demandes.error && <p className="text-sm text-destructive">{(demandes.error as Error).message}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre libelle={t("cmSuivi.totalDone")} valeur={String(total.done)} />
        <Chiffre libelle={t("cmSuivi.recues")} valeur={String(total.recues)} />
        <Chiffre libelle={t("cmSuivi.verifies")} valeur={String(total.verifies)} />
        <Chiffre
          libelle={t("cmSuivi.bonusPrevu")}
          valeur={dollars(total.bonus, langue)}
          detail={
            parCommentaire > 0
              ? t("cmSuivi.bonusDetail", {
                  done: total.done,
                  montant: dollars(parCommentaire, langue),
                  lundi: fmtDate(lundiBonus(periode.type === "en_cours" || periode.type === "precedente" ? periode : enCours)),
                })
              : t("cmSuivi.montantNonRegle")
          }
        />
      </div>
      {total.aValider > 0 && (
        <p className="rounded-md border border-warning/50 bg-warning/8 px-3 py-2 text-sm">
          {t("cmSuivi.aValider")} : <strong>{total.aValider}</strong>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {demandes.data && lignes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("cmSuivi.aucune")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    {(["cm", "canal", "recues", "done", "pct", "verifies", "delai", "dernier"] as const).map((c) => (
                      <th key={c} className={TH}>
                        {t(`cmSuivi.cols.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lignes.map((l) => (
                    <tr
                      key={l.cle}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setOuvert(l)}
                      data-cm={l.nom ?? l.langue}
                    >
                      <td className={TD}>
                        <p className="font-medium">{l.nom ?? t("cmSuivi.sansMandat")}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.langue}
                          {l.region && ` · ${l.region}`}
                        </p>
                      </td>
                      <td className={cn(TD, "text-xs text-muted-foreground")}>{l.canal ?? "—"}</td>
                      <td className={TD}>{l.recues}</td>
                      <td className={TD}>
                        <span className="font-semibold">{l.done}</span>
                        {l.aValider > 0 && (
                          <Badge variant="warning" className="ml-1.5">
                            +{l.aValider}
                          </Badge>
                        )}
                      </td>
                      <td className={TD}>{l.pctDone === null ? "—" : `${l.pctDone} %`}</td>
                      <td className={TD}>{l.verifies}</td>
                      <td className={TD}>{delaiLisible(l.delaiMinutes)}</td>
                      <td className={cn(TD, "text-xs")}>{l.dernierDone ? fmtHeure(l.dernierDone) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={ligneOuverte !== null} onOpenChange={(o) => !o && setOuvert(null)}>
        <DialogPopup className="max-w-3xl">
          {ligneOuverte && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {t("cmSuivi.detail.titre", { nom: ligneOuverte.nom ?? t("cmSuivi.sansMandat"), langue: ligneOuverte.langue })}
                </DialogTitle>
                <DialogDescription>
                  {t(`cmSuivi.periodes.${periode.type}`, { debut: fmtDate(periode.debut), fin: fmtDate(periode.fin) })} ·{" "}
                  {ligneOuverte.done}/{ligneOuverte.recues} Done
                </DialogDescription>
              </DialogHeader>
              <DialogPanel className="pb-5">
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted/40">
                      <tr className="border-b">
                        {(["envoye", "tiktok", "slack", "done", "verifie"] as const).map((c) => (
                          <th key={c} className={TH}>
                            {t(`cmSuivi.detail.${c}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ligneOuverte.demandes.map((d) => (
                        <LigneDemande
                          key={d.id}
                          d={d}
                          fmtHeure={fmtHeure}
                          onValider={(valide) => valider.mutate({ id: d.id, valide })}
                          enCours={valider.isPending}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {valider.isError && <p className="mt-2 text-sm text-destructive">{(valider.error as Error).message}</p>}
              </DialogPanel>
            </>
          )}
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function LigneDemande({
  d,
  fmtHeure,
  onValider,
  enCours,
}: {
  d: DemandeCm;
  fmtHeure: (iso: string) => string;
  onValider: (valide: boolean) => void;
  enCours: boolean;
}) {
  const { t } = useTranslation();
  const lien = (href: string | null) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
      >
        {t("cmSuivi.detail.ouvrir")}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    ) : (
      "—"
    );
  const mode = d.fait_mode ?? (d.fait_at ? "bouton" : null);
  return (
    <tr data-demande={d.id}>
      <td className={cn(TD, "text-xs")}>{fmtHeure(d.envoye_at)}</td>
      <td className={TD}>{lien(d.publie_url)}</td>
      <td className={TD}>{lien(d.slack_channel_id && d.slack_ts ? lienSlack(d.slack_channel_id, d.slack_ts) : null)}</td>
      <td className={TD}>
        {d.fait_at ? (
          <div className="space-y-1">
            <Badge variant={d.compte ? "success" : "warning"}>{t("cmSuivi.detail.oui")}</Badge>
            <p className="text-xs text-muted-foreground">
              {fmtHeure(d.fait_at)}
              {d.fait_par && ` · ${t("cmSuivi.detail.par", { qui: d.fait_par })}`}
              {mode && ` · ${t(`cmSuivi.detail.modes.${mode}`)}`}
            </p>
            {d.autre_personne && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-warning-foreground">{t("cmSuivi.detail.autre", { qui: d.fait_par ?? "?" })}</span>
                {d.autre_valide_at && <Badge variant="success">{t("cmSuivi.detail.valide")}</Badge>}
                <Button
                  size="sm"
                  variant={d.autre_valide_at ? "ghost" : "outline"}
                  className="h-7"
                  disabled={enCours}
                  onClick={() => onValider(!d.autre_valide_at)}
                >
                  {d.autre_valide_at ? t("cmSuivi.detail.retirer") : t("cmSuivi.detail.valider")}
                </Button>
              </p>
            )}
          </div>
        ) : (
          <Badge variant="outline">{t("cmSuivi.detail.non")}</Badge>
        )}
      </td>
      <td className={TD}>
        <Badge variant={d.verifie ? "success" : "outline"}>
          {d.verifie ? t("cmSuivi.detail.oui") : t("cmSuivi.detail.non")}
        </Badge>
      </td>
    </tr>
  );
}
