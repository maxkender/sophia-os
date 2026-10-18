import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import {
  lireCibleRepartitionApps,
  lireMarchesApplications,
  lireMarchesRepartition,
  lireReglagesRepartition,
  type MarcheRepartition,
} from "@/features/moteur/repartition/apiRepartition";
import {
  classerApplications,
  ecartsFlotte,
  type CibleApplications,
  type MarcheApplications,
} from "@/features/moteur/repartition/scoreApplication";
import {
  classerLabels,
  classerPropose,
  motifFermeture,
  type LabelClasse,
  type LabelPropose,
  type MotifFermeture,
  type ReglagesChoixLabel,
} from "@/features/moteur/repartition/scoreLabel";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function nombre(n: number, decimales = 2): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Répartition des labels — playground.
 *
 * Répond à une seule question : **où partirait la prochaine recrue, marché par
 * marché, et pourquoi**. Deux colonnes côte à côte, le classement que le moteur
 * applique aujourd'hui et celui que donnerait la règle proposée, pour qu'on
 * voie l'écart avant de décider quoi que ce soit.
 *
 * LA PAGE N'ÉCRIT RIEN. Pas de réglage modifiable, pas de label fermé ni
 * rouvert, aucun compte créé. Les contrôles de fermeture manuelle sont
 * affichés désactivés : la mécanique par application existe dans le miroir
 * (`fermes_app` / `ouverts_app`) mais le moteur ne la lit pas encore, et
 * afficher un bouton qui ne ferait rien serait pire que pas de bouton.
 */
