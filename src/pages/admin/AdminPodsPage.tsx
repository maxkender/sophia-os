import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Boxes, Check, ExternalLink } from "lucide-react";

import { EtiquetteApplication, LogoApplication } from "@/components/brand/LogoApplication";
import { BarChart, type PointBarre } from "@/components/charts/BarChart";
import { abrege, exact } from "@/components/charts/echelle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Replie } from "@/components/ui/replie";
import { Segments } from "@/components/ui/segments";
import { SectionBoitePodz } from "@/features/bleo/SectionBoitePodz";
import { drapeauLangue } from "@/features/moteur/langues";
import { SEUIL_STOCK_JOURS } from "@/features/moteur/pilotage";
import { Aide, BarreReserve } from "@/features/moteur/repartition/graphes";
import {
  autonomieMin,
  deciderPersona,
  echeanceAutoValidation,
  enregistrerDemo,
  itemsVideo,
  languesOrdonnees,
  lireTableauPods,
  listerDemos,
  listerPersonas,
  majAutoValidation,
  nomsComptes,
  POD_VIDEO,
  listerLivraisons,
  listerPods,
  parPod,
  rejeterLivraison,
  validerLivraison,
  variantesDeck,
  type Livraison,
  type PerceeTableau,
  type Pod,
  type PodTableau,
  type PreuveOriginal,
  type StatutLivraison,
} from "@/features/pods/api";
import { lignesPods, OBJECTIF_PART_PODS, resumePods, type ResumePods } from "@/features/pods/resume";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

/** Les tableaux de la page Allocation : en-têtes en petites capitales, lignes fines. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-4 align-top last:pr-0";
const LIGNE = "border-b border-border/40";

/** La couleur dit l'état ; le texte reste neutre. */
const POINT_STATUT: Record<StatutLivraison, string> = {
  a_valider: "bg-warning",
  validee: "bg-success",
  rejetee: "bg-destructive",
  ecartee_note: "bg-muted-foreground",
};

function PastilleStatut({ statut }: { statut: StatutLivraison }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
      <span className={cn("size-1.5 rounded-full", POINT_STATUT[statut])} aria-hidden />
      {t(`pods.statut.${statut}`)}
    </span>
  );
}

