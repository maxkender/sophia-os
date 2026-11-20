import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Globe,
  Settings2,
} from "lucide-react";

import { couleurApplication, nomAffiche, trierApplications } from "@/components/brand/identiteApplications";
import { EtiquetteApplication, LogoApplication } from "@/components/brand/LogoApplication";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { lireReglages } from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import type { ReglagesFileLabels } from "@/features/moteur/types";
import { nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import {
  CLE_CHOIX_APPLICATION_AUTO,
  ecrireChoixApplicationAuto,
  ecrireCibleRepartitionApps,
  ecrireEtatManuelLabel,
  ecrireReglagesChoixLabel,
  lireApplicationsEnPreparation,
  lireChoixApplicationAuto,
  lireCibleRepartitionApps,
  lireMarchesApplications,
  lireMarchesRepartition,
  lireRecruesSite,
  lireReglagesChoixLabelPoses,
  lireReglagesRepartition,
  PROVENANCE_JOURS,
  type RecruesMarche,
  remettreReglagesChoixLabelDefaut,
} from "@/features/moteur/repartition/apiRepartition";
import { candidatesRepartition } from "@/features/moteur/repartition/candidates";
import { CarteFileLabels } from "@/features/moteur/repartition/CarteFileLabels";
import { CartePodz } from "@/features/moteur/repartition/CartePodz";
import { ReaffectationLabelFerme } from "@/features/moteur/repartition/ReaffectationLabelFerme";
import { fileDeLApplication } from "@/features/moteur/repartition/fileApplication";
import {
  Aide,
  BarreRepartition,
  Bulle,
  BarreReserve,
  LegendeApplications,
  NomLabel,
} from "@/features/moteur/repartition/graphes";
import { segmentsApplications } from "@/features/moteur/repartition/segments";
import {
  brouillonDepuisReglages,
  CHAMPS_REGLAGE_LABEL,
  etatManuelLabel,
  validerReglagesLabel,
  type BrouillonReglageLabel,
  type ChampReglageLabel,
  type EtatManuelLabel,
} from "@/features/moteur/repartition/reglagesLabel";
import { SchemaDecision, type EtapeSchema } from "@/features/moteur/repartition/SchemaDecision";
import {
  applicationsEligibles,
  ecartsFlotte,
  type ApplicationCandidate,
  type CibleApplications,
  type MarcheApplications,
} from "@/features/moteur/repartition/scoreApplication";
import {
  enTestPod,
  motifFermeture,
  testPodPlein,
  type MotifFermeture,
  type ReglagesChoixLabel,
  type StatLabel,
} from "@/features/moteur/repartition/scoreLabel";
import { simulerTirages, TIRAGES_DEFAUT, type Tirage } from "@/features/moteur/repartition/tirages";
import { cn } from "@/lib/utils";

/**
 * Répartition — où vont les nouveaux comptes.
 *
 * La page répond à quatre questions, de haut en bas :
 *   1. comment un nouveau compte est placé (le schéma, avec les chiffres du jour) ;
 *   2. quelle part chaque APPLICATION doit avoir, et où on en est (la cible,
 *      éditable, face au réel) ;
 *   3. où partiront les prochains comptes, MARCHÉ PAR MARCHÉ (application et
 *      label du prochain, composition des vingt suivants) ;
 *   4. l'état des LABELS d'une application (réserve, performance, décision).
 * Puis la File, qui force la main au moteur, et les réglages fins, repliés.
 *
 * Tout ce qui s'édite ici part en base et sert à la création suivante. Les
 * chiffres affichés sont ceux que le moteur reçoit (`simulation_repartition`,
 * `stats_choix_application`), et les projections rejouent ses classements.
 */

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

function pourcent(n: number, decimales = 0): string {
  return `${nombre(n, decimales)} %`;
}

const cleMarche = (m: { langue: string; pays: string | null }) => `${m.langue}|${m.pays ?? ""}`;

function CelluleMarche({ langue, pays }: { langue: string; pays: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {pays && <span aria-hidden>{drapeauPays(pays)}</span>}
      <span className="truncate">{nomLangue(langue)}</span>
      {pays && <span className="truncate text-xs text-muted-foreground">{nomPaysIso(pays)}</span>}
    </span>
  );
}

function EtatLabel({ motif, testPlein = false }: { motif: MotifFermeture | null; testPlein?: boolean }) {
  const { t } = useTranslation();
  // Ouvert, mais le moteur ne lui donne plus de compte tant que son test dure.
  if (motif === null && testPlein) {
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="size-3 text-amber-600" aria-hidden />
        {t("repartition.testComplet")}
      </Badge>
    );
  }
  if (motif === null) {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 className="size-3 text-emerald-600" aria-hidden />
        {t("repartition.ouvert")}
      </Badge>
    );
  }
  return <Badge variant="destructive">{t(`repartition.ferme_${motif}`)}</Badge>;
}

// ---------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------

