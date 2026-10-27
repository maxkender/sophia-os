import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarreChargement } from "@/components/ui/progress";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { lireCohorte } from "@/features/ckd/cohorte/api";
import { ActionsPosteur } from "@/features/ckd/cohorte/ActionsPosteur";
import { etatCohorte } from "@/features/ckd/cohorte/etapeCohorte";
import { libelleCohorte, paireDuJour } from "@/features/ckd/cohorte/logique";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { EtapeBadge, QualiteBadge } from "@/features/moteur/EtapeBadge";
import { qualiteAffichee } from "@/features/moteur/etapes";
import { lireEtapesComptes } from "@/features/moteur/etapesApi";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { nomsHms } from "@/features/paie/api";
import { selectClass } from "@/features/ckd/vueHm/ChoixHm";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireCalendrier, type LigneCalendrier } from "./api";
import { COULEUR } from "./couleurs";
import {
  aPublieCalendrier,
  aUnProbleme,
  casesSemaine,
  filtrerLignes,
  joursSemaine,
  paysPresents,
  semainesChoix,
  type CaseJour,
} from "./logique";



function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]!.toUpperCase())
      .join("") || "?"
  );
}

function ContenuCase({ c }: { c: CaseJour }) {
  if (c.etat === "vide") return <span aria-hidden>—</span>;
  if (c.etat === "a_venir") return <span className="tabular-nums">{c.prevus}</span>;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {c.etat === "ok" && <Check className="size-3.5" aria-hidden />}
      {c.etat === "rate" && <X className="size-3.5" aria-hidden />}
      {c.publies}/{c.prevus}
    </span>
  );
}