function Deck({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const langues = languesOrdonnees(livraison);
  const [langue, setLangue] = React.useState(langues[0]);
  // Sophia et/ou les applications livrées (pod 6 : UnSwipe seul).
  const variantes = variantesDeck(livraison, langue);
  const [cle, setCle] = React.useState<string | null>(null);
  const deck = variantes.find((v) => v.cle === cle) ?? variantes[0];
  const choixApplis = variantes.length > 1 || (deck && deck.cle !== "sophia");
  return (
    <div className="space-y-2">
      {(langues.length > 1 || choixApplis) && (
        <div className="flex flex-wrap items-center gap-2">
          {langues.length > 1 && (
            <Segments
              libelle={t("pods.ongletsLangues")}
              actif={langue}
              onChange={setLangue}
              options={langues.map((l) => ({ cle: l, contenu: `${drapeauLangue(l)} ${l}` }))}
            />
          )}
          {choixApplis && (
            <Segments
              libelle={t("pods.ongletsApplis")}
              actif={deck?.cle}
              onChange={setCle}
              options={variantes.map((v) => ({ cle: v.cle, contenu: <EtiquetteApplication slug={v.cle} taille="xs" /> }))}
            />
          )}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {deck?.slides.map((s) => (
          <div key={s.position} className="w-32 shrink-0 space-y-1">
            <a href={s.url} target="_blank" rel="noreferrer" className="relative block">
              {s.texte_overlay !== undefined && (
                <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 whitespace-pre-line rounded bg-black/50 p-1 text-center text-[9px] leading-tight text-white">
                  {s.texte_sophia ?? s.texte_overlay}
                </span>
              )}
              <img
                src={s.url}
                alt={`slide ${s.position}`}
                loading="lazy"
                className={`h-56 w-full rounded-md border object-cover ${s.position_sophia ? "ring-2 ring-primary" : ""}`}
              />
            </a>
            {s.position_sophia && <p className="text-center text-xs text-primary">{t("pods.appli")}</p>}
            {s.reference_url && (
              <a href={s.reference_url} target="_blank" rel="noreferrer" className="block" title={t("pods.inspiration")}>
                <img src={s.reference_url} alt="" loading="lazy" className="h-16 w-auto rounded border opacity-80" />
                <span className="text-[10px] text-muted-foreground">{t("pods.inspiration")}</span>
              </a>
            )}
          </div>
        ))}
      </div>
      {deck?.hashtags && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("pods.legende")} :</span> {deck.hashtags}
        </p>
      )}
    </div>
  );
}

/** Pod 4 : le schéma d'accroche et ce qui prouve qu'il fait des vues aujourd'hui. */
function Preuve({ preuve }: { preuve: PreuveOriginal }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
      <p>
        <span className="font-medium">{t("pods.preuve")} :</span> {t("pods.preuveSchema", { schema: preuve.schema })}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        {preuve.references.map((r) =>
          r.type === "tiktok" ? (
            <li key={r.url}>
              <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                {t("pods.preuveTiktok", {
                  vues: abrege(r.vues, i18n.language),
                  date: new Date(`${r.publie_le}T12:00:00Z`).toLocaleDateString(localeDate()),
                })}
                <ExternalLink className="size-3" />
              </a>
              {r.enregistrements != null &&
                ` · ${t("pods.preuveEnregistrements", { n: abrege(r.enregistrements, i18n.language) })}`}
            </li>
          ) : (
            <li key={r.contenu_id}>
              {t("pods.preuveOs", {
                r: r.r_median?.toLocaleString() ?? "—",
                n: r.publies,
                contenu: r.contenu_id.slice(0, 8),
              })}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function LigneLivraison({ livraison, pod }: { livraison: Livraison; pod?: Pod }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [motif, setMotif] = React.useState("");
  // Podz sûr : la livraison sera validée toute seule au bout du délai.
  const echeance =
    pod?.auto_validation && livraison.type !== "video"
      ? echeanceAutoValidation(livraison.depose_le, pod.auto_validation_heures)
      : null;
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] });
  const valider = useMutation({ mutationFn: () => validerLivraison(livraison.id), onSuccess: rafraichir });
  const rejeter = useMutation({ mutationFn: () => rejeterLivraison(livraison.id, motif), onSuccess: rafraichir });
  const occupe = valider.isPending || rejeter.isPending;
  const erreur = (valider.error ?? rejeter.error) as Error | null;

  // Ce qu'est la livraison, d'où elle vient : une ligne, séparée par des points.
  const contexte: React.ReactNode[] = [
    <span key="type" className="inline-flex items-center gap-1 font-medium text-foreground">
      {livraison.type === "langues"
        ? t("pods.types.langues", { langues: Object.keys(livraison.decks ?? {}).join(", ") })
        : t(`pods.types.${livraison.type}`)}
      {livraison.type === "original" && <Aide libelle={t("pods.types.original")}>{t("pods.original")}</Aide>}
    </span>,
  ];
  if (livraison.source_vues != null) contexte.push(t("pods.vues", { n: livraison.source_vues.toLocaleString() }));
  if (livraison.musique_titre) {
    contexte.push(
      <span key="musique">
        ♪{" "}
        {livraison.musique_url ? (
          <a className="underline-offset-2 hover:underline" href={livraison.musique_url} target="_blank" rel="noreferrer">
            {livraison.musique_titre}
          </a>
        ) : (
          livraison.musique_titre
        )}
      </span>,
    );
  }
  if (livraison.source_url) {
    contexte.push(
      <a key="source" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={livraison.source_url} target="_blank" rel="noreferrer">
        {t("pods.source")} <ExternalLink className="size-3" />
      </a>,
    );
  }

  return (
    <div className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{livraison.titre ?? livraison.id}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {contexte.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {c}
              </React.Fragment>
            ))}
          </p>
        </div>
        <PastilleStatut statut={livraison.statut} />
      </div>

      {livraison.preuve && <Preuve preuve={livraison.preuve} />}

      {livraison.type === "video" ? <DeckVideo livraison={livraison} /> : <Deck livraison={livraison} />}

      {livraison.statut === "a_valider" ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          {livraison.auto_erreur ? (
            <p className="text-xs font-medium text-destructive">{t("pods.autoErreur", { erreur: livraison.auto_erreur })}</p>
          ) : (
            echeance && (
              <p className="text-xs text-muted-foreground">
                {t("pods.autoEcheance", {
                  heure: echeance.toLocaleString(localeDate(), { weekday: "short", hour: "2-digit", minute: "2-digit" }),
                })}
              </p>
            )
          )}
          <div className="flex flex-wrap items-start gap-2">
            <Input
              className="min-w-0 flex-1 basis-60"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={t("pods.motif")}
              aria-label={t("pods.motif")}
            />
            <Button disabled={occupe} onClick={() => valider.mutate()}>
              {t("pods.valider")}
            </Button>
            <Button disabled={occupe} variant="outline" onClick={() => rejeter.mutate()}>
              {t("pods.rejeter")}
            </Button>
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {livraison.statut === "validee" && <Check className="size-3.5 text-foreground" aria-hidden />}
          <span>
            {livraison.statut === "validee" &&
              (livraison.type === "video"
                ? t("pods.videoValidee")
                : t("pods.valide", { tier: livraison.tier, note: livraison.note_import }))}
            {livraison.statut === "validee" && livraison.decide_auto && ` · ${t("pods.autoFaite")}`}
            {livraison.statut === "ecartee_note" && t("pods.ecartee", { note: livraison.note_import })}
            {livraison.statut === "rejetee" && `${t("pods.rejete")}${livraison.motif ? ` — ${livraison.motif}` : ""}`}
          </span>
        </p>
      )}
    </div>
  );
}