export function AdminRepartitionPage() {
  const { t } = useTranslation();
  const { applications, applicationId } = useApplication();

  // Les applications EN PRÉPARATION (inactives, déjà dotées d'un label) : elles
  // ne publient rien, mais peuvent recevoir les prochaines recrues. Lues en
  // base par la fonction que lit aussi le moteur (0770).
  const preparation = useQuery({
    queryKey: ["repartition-preparation"],
    queryFn: lireApplicationsEnPreparation,
    retry: false,
  });
  // Les applications qui peuvent recevoir un nouveau compte : les actives et
  // celles en préparation. Toute la page raisonne sur cette liste, comme le
  // moteur (`stats_choix_application`).
  const { candidates, enPreparation } = React.useMemo(() => {
    const r = candidatesRepartition(applications, preparation.data ?? []);
    return {
      candidates: trierApplications(r.candidates, (a) => a.slug),
      enPreparation: r.enPreparation,
    };
  }, [applications, preparation.data]);
  const slugsCandidates = React.useMemo(() => candidates.map((a) => a.slug), [candidates]);
  const slugsEnPreparation = React.useMemo(() => [...enPreparation], [enPreparation]);

  const reglages = useQuery({
    queryKey: ["repartition-reglages"],
    queryFn: lireReglagesRepartition,
    retry: false,
  });
  // La File, pour la projection et le schéma. Même clé que `CarteFileLabels` :
  // une seule requête, et tout se remet à jour dès qu'on touche à la File.
  const reglagesOs = useQuery({ queryKey: ["reglages"], queryFn: lireReglages, retry: false });
  const marchesApps = useQuery({
    queryKey: ["repartition-apps"],
    queryFn: lireMarchesApplications,
    retry: false,
  });
  const cible = useQuery({
    queryKey: ["repartition-cible-apps", slugsCandidates],
    queryFn: () => lireCibleRepartitionApps(slugsCandidates),
    // Pas avant de savoir qui est candidate : la cible se lit sur cette liste.
    enabled: slugsCandidates.length > 0 && !preparation.isPending,
    retry: false,
  });
  // Combien de recrues viennent du site de recrutement. Une information : le
  // moteur les place comme les autres depuis le 19/11, elles ne contraignent
  // plus la cible.
  const provenance = useQuery({
    queryKey: ["repartition-provenance", PROVENANCE_JOURS],
    queryFn: () => lireRecruesSite(PROVENANCE_JOURS),
    retry: false,
  });
  // Les labels de CHAQUE application : la projection croise les deux étages.
  const parApp = useQueries({
    queries: candidates.map((a) => ({
      queryKey: ["repartition-marches", a.id],
      queryFn: () => lireMarchesRepartition(a.id),
      retry: false,
    })),
  });

  const erreur =
    preparation.error ??
    reglages.error ??
    marchesApps.error ??
    cible.error ??
    provenance.error ??
    parApp.find((q) => q.error)?.error;
  const chargement =
    preparation.isPending ||
    reglages.isPending ||
    marchesApps.isPending ||
    cible.isPending ||
    provenance.isPending ||
    parApp.some((q) => q.isPending);
  const pret = !chargement && !erreur && candidates.length > 0;

  /** Les stats de chaque application, indexées par marché. */
  const statsParAppEtMarche = React.useMemo(() => {
    const out: Record<string, Record<string, StatLabel[]>> = {};
    candidates.forEach((a, i) => {
      for (const m of parApp[i]?.data ?? []) (out[cleMarche(m)] ??= {})[a.id] = m.stats;
    });
    return out;
  }, [candidates, parApp]);

  const marchesParApp = React.useMemo(
    () => Object.fromEntries(candidates.map((a, i) => [a.id, parApp[i]?.data ?? []])),
    [candidates, parApp],
  );

  /** Les labels 100 % podz (0352), toutes applications : leur nom porte la marque pod. */
  const labelsPod = React.useMemo(() => {
    const out = new Set<string>();
    for (const q of parApp) for (const m of q.data ?? []) for (const s of m.stats) if (s.pod_seul) out.add(s.label_id);
    return out;
  }, [parApp]);

  return (
    <div className="space-y-6" data-testid="page-repartition">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("repartition.titre")}</h1>
          <p className="text-sm text-muted-foreground">{t("repartition.description")}</p>
        </div>
        {pret && cible.data && <InterrupteurChoixAuto cible={cible.data} />}
      </div>

      {erreur && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("repartition.erreurTitre")}</AlertTitle>
          <AlertDescription className="font-mono text-xs">{messageErreur(erreur)}</AlertDescription>
        </Alert>
      )}

      {chargement && !erreur && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {pret && cible.data && marchesApps.data && reglages.data && (
        <>
          <CarteParcours
            cible={cible.data}
            applications={candidates}
            file={reglagesOs.data?.file_labels_comptes}
          />
          <CarteApplications
            marches={marchesApps.data}
            cible={cible.data}
            applications={candidates}
            enPreparation={enPreparation}
            flotte={provenance.data ?? []}
          />
          <CarteMarches
            marches={marchesApps.data}
            statsParAppEtMarche={statsParAppEtMarche}
            cible={cible.data}
            applications={candidates}
            reglages={reglages.data}
            file={reglagesOs.data?.file_labels_comptes}
            labelsPod={labelsPod}
          />
          <CarteLabels
            applications={candidates}
            applicationParDefaut={applicationId}
            marchesParApp={marchesParApp}
            reglages={reglages.data}
          />
          <CartePodz applications={candidates} marchesParApp={marchesParApp} reglages={reglages.data} />
          <CarteFileLabels
            slugsEnPreparation={slugsEnPreparation}
            // Sans cible posée, le moteur s'abstient : rien à dire sur les parts.
            partsCible={cible.data.source === "reglage" ? cible.data.parts : null}
          />
        </>
      )}

      {/* Hors du bloc ci-dessus : les douze réglages valent pour TOUTES les
          applications, la carte ne doit pas disparaître faute de marché. */}
      {pret && reglages.data && <CarteReglages reglages={reglages.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'interrupteur
// ---------------------------------------------------------------------------

/**
 * L'interrupteur de la bascule.
 *
 * Éteint, l'application d'un nouveau compte reste celle que le recruteur
 * coche. Allumé, c'est le moteur qui décide, par la règle du schéma, et la
 * case disparaît des écrans de création. Les comptes EXISTANTS ne bougent
 * jamais. Les recrues du site suivent la même règle depuis le 19/11.
 */
function InterrupteurChoixAuto({ cible }: { cible: CibleApplications }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const auto = useQuery({
    queryKey: [CLE_CHOIX_APPLICATION_AUTO],
    queryFn: lireChoixApplicationAuto,
    retry: false,
  });
  const basculer = useMutation({
    mutationFn: (actif: boolean) => ecrireChoixApplicationAuto(actif),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CLE_CHOIX_APPLICATION_AUTO] });
    },
  });

  const actif = auto.data === true;
  // Sans cible posée, allumer ne ferait rien de bon : le serveur s'abstient
  // et tout repartirait sur Sophia. Autant l'interdire ici.
  const sansCible = cible.source === "defaut";

  return (
    <div
      className={cn(
        "flex max-w-md items-center gap-3 rounded-lg border px-3 py-2",
        actif ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {t("repartition.basculeTitre")}
          <Aide libelle={t("repartition.basculeTitre")}>
            {sansCible ? t("repartition.basculeSansCible") : t("repartition.basculeAide")}
          </Aide>
        </p>
        <p className={cn("text-xs", actif ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
          {sansCible
            ? t("repartition.basculeSansCible")
            : actif
              ? t("repartition.basculeActifAvis")
              : t("repartition.basculeEteint")}
        </p>
        {basculer.isError && <p className="text-xs text-destructive">{messageErreur(basculer.error)}</p>}
      </div>
      <Switch
        checked={actif}
        disabled={auto.isPending || basculer.isPending || sansCible}
        onCheckedChange={(v) => basculer.mutate(v)}
        aria-label={t("repartition.basculeTitre")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Le parcours d'un nouveau compte
// ---------------------------------------------------------------------------

/** Les recrues de la fenêtre, et combien venaient du site de recrutement. */
function totauxSite(flotte: readonly RecruesMarche[]) {
  return {
    recrues: flotte.reduce((a, m) => a + m.recrues, 0),
    site: flotte.reduce((a, m) => a + m.recruesSite, 0),
  };
}

function CarteParcours({
  cible,
  applications,
  file,
}: {
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  file: ReglagesFileLabels | undefined;
}) {
  const { t } = useTranslation();
  const fileParApp = applications
    .map((a) => {
      if (!file) return { slug: a.slug, n: 0 };
      const f = fileDeLApplication(file, a.slug);
      const n = f.items.length + Object.values(f.par_langue).reduce((x, l) => x + l.length, 0);
      return { slug: a.slug, n };
    })
    .filter((x) => x.n > 0);
  const entreesFile = fileParApp.reduce((a, x) => a + x.n, 0);

  const etapes: EtapeSchema[] = [
    {
      cle: "file",
      icone: "file",
      titre: t("repartition.etapeFileTitre"),
      regle: t("repartition.etapeFileRegle"),
      applications: fileParApp.map((x) => x.slug),
      mesure: (
        <span className="text-muted-foreground">
          {!file
            ? t("repartition.fileNonLue")
            : entreesFile > 0
              ? t("repartition.etapeFileMesure", { count: entreesFile })
              : t("repartition.etapeFileVide")}
        </span>
      ),
    },
    {
      cle: "app",
      icone: "app",
      titre: t("repartition.etapeAppTitre"),
      regle: t("repartition.etapeAppRegle"),
      // Sans cible posée, la page calcule avec des parts égales pour montrer le
      // manque : les dessiner ici les ferait passer pour une décision.
      mesure:
        cible.source === "defaut" ? (
          <span className="text-muted-foreground">{t("repartition.cibleAbsenteTitre")}</span>
        ) : (
          <div className="w-full space-y-1.5">
            <BarreRepartition
              hauteur="sm"
              aria-label={t("repartition.cible")}
              segments={segmentsApplications(applications.map((a) => ({ slug: a.slug, valeur: cible.parts[a.slug] ?? 0 })))}
            />
            <LegendeApplications
              elements={applications
                .filter((a) => (cible.parts[a.slug] ?? 0) > 0)
                .map((a) => ({ slug: a.slug, valeur: pourcent(cible.parts[a.slug] ?? 0) }))}
            />
          </div>
        ),
    },
    {
      cle: "label",
      icone: "label",
      titre: t("repartition.etapeLabelTitre"),
      regle: t("repartition.etapeLabelRegle"),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("repartition.schemaTitre")}</CardTitle>
      </CardHeader>
      <CardContent>
        <SchemaDecision etapes={etapes} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Les applications : cible et réel
// ---------------------------------------------------------------------------

function CarteApplications({
  marches,
  cible,
  applications,
  enPreparation,
  flotte,
}: {
  marches: MarcheApplications[];
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  /** Slugs des applications inactives de la liste : elles recrutent, sans publier. */
  enPreparation: ReadonlySet<string>;
  /** Les recrues de la fenêtre : la ligne « Site de recrutement », pour information. */
  flotte: RecruesMarche[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = React.useState<Record<string, string> | null>(null);

  const reel = new Map(ecartsFlotte(marches, cible, applications).map((f) => [f.slug, f]));
  const totalComptes = [...reel.values()].reduce((a, f) => a + f.comptes, 0);

  const valeurs = React.useMemo(() => {
    if (brouillon) return brouillon;
    const out: Record<string, string> = {};
    for (const a of applications) {
      out[a.slug] = cible.source === "reglage" ? String(Math.round(cible.parts[a.slug] ?? 0)) : "";
    }
    return out;
  }, [brouillon, cible, applications]);
  const total = Object.values(valeurs).reduce((a, v) => a + (Number(v) || 0), 0);
  // Ce que montre la barre « cible » : la saisie en cours si on édite (on voit
  // l'effet avant d'enregistrer), sinon la cible posée.
  const partsCible = Object.fromEntries(
    applications.map((a) => [a.slug, brouillon ? Number(valeurs[a.slug]) || 0 : (cible.parts[a.slug] ?? 0)]),
  );

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

  const site = totauxSite(flotte);
  const restreintes = applications.filter((a) => a.langues !== null);
  const sansCible = cible.source === "defaut" && !brouillon;
  const autres = Math.max(0, 100 - applications.reduce((x, a) => x + (reel.get(a.slug)?.partReelle ?? 0), 0));
  // Une application inactive à qui la cible (posée, ou en cours de saisie)
  // donne une part : ses comptes se créeront et attendront. À dire avant
  // d'enregistrer, pas après.
  const inactivesVisees = sansCible
    ? []
    : applications.filter((a) => enPreparation.has(a.slug) && (partsCible[a.slug] ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("repartition.appsTitre")}
          <Aide libelle={t("repartition.appsTitre")}>{t("repartition.cibleAide")}</Aide>
        </CardTitle>
        <CardDescription>{t("repartition.appsAide", { comptes: Math.round(totalComptes) })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cible.source === "defaut" && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("repartition.cibleAbsenteTitre")}</AlertTitle>
            <AlertDescription>{t("repartition.cibleAbsenteAide")}</AlertDescription>
          </Alert>
        )}

        {/* Les deux barres l'une sous l'autre, même échelle : l'écart se lit
            d'un coup d'œil, sans faire la soustraction. Sans cible posée, pas
            de barre « cible » : des parts égales inventées passeraient pour
            une décision. */}
        <div className="space-y-3">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t("repartition.cible")}</span>
            {sansCible ? (
              <span className="flex h-7 items-center rounded-[4px] border border-dashed px-3 text-xs text-muted-foreground">
                {t("repartition.cibleAbsenteTitre")}
              </span>
            ) : (
              <BarreRepartition
                hauteur="lg"
                etiquettes
                aria-label={t("repartition.cible")}
                segments={segmentsApplications(applications.map((a) => ({ slug: a.slug, valeur: partsCible[a.slug] ?? 0 })))}
              />
            )}
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t("repartition.reel")}</span>
            {/* Même base que la colonne « Réel » : la part de toute la flotte,
                une appli inactive qui porte encore des comptes compte en « autre ». */}
            <BarreRepartition
              hauteur="lg"
              etiquettes
              aria-label={t("repartition.reel")}
              segments={[
                ...segmentsApplications(
                  applications.map((a) => ({
                    slug: a.slug,
                    valeur: reel.get(a.slug)?.partReelle ?? 0,
                    valeurAffichee: t("repartition.nComptes", { count: Math.round(reel.get(a.slug)?.comptes ?? 0) }),
                  })),
                ),
                ...(autres >= 0.5
                  ? [{ cle: "autre", valeur: autres, couleur: couleurApplication(""), libelle: t("repartition.autresApps") }]
                  : []),
              ]}
            />
          </div>
        </div>

        {/* Le tableau sous le graphe : c'est aussi l'éditeur de la cible. */}
        <div className="overflow-x-auto">
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-1.5 text-left font-medium">{t("repartition.colApp")}</th>
                <th className="pb-1.5 pl-3 text-right font-medium">{t("repartition.cible")}</th>
                {restreintes.length > 0 && <th className="pb-1.5 pl-3 text-right font-medium">{t("repartition.visee")}</th>}
                <th className="pb-1.5 pl-3 text-right font-medium">{t("repartition.reel")}</th>
                <th className="pb-1.5 pl-3 text-right font-medium">
                  {restreintes.length > 0 ? t("repartition.vsVisee") : t("repartition.colEcart")}
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const f = reel.get(a.slug);
                // Réel MOINS visée, arrondi AVANT de choisir le signe : « +7 pts »
                // veut dire 7 points au-dessus, dans le sens où la barre « Réel »
                // est plus longue ; jamais « +0 » ni « -0 ».
                const ecart = Math.round(-(f?.ecart ?? 0)) || 0;
                const fort = Math.abs(ecart) >= 5;
                return (
                  <tr key={a.slug} className="border-t border-border/40">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: couleurApplication(a.slug) }} aria-hidden />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <EtiquetteApplication slug={a.slug} />
                            {enPreparation.has(a.slug) && (
                              <span className="inline-flex items-center gap-1" data-testid={`inactive-${a.slug}`}>
                                <Badge variant="outline" className="font-normal">
                                  {t("repartition.appInactive")}
                                </Badge>
                                <Aide libelle={t("repartition.appInactive")}>{t("repartition.appInactiveAide")}</Aide>
                              </span>
                            )}
                          </span>
                          {a.langues !== null && (
                            <span className="block text-xs text-muted-foreground">
                              {t("repartition.langues", { liste: a.langues.join(", ") })}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Input
                          id={`cible-${a.slug}`}
                          aria-label={t("repartition.cibleDe", { app: nomAffiche(a.slug) })}
                          type="number"
                          min={0}
                          max={100}
                          value={valeurs[a.slug] ?? ""}
                          onChange={(e) => setBrouillon({ ...valeurs, [a.slug]: e.target.value })}
                          className="h-8 w-16 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </span>
                    </td>
                    {restreintes.length > 0 && (
                      <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-muted-foreground">
                        {sansCible || !f ? "—" : pourcent(f.partVisee)}
                      </td>
                    )}
                    <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{f ? pourcent(f.partReelle) : "—"}</td>
                    <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                      {sansCible ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cn("inline-flex items-center gap-0.5", fort ? "font-semibold" : "text-muted-foreground")}>
                          {fort && (ecart > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />)}
                          {t("repartition.points", { n: `${ecart > 0 ? "+" : ""}${ecart}` })}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(brouillon || enregistrer.isError) && (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={enregistrer.isPending || total <= 0} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? t("common.saving") : t("repartition.poserCible")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBrouillon(null)}>
              {t("common.cancel")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("repartition.sommeAide", { total })}</span>
            {enregistrer.isError && <span className="text-xs text-destructive">{messageErreur(enregistrer.error)}</span>}
          </div>
        )}
        {inactivesVisees.length > 0 && (
          <Alert data-testid="alerte-inactives">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {t("repartition.cibleInactiveTitre", {
                count: inactivesVisees.length,
                apps: inactivesVisees.map((a) => nomAffiche(a.slug)).join(", "),
              })}
            </AlertTitle>
            <AlertDescription>{t("repartition.cibleInactiveAide")}</AlertDescription>
          </Alert>
        )}
        {restreintes.length > 0 && <p className="text-xs text-muted-foreground">{t("repartition.appsFlotteAide")}</p>}

        {/* Le site de recrutement : combien de recrues il amène. Il ne décide
            plus de leur application (19/11), le moteur les place. */}
        <div className="space-y-1 rounded-lg border bg-muted/30 p-3" data-testid="bloc-site">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Globe className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{t("repartition.siteTitre")}</span>
            <Aide libelle={t("repartition.siteTitre")}>{t("repartition.siteAide", { jours: PROVENANCE_JOURS })}</Aide>
            <span className="text-muted-foreground">
              {site.recrues > 0
                ? t("repartition.siteResume", {
                    jours: PROVENANCE_JOURS,
                    recrues: site.recrues,
                    site: site.site,
                    part: pourcent((100 * site.site) / site.recrues),
                  })
                : t("repartition.siteVide")}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{t("repartition.siteMoteur")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Marché par marché
// ---------------------------------------------------------------------------

/** Au-delà, les marchés se replient derrière un bouton : on lit d'abord ceux qui pèsent. */
const MARCHES_VISIBLES = 12;

function CarteMarches({
  marches,
  statsParAppEtMarche,
  cible,
  applications,
  reglages,
  file,
  labelsPod,
}: {
  marches: MarcheApplications[];
  statsParAppEtMarche: Record<string, Record<string, StatLabel[]>>;
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  reglages: ReglagesChoixLabel;
  file: ReglagesFileLabels | undefined;
  labelsPod: Set<string>;
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const [tous, setTous] = React.useState(false);
  const lignes = React.useMemo(
    () =>
      marches
        .map((m) => {
          const cle = cleMarche(m);
          const stats = statsParAppEtMarche[cle] ?? {};
          const tirages = simulerTirages(m, stats, cible, applications, reglages, TIRAGES_DEFAUT, {
            // La File passe avant le classement, et détourne l'application.
            // Chaque ligne est une projection CONDITIONNELLE (« si les vingt
            // prochaines recrues venaient d'ici ») : chacune part du même état
            // de la File.
            file,
          });
          // Le prochain compte : un seul tirage.
          const prochain = simulerTirages(m, stats, cible, applications, reglages, 1, { file })[0] ?? null;
          const places = tirages.reduce((a, x) => a + x.comptes, 0);
          return {
            cle,
            marche: m,
            comptes: m.parts.reduce((a, p) => a + p.comptes, 0),
            eligibles: new Set(applicationsEligibles(m.langue, applications).map((a) => a.slug)),
            tirages,
            prochain,
            // Les recrues qu'aucune application n'a pu prendre, faute de label
            // ouvert. Sans ce compteur elles disparaîtraient en silence.
            perdues: Math.max(0, TIRAGES_DEFAUT - places),
          };
        })
        .sort((a, b) => b.comptes - a.comptes || a.marche.langue.localeCompare(b.marche.langue)),
    [marches, statsParAppEtMarche, cible, applications, reglages, file],
  );
  const visibles = tous ? lignes : lignes.slice(0, MARCHES_VISIBLES);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("repartition.marchesTitre")}
          <Aide libelle={t("repartition.marchesTitre")}>{t("repartition.tiragesAide", { n: TIRAGES_DEFAUT })}</Aide>
        </CardTitle>
        <CardDescription>{t("repartition.marchesAide", { n: TIRAGES_DEFAUT, marches: lignes.length })}</CardDescription>
        <LegendeApplications className="pt-1" elements={applications.map((a) => ({ slug: a.slug }))} />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("repartition.marchesVide")}</p>
        ) : (
          <table className="w-full border-collapse text-sm sm:min-w-[44rem]">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-6 pb-2" aria-hidden />
                <th className="pb-2 text-left font-medium">{t("repartition.colMarche")}</th>
                <th className="hidden pb-2 pr-4 text-right font-medium sm:table-cell">{t("repartition.colComptes")}</th>
                <th className="hidden w-[18%] pb-2 pr-4 text-left font-medium md:table-cell">{t("repartition.colAujourdhui")}</th>
                <th className="pb-2 pr-4 text-left font-medium">{t("repartition.colProchaine")}</th>
                <th className="w-[22%] pb-2 pr-4 text-left font-medium">{t("repartition.colVingt", { n: TIRAGES_DEFAUT })}</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => {
                const actif = ouvert === l.cle;
                const parAppVingt = new Map<string, number>();
                for (const x of l.tirages) parAppVingt.set(x.app, (parAppVingt.get(x.app) ?? 0) + x.comptes);
                return (
                  <React.Fragment key={l.cle}>
                    <tr
                      className={cn("cursor-pointer border-b border-border/40 hover:bg-muted/50", actif && "bg-muted/40")}
                      onClick={() => setOuvert(actif ? null : l.cle)}
                      data-testid={`marche-${l.cle}`}
                    >
                      <td className="py-2 text-muted-foreground">
                        {/* Le clic sur toute la ligne est un confort de souris ;
                            ce bouton est le vrai contrôle, au clavier comme au
                            lecteur d'écran. */}
                        <button
                          type="button"
                          aria-expanded={actif}
                          aria-label={t("repartition.deplierMarche", { marche: `${nomLangue(l.marche.langue)}${l.marche.pays ? ` ${nomPaysIso(l.marche.pays)}` : ""}` })}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOuvert(actif ? null : l.cle);
                          }}
                          className="inline-flex size-5 items-center justify-center rounded border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {actif ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                        </button>
                      </td>
                      <td className="py-2 pr-4">
                        <CelluleMarche langue={l.marche.langue} pays={l.marche.pays} />
                      </td>
                      <td className="hidden py-2 pr-4 text-right tabular-nums text-muted-foreground sm:table-cell">{Math.round(l.comptes)}</td>
                      <td className="hidden py-2 pr-4 md:table-cell">
                        <BarreRepartition
                          hauteur="sm"
                          aria-label={t("repartition.colAujourdhui")}
                          segments={segmentsApplications(
                            applications.map((a) => {
                              const n = l.marche.parts.find((p) => p.slug === a.slug)?.comptes ?? 0;
                              return { slug: a.slug, valeur: n, valeurAffichee: t("repartition.nComptes", { count: Math.round(n) }) };
                            }),
                          )}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        {l.prochain ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <LogoApplication slug={l.prochain.app} taille="sm" />
                            <NomLabel nom={l.prochain.label_nom} pod={labelsPod.has(l.prochain.label_id)} className="text-xs" />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("repartition.aucun")}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <BarreRepartition
                          hauteur="sm"
                          aria-label={t("repartition.colVingt", { n: TIRAGES_DEFAUT })}
                          vide={t("repartition.aucun")}
                          // Les recrues qu'aucune appli n'a pu prendre gardent leur
                          // place dans la barre : la renormaliser à 100 % sur les
                          // seules placées cacherait des comptes à créer quand même.
                          segments={[
                            ...segmentsApplications(
                              applications.map((a) => {
                                const n = parAppVingt.get(a.slug) ?? 0;
                                const labels = l.tirages.filter((x) => x.app === a.slug);
                                return {
                                  slug: a.slug,
                                  valeur: n,
                                  valeurAffichee: t("repartition.nSurVingt", { n, total: TIRAGES_DEFAUT }),
                                  detail: labels.map((x) => `${x.label_nom} ${x.comptes}`).join(" · "),
                                };
                              }),
                            ),
                            ...(l.perdues > 0
                              ? [{
                                  cle: "perdues",
                                  valeur: l.perdues,
                                  couleur: couleurApplication(""),
                                  libelle: t("repartition.sansLabelOuvert"),
                                  valeurAffichee: t("repartition.nSurVingt", { n: l.perdues, total: TIRAGES_DEFAUT }),
                                }]
                              : []),
                          ]}
                        />
                        {l.perdues > 0 && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-destructive-foreground">
                            <AlertTriangle className="size-3" aria-hidden />
                            {t("repartition.tiragesPerdus", { n: l.perdues })}
                          </span>
                        )}
                      </td>
                    </tr>
                    {actif && (
                      <tr>
                        <td colSpan={6} className="pb-3">
                          <DetailMarche ligne={l} applications={applications} labelsPod={labelsPod} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {lignes.length > MARCHES_VISIBLES && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTous(!tous)}>
            {tous ? t("repartition.marchesMoins") : t("repartition.marchesTous", { n: lignes.length })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Le détail d'un marché : la composition des vingt prochains comptes. */
function DetailMarche({
  ligne,
  applications,
  labelsPod,
}: {
  ligne: {
    marche: MarcheApplications;
    tirages: Tirage[];
    eligibles: Set<string>;
  };
  applications: ApplicationCandidate[];
  labelsPod: Set<string>;
}) {
  const { t } = useTranslation();
  const tries = trierApplications(ligne.tirages, (x) => x.app);
  const nonServies = applications.filter((a) => !ligne.eligibles.has(a.slug));
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("repartition.detailVingt", { n: TIRAGES_DEFAUT, langue: nomLangue(ligne.marche.langue) })}
        </p>
        {tries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("repartition.aucun")}</p>
        ) : (
          <ul className="space-y-1.5">
            {tries.map((x) => (
              <li key={`${x.application_id}:${x.label_id}`} className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <LogoApplication slug={x.app} taille="xs" />
                <NomLabel nom={x.label_nom} pod={labelsPod.has(x.label_id)} />
                <span className="h-2 rounded-r-[4px]" style={{ width: `${(100 * x.comptes) / TIRAGES_DEFAUT}%`, background: couleurApplication(x.app) }} aria-hidden />
                <span className="whitespace-nowrap text-right tabular-nums">{x.comptes}</span>
              </li>
            ))}
          </ul>
        )}
        {nonServies.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("repartition.nonServies", { liste: nonServies.map((a) => nomAffiche(a.slug)).join(", ") })}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Les labels d'une application
// ---------------------------------------------------------------------------

function bornesRemplissage(r: { min: number; max: number; niveau: number | null } | undefined) {
  if (!r) return { min: 0, max: 0 };
  return { min: r.niveau ?? r.min, max: Math.max(r.max, r.niveau ?? 0) };
}

function CarteLabels({
  applications,
  applicationParDefaut,
  marchesParApp,
  reglages,
}: {
  applications: ApplicationCandidate[];
  applicationParDefaut: string | null;
  marchesParApp: Record<string, Array<{ langue: string; pays: string | null; stats: StatLabel[] }>>;
  reglages: ReglagesChoixLabel;
}) {
  const { t } = useTranslation();
  const [choix, setChoix] = React.useState<string | null>(null);
  // 0794 : les labels fermés sont cachés, et fermer un label propose de réaffecter ses comptes.
  const [voirFermes, setVoirFermes] = React.useState(false);
  const [aReaffecter, setAReaffecter] = React.useState<{ id: string; nom: string } | null>(null);
  const appId =
    choix ?? (applications.some((a) => a.id === applicationParDefaut) ? applicationParDefaut : applications[0]?.id) ?? null;
  const app = applications.find((a) => a.id === appId) ?? null;
  const marches = React.useMemo(() => (appId ? (marchesParApp[appId] ?? []) : []), [appId, marchesParApp]);

  const lignes = React.useMemo(() => {
    if (!appId || marches.length === 0) return [];
    // Une ligne par label. La réserve d'un label livré par un pod dépend de la
    // langue (0348) : on prend son stock entier (le plus haut des marchés) pour
    // les jours, et on compte les marchés où il ne peut RIEN servir.
    const parLabel = new Map<string, { stat: StatLabel; max: number; absents: string[] }>();
    for (const m of marches) {
      for (const s of m.stats) {
        const e = parLabel.get(s.label_id);
        if (!e) parLabel.set(s.label_id, { stat: s, max: s.passages_restants, absents: [] });
        else if (s.passages_restants > e.max) parLabel.set(s.label_id, { ...e, stat: s, max: s.passages_restants });
      }
    }
    for (const m of marches) {
      for (const s of m.stats) {
        const e = parLabel.get(s.label_id)!;
        // 100 % podz (0352) : absent là où son pod ne livre pas, stock ou non.
        const absent = s.pod_seul ? s.livre_langue === false : e.max > 0 && s.passages_restants <= 0;
        if (absent) e.absents.push(nomLangue(m.langue));
      }
    }
    // Remplissage d'un label 100 % podz : ses comptes par langue servie, du
    // moins rempli au plus rempli (le moteur le remplit en largeur). Le bas se
    // lit dans `niveau_pod`, que le moteur calcule sur les seules langues où
    // l'application recrute : une langue servie sans recrue ne le tire pas à 0.
    // `niveau_pod` d'un marché = le moins rempli des AUTRES langues qui
    // recrutent ; sur tous les marchés, ça couvre toutes ces langues. Sans
    // aucun niveau (une seule langue recrute), le bas des marchés servis.
    const remplissage = new Map<string, { min: number; max: number; niveau: number | null }>();
    for (const m of marches) {
      for (const s of m.stats) {
        if (!s.pod_seul || s.livre_langue === false) continue;
        const r = remplissage.get(s.label_id);
        remplissage.set(s.label_id, {
          min: Math.min(r?.min ?? Infinity, s.comptes_langue),
          max: Math.max(r?.max ?? 0, s.comptes_langue),
          niveau:
            s.niveau_pod === null || s.niveau_pod === undefined
              ? (r?.niveau ?? null)
              : Math.min(r?.niveau ?? Infinity, s.niveau_pod),
        });
      }
    }
    // Les comptes de CETTE application : l'onglet micabo ne doit pas compter
    // les comptes Sophia d'un label partagé (le moteur, lui, compte tout).
    const comptesApp = (s: StatLabel) => s.comptes_app ?? s.comptes_total;
    const totalApp = [...parLabel.values()].reduce((a, e) => a + comptesApp(e.stat), 0);
    return [...parLabel.values()]
      .map(({ stat, max, absents }) => ({
        stat,
        motif: motifFermeture(stat.label_id, appId, reglages, stat),
        decision: etatManuelLabel(stat.label_id, appId, reglages),
        jours: max / (stat.demande_jour + reglages.postsParJourNouveau),
        perf: stat.perf_flotte && stat.perf_label !== null && stat.passages > 0 ? stat.perf_label / stat.perf_flotte : null,
        comptes: comptesApp(stat),
        part: totalApp > 0 ? (100 * comptesApp(stat)) / totalApp : 0,
        absents: [...new Set(absents)],
        remplissage: stat.pod_seul ? bornesRemplissage(remplissage.get(stat.label_id)) : null,
        enTest: enTestPod(stat, reglages, appId),
        testPlein: testPodPlein(stat, reglages, appId),
      }))
      // Les 100 % podz en dernier : leur réserve ne les juge pas.
      .sort((a, b) => Number(a.remplissage !== null) - Number(b.remplissage !== null) || a.jours - b.jours);
  }, [appId, marches, reglages]);

  const nbFermes = lignes.filter((e) => e.motif !== null).length;
  const lignesVues = voirFermes ? lignes : lignes.filter((e) => e.motif === null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {t("repartition.labelsTitre")}
              <Aide libelle={t("repartition.labelsTitre")}>{t("repartition.etatAide")}</Aide>
            </CardTitle>
            <CardDescription>{t("repartition.labelsAide", { jours: reglages.reserveMinJours, test: reglages.testPodComptes })}</CardDescription>
          </div>
          <div
            role="tablist"
            aria-label={t("repartition.colApp")}
            className="inline-flex gap-1 rounded-lg border bg-muted/40 p-1"
            onKeyDown={(ev) => {
              // Flèches, Début et Fin : le motif d'onglets ARIA. Un seul onglet
              // est dans l'ordre de tabulation, celui qui est choisi.
              const i = applications.findIndex((a) => a.id === appId);
              const n = applications.length;
              const vers =
                ev.key === "ArrowRight" ? (i + 1) % n
                : ev.key === "ArrowLeft" ? (i - 1 + n) % n
                : ev.key === "Home" ? 0
                : ev.key === "End" ? n - 1
                : -1;
              if (vers < 0 || n === 0) return;
              ev.preventDefault();
              setChoix(applications[vers].id);
              document.getElementById(`onglet-labels-${applications[vers].id}`)?.focus();
            }}
          >
            {applications.map((a) => (
              <button
                key={a.id}
                id={`onglet-labels-${a.id}`}
                type="button"
                role="tab"
                aria-selected={a.id === appId}
                aria-controls="panneau-labels"
                tabIndex={a.id === appId ? 0 : -1}
                onClick={() => setChoix(a.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                  a.id === appId ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LogoApplication slug={a.slug} taille="xs" decoratif />
                {nomAffiche(a.slug)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className="overflow-x-auto"
        id="panneau-labels"
        role="tabpanel"
        aria-labelledby={appId ? `onglet-labels-${appId}` : undefined}
      >
        {!app || lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("repartition.labelsVide")}</p>
        ) : (
          <table className="w-full border-collapse text-sm md:min-w-[46rem]" data-testid="table-labels">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 text-left font-medium">{t("repartition.colLabel")}</th>
                <th className="w-[28%] pb-2 pr-4 text-left font-medium">{t("repartition.colReserve")}</th>
                <th className="hidden pb-2 pr-4 text-right font-medium md:table-cell">{t("repartition.colPerf")}</th>
                <th className="hidden pb-2 pr-4 text-right font-medium md:table-cell">{t("repartition.colFlotte")}</th>
                <th className="hidden pb-2 pr-4 text-left font-medium md:table-cell">{t("repartition.colEtat")}</th>
                <th className="pb-2 text-left font-medium">{t("repartition.colDecision")}</th>
              </tr>
            </thead>
            <tbody>
              {lignesVues.map((e) => (
                <tr key={e.stat.label_id} className="border-b border-border/40" data-testid={`label-${e.stat.label_nom}`}>
                  <td className="py-2 pr-4">
                    <NomLabel nom={e.stat.label_nom} pod={e.stat.pod_seul} className="text-xs" />
                    {/* Un label 100 % podz montre ses langues dans sa propre carte. */}
                    {e.absents.length > 0 && !e.stat.pod_seul && (
                      <Bulle
                        libelle={t("repartition.absentLangues", { count: e.absents.length })}
                        className="ml-2 text-[11px] text-amber-700 dark:text-amber-400"
                        declencheur={
                          <>
                            <AlertTriangle className="size-3" aria-hidden />
                            {t("repartition.absentLangues", { count: e.absents.length })}
                          </>
                        }
                      >
                        {t("repartition.absentLanguesAide", { liste: e.absents.join(", ") })}
                      </Bulle>
                    )}
                    {/* Sous md, la colonne État est masquée : le badge passe ici. */}
                    <span className="mt-1 block md:hidden">
                      <EtatLabel motif={e.motif} testPlein={e.testPlein} />
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {e.remplissage ? (
                      e.enTest ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="test-pod">
                          {t("repartition.testPod", {
                            comptes: e.stat.comptes_total,
                            max: reglages.testPodComptes,
                            posts: e.stat.passages,
                            postsMax: reglages.testPodPosts,
                          })}
                          <Aide libelle={t("repartition.colReserve")}>
                            {t("repartition.testPodAide", {
                              max: reglages.testPodComptes,
                              postsMax: reglages.testPodPosts,
                              seuil: nombre(reglages.fermeturePerf, 2),
                            })}
                          </Aide>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground" data-testid="remplissage-pod">
                          {t("repartition.podzVoirCarte")}
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-2">
                        <BarreReserve
                          jours={e.jours}
                          seuil={reglages.reserveMinJours}
                          libelleSeuil={t("repartition.seuilReserve", { jours: reglages.reserveMinJours })}
                        />
                        <span
                          className={cn(
                            "inline-flex w-14 shrink-0 items-center justify-end gap-0.5 tabular-nums",
                            e.jours < reglages.reserveMinJours
                              ? "font-semibold text-destructive-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {e.jours < reglages.reserveMinJours && <AlertTriangle className="size-3" aria-hidden />}
                          {t("repartition.nJours", { n: nombre(e.jours, e.jours < 10 ? 1 : 0) })}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap py-2 pr-4 text-right tabular-nums md:table-cell">
                    {e.perf === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-0.5", e.perf < 1 ? "text-muted-foreground" : "font-medium")}>
                        {e.perf >= 1 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}×{nombre(e.perf)}
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap py-2 pr-4 text-right tabular-nums md:table-cell" data-testid="comptes-label">
                    {e.comptes}
                    <span className="ml-1 text-xs text-muted-foreground">({pourcent(e.part)})</span>
                    {e.stat.comptes_total !== e.comptes && (
                      <span className="block text-[11px] text-muted-foreground">
                        {t("repartition.comptesToutesApps", { n: e.stat.comptes_total })}
                      </span>
                    )}
                  </td>
                  <td className="hidden py-2 pr-4 md:table-cell">
                    <EtatLabel motif={e.motif} testPlein={e.testPlein} />
                  </td>
                  <td className="py-2">
                    <DecisionLabel
                      applicationId={appId!}
                      labelId={e.stat.label_id}
                      etat={e.decision}
                      onFerme={() => setAReaffecter({ id: e.stat.label_id, nom: e.stat.label_nom })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nbFermes > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs text-muted-foreground"
            aria-expanded={voirFermes}
            data-testid="voir-labels-fermes"
            onClick={() => setVoirFermes((v) => !v)}
          >
            {voirFermes ? t("repartition.fermesMasquer") : t("repartition.fermesVoir", { count: nbFermes })}
          </Button>
        )}
        {aReaffecter && (
          <ReaffectationLabelFerme
            key={aReaffecter.id}
            labelId={aReaffecter.id}
            nom={aReaffecter.nom}
            onFini={() => setAReaffecter(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ouvrir, fermer ou rendre à l'automatique un label, pour l'application
 * choisie. Trois boutons plutôt qu'un interrupteur : « auto » n'est pas
 * « ouvert ». En auto, le label suit ses chiffres et la nuit peut le fermer ;
 * ouvert, il est tenu ouvert contre ses chiffres.
 */
function DecisionLabel({
  applicationId,
  labelId,
  etat,
  onFerme,
}: {
  applicationId: string;
  labelId: string;
  etat: EtatManuelLabel;
  /** Le label vient d'être fermé à la main : proposer de réaffecter ses comptes (0794). */
  onFerme?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const poser = useMutation({
    mutationFn: (vers: EtatManuelLabel) => ecrireEtatManuelLabel({ applicationId, labelId, etat: vers }),
    onSuccess: (_rien, vers) => {
      void queryClient.invalidateQueries({ queryKey: ["repartition-reglages"] });
      if (vers === "ferme") onFerme?.();
    },
  });

  const choix: Array<{ valeur: EtatManuelLabel; libelle: string }> = [
    { valeur: "auto", libelle: t("repartition.decisionAuto") },
    { valeur: "ouvert", libelle: t("repartition.decisionOuvert") },
    { valeur: "ferme", libelle: t("repartition.decisionFerme") },
  ];

  return (
    <span className="inline-flex rounded-md border p-0.5">
      {choix.map((c) => (
        <Button
          key={c.valeur}
          size="sm"
          variant={etat === c.valeur ? "default" : "ghost"}
          aria-pressed={etat === c.valeur}
          disabled={poser.isPending}
          className="h-7 px-2.5"
          // Reposer l'état en cours n'écrirait rien de neuf.
          onClick={() => etat !== c.valeur && poser.mutate(c.valeur)}
        >
          {c.libelle}
        </Button>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 5. Les réglages fins, repliés
// ---------------------------------------------------------------------------

type Traduire = ReturnType<typeof useTranslation>["t"];

/** L'intervalle que le moteur accepte vraiment, écrit sous le champ. */
function aideChamp(c: ChampReglageLabel, t: Traduire): string {
  const borne =
    c.max !== undefined
      ? t("repartition.borneIntervalle", { min: c.min, max: c.max })
      : c.strict
        ? t("repartition.borneSup", { min: c.min })
        : t("repartition.borneSupEgal", { min: c.min });
  return c.entier ? `${borne}, ${t("repartition.borneEntier")}` : borne;
}

/**
 * Les réglages du choix de label, éditables, repliés par défaut : on y vient
 * pour un réglage précis, pas pour lire la page.
 *
 * REFUSER PLUTÔT QUE SE FAIRE RÉÉCRIRE. Le lecteur du moteur remplace une
 * valeur qu'il n'aime pas par celle par défaut, sans le dire :
 * `validerReglagesLabel` recopie ses bornes et bloque l'enregistrement, pour
 * que l'écran et le moteur racontent la même chose.
 *
 * REVENIR AUX DÉFAUTS RETIRE LES CLÉS au lieu de réécrire les mêmes nombres.
 */
function CarteReglages({ reglages }: { reglages: ReglagesChoixLabel }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deplie, setDeplie] = React.useState(false);
  const [brouillon, setBrouillon] = React.useState<BrouillonReglageLabel | null>(null);
  const poses = useQuery({
    queryKey: ["repartition-reglages-poses"],
    queryFn: lireReglagesChoixLabelPoses,
    retry: false,
  });

  const valeurs = brouillon ?? brouillonDepuisReglages(reglages);
  const verdict = validerReglagesLabel(valeurs);

  const rafraichir = () => {
    setBrouillon(null);
    void queryClient.invalidateQueries({ queryKey: ["repartition-reglages"] });
    void queryClient.invalidateQueries({ queryKey: ["repartition-reglages-poses"] });
  };

  const enregistrer = useMutation({
    mutationFn: () => ecrireReglagesChoixLabel(verdict.valeurs!),
    onSuccess: rafraichir,
  });
  const defauts = useMutation({
    mutationFn: () => remettreReglagesChoixLabelDefaut(),
    onSuccess: rafraichir,
  });
  const enCours = enregistrer.isPending || defauts.isPending;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setDeplie(!deplie)}
          aria-expanded={deplie}
          className="flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left"
        >
          <span className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" aria-hidden />
              {t("repartition.reglagesTitre")}
            </CardTitle>
            <CardDescription>
              {poses.data ? t("repartition.reglagesSourcePosee") : t("repartition.reglagesSourceDefaut")}
            </CardDescription>
          </span>
          {deplie ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
        </button>
      </CardHeader>
      {deplie && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("repartition.reglagesAide")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHAMPS_REGLAGE_LABEL.map((c) => {
              const faute = verdict.erreurs[c.cle];
              return (
                <div key={c.cle} className="space-y-1">
                  <label htmlFor={`reglage-${c.cle}`} className="text-sm font-medium">
                    {t(`repartition.${c.cleI18n}`)}
                  </label>
                  <Input
                    id={`reglage-${c.cle}`}
                    type="number"
                    step={c.pas}
                    min={c.min}
                    max={c.max}
                    aria-invalid={faute ? true : undefined}
                    value={valeurs[c.cle]}
                    onChange={(e) => setBrouillon({ ...valeurs, [c.cle]: e.target.value })}
                    className={`h-9 ${faute ? "border-destructive" : ""}`}
                  />
                  <p className={`text-xs ${faute ? "text-destructive" : "text-muted-foreground"}`}>{aideChamp(c, t)}</p>
                </div>
              );
            })}
          </div>
          {verdict.bornesCroisees && <p className="text-xs text-destructive">{t("repartition.reglagesBornesCroisees")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={enCours || verdict.valeurs === null} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? t("common.saving") : t("repartition.reglagesEnregistrer")}
            </Button>
            <Button size="sm" variant="outline" disabled={enCours} onClick={() => defauts.mutate()}>
              {t("repartition.reglagesDefaut")}
            </Button>
            {brouillon && (
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => setBrouillon(null)}>
                {t("common.cancel")}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {t("repartition.rFermesApp")} : {reglages.fermesApp.length + reglages.fermes.length}
            </span>
          </div>
          {verdict.valeurs === null && !verdict.bornesCroisees && (
            <p className="text-xs text-destructive">{t("repartition.reglagesRefus")}</p>
          )}
          {(enregistrer.isError || defauts.isError) && (
            <p className="text-xs text-destructive">{messageErreur(enregistrer.error ?? defauts.error)}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
