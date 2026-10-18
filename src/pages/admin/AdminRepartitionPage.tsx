import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock, UserCheck } from "lucide-react";

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
  lireCohorteRecrutement,
  lireReglagesRepartition,
  PROVENANCE_JOURS,
  type MarcheRepartition,
} from "@/features/moteur/repartition/apiRepartition";
import {
  APPLICATION_COHORTE_RUUL,
  cibleHorsCohorte,
  partCohorte,
  type PartCohorte,
  type ProvenanceMarche,
} from "@/features/moteur/repartition/provenance";
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
  // D'où viennent les recrues. Celles de la cohorte Ruul partent toujours sur
  // Sophia : sans ce chiffre, la cible afficherait une concurrence entre
  // applications qui n'existe pas pour cette part des recrues.
  const provenance = useQuery({
    queryKey: ["repartition-provenance", PROVENANCE_JOURS],
    queryFn: () => lireCohorteRecrutement(PROVENANCE_JOURS),
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
    reglages.error ??
    marchesApps.error ??
    cible.error ??
    provenance.error ??
    parApp.find((q) => q.error)?.error;
  const chargement =
    reglages.isPending ||
    marchesApps.isPending ||
    cible.isPending ||
    provenance.isPending ||
    parApp.some((q) => q.isPending);
  const pret = !chargement && !erreur && actifs.length > 0;

  /**
   * La part des prochaines recrues déjà promise à Sophia, marché par marché.
   *
   * Appariée sur la clé de marché BRUTE, comme les deux autres lectures : les
   * trois RPC rendent la langue et le pays tels qu'ils sont en base, et
   * normaliser ici désaccorderait silencieusement les tableaux.
   */
  const partParMarche = React.useMemo(() => {
    const flotte = provenance.data ?? [];
    const parCle = new Map(flotte.map((p) => [`${p.langue}|${p.pays ?? ""}`, p]));
    const out = new Map<string, PartCohorte>();
    for (const m of marchesApps.data ?? []) {
      const k = `${m.langue}|${m.pays ?? ""}`;
      out.set(k, partCohorte(parCle.get(k), flotte));
    }
    return out;
  }, [provenance.data, marchesApps.data]);

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
          <CarteCohorte
            marches={marchesApps.data}
            cible={cible.data}
            applications={actifs}
            partParMarche={partParMarche}
            flotte={provenance.data ?? []}
          />
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
            partParMarche={partParMarche}
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

/**
 * Les recrues que la cible ne peut pas placer.
 *
 * Un créateur de la cohorte Ruul va TOUJOURS sur Sophia. Sur 30 jours
 * glissants, en français, c'est 5 recrues sur 11 : près de la moitié des
 * prochains comptes sont promis avant que le moindre classement ne tourne.
 * Une cible qui demanderait moins de Sophia que ça n'est pas ambitieuse, elle
 * est impossible, et la page doit le dire plutôt que d'afficher un écart que
 * personne ne pourra jamais combler.
 *
 * La colonne « Sophia au minimum » est ce plancher. La dernière colonne
 * confronte la cible posée à ce plancher, marché par marché.
 */
function CarteCohorte({
  marches,
  cible,
  applications,
  partParMarche,
  flotte,
}: {
  marches: MarcheApplications[];
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  partParMarche: Map<string, PartCohorte>;
  flotte: ProvenanceMarche[];
}) {
  const { t } = useTranslation();

  const totalRecrues = flotte.reduce((a, m) => a + m.recrues, 0);
  const totalCohorte = flotte.reduce((a, m) => a + m.recruesRuul, 0);
  const totalEcart = flotte.reduce((a, m) => a + m.recruesRuulHorsSophia, 0);

  const parCle = new Map(flotte.map((x) => [`${x.langue}|${x.pays ?? ""}`, x]));

  const lignes = marches
    .map((m) => {
      const cle = `${m.langue}|${m.pays ?? ""}`;
      const p = partParMarche.get(cle) ?? partCohorte(undefined, flotte);
      // Les EFFECTIFS affichés sont ceux du marché, toujours. Quand la part
      // est empruntée à la flotte, `p.recrues` vaut ceux de la flotte entière
      // et afficher 28 recrues en face de l'Espagne, qui en a eu 2, serait
      // simplement faux. C'est la colonne « Mesurée sur » qui dit d'où vient
      // le pourcentage.
      const sien = parCle.get(cle);
      // La cible doit être ramenée aux applications qui servent la langue
      // AVANT d'en déduire quoi que ce soit : c'est ce que fait déjà
      // `classerApplications`, on lui reprend ses parts visées.
      const classe = classerApplications(m, cible, applications);
      const cibleMarche: CibleApplications = {
        source: cible.source,
        parts: Object.fromEntries(classe.map((a) => [a.slug, a.partVisee])),
      };
      return {
        cle,
        marche: m,
        part: p,
        recrues: sien?.recrues ?? 0,
        cohorte: sien?.recruesRuul ?? 0,
        verdict: cibleHorsCohorte(cibleMarche, p.part),
      };
    })
    .sort(
      (a, b) =>
        b.cohorte - a.cohorte ||
        b.part.part - a.part.part ||
        a.marche.langue.localeCompare(b.marche.langue),
    );

  type Ligne = (typeof lignes)[number];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.cohorteTitre")}</CardTitle>
        <CardDescription>
          {t("repartition.cohorteAide", { app: APPLICATION_COHORTE_RUUL, jours: PROVENANCE_JOURS })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant={totalEcart > 0 ? "error" : undefined}>
          {totalEcart > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          <AlertDescription>
            {t("repartition.cohorteResume", {
              jours: PROVENANCE_JOURS,
              recrues: totalRecrues,
              cohorte: totalCohorte,
              part: totalRecrues > 0 ? pourcent((100 * totalCohorte) / totalRecrues, 0) : "—",
            })}{" "}
            {/* La règle n'est appliquée nulle part : c'est le site qui choisit
                l'application de ses candidats et il sait demander Unswipe. On
                la vérifie donc à chaque ouverture au lieu de la supposer. */}
            {totalCohorte === 0
              ? null
              : totalEcart > 0
                ? t("repartition.cohorteEcart", { n: totalEcart })
                : t("repartition.cohorteRegleTient")}
          </AlertDescription>
        </Alert>
        <Tableau
          lignes={lignes}
          cleLigne={(l) => l.cle}
          vide={t("repartition.cohorteVide")}
          colonnes={
            [
              {
                cle: "marche",
                titre: t("repartition.colMarche"),
                rendu: (l) => <CelluleMarche langue={l.marche.langue} pays={l.marche.pays} />,
              },
              {
                cle: "recrues",
                titre: t("repartition.colRecrues", { jours: PROVENANCE_JOURS }),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (l) => l.recrues,
              },
              {
                cle: "cohorte",
                titre: t("repartition.colCohorte"),
                align: "droite",
                rendu: (l) => (
                  <span className={l.cohorte > 0 ? "font-semibold" : "text-muted-foreground/60"}>
                    {l.cohorte}
                  </span>
                ),
              },
              {
                cle: "part",
                titre: t("repartition.colPartCohorte"),
                align: "droite",
                // Sans décimale : 5 sur 11 ne vaut pas « 45,5 % », il vaut
                // « à peu près 45 % », et l'effectif est juste à côté pour
                // qui veut juger de la confiance à lui accorder.
                rendu: (l) => (l.part.base === "aucune" ? "—" : pourcent(100 * l.part.part, 0)),
              },
              {
                cle: "mesure",
                titre: t("repartition.colMesure"),
                classe: "text-xs text-muted-foreground",
                rendu: (l) => t(`repartition.mesure_${l.part.base}`),
              },
              {
                cle: "plancher",
                titre: t("repartition.colPlancher", { app: APPLICATION_COHORTE_RUUL }),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (l) => (l.part.part > 0 ? pourcent(l.verdict.partPromise, 0) : "—"),
              },
              {
                cle: "verdict",
                titre: t("repartition.colAtteignable"),
                rendu: (l) => {
                  // Sans cible posée, `lireCibleApplications` rend des parts
                  // ÉGALES pour montrer le manque. Juger « impossible » une
                  // cible que personne n'a choisie serait un faux reproche :
                  // le plancher, lui, reste vrai, il ne dépend que de la
                  // cohorte.
                  if (l.part.base === "aucune" || cible.source === "defaut") {
                    return (
                      <span className="text-xs text-muted-foreground">
                        {t("repartition.verdictSansCible")}
                      </span>
                    );
                  }
                  if (l.verdict.atteignable) {
                    return <Badge variant="outline">{t("repartition.atteignableOui")}</Badge>;
                  }
                  // 29 marchés sur 36 n'ont pas assez de recrues pour parler
                  // d'eux-mêmes et empruntent la part de la flotte. Déclarer
                  // une cible impossible sur un chiffre emprunté, c'est
                  // pousser l'admin à la gonfler pour rien.
                  if (l.part.base !== "marche") {
                    return (
                      <span className="text-xs text-muted-foreground">
                        {t("repartition.verdictEchantillon", {
                          minimum: pourcent(l.verdict.minimum, 0),
                        })}
                      </span>
                    );
                  }
                  return (
                    <Badge variant="destructive">
                      {t("repartition.atteignableNon", { minimum: pourcent(l.verdict.minimum, 0) })}
                    </Badge>
                  );
                },
              },
            ] satisfies Array<ColonneTableau<Ligne>>
          }
        />
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
  partParMarche,
}: {
  marches: MarcheApplications[];
  statsParAppEtMarche: Record<string, Record<string, StatLabel[]>>;
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  reglages: ReglagesChoixLabel;
  partParMarche: Map<string, PartCohorte>;
}) {
  const { t } = useTranslation();
  const lignes = marches
    .map((m) => {
      const cle = `${m.langue}|${m.pays ?? ""}`;
      // La cible passe TELLE QUELLE : les comptes de la cohorte sont comptés
      // comme les autres, donc Sainte-Laguë envoie d'autant moins de recrues
      // placées par le moteur vers Sophia. Lui passer une cible déjà corrigée
      // la corrigerait deux fois.
      const tirages = simulerTirages(
        m,
        statsParAppEtMarche[cle] ?? {},
        cible,
        applications,
        reglages,
        TIRAGES_DEFAUT,
        { partCohorte: partParMarche.get(cle)?.part ?? 0 },
      );
      const places = tirages.reduce((a, x) => a + x.comptes, 0);
      return {
        cle,
        marche: m,
        comptes: m.parts.reduce((a, p) => a + p.comptes, 0),
        tirages,
        cohorte: tirages.reduce((a, x) => a + x.comptesCohorte, 0),
        // Les recrues qu'aucune application n'a pu prendre, faute de label
        // ouvert. Sans ce compteur elles disparaissaient en silence et le
        // « mix » était renormalisé à 100 % sur les survivantes : l'admin
        // lisait une composition qui excluait des comptes à créer quand même.
        perdues: Math.max(0, TIRAGES_DEFAUT - places),
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
              cle: "cohorte",
              titre: t("repartition.colCohorte"),
              align: "droite",
              classe: "text-muted-foreground",
              rendu: (l) => (
                <>
                  {l.cohorte > 0
                    ? t("repartition.dontCohorte", { n: l.cohorte, total: TIRAGES_DEFAUT })
                    : "—"}
                  {l.perdues > 0 && (
                    <span className="block text-xs text-destructive">
                      {t("repartition.tiragesPerdus", { n: l.perdues })}
                    </span>
                  )}
                </>
              ),
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
                        {x.comptesCohorte > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({t("repartition.dontCohorteCourt", { n: x.comptesCohorte })})
                          </span>
                        )}
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
