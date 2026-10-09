import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Shuffle, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  lancerContenusABlanc,
  listerApplications,
  listerLabelIdsApplication,
  listerLabels,
  listerSlideshowsLabelABlanc,
} from "./api";
import { ID_SOPHIA, SLUG_SOPHIA } from "./multiApp";
import { LANGUES_CIBLES, nomLangue } from "./langues";
import {
  iaBloqueeParLaNuit,
  motifBlocageCle,
  operationCle,
  type AssignationABlancLog,
} from "./assignationABlanc";
import {
  basculerSelection,
  formatNote,
  MAX_CONTENUS_A_BLANC,
  motifNonEligibleCle,
  ordonnerLabels,
  raisonDeckCle,
  statutDeckCle,
  tirerAuHasard,
  type ContenusABlancResultat,
  type ContenuTesteABlanc,
  type DeckTesteABlanc,
  type SlideshowABlanc,
  type SlideTesteeABlanc,
} from "./contenusABlanc";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const SLUG_DEFAUT = "unswipe";

/**
 * Test à blanc « contenus » : choisir 1 à 3 slideshows d'un label, puis voir
 * la note de pertinence d'une application (calcul du rattrapage), son
 * éligibilité, son tier d'entrée et son placement — sans rien enregistrer
 * (fonction `assignation-a-blanc`, mode `contenus`). Sert à vérifier les
 * prompts `pertinence_<app>` / `placement_<app>` avant de lancer le rattrapage
 * de tout un label.
 */
