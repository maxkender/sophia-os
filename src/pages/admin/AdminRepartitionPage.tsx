import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import {
  ecrireCibleRepartitionApps,
  lireCibleRepartitionApps,
  lireMarchesApplications,
  lireMarchesRepartition,
  lireReglagesRepartition,
  type MarcheRepartition,
} from "@/features/moteur/repartition/apiRepartition";
import {
  applicationsEligibles,
  classerApplications,
  ecartsFlotte,
  type ApplicationCandidate,
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
  type StatLabel,
} from "@/features/moteur/repartition/scoreLabel";
import { Tableau, type ColonneTableau } from "@/features/moteur/repartition/Tableau";
import { simulerTirages, TIRAGES_DEFAUT, type Tirage } from "@/features/moteur/repartition/tirages";

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

function pourcent(n: number, decimales = 1): string {
  return `${nombre(n, decimales)} %`;
}

/**
 * Répartition — où partirait la prochaine recrue.
 *
 * Trois questions, dans cet ordre : quelle APPLICATION prend le prochain
 * compte d'un marché, quel LABEL dans cette application, et au total quelle
 * COMPOSITION on obtient si on embauche vingt personnes dans une langue.
 *
 * La page n'écrit qu'une chose, la cible de répartition entre applications
 * (`reglages.repartition_applications`). Elle ne crée aucun compte, ne ferme
 * aucun label et ne change rien au moteur : la cible n'est lue que par cette
 * page tant que le choix automatique d'application n'est pas câblé.
 */