/** Les posts du jour : rang, vues, lien. */
function ListePosts({ c }: { c: CaseJour }) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="space-y-1">
      {c.posts.map((p) => (
        <li key={p.rang} className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{t("accueilHm.calendrier.rang", { rang: p.rang })}</span>
          {p.url ? (
            <>
              <span className="text-muted-foreground">
                {p.vues === null
                  ? t("accueilHm.calendrier.vuesInconnues")
                  : t("accueilHm.calendrier.vues", { vues: p.vues.toLocaleString(i18n.resolvedLanguage) })}
              </span>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
              >
                {t("accueilHm.calendrier.ouvrir")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          ) : (
            <span className="text-destructive-foreground">{t("accueilHm.calendrier.pasDeLien")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * « Cette semaine » en calendrier (0370) : une ligne par compte, une colonne
 * par jour du lundi au dimanche. Vert : tout publié ; orange : incomplet ;
 * rouge : rien ; gris : à venir ; aujourd'hui encadré. Un clic sur une case
 * ouvre les posts du jour et, s'il y a un problème, le diagnostic de la
 * semaine en 3 lignes et ce qu'il faut faire. `hm` : la HM choisie par
 * l'admin ou le Head of Ops ("" = toutes) ; une HM ne reçoit que les siens.
 */
export function CalendrierSemaine({ hm = "" }: { hm?: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const aujourdhui = aujourdhuiParis();
  const semaines = semainesChoix(paireDuJour(aujourdhui).poste);
  const [lundi, setLundi] = React.useState(semaines[0]!);
  const [problemesSeulement, setProblemesSeulement] = React.useState(false);
  const [pays, setPays] = React.useState("");
  const [ouverte, setOuverte] = React.useState<{ ligne: LigneCalendrier; c: CaseJour } | null>(null);

  const donnees = useQuery({
    queryKey: ["accueil-hm", "calendrier", lundi],
    queryFn: async () => {
      const [lignes, cohorte] = await Promise.all([lireCalendrier(lundi), lireCohorte(lundi)]);
      const noms = await nomsHms([...new Set(lignes.map((l) => l.poster_id))]);
      return { lignes, cohorte: new Map(cohorte.map((c) => [c.compte_id, c])), noms };
    },
  });
  const etapes = useQuery({ queryKey: ["etapes-comptes"], queryFn: lireEtapesComptes });

  const toutes = donnees.data?.lignes ?? [];
  const nom = (l: LigneCalendrier) => donnees.data?.noms.get(l.poster_id) ?? "—";
  const visibles = filtrerLignes(toutes, { problemesSeulement, pays, hm }, lundi, aujourdhui)
    // Les problèmes d'abord, puis par nom.
    .map((l) => ({ l, probleme: aUnProbleme(l, lundi, aujourdhui) }))
    .sort((a, b) => Number(b.probleme) - Number(a.probleme) || nom(a.l).localeCompare(nom(b.l)));
  const jours = joursSemaine(lundi);
  const fmtJour = new Intl.DateTimeFormat(localeDate(langue), { weekday: "short", timeZone: "UTC" });
  const fmtLong = new Intl.DateTimeFormat(localeDate(langue), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const date = (j: string) => new Date(`${j}T12:00:00Z`);
  const nbProblemes = filtrerLignes(toutes, { problemesSeulement: true, pays, hm }, lundi, aujourdhui).length;
  const nbVus = filtrerLignes(toutes, { problemesSeulement: false, pays, hm }, lundi, aujourdhui).length;

  return (
    <Card data-testid="calendrier-semaine">
      <CardHeader>
        <CardTitle>
          {lundi === semaines[0] ? t("accueilHm.calendrier.cetteSemaine") : t("accueilHm.calendrier.semaineDerniere")} ·{" "}
          {libelleCohorte(lundi)}
        </CardTitle>
        <CardDescription>{t("accueilHm.cetteSemaineDesc")}</CardDescription>
        {donnees.data && nbVus > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 text-xs tabular-nums">
            <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">
              {t("accueilHm.resume.posteurs", { count: nbVus })}
            </span>
            <span className="rounded-full border border-success/40 bg-success/8 px-2.5 py-0.5 text-success-foreground">
              {t("accueilHm.resume.ok", { n: nbVus - nbProblemes })}
            </span>
            {nbProblemes > 0 && (
              <span className="rounded-full border border-warning/50 bg-warning/10 px-2.5 py-0.5 text-warning-foreground">
                {t("accueilHm.resume.aRelancer", { n: nbProblemes })}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={lundi}
            onChange={(e) => setLundi(e.target.value)}
            aria-label={t("accueilHm.calendrier.semaine")}
          >
            {semaines.map((s, i) => (
              <option key={s} value={s}>
                {i === 0 ? t("accueilHm.calendrier.cetteSemaine") : t("accueilHm.calendrier.semaineDerniere")} ·{" "}
                {libelleCohorte(s)}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            aria-label={t("accueilHm.calendrier.filtrePays")}
          >
            <option value="">{t("accueilHm.calendrier.tousPays")}</option>
            {paysPresents(toutes).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={problemesSeulement}
              onChange={(e) => setProblemesSeulement(e.target.checked)}
            />
            {t("accueilHm.calendrier.problemesSeulement")}
          </label>
        </div>

        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {(["ok", "partiel", "rate", "a_venir"] as const).map((e) => (
            <li key={e} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block size-3 rounded-sm border", COULEUR[e])} />
              {t(`accueilHm.calendrier.legende.${e}`)}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border ring-2 ring-primary/70" />
            {t("accueilHm.calendrier.legende.en_cours")}
          </li>
        </ul>

        {donnees.isLoading && <BarreChargement actif />}
        {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}

        {donnees.data &&
          (visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {toutes.length === 0 ? t("accueilHm.vide") : t("accueilHm.calendrier.aucun")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="sticky left-0 z-10 border-b bg-muted px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("accueilHm.posteur")}
                    </th>
                    {jours.map((j) => (
                      <th
                        key={j}
                        className={cn(
                          "border-b px-1 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                          j === aujourdhui && "bg-primary/10 text-primary",
                        )}
                      >
                        <span className="block">{fmtJour.format(date(j))}</span>
                        <span className="block text-sm normal-case tabular-nums">{Number(j.slice(8, 10))}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(({ l }) => {
                    const c = donnees.data!.cohorte.get(l.compte_id);
                    const etat = c ? etatCohorte(c, aujourdhui) : null;
                    return (
                      <tr key={l.compte_id} className="hover:bg-muted/30">
                        <td className="sticky left-0 z-10 max-w-32 border-b bg-card sm:max-w-44 px-3 py-2 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-[10px] text-primary sm:flex"
                            >
                              {initiales(nom(l))}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{nom(l)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {l.handle ? (
                                  <a
                                    href={`https://www.tiktok.com/@${l.handle}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline-offset-2 hover:text-primary hover:underline"
                                  >
                                    @{l.handle}
                                  </a>
                                ) : (
                                  "—"
                                )}
                                {l.pays && ` · ${l.pays}`}
                              </p>
                              {etat && (
                                <span className="mt-1 hidden flex-wrap gap-1 sm:flex">
                                  <EtapeBadge etat={etat} />
                                  <QualiteBadge
                                    qualite={qualiteAffichee(etat, etapes.data?.get(l.compte_id)?.qualite)}
                                  />
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {casesSemaine(l, lundi, aujourdhui).map((cj) => {
                          const libelle = `${fmtLong.format(date(cj.jour))} : ${t(`accueilHm.calendrier.etats.${cj.etat}`, {
                            publies: cj.publies,
                            prevus: cj.prevus,
                          })}`;
                          const bouton = (
                            <button
                              type="button"
                              disabled={cj.etat === "vide"}
                              onClick={() => setOuverte({ ligne: l, c: cj })}
                              aria-label={`${nom(l)}, ${libelle}`}
                              data-etat={cj.etat}
                              className={cn(
                                "flex h-10 w-full min-w-10 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                                "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                                COULEUR[cj.etat],
                                cj.aujourdhui && "ring-2 ring-primary/70",
                              )}
                            >
                              <ContenuCase c={cj} />
                            </button>
                          );
                          return (
                            <td
                              key={cj.jour}
                              className={cn("border-b px-1 py-2 align-middle", cj.aujourdhui && "bg-primary/5")}
                            >
                              {cj.posts.some((p) => p.url) ? (
                                <Tooltip>
                                  <TooltipTrigger render={bouton} />
                                  <TooltipPopup className="w-max max-w-80 p-1 text-xs">
                                    <ListePosts c={cj} />
                                  </TooltipPopup>
                                </Tooltip>
                              ) : (
                                bouton
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
      </CardContent>

      <Dialog open={ouverte !== null} onOpenChange={(o) => !o && setOuverte(null)}>
        <DialogPopup className="max-w-md">
          {ouverte && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {nom(ouverte.ligne)}
                  {ouverte.ligne.handle && (
                    <span className="font-normal text-muted-foreground"> · @{ouverte.ligne.handle}</span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {fmtLong.format(date(ouverte.c.jour))} ·{" "}
                  {t(`accueilHm.calendrier.etats.${ouverte.c.etat}`, {
                    publies: ouverte.c.publies,
                    prevus: ouverte.c.prevus,
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogPanel className="space-y-4 pb-5 text-sm">
                <ListePosts c={ouverte.c} />
                {(ouverte.c.etat === "rate" ||
                  ouverte.c.etat === "partiel" ||
                  ouverte.ligne.diagnostic.badge !== "ok") && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("accueilHm.calendrier.diagnosticSemaine")}
                    </p>
                    <DiagnosticCompte diagnostic={ouverte.ligne.diagnostic} />
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                      <p className="font-medium">{t("accueilHm.calendrier.actionTitre")}</p>
                      <p>{t(`accueilHm.calendrier.actions.${ouverte.ligne.diagnostic.badge}`)}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <ActionsPosteur
                    posteurId={ouverte.ligne.poster_id}
                    nom={nom(ouverte.ligne)}
                    compteId={ouverte.ligne.compte_id}
                    warmupLance={ouverte.ligne.warmup_lance}
                    aPublie={aPublieCalendrier(ouverte.ligne)}
                  />
                </div>
              </DialogPanel>
            </>
          )}
        </DialogPopup>
      </Dialog>
    </Card>
  );
}