export function ContenusABlancCard() {
  const { t } = useTranslation();
  const applications = useQuery({ queryKey: ["applications"], queryFn: listerApplications });
  const autres = React.useMemo(
    () => (applications.data ?? []).filter((a) => a.id !== ID_SOPHIA && a.slug !== SLUG_SOPHIA),
    [applications.data],
  );
  const [applicationChoisie, setApplicationChoisie] = React.useState("");
  const applicationId =
    applicationChoisie || (autres.find((a) => a.slug === SLUG_DEFAUT) ?? autres[0])?.id || "";

  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels(), staleTime: 60_000 });
  const servis = useQuery({
    queryKey: ["labels-application", applicationId],
    queryFn: () => listerLabelIdsApplication(applicationId),
    enabled: Boolean(applicationId),
  });
  const labelsOrdonnes = React.useMemo(
    () => ordonnerLabels(labels.data ?? [], new Set(servis.data ?? [])),
    [labels.data, servis.data],
  );
  const [labelId, setLabelId] = React.useState("");
  const [recherche, setRecherche] = React.useState("");
  const rechercheDifferee = React.useDeferredValue(recherche.trim());
  const slideshows = useQuery({
    queryKey: ["slideshows-a-blanc", labelId, rechercheDifferee],
    queryFn: () => listerSlideshowsLabelABlanc(labelId, rechercheDifferee),
    enabled: Boolean(labelId),
  });
  const [choisis, setChoisis] = React.useState<SlideshowABlanc[]>([]);
  const [langue, setLangue] = React.useState("");
  const [logs, setLogs] = React.useState<AssignationABlancLog[]>([]);
  const logsRef = React.useRef<HTMLDivElement>(null);
  const nuit = iaBloqueeParLaNuit();

  React.useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  const basculer = (s: SlideshowABlanc) => {
    setChoisis((prev) => {
      const ids = basculerSelection(prev.map((x) => x.id), s.id);
      const parId = new Map([...prev, s].map((x) => [x.id, x]));
      return ids.map((id) => parId.get(id)!).filter(Boolean);
    });
  };

  const tester = useMutation({
    mutationFn: () => {
      setLogs([]);
      return lancerContenusABlanc(
        applicationId,
        choisis.map((c) => c.id),
        langue || null,
        (ligne) => setLogs((prev) => [...prev, ligne]),
      );
    },
  });

  const liste = slideshows.data ?? [];
  const pleine = choisis.length >= MAX_CONTENUS_A_BLANC;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t("contenusABlanc.title")}
        </CardTitle>
        <CardDescription>{t("contenusABlanc.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>{t("contenusABlanc.garantie")}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cabApplication">{t("contenusABlanc.application")}</Label>
            <select
              id="cabApplication"
              className={selectClass}
              value={applicationId}
              onChange={(e) => setApplicationChoisie(e.target.value)}
            >
              {autres.length === 0 && <option value="">{t("contenusABlanc.aucuneApplication")}</option>}
              {autres.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom || a.slug}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cabLabel">{t("contenusABlanc.label")}</Label>
            <select
              id="cabLabel"
              className={selectClass}
              value={labelId}
              onChange={(e) => {
                setLabelId(e.target.value);
                setChoisis([]);
              }}
            >
              <option value="">{t("contenusABlanc.labelChoisir")}</option>
              {labelsOrdonnes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                  {l.sert ? ` · ${t("contenusABlanc.labelSert")}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cabLangue">{t("contenusABlanc.langue")}</Label>
            <select id="cabLangue" className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
              <option value="">{t("contenusABlanc.langueSource")}</option>
              {LANGUES_CIBLES.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)} ({l})
                </option>
              ))}
            </select>
          </div>
        </div>

        {labelId && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor="cabRecherche">{t("contenusABlanc.recherche")}</Label>
                <Input
                  id="cabRecherche"
                  placeholder={t("contenusABlanc.recherchePh")}
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={liste.length === 0 || tester.isPending}
                onClick={() => setChoisis(tirerAuHasard(liste, MAX_CONTENUS_A_BLANC))}
              >
                <Shuffle className="size-4" />
                {t("contenusABlanc.hasard")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {slideshows.isLoading
                ? t("contenusABlanc.chargement")
                : t("contenusABlanc.nbSlideshows", { n: liste.length, max: MAX_CONTENUS_A_BLANC })}
            </p>
            {slideshows.isError && (
              <p className="text-xs text-destructive">{(slideshows.error as Error).message}</p>
            )}
            <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1" data-testid="liste-slideshows">
              {liste.map((s) => {
                const coche = choisis.some((c) => c.id === s.id);
                return (
                  <li key={s.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted",
                        coche && "bg-primary/10",
                        !coche && pleine && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={coche}
                        disabled={(!coche && pleine) || tester.isPending}
                        onChange={() => basculer(s)}
                      />
                      <span className="flex-1 truncate">{s.titre || "—"}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {s.langue_source ?? "?"} · {t("contenusABlanc.vues", { n: (s.vues_source ?? 0).toLocaleString() })}
                      </span>
                    </label>
                  </li>
                );
              })}
              {!slideshows.isLoading && liste.length === 0 && (
                <li className="px-2 py-1 text-xs text-muted-foreground">{t("contenusABlanc.aucunSlideshow")}</li>
              )}
            </ul>
          </div>
        )}

        {choisis.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="selection">
            <span className="text-muted-foreground">{t("contenusABlanc.selection")} :</span>
            {choisis.map((c) => (
              <Badge key={c.id} variant="secondary">
                {(c.titre || c.id.slice(0, 8)).slice(0, 40)}
                <button
                  type="button"
                  className="ml-1"
                  aria-label={t("contenusABlanc.retirer")}
                  disabled={tester.isPending}
                  onClick={() => basculer(c)}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        {nuit && <p className="text-xs text-warning">{t("contenusABlanc.nuit")}</p>}
        <Button
          type="button"
          disabled={!applicationId || choisis.length === 0 || nuit || tester.isPending}
          onClick={() => tester.mutate()}
        >
          {tester.isPending ? t("contenusABlanc.enCours") : t("contenusABlanc.lancer")}
        </Button>

        {(tester.isPending || logs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("aBlanc.logs")}
              {tester.isPending ? ` — ${t("contenusABlanc.enCours")}` : ""}
            </p>
            <div
              ref={logsRef}
              className="max-h-56 overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && tester.isPending && (
                <p className="text-muted-foreground">{t("aBlanc.logsAttente")}</p>
              )}
              {logs.map((l, i) => (
                <p
                  key={`${l.at}-${i}`}
                  className={cn(
                    l.etape === "a_blanc" && "italic text-muted-foreground",
                    l.statut === "echec" && "text-destructive",
                    l.statut === "ok" && "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <span className="text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span> {l.detail}
                </p>
              ))}
            </div>
          </div>
        )}

        {tester.isError && <p className="text-sm text-destructive">{(tester.error as Error).message}</p>}
        {tester.isSuccess && <ResultatContenus r={tester.data} />}
      </CardContent>
    </Card>
  );
}

function ResultatContenus({ r }: { r: ContenusABlancResultat }) {
  const { t } = useTranslation();
  const nomApp = r.application?.nom ?? r.application?.slug ?? "—";
  return (
    <div className="space-y-4" data-testid="resultat-contenus-a-blanc">
      {r.erreurRun && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("aBlanc.erreurRun", { erreur: r.erreurRun })}
        </p>
      )}
      {!r.erreurRun && <p className="rounded-md bg-success/10 p-3 text-sm font-medium text-success">{r.resume}</p>}
      {r.prompts && !r.prompts.pertinence.present && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("contenusABlanc.promptPertinenceVide", { cle: r.prompts.pertinence.cle })}
        </p>
      )}
      {r.prompts && !r.prompts.placement.present && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("contenusABlanc.promptPlacementVide", { cle: r.prompts.placement.cle })}
        </p>
      )}

      {r.contenus.map((c, i) => (
        <FicheContenu key={c.id} c={c} rang={i + 1} nomApp={nomApp} />
      ))}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("aBlanc.ecritures")}</p>
        {r.ecrituresEvitees.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("aBlanc.ecrituresVide")}</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {r.ecrituresEvitees.map((e) => (
              <li key={`${e.table}-${e.operation}`}>
                <span className="font-mono">{e.table}</span> · {t(operationCle(e.operation))} ×{e.requetes} (
                {t("aBlanc.colLignes").toLowerCase()} : {e.lignes ?? "?"})
              </li>
            ))}
          </ul>
        )}
        {r.appelsBloques.length > 0 && (
          <ul className="space-y-0.5 text-xs">
            {r.appelsBloques.map((b) => (
              <li key={`${b.hote}-${b.motif}`}>
                {t("aBlanc.appels")} : <span className="font-mono">{b.hote}</span> · {t(motifBlocageCle(b.motif))} ×
                {b.nombre}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("contenusABlanc.iaCompteur", {
            autorises: r.appelsIA.autorises,
            bloques: r.appelsIA.bloques,
            plafond: r.plafondIA,
          })}{" "}
          · {t("aBlanc.lectures", { n: r.lectures })} · {t("aBlanc.duree", { s: Math.round(r.dureeMs / 100) / 10 })}
        </p>
      </div>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">{t("aBlanc.limites")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {r.limites.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function FicheContenu({ c, rang, nomApp }: { c: ContenuTesteABlanc; rang: number; nomApp: string }) {
  const { t } = useTranslation();
  const p = c.pertinence;
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm" data-testid="contenu-a-blanc">
      <div className="space-y-0.5">
        <p className="font-medium">
          {rang}. {c.titre || "—"} <span className="font-mono text-xs text-muted-foreground">{c.id.slice(0, 8)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("contenusABlanc.langues", { source: c.langueSource || "?", langue: c.langue || "?" })} ·{" "}
          {t("contenusABlanc.vues", { n: (c.vues ?? 0).toLocaleString() })} ·{" "}
          {c.pisteSource === null
            ? t("contenusABlanc.pisteInconnue")
            : t("contenusABlanc.piste", { n: Math.round(c.pisteSource) })}
        </p>
        {c.avertissements.map((a) => (
          <p key={a} className="text-xs text-warning">
            {a}
          </p>
        ))}
        {c.erreur && <p className="text-xs text-destructive">{c.erreur}</p>}
      </div>

      {p && (
        <div className="space-y-1 rounded-md bg-muted/30 p-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("contenusABlanc.etapePertinence", { app: nomApp })}
          </p>
          {p.erreur ? (
            <p className="text-xs text-destructive">{p.erreur}</p>
          ) : (
            <>
              <p>
                <span className="text-lg font-semibold tabular-nums">{p.score ?? "—"}</span>
                <span className="text-muted-foreground">/100</span>{" "}
                {p.raison && <span className="italic">« {p.raison} »</span>}
              </p>
              {p.accroche && (
                <p className="text-xs text-muted-foreground">{t("contenusABlanc.accroche", { texte: p.accroche })}</p>
              )}
              <p className="text-xs">
                {t("contenusABlanc.note", { note: formatNote(p.note), seuil: p.seuil })} ·{" "}
                {t("contenusABlanc.plancher", { plancher: p.plancher })}
                {p.forcee && <> · {t("contenusABlanc.forcee")}</>}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={p.eligible ? "success" : "error"}>
                  {p.eligible ? t("contenusABlanc.eligible") : t("contenusABlanc.nonEligible")}
                </Badge>
                {p.motifs.map((m) => (
                  <span key={m} className="text-xs text-destructive">
                    {t(motifNonEligibleCle(m), { plancher: p.plancher, seuil: p.seuil })}
                  </span>
                ))}
                <Badge variant="outline">
                  {t("contenusABlanc.tier", { tier: p.tier, passages: p.passages })}
                </Badge>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {p.enBase
              ? t("contenusABlanc.enBase", {
                score: p.enBase.score ?? "—",
                note: formatNote(p.enBase.note),
                eligible: p.enBase.eligible ? t("contenusABlanc.eligible") : t("contenusABlanc.nonEligible"),
              })
              : t("contenusABlanc.jamaisNote", { app: nomApp })}
          </p>
        </div>
      )}

      {c.deck && <BlocDeck deck={c.deck} eligible={Boolean(p?.eligible)} langue={c.langue} nomApp={nomApp} />}
    </div>
  );
}

function BlocDeck({
  deck,
  eligible,
  langue,
  nomApp,
}: {
  deck: DeckTesteABlanc;
  eligible: boolean;
  langue: string;
  nomApp: string;
}) {
  const { t } = useTranslation();
  const raison = raisonDeckCle(deck.raison);
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("contenusABlanc.etapePlacement", { app: nomApp, langue })}
        </p>
        <Badge variant={deck.statut === "pret" ? "success" : deck.statut === "ineligible" ? "warning" : "error"}>
          {t(statutDeckCle(deck.statut))}
        </Badge>
      </div>
      {raison && <p className="text-xs text-destructive">{t(raison.cle, { raison: raison.brut, cle: raison.brut })}</p>}
      {!eligible && <p className="text-xs text-warning">{t("contenusABlanc.placementQuandMeme")}</p>}
      {deck.positionImposee !== null && (
        <p className="text-xs text-info">{t("contenusABlanc.concurrent", { position: deck.positionImposee })}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <ListeSlides titre={t("contenusABlanc.avant")} slides={deck.base} remplacee={deck.slidePub} />
        {deck.statut === "pret" && (
          <ListeSlides titre={t("contenusABlanc.apres")} slides={deck.slides} pub={deck.slidePub} />
        )}
      </div>
      {deck.hashtags && (
        <p className="text-xs">
          <span className="text-muted-foreground">{t("aBlanc.hashtags")} :</span> {deck.hashtags}
        </p>
      )}
      {deck.variantes.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("contenusABlanc.variantes", { n: deck.variantes.length })}
            {deck.mode ? ` · ${deck.mode}` : ""}
          </summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {deck.variantes.map((v, i) => (
              <li key={i} className={cn(i === deck.varianteRetenue && "font-medium")}>
                {v}
                {i === deck.varianteRetenue && (
                  <Badge variant="default" className="ml-1.5">
                    {t("contenusABlanc.retenue")}
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function ListeSlides({
  titre,
  slides,
  pub,
  remplacee,
}: {
  titre: string;
  slides: SlideTesteeABlanc[];
  pub?: number | null;
  remplacee?: number | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{titre}</p>
      {slides.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ol className="space-y-1">
          {slides.map((s) => {
            const estPub = pub !== undefined && pub !== null && s.position === pub;
            const estRemplacee = remplacee !== undefined && remplacee !== null && s.position === remplacee;
            return (
              <li
                key={s.position}
                className={cn(
                  "flex items-start gap-2 rounded px-1.5 py-1 text-xs",
                  estPub && "border border-primary bg-primary/10 font-medium",
                  estRemplacee && "bg-muted line-through decoration-muted-foreground/60",
                )}
                data-pub={estPub ? "true" : undefined}
              >
                <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{s.position}.</span>
                <span className="whitespace-pre-line">
                  {s.texte || "—"}
                  {estPub && (
                    <Badge variant="default" className="ml-1.5">
                      {t("aBlanc.pub")}
                    </Badge>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