export function AdminRepartitionPage() {
  const { t } = useTranslation();
  const { applications, application, applicationId, slug } = useApplication();
  const nomApp = application ? nomApplication(application) : nomApplication({ slug });
  const [marcheOuvert, setMarcheOuvert] = React.useState<string | null>(null);
  const actifs = React.useMemo(
    () => applications.filter((a) => a.actif).map((a) => ({ id: a.id, slug: a.slug })),
    [applications],
  );
  const slugsActifs = React.useMemo(() => actifs.map((a) => a.slug), [actifs]);

  const marches = useQuery({
    queryKey: ["repartition-marches", applicationId],
    queryFn: () => lireMarchesRepartition(applicationId!),
    enabled: Boolean(applicationId),
    retry: false,
  });
  const reglages = useQuery({
    queryKey: ["repartition-reglages"],
    queryFn: lireReglagesRepartition,
    retry: false,
  });
  const marchesApps = useQuery({
    queryKey: ["repartition-apps"],
    queryFn: lireMarchesApplications,
    retry: false,
  });
  const cibleApps = useQuery({
    queryKey: ["repartition-cible-apps", slugsActifs],
    queryFn: () => lireCibleRepartitionApps(slugsActifs),
    enabled: slugsActifs.length > 0,
    retry: false,
  });

  const erreur = marches.error ?? reglages.error ?? marchesApps.error ?? cibleApps.error;
  const pret = Boolean(applicationId && marches.data && reglages.data);
  const pretApps = Boolean(marchesApps.data && cibleApps.data && actifs.length > 0);

  const lignes = React.useMemo(() => {
    if (!pret || !applicationId) return [];
    const r = reglages.data!.reglages;
    const fermeturesApp = reglages.data!.fermeturesApp;
    const opts = { applicationId, fermeturesApp };
    return marches.data!.map((m) => {
      const actuel = classerLabels(m.stats, r, opts);
      const propose = classerPropose(m.stats, r, opts);
      return {
        marche: m,
        cle: `${m.langue}|${m.pays ?? ""}`,
        actuel,
        propose,
        change:
          actuel.length > 0 &&
          propose.length > 0 &&
          actuel[0].label_id !== propose[0].label_id,
      };
    });
  }, [pret, applicationId, marches.data, reglages.data]);

  const nbChangements = lignes.filter((l) => l.change).length;
  // Somme des comptes du pool, pour exprimer chaque label en part de flotte.
  const totalFlotte = React.useMemo(
    () => (lignes[0]?.marche.stats ?? []).reduce((a, s) => a + s.comptes_total, 0),
    [lignes],
  );

  // Une ligne par label, prise sur le marché le plus peuplé : les chiffres de
  // stock et de performance sont les mêmes partout, seule la présence change.
  const etatLabels = React.useMemo(() => {
    if (!pret || !applicationId || lignes.length === 0) return [];
    const r = reglages.data!.reglages;
    const fermeturesApp = reglages.data!.fermeturesApp;
    const reference = lignes[0].marche;
    return reference.stats
      .map((s) => ({
        stat: s,
        motif: motifFermeture(s.label_id, applicationId, r, s, fermeturesApp),
        jours: s.passages_restants / (s.demande_jour + r.postsParJourNouveau),
        perf: s.perf_flotte && s.perf_label !== null && s.passages > 0
          ? s.perf_label / s.perf_flotte
          : null,
      }))
      .sort((a, b) => a.jours - b.jours);
  }, [pret, applicationId, lignes, reglages.data]);

  return (
    <div className="space-y-6" data-testid="page-repartition">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("repartition.titre", { nom: nomApp })}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("repartition.description")}</p>
      </div>

      <Alert>
        <Lock className="h-4 w-4" />
        <AlertTitle>{t("repartition.playgroundTitre")}</AlertTitle>
        <AlertDescription>{t("repartition.playgroundAide")}</AlertDescription>
      </Alert>

      {erreur && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("repartition.erreurTitre")}</AlertTitle>
          <AlertDescription className="font-mono text-xs">{messageErreur(erreur)}</AlertDescription>
        </Alert>
      )}

      {!pret && !erreur && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {pretApps && (
        <CarteApplications
          marches={marchesApps.data!}
          cible={cibleApps.data!}
          applications={actifs}
        />
      )}

      {pret && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("repartition.prochainesTitre")}</CardTitle>
              <CardDescription>
                {t("repartition.prochainesAide", {
                  marches: lignes.length,
                  changements: nbChangements,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>{t("repartition.colMarche")}</span>
                <span className="text-right">{t("repartition.colComptes")}</span>
                <span>{t("repartition.colAujourdhui")}</span>
                <span>{t("repartition.colPropose")}</span>
              </div>
              {lignes.map((l) => (
                <div key={l.cle}>
                  <button
                    type="button"
                    onClick={() => setMarcheOuvert(marcheOuvert === l.cle ? null : l.cle)}
                    className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 rounded px-1 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2">
                      {l.marche.pays && <span aria-hidden>{drapeauPays(l.marche.pays)}</span>}
                      <span>{nomLangue(l.marche.langue)}</span>
                      {l.marche.pays && (
                        <span className="text-xs text-muted-foreground">
                          {nomPaysIso(l.marche.pays)}
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {l.marche.comptes}
                    </span>
                    <span className="font-mono text-xs">
                      {l.actuel[0]?.label_nom ?? t("repartition.aucun")}
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      {l.change && <ArrowRight className="h-3 w-3 text-amber-600" />}
                      <span className={l.change ? "font-semibold text-amber-700" : ""}>
                        {l.propose[0]?.label_nom ?? t("repartition.aucun")}
                      </span>
                    </span>
                  </button>
                  {marcheOuvert === l.cle && (
                    <DetailMarche
                      marche={l.marche}
                      actuel={l.actuel}
                      propose={l.propose}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("repartition.etatTitre")}</CardTitle>
              <CardDescription>{t("repartition.etatAide")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 border-b pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>{t("repartition.colLabel")}</span>
                <span className="text-right">{t("repartition.colPerf")}</span>
                <span className="text-right">{t("repartition.colJours")}</span>
                <span className="text-right">{t("repartition.colFlotte")}</span>
                <span>{t("repartition.colEtat")}</span>
              </div>
              {etatLabels.map((e) => (
                <div
                  key={e.stat.label_id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{e.stat.label_nom}</span>
                  <span className="text-right tabular-nums">
                    {e.perf === null ? "—" : nombre(e.perf)}
                  </span>
                  <span
                    className={`text-right tabular-nums ${e.jours < 7 ? "font-semibold text-destructive" : ""}`}
                  >
                    {nombre(e.jours, 1)}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {e.stat.comptes_total}
                    {totalFlotte > 0 && (
                      <span className="ml-1.5 text-xs">
                        {pourcent((100 * e.stat.comptes_total) / totalFlotte)}
                      </span>
                    )}
                  </span>
                  <EtatLabel motif={e.motif} />
                </div>
              ))}
            </CardContent>
          </Card>

          <CarteReglages reglages={reglages.data!.reglages} />
        </>
      )}
    </div>
  );
}

function pourcent(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/**
 * Répartition entre applications. Deux niveaux : la flotte entière face à la
 * cible, puis marché par marché, parce que viser 25 % d'Unswipe ne veut rien
 * dire si les 25 % sont tous en allemand. La dernière colonne dit quelle
 * application prendrait la prochaine recrue de ce marché.
 */
function CarteApplications({
  marches,
  cible,
  applications,
}: {
  marches: MarcheApplications[];
  cible: CibleApplications;
  applications: Array<{ id: string; slug: string }>;
}) {
  const { t } = useTranslation();
  const flotte = ecartsFlotte(marches, cible);
  const colonnes = applications.map((a) => a.slug);
  const lignes = marches
    .map((m) => {
      const total = m.parts.reduce((a, p) => a + p.comptes, 0);
      const parSlug = new Map(m.parts.map((p) => [p.slug, p.comptes]));
      return {
        cle: `${m.langue}|${m.pays ?? ""}`,
        marche: m,
        total,
        parSlug,
        classe: classerApplications(m, cible, applications),
      };
    })
    .sort((a, b) => b.total - a.total || a.marche.langue.localeCompare(b.marche.langue));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.appsTitre")}</CardTitle>
        <CardDescription>{t("repartition.appsAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cible.source === "defaut" && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("repartition.cibleAbsenteTitre")}</AlertTitle>
            <AlertDescription>{t("repartition.cibleAbsenteAide")}</AlertDescription>
          </Alert>
        )}

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("repartition.appsFlotte")}
          </p>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 border-b pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>{t("repartition.colApp")}</span>
            <span className="text-right">{t("repartition.colComptes")}</span>
            <span className="text-right">{t("repartition.colReelle")}</span>
            <span className="text-right">{t("repartition.colVisee")}</span>
            <span className="text-right">{t("repartition.colEcart")}</span>
          </div>
          {flotte.map((f) => (
            <div
              key={f.slug}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 py-1.5 text-sm"
            >
              <span className="font-mono text-xs">{f.slug}</span>
              <span className="text-right tabular-nums">{Math.round(f.comptes)}</span>
              <span className="text-right tabular-nums">{pourcent(f.partReelle)}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {pourcent(f.partVisee)}
              </span>
              <span
                className={`text-right tabular-nums ${
                  Math.abs(f.ecart) >= 5 ? "font-semibold text-amber-700" : "text-muted-foreground"
                }`}
              >
                {f.ecart > 0 ? "+" : ""}
                {pourcent(f.ecart)}
              </span>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("repartition.appsMarches")}
          </p>
          <div
            className="grid gap-x-4 border-b pb-1 text-[11px] uppercase tracking-wide text-muted-foreground"
            style={{ gridTemplateColumns: `1fr auto repeat(${colonnes.length}, auto) auto` }}
          >
            <span>{t("repartition.colMarche")}</span>
            <span className="text-right">{t("repartition.colComptes")}</span>
            {colonnes.map((s) => (
              <span key={s} className="text-right font-mono normal-case">
                {s}
              </span>
            ))}
            <span>{t("repartition.colProchaine")}</span>
          </div>
          {lignes.map((l) => (
            <div
              key={l.cle}
              className="grid items-center gap-x-4 py-1.5 text-sm"
              style={{ gridTemplateColumns: `1fr auto repeat(${colonnes.length}, auto) auto` }}
            >
              <span className="flex items-center gap-2">
                {l.marche.pays && <span aria-hidden>{drapeauPays(l.marche.pays)}</span>}
                <span>{nomLangue(l.marche.langue)}</span>
                {l.marche.pays && (
                  <span className="text-xs text-muted-foreground">{nomPaysIso(l.marche.pays)}</span>
                )}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {Math.round(l.total)}
              </span>
              {colonnes.map((s) => {
                const n = l.parSlug.get(s) ?? 0;
                return (
                  <span
                    key={s}
                    className={`text-right tabular-nums ${n === 0 ? "text-muted-foreground/40" : ""}`}
                  >
                    {l.total > 0 ? pourcent((100 * n) / l.total) : "—"}
                  </span>
                );
              })}
              <span className="font-mono text-xs">{l.classe[0]?.slug ?? "—"}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EtatLabel({ motif }: { motif: MotifFermeture | null }) {
  const { t } = useTranslation();
  if (motif === null) return <Badge variant="outline">{t("repartition.ouvert")}</Badge>;
  return <Badge variant="destructive">{t(`repartition.ferme_${motif}`)}</Badge>;
}

function DetailMarche({
  marche,
  actuel,
  propose,
}: {
  marche: MarcheRepartition;
  actuel: LabelClasse[];
  propose: LabelPropose[];
}) {
  const { t } = useTranslation();
  const rangActuel = new Map(actuel.map((c, i) => [c.label_id, i + 1]));
  return (
    <div className="mb-2 rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        {t("repartition.detailAide", { langue: nomLangue(marche.langue) })}
      </p>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 border-b pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{t("repartition.colLabel")}</span>
        <span className="text-right">{t("repartition.colPoids")}</span>
        <span className="text-right">{t("repartition.colVisee")}</span>
        <span className="text-right">{t("repartition.colPresence")}</span>
        <span className="text-right">{t("repartition.colScore")}</span>
        <span className="text-right">{t("repartition.colRangActuel")}</span>
        <span className="text-right">{t("repartition.colJours")}</span>
      </div>
      {propose.map((c, i) => (
        <div
          key={c.label_id}
          className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 py-1 text-xs"
        >
          <span className="font-mono">{c.label_nom}</span>
          <span className="text-right tabular-nums">{nombre(c.poids)}</span>
          <span className="text-right tabular-nums text-muted-foreground">
            {pourcent(100 * c.part)}
          </span>
          <span className="text-right tabular-nums">{c.presence}</span>
          <span className={`text-right tabular-nums ${i === 0 ? "font-semibold" : ""}`}>
            {nombre(c.score, 3)}
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {rangActuel.get(c.label_id) ?? "—"}
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {nombre(c.jours, 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CarteReglages({ reglages }: { reglages: ReglagesChoixLabel }) {
  const { t } = useTranslation();
  const lignes: Array<[string, string]> = [
    [t("repartition.rPerfExposant"), String(reglages.perfExposant)],
    [t("repartition.rPerfLissage"), String(reglages.perfLissage)],
    [t("repartition.rPerfBornes"), `${reglages.perfMin} – ${reglages.perfMax}`],
    [t("repartition.rFermeture"), `${reglages.fermeturePerf} / ${reglages.fermetureMinPosts}`],
    [t("repartition.rReserveMin"), `${reglages.reserveMinJours} j`],
    [t("repartition.rReserveCible"), `${reglages.reserveCibleJours} j`],
    [t("repartition.rPostsNouveau"), String(reglages.postsParJourNouveau)],
    [t("repartition.rPartMax"), String(reglages.partMax)],
    [t("repartition.rRafale"), String(reglages.rafaleRecents)],
    [t("repartition.rRelabels"), String(reglages.relabelsMaxParNuit)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.reglagesTitre")}</CardTitle>
        <CardDescription>{t("repartition.reglagesAide")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {lignes.map(([label, valeur]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums">{valeur}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