/** Livraison vidéo (pod 3) : une réaction refaite par compte, avec ses textes. */
function DeckVideo({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const items = itemsVideo(livraison);
  const noms = useQuery({
    queryKey: ["pods", "noms", livraison.id],
    queryFn: () => nomsComptes(items.map(([id]) => id)),
  });
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map(([compteId, item]) => (
        <div key={compteId} className="w-44 shrink-0 space-y-1 text-xs">
          <video src={item.reaction_url} controls muted playsInline preload="metadata" className="h-72 w-full rounded-md border bg-black object-cover" />
          <p className="font-medium">
            {drapeauLangue(item.langue)} {noms.data?.get(compteId) ?? compteId.slice(0, 8)}
          </p>
          <p>
            <span className="text-muted-foreground">{t("pods.texteEcran")} :</span> {item.texte_ecran}
          </p>
          <p className="text-muted-foreground">{item.legende}</p>
        </div>
      ))}
    </div>
  );
}

/** Personas synthétiques du pod vidéo : 1 compte = 1 persona, validé à la main. */
function PanneauPersonas({ pod }: { pod: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "personas", pod], queryFn: () => listerPersonas(pod) });
  const decider = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => deciderPersona(id, ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods", "personas", pod] }),
  });
  const personas = data ?? [];
  const aValider = personas.filter((p) => p.statut === "a_valider");
  const valides = personas.filter((p) => p.statut === "valide");
  return (
    <Replie
      titre={t("pods.personas", { valides: valides.length, attente: aValider.length })}
      aide={t("pods.personasAide")}
      ouvert={aValider.length > 0}
    >
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[...aValider, ...valides].map((p) => (
          <div key={p.id} className="w-36 shrink-0 space-y-1 text-xs">
            <img src={p.image_url} alt="" loading="lazy" className="h-48 w-full rounded-md border object-cover" />
            <p className="font-medium">
              {drapeauLangue(p.compte?.langue ?? "")} {p.compte?.handle_tiktok ? `@${p.compte.handle_tiktok}` : p.compte?.persona_nom}
            </p>
            {p.statut === "a_valider" ? (
              <div className="flex gap-1">
                <Button size="sm" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: true })}>
                  {t("pods.valider")}
                </Button>
                <Button size="sm" variant="outline" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: false })}>
                  {t("pods.rejeter")}
                </Button>
              </div>
            ) : (
              <PastilleStatut statut="validee" />
            )}
          </div>
        ))}
      </div>
      {decider.error && <p className="text-sm text-destructive">{(decider.error as Error).message}</p>}
    </Replie>
  );
}