export function AdminRepartitionPage() {
  const { t } = useTranslation();
  const { applications, application, applicationId, slug } = useApplication();
  const nomApp = application ? nomApplication(application) : nomApplication({ slug });
  const [marcheOuvert, setMarcheOuvert] = React.useState<string | null>(null);

  const actifs: ApplicationCandidate[] = React.useMemo(
    () =>
      applications
        .filter((a) => a.actif)
        .map((a) => ({ id: a.id, slug: a.slug, langues: a.langues })),
    [applications],
  );
  const slugsActifs = React.useMemo(() => actifs.map((a) => a.slug), [actifs]);

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
  const cible = useQuery({
    queryKey: ["repartition-cible-apps", slugsActifs],
    queryFn: () => lireCibleRepartitionApps(slugsActifs),
    enabled: slugsActifs.length > 0,
    retry: false,
  });
  // Les labels de CHAQUE application : la projection croise les deux étages,
  // elle ne peut pas se contenter de l'application du sélecteur.
  const parApp = useQueries({
    queries: actifs.map((a) => ({
      queryKey: ["repartition-marches", a.id],
      queryFn: () => lireMarchesRepartition(a.id),
      retry: false,
    })),
  });

  const erreur =
    reglages.error ?? marchesApps.error ?? cible.error ?? parApp.find((q) => q.error)?.error;
  const chargement =
    reglages.isPending || marchesApps.isPending || cible.isPending || parApp.some((q) => q.isPending);
  const pret = !chargement && !erreur && actifs.length > 0;

  /** Les stats de chaque application, indexées par marché. */
  const statsParAppEtMarche = React.useMemo(() => {
    const out: Record<string, Record<string, StatLabel[]>> = {};
    actifs.forEach((a, i) => {
      for (const m of parApp[i]?.data ?? []) {
        const k = `${m.langue}|${m.pays ?? ""}`;
        (out[k] ??= {})[a.id] = m.stats;
      }
    });
    return out;
  }, [actifs, parApp]);

  const marchesSelection: MarcheRepartition[] = React.useMemo(() => {
    const i = actifs.findIndex((a) => a.id === applicationId);
    return i >= 0 ? (parApp[i]?.data ?? []) : [];
  }, [actifs, applicationId, parApp]);

  const lignesLabels = React.useMemo(() => {
    if (!pret || !applicationId || !reglages.data) return [];
    const r = reglages.data;
    const opts = { applicationId };
    return marchesSelection.map((m) => {
      const actuel = classerLabels(m.stats, r, opts);
      const propose = classerPropose(m.stats, r, opts);
      return {
        marche: m,
        cle: `${m.langue}|${m.pays ?? ""}`,
        actuel,
        propose,
        change:
          actuel.length > 0 && propose.length > 0 && actuel[0].label_id !== propose[0].label_id,
      };
    });
  }, [pret, applicationId, marchesSelection, reglages.data]);

  const totalFlotte = React.useMemo(
    () => (lignesLabels[0]?.marche.stats ?? []).reduce((a, s) => a + s.comptes_total, 0),
    [lignesLabels],
  );

  const etatLabels = React.useMemo(() => {
    if (!pret || !applicationId || !reglages.data || lignesLabels.length === 0) return [];
    const r = reglages.data;
    return lignesLabels[0].marche.stats
      .map((s) => ({
        stat: s,
        motif: motifFermeture(s.label_id, applicationId, r, s),
        jours: s.passages_restants / (s.demande_jour + r.postsParJourNouveau),
        perf:
          s.perf_flotte && s.perf_label !== null && s.passages > 0
            ? s.perf_label / s.perf_flotte
            : null,
      }))
      .sort((a, b) => a.jours - b.jours);
  }, [pret, applicationId, lignesLabels, reglages.data]);

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

      {chargement && !erreur && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {pret && cible.data && marchesApps.data && (
        <>
          <CarteCible cible={cible.data} applications={actifs} />
          <CarteApplications
            marches={marchesApps.data}
            cible={cible.data}
            applications={actifs}
          />
          <CarteTirages
            marches={marchesApps.data}
            statsParAppEtMarche={statsParAppEtMarche}
            cible={cible.data}
            applications={actifs}
            reglages={reglages.data!}
          />
        </>
      )}

      {pret && reglages.data && lignesLabels.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("repartition.prochainesTitre", { nom: nomApp })}</CardTitle>
              <CardDescription>
                {t("repartition.prochainesAide", {
                  marches: lignesLabels.length,
                  changements: lignesLabels.filter((l) => l.change).length,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau
                lignes={lignesLabels}
                cleLigne={(l) => l.cle}
                onLigne={(l) => setMarcheOuvert(marcheOuvert === l.cle ? null : l.cle)}
                ligneActive={(l) => marcheOuvert === l.cle}
                detail={(l) => <DetailMarche marche={l.marche} actuel={l.actuel} propose={l.propose} />}
                colonnes={[
                  {
                    cle: "marche",
                    titre: t("repartition.colMarche"),
                    rendu: (l) => <CelluleMarche langue={l.marche.langue} pays={l.marche.pays} />,
                  },
                  {
                    cle: "comptes",
                    titre: t("repartition.colComptes"),
                    align: "droite",
                    classe: "text-muted-foreground",
                    rendu: (l) => l.marche.comptes,
                  },
                  {
                    cle: "actuel",
                    titre: t("repartition.colAujourdhui"),
                    classe: "font-mono text-xs",
                    rendu: (l) => l.actuel[0]?.label_nom ?? t("repartition.aucun"),
                  },
                  {
                    cle: "propose",
                    titre: t("repartition.colPropose"),
                    classe: "font-mono text-xs",
                    rendu: (l) => (
                      <span className={l.change ? "font-semibold text-amber-700" : ""}>
                        {l.propose[0]?.label_nom ?? t("repartition.aucun")}
                      </span>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("repartition.etatTitre", { nom: nomApp })}</CardTitle>
              <CardDescription>{t("repartition.etatAide")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau
                lignes={etatLabels}
                cleLigne={(e) => e.stat.label_id}
                colonnes={[
                  {
                    cle: "label",
                    titre: t("repartition.colLabel"),
                    classe: "font-mono text-xs",
                    rendu: (e) => e.stat.label_nom,
                  },
                  {
                    cle: "perf",
                    titre: t("repartition.colPerf"),
                    align: "droite",
                    rendu: (e) => (e.perf === null ? "—" : nombre(e.perf)),
                  },
                  {
                    cle: "jours",
                    titre: t("repartition.colJours"),
                    align: "droite",
                    rendu: (e) => (
                      <span className={e.jours < 7 ? "font-semibold text-destructive" : ""}>
                        {nombre(e.jours, 1)}
                      </span>
                    ),
                  },
                  {
                    cle: "comptes",
                    titre: t("repartition.colFlotte"),
                    align: "droite",
                    classe: "text-muted-foreground",
                    rendu: (e) => e.stat.comptes_total,
                  },
                  {
                    cle: "part",
                    titre: t("repartition.colPart"),
                    align: "droite",
                    classe: "text-muted-foreground",
                    rendu: (e) =>
                      totalFlotte > 0 ? pourcent((100 * e.stat.comptes_total) / totalFlotte) : "—",
                  },
                  {
                    cle: "etat",
                    titre: t("repartition.colEtat"),
                    rendu: (e) => <EtatLabel motif={e.motif} />,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <CarteReglages reglages={reglages.data} />
        </>
      )}
    </div>
  );
}

function CelluleMarche({ langue, pays }: { langue: string; pays: string | null }) {
  return (
    <span className="flex items-center gap-2">
      {pays && <span aria-hidden>{drapeauPays(pays)}</span>}
      <span>{nomLangue(langue)}</span>
      {pays && <span className="text-xs text-muted-foreground">{nomPaysIso(pays)}</span>}
    </span>
  );
}

function EtatLabel({ motif }: { motif: MotifFermeture | null }) {
  const { t } = useTranslation();
  if (motif === null) return <Badge variant="outline">{t("repartition.ouvert")}</Badge>;
  return <Badge variant="destructive">{t(`repartition.ferme_${motif}`)}</Badge>;
}

/**
 * La cible de répartition entre applications, éditable ici.
 *
 * Les parts sont saisies en pourcentages entiers et renormalisées à 100 à la
 * lecture : on n'oblige personne à faire la somme de tête. Une application
 * laissée à zéro ne reçoit rien, ce qui est une façon légitime de la mettre en
 * pause sans la désactiver.
 */
function CarteCible({
  cible,
  applications,
}: {
  cible: CibleApplications;
  applications: ApplicationCandidate[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = React.useState<Record<string, string> | null>(null);

  const valeurs = React.useMemo(() => {
    if (brouillon) return brouillon;
    const out: Record<string, string> = {};
    for (const a of applications) {
      out[a.slug] = cible.source === "reglage" ? String(Math.round(cible.parts[a.slug] ?? 0)) : "";
    }
    return out;
  }, [brouillon, cible, applications]);

  const total = Object.values(valeurs).reduce((a, v) => a + (Number(v) || 0), 0);

  const enregistrer = useMutation({
    mutationFn: () => {
      const parts: Record<string, number> = {};
      for (const [slug, v] of Object.entries(valeurs)) parts[slug] = Number(v) || 0;
      return ecrireCibleRepartitionApps(parts);
    },
    onSuccess: () => {
      setBrouillon(null);
      void queryClient.invalidateQueries({ queryKey: ["repartition-cible-apps"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.cibleTitre")}</CardTitle>
        <CardDescription>{t("repartition.cibleAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cible.source === "defaut" && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("repartition.cibleAbsenteTitre")}</AlertTitle>
            <AlertDescription>{t("repartition.cibleAbsenteAide")}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {applications.map((a) => (
            <div key={a.slug} className="space-y-1">
              <label htmlFor={`cible-${a.slug}`} className="text-sm font-medium">
                {a.slug}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={`cible-${a.slug}`}
                  type="number"
                  min={0}
                  max={100}
                  value={valeurs[a.slug] ?? ""}
                  onChange={(e) => setBrouillon({ ...valeurs, [a.slug]: e.target.value })}
                  className="h-9"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {a.langues === null
                  ? t("repartition.toutesLangues")
                  : t("repartition.langues", { liste: a.langues.join(", ") })}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={enregistrer.isPending || total <= 0} onClick={() => enregistrer.mutate()}>
            {enregistrer.isPending ? t("common.saving") : t("repartition.poserCible")}
          </Button>
          {brouillon && (
            <Button size="sm" variant="ghost" onClick={() => setBrouillon(null)}>
              {t("common.cancel")}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {t("repartition.sommeAide", { total })}
          </span>
        </div>
        {enregistrer.isError && (
          <p className="text-xs text-destructive">{messageErreur(enregistrer.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CarteApplications({
  marches,
  cible,
  applications,
}: {
  marches: MarcheApplications[];
  cible: CibleApplications;
  applications: ApplicationCandidate[];
}) {
  const { t } = useTranslation();
  const flotte = ecartsFlotte(marches, cible);
  const lignes = marches
    .map((m) => {
      const total = m.parts.reduce((a, p) => a + p.comptes, 0);
      return {
        cle: `${m.langue}|${m.pays ?? ""}`,
        marche: m,
        total,
        parSlug: new Map(m.parts.map((p) => [p.slug, p.comptes])),
        eligibles: applicationsEligibles(m.langue, applications).map((a) => a.slug),
        classe: classerApplications(m, cible, applications),
      };
    })
    .sort((a, b) => b.total - a.total || a.marche.langue.localeCompare(b.marche.langue));

  type Ligne = (typeof lignes)[number];
  const colonnes: Array<ColonneTableau<Ligne>> = [
    {
      cle: "marche",
      titre: t("repartition.colMarche"),
      rendu: (l) => <CelluleMarche langue={l.marche.langue} pays={l.marche.pays} />,
    },
    {
      cle: "comptes",
      titre: t("repartition.colComptes"),
      align: "droite",
      classe: "text-muted-foreground",
      rendu: (l) => Math.round(l.total),
    },
    ...applications.map((a): ColonneTableau<Ligne> => ({
      cle: a.slug,
      titre: <span className="font-mono normal-case">{a.slug}</span>,
      align: "droite",
      rendu: (l) => {
        if (!l.eligibles.includes(a.slug)) {
          return <span className="text-muted-foreground/40">{t("repartition.nonServie")}</span>;
        }
        const n = l.parSlug.get(a.slug) ?? 0;
        return (
          <span className={n === 0 ? "text-muted-foreground/60" : ""}>
            {l.total > 0 ? pourcent((100 * n) / l.total) : "—"}
          </span>
        );
      },
    })),
    {
      cle: "prochaine",
      titre: t("repartition.colProchaine"),
      classe: "font-mono text-xs",
      rendu: (l) => l.classe[0]?.slug ?? "—",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.appsTitre")}</CardTitle>
        <CardDescription>{t("repartition.appsAide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("repartition.appsFlotte")}
          </p>
          <Tableau
            lignes={flotte}
            cleLigne={(f) => f.slug}
            colonnes={[
              { cle: "app", titre: t("repartition.colApp"), classe: "font-mono text-xs", rendu: (f) => f.slug },
              { cle: "n", titre: t("repartition.colComptes"), align: "droite", rendu: (f) => Math.round(f.comptes) },
              { cle: "reelle", titre: t("repartition.colReelle"), align: "droite", rendu: (f) => pourcent(f.partReelle) },
              {
                cle: "visee",
                titre: t("repartition.colVisee"),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (f) => pourcent(f.partVisee),
              },
              {
                cle: "ecart",
                titre: t("repartition.colEcart"),
                align: "droite",
                rendu: (f) => (
                  <span
                    className={
                      Math.abs(f.ecart) >= 5 ? "font-semibold text-amber-700" : "text-muted-foreground"
                    }
                  >
                    {f.ecart > 0 ? "+" : ""}
                    {pourcent(f.ecart)}
                  </span>
                ),
              },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("repartition.appsMarches")}
          </p>
          <Tableau lignes={lignes} cleLigne={(l) => l.cle} colonnes={colonnes} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * La composition des vingt prochains comptes, par marché. C'est la réponse à
 * « quelle est la répartition des prochains posts dans cette langue » : une
 * ligne par marché, et le détail application × label en pourcentages.
 */
function CarteTirages({
  marches,
  statsParAppEtMarche,
  cible,
  applications,
  reglages,
}: {
  marches: MarcheApplications[];
  statsParAppEtMarche: Record<string, Record<string, StatLabel[]>>;
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  reglages: ReglagesChoixLabel;
}) {
  const { t } = useTranslation();
  const lignes = marches
    .map((m) => {
      const cle = `${m.langue}|${m.pays ?? ""}`;
      return {
        cle,
        marche: m,
        comptes: m.parts.reduce((a, p) => a + p.comptes, 0),
        tirages: simulerTirages(
          m,
          statsParAppEtMarche[cle] ?? {},
          cible,
          applications,
          reglages,
          TIRAGES_DEFAUT,
        ),
      };
    })
    .sort((a, b) => b.comptes - a.comptes || a.marche.langue.localeCompare(b.marche.langue));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.tiragesTitre", { n: TIRAGES_DEFAUT })}</CardTitle>
        <CardDescription>{t("repartition.tiragesAide", { n: TIRAGES_DEFAUT })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tableau
          lignes={lignes}
          cleLigne={(l) => l.cle}
          colonnes={[
            {
              cle: "marche",
              titre: t("repartition.colMarche"),
              rendu: (l) => <CelluleMarche langue={l.marche.langue} pays={l.marche.pays} />,
            },
            {
              cle: "comptes",
              titre: t("repartition.colComptes"),
              align: "droite",
              classe: "text-muted-foreground",
              rendu: (l) => Math.round(l.comptes),
            },
            {
              cle: "mix",
              titre: t("repartition.colMix"),
              rendu: (l) =>
                l.tirages.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{t("repartition.aucun")}</span>
                ) : (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {l.tirages.map((x: Tirage) => (
                      <span key={`${x.application_id}:${x.label_id}`} className="text-xs">
                        <span className="font-semibold tabular-nums">{pourcent(x.part)}</span>{" "}
                        <span className="font-mono">
                          {x.app} × {x.label_nom}
                        </span>
                      </span>
                    ))}
                  </span>
                ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
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
    <div className="rounded-md border bg-background p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        {t("repartition.detailAide", { langue: nomLangue(marche.langue) })}
      </p>
      <Tableau
        lignes={propose}
        cleLigne={(c) => c.label_id}
        colonnes={[
          { cle: "label", titre: t("repartition.colLabel"), classe: "font-mono text-xs", rendu: (c) => c.label_nom },
          { cle: "poids", titre: t("repartition.colPoids"), align: "droite", rendu: (c) => nombre(c.poids) },
          {
            cle: "visee",
            titre: t("repartition.colVisee"),
            align: "droite",
            classe: "text-muted-foreground",
            rendu: (c) => pourcent(100 * c.part),
          },
          { cle: "presence", titre: t("repartition.colPresence"), align: "droite", rendu: (c) => c.presence },
          {
            cle: "score",
            titre: t("repartition.colScore"),
            align: "droite",
            rendu: (c, i) => <span className={i === 0 ? "font-semibold" : ""}>{nombre(c.score, 3)}</span>,
          },
          {
            cle: "rang",
            titre: t("repartition.colRangActuel"),
            align: "droite",
            classe: "text-muted-foreground",
            rendu: (c) => rangActuel.get(c.label_id) ?? "—",
          },
          {
            cle: "jours",
            titre: t("repartition.colJours"),
            align: "droite",
            classe: "text-muted-foreground",
            rendu: (c) => nombre(c.jours, 1),
          },
        ]}
      />
    </div>
  );
}

function CarteReglages({ reglages }: { reglages: ReglagesChoixLabel }) {
  const { t } = useTranslation();
  const lignes: Array<{ cle: string; label: string; valeur: string }> = [
    { cle: "exp", label: t("repartition.rPerfExposant"), valeur: String(reglages.perfExposant) },
    { cle: "lis", label: t("repartition.rPerfLissage"), valeur: String(reglages.perfLissage) },
    { cle: "bor", label: t("repartition.rPerfBornes"), valeur: `${reglages.perfMin} – ${reglages.perfMax}` },
    {
      cle: "fer",
      label: t("repartition.rFermeture"),
      valeur: `${reglages.fermeturePerf} / ${reglages.fermetureMinPosts}`,
    },
    { cle: "rmin", label: t("repartition.rReserveMin"), valeur: `${reglages.reserveMinJours} j` },
    { cle: "rcib", label: t("repartition.rReserveCible"), valeur: `${reglages.reserveCibleJours} j` },
    { cle: "ppj", label: t("repartition.rPostsNouveau"), valeur: String(reglages.postsParJourNouveau) },
    { cle: "pmax", label: t("repartition.rPartMax"), valeur: String(reglages.partMax) },
    { cle: "raf", label: t("repartition.rRafale"), valeur: String(reglages.rafaleRecents) },
    { cle: "rel", label: t("repartition.rRelabels"), valeur: String(reglages.relabelsMaxParNuit) },
    {
      cle: "ferm",
      label: t("repartition.rFermesApp"),
      valeur: String(reglages.fermesApp.length + reglages.fermes.length),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.reglagesTitre")}</CardTitle>
        <CardDescription>{t("repartition.reglagesAide")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {lignes.map((l) => (
            <div key={l.cle} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="font-mono tabular-nums">{l.valeur}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