/** Démos Sophia par langue : la vidéo « utilisation » que le poster colle après la réaction. */
function PanneauDemos() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "demos"], queryFn: listerDemos });
  const [langue, setLangue] = React.useState("");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const envoyer = useMutation({
    mutationFn: () => enregistrerDemo(langue, fichier!),
    onSuccess: () => {
      setFichier(null);
      setLangue("");
      void qc.invalidateQueries({ queryKey: ["pods", "demos"] });
    },
  });
  return (
    <Replie titre={t("pods.demos", { n: data?.length ?? 0 })} aide={t("pods.demosAide")}>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="flex flex-wrap gap-3">
        {(data ?? []).map((d) => (
          <div key={d.id} className="w-28 space-y-1 text-xs">
            <video src={d.video_url} controls muted playsInline preload="metadata" className="h-48 w-full rounded-md border bg-black object-cover" />
            <p className="text-center font-medium">
              {drapeauLangue(d.langue)} {d.langue}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={langue}
          onChange={(e) => setLangue(e.target.value)}
          placeholder="fr"
          maxLength={2}
          className="h-9 w-16 rounded-md border bg-background px-2 text-sm"
          aria-label={t("pods.demoLangue")}
        />
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="max-w-full text-sm"
        />
        <Button size="sm" disabled={!fichier || langue.length !== 2 || envoyer.isPending} onClick={() => envoyer.mutate()}>
          {envoyer.isPending ? t("pods.demoEnvoi") : t("pods.demoEnvoyer")}
        </Button>
      </div>
      {envoyer.error && <p className="text-sm text-destructive">{(envoyer.error as Error).message}</p>}
    </Replie>
  );
}

const pourcent = (n: number | null | undefined, langue: string) =>
  n == null ? "—" : `${n.toLocaleString(langue === "fr" ? "fr-FR" : "en-US")} %`;

/** Les quatre chiffres du haut : la part des podz (hier, 7 jours), la file à valider, les percées. */
function ChiffresPods({ resume }: { resume: ResumePods }) {
  const { t, i18n } = useTranslation();
  const { hier } = resume;
  return (
    <StatGroup>
      <StatTile
        label={t("pods.chiffres.hier")}
        value={pourcent(hier?.part, i18n.language)}
        detail={hier ? t("pods.chiffres.hierDetail", { pods: hier.publies_pods, total: hier.publies }) : undefined}
        trend={resume.jours.map((j) => j.part)}
      />
      <StatTile
        label={t("pods.chiffres.septJours")}
        value={pourcent(resume.septJours, i18n.language)}
        detail={t("pods.chiffres.objectif", { n: OBJECTIF_PART_PODS })}
      />
      <StatTile
        label={t("pods.chiffres.aValider")}
        value={resume.aValider}
        tone={resume.autoErreurs > 0 ? "alerte" : "neutre"}
        detail={
          resume.autoErreurs > 0
            ? t("pods.chiffres.autoErreurs", { n: resume.autoErreurs })
            : resume.podsEnAttente > 0
              ? t("pods.chiffres.aValiderDetail", { count: resume.podsEnAttente })
              : undefined
        }
      />
      <StatTile
        label={t("pods.chiffres.percees")}
        value={resume.percees}
        detail={
          resume.meilleure
            ? t("pods.chiffres.perceesDetail", { vues: abrege(resume.meilleure.vues, i18n.language) })
            : t("pods.chiffres.aucunePercee")
        }
      />
    </StatGroup>
  );
}

/** La part des podz jour par jour, face à l'objectif. */
function CarteJours({ resume }: { resume: ResumePods }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const points: PointBarre[] = resume.jours.map((j) => {
    const d = new Date(`${j.jour}T12:00:00Z`);
    return {
      key: j.jour,
      axisLabel: d.toLocaleDateString(localeDate(langue), { day: "2-digit", month: "2-digit" }),
      tooltipTitle: `${d.toLocaleDateString(localeDate(langue), { weekday: "long", day: "numeric", month: "long" })} · ${j.publies_pods} / ${j.publies}`,
      value: j.part,
    };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.jours.titre")}</CardTitle>
        <CardDescription>{t("pods.jours.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarChart
          points={points}
          average={points.map(() => OBJECTIF_PART_PODS)}
          averageLabel={t("pods.jours.objectif")}
          valueLabel={t("pods.jours.serie")}
          height={180}
          formatTick={(n) => `${n} %`}
          formatValue={(n) => pourcent(n, langue)}
          ariaLabel={t("pods.jours.titre")}
        />
      </CardContent>
    </Card>
  );
}

/** Le tableau de bord des podz (fonction SQL `pods_tableau`, 0324) : les chiffres de chaque podz. */
function CarteTableauPods({ lignes }: { lignes: PodTableau[] }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const nombre = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(langue === "fr" ? "fr-FR" : "en-US"));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.tableau.titre")}</CardTitle>
        <CardDescription>{t("pods.tableau.description")}</CardDescription>
      </CardHeader>
      <CardContent className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("pods.tableau.podz")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.vuesMediane")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.pct10k")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.meilleur")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.r")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.publies7j")}</th>
              <th className={TH}>
                <span className="inline-flex items-center gap-1">
                  {t("pods.tableau.runway")}
                  <Aide libelle={t("pods.tableau.runway")}>{t("pods.tableau.runwayAide")}</Aide>
                </span>
              </th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.aValider")}</th>
              <th className={cn(TH, "text-right")}>{t("pods.tableau.rangs")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((p) => {
              const runway = autonomieMin(p.autonomie);
              const court = runway?.jours != null && runway.jours < SEUIL_STOCK_JOURS;
              return (
                <tr key={p.slug} className={LIGNE}>
                  <td className={TD}>
                    <a href={`#pod-${p.slug}`} className="font-medium underline-offset-2 hover:underline">
                      {p.nom}
                    </a>
                    {p.auto_validation && (
                      <span className="ml-1.5 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">{t("pods.tableau.auto")}</span>
                    )}
                    {p.label && <div className="font-mono text-xs text-muted-foreground">{p.label}</div>}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{p.vues_mediane == null ? "—" : abrege(p.vues_mediane, langue)}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{pourcent(p.pct_10k, langue)}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{p.max_vues ? abrege(p.max_vues, langue) : "—"}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{nombre(p.r_mediane)}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{p.publies_7j}</td>
                  <td className={cn(TD, "min-w-36")}>
                    {runway?.jours != null ? (
                      <div
                        className="flex items-center gap-2"
                        title={
                          runway.reserve_label_jours == null
                            ? undefined
                            : t("pods.runwayLabel", { n: runway.reserve_label_jours.toLocaleString() })
                        }
                      >
                        <LogoApplication slug={runway.application} taille="xs" />
                        <span className={cn("w-10 shrink-0 tabular-nums", court && "font-semibold text-destructive")}>
                          {t("pods.runwayJours", { n: runway.jours.toLocaleString() })}
                        </span>
                        <div className="w-16">
                          <BarreReserve
                            jours={runway.jours}
                            seuil={SEUIL_STOCK_JOURS}
                            libelleSeuil={t("pods.runwayJours", { n: SEUIL_STOCK_JOURS })}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums", p.a_valider > 0 && "font-semibold text-warning-foreground")}>
                    {p.a_valider}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>
                    {p.coupes} · {p.en_tete}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Ce qui perce : les posts des podz à 30 k vues ou plus sur 14 jours. */
function CartePercees({ percees, nomPod }: { percees: PerceeTableau[]; nomPod: Map<string, string> }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.tableau.percees")}</CardTitle>
        <CardDescription>{t("pods.perceesDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="relative overflow-x-auto">
        {percees.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pods.tableau.aucunePercee")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, "text-right")}>{t("pods.colonnes.vues")}</th>
                <th className={TH}>{t("pods.colonnes.accroche")}</th>
                <th className={TH}>{t("pods.colonnes.appli")}</th>
              </tr>
            </thead>
            <tbody>
              {percees.slice(0, 8).map((pe) => {
                const accroche = pe.accroche?.replace(/\s+/g, " ") ?? "—";
                return (
                  <tr key={`${pe.contenu_id}-${pe.compte}-${pe.jour}`} className={LIGNE}>
                    <td className={cn(TD, "text-right font-semibold tabular-nums")} title={exact(pe.vues, i18n.language)}>
                      {abrege(pe.vues, i18n.language)}
                    </td>
                    <td className={cn(TD, "min-w-0")}>
                      {pe.url ? (
                        <a
                          href={pe.url}
                          target="_blank"
                          rel="noreferrer"
                          title={accroche}
                          className="flex max-w-[22rem] items-center gap-1.5 hover:underline"
                        >
                          <span className="truncate">{accroche}</span>
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                        </a>
                      ) : (
                        <span className="block max-w-[22rem] truncate" title={accroche}>
                          {accroche}
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {[nomPod.get(pe.pod) ?? pe.pod, `${drapeauLangue(pe.langue)} ${pe.langue}`, pe.tier ? t("pods.rangCourt", { tier: pe.tier }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className={TD}>
                      <LogoApplication slug={pe.application} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** Podz sûr : ses livraisons en attente sont validées en B toutes seules, après son délai. */
function InterrupteurAuto({ pod }: { pod: Pod }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const basculer = useMutation({
    mutationFn: (actif: boolean) => majAutoValidation(pod.slug, actif),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={pod.auto_validation}
          disabled={basculer.isPending}
          onCheckedChange={(v) => basculer.mutate(v === true)}
          aria-label={t("pods.autoInterrupteurAria", { pod: pod.nom })}
        />
        <span>{t("pods.autoInterrupteur", { heures: pod.auto_validation_heures })}</span>
      </label>
      {basculer.error && <p className="text-xs text-destructive">{(basculer.error as Error).message}</p>}
    </div>
  );
}

/** Valide une file de livraisons au rang B, une livraison après l'autre. `tous` : toute la file de la page, tous podz confondus. */
function ToutValiderEnB({ livraisons, tous = false }: { livraisons: Livraison[]; tous?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [fait, setFait] = React.useState(0);
  const [erreurs, setErreurs] = React.useState<string[]>([]);
  const tout = useMutation({
    mutationFn: async () => {
      setFait(0);
      setErreurs([]);
      for (const l of livraisons) {
        try {
          await validerLivraison(l.id, "B");
        } catch (e) {
          setErreurs((x) => [...x, `${l.titre ?? l.id} : ${(e as Error).message}`]);
        }
        setFait((n) => n + 1);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] }),
  });
  if (!livraisons.length) return null;
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant={tous ? "default" : "outline"}
        disabled={tout.isPending}
        onClick={() =>
          window.confirm(t(tous ? "pods.toutValiderTousConfirm" : "pods.toutValiderBConfirm", { n: livraisons.length })) && tout.mutate()
        }
      >
        {tout.isPending
          ? t("pods.toutValiderBEnCours", { fait, n: livraisons.length })
          : t(tous ? "pods.toutValiderTous" : "pods.toutValiderB", { n: livraisons.length })}
      </Button>
      {erreurs.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

/** Le haut de page : chiffres, part par jour, tableau des podz, percées. */
function TableauDeBord() {
  const { t } = useTranslation();
  const { data, error } = useQuery({ queryKey: ["pods", "tableau"], queryFn: () => lireTableauPods(14) });
  if (error) {
    return <p className="text-sm text-destructive">{t("pods.tableau.erreur", { message: (error as Error).message })}</p>;
  }
  if (!data) return null;
  const resume = resumePods(data);
  const nomPod = new Map(data.pods.map((p) => [p.slug, p.nom]));
  return (
    <>
      <ChiffresPods resume={resume} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CarteJours resume={resume} />
        <CartePercees percees={data.percees} nomPod={nomPod} />
      </div>
      <CarteTableauPods lignes={lignesPods(data.pods)} />
    </>
  );
}

export function AdminPodsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({ queryKey: ["pods", "livraisons"], queryFn: listerLivraisons });
  const pods = useQuery({ queryKey: ["pods", "liste"], queryFn: listerPods });

  const liste = pods.data ?? [];
  const attente = parPod(liste, data?.aValider ?? []);
  const faites = parPod(liste, data?.decidees ?? []);
  const slugs = [...new Set([...attente.keys(), ...faites.keys()])];
  const infos = (slug: string) => liste.find((p) => p.slug === slug);
  // La vidéo n'est pas un podz sûr : elle reste à valider une par une.
  const toutesAValider = [...attente.entries()].filter(([slug]) => slug !== POD_VIDEO).flatMap(([, ls]) => ls);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("pods.title")}
            <Aide libelle={t("pods.title")}>{t("pods.subtitle")}</Aide>
          </span>
        }
        description={t("pods.description")}
        actions={<ToutValiderEnB livraisons={toutesAValider} tous />}
      />

      <TableauDeBord />

      {/* BLEO : la jauge et la boîte des podz de la voie 1 (lecture seule), sous le tableau de bord. */}
      <SectionBoitePodz />

      {(error || pods.error) && <p className="text-sm text-destructive">{((error ?? pods.error) as Error).message}</p>}

      {!isLoading && !slugs.length && (
        <EmptyState icon={<Boxes />} title={t("pods.vide")} description={t("pods.videDesc")} />
      )}

      {slugs.map((slug) => {
        const pod = infos(slug);
        const aValider = attente.get(slug) ?? [];
        const decidees = faites.get(slug) ?? [];
        return (
          <Card key={slug} id={`pod-${slug}`} className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {pod?.nom ?? slug}
                {pod?.label && <span className="font-mono text-xs font-normal text-muted-foreground">{pod.label}</span>}
                {pod && !pod.actif && <Badge variant="destructive">{t("pods.inactif")}</Badge>}
              </CardTitle>
              <CardDescription>{t("pods.enAttente", { count: aValider.length })}</CardDescription>
              {pod && slug !== POD_VIDEO && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <InterrupteurAuto pod={pod} />
                  <ToutValiderEnB livraisons={aValider} />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {slug === POD_VIDEO && (
                <div className="space-y-2">
                  <PanneauPersonas pod={slug} />
                  <PanneauDemos />
                </div>
              )}
              {aValider.length ? (
                <div className="divide-y divide-border/60">
                  {aValider.map((l) => (
                    <LigneLivraison key={l.id} livraison={l} pod={pod} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("pods.vide")}</p>
              )}
              {!!decidees.length && (
                <Replie titre={`${t("pods.historique")} (${decidees.length})`}>
                  <div className="divide-y divide-border/60">
                    {decidees.map((l) => (
                      <LigneLivraison key={l.id} livraison={l} />
                    ))}
                  </div>
                </Replie>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
