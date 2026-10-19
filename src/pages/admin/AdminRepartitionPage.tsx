import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock, UserCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import {
  CLE_CHOIX_APPLICATION_AUTO,
  ecrireChoixApplicationAuto,
  ecrireCibleRepartitionApps,
  lireChoixApplicationAuto,
  lireCibleRepartitionApps,
  lireMarchesApplications,
  lireMarchesRepartition,
  lireRecruesSite,
  lireReglagesRepartition,
  PROVENANCE_JOURS,
  type MarcheRepartition,
} from "@/features/moteur/repartition/apiRepartition";
import {
  cibleHorsSite,
  partSite,
  type PartSite,
  type RecruesMarche,
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
  // D'où viennent les recrues. Celles du site ont déjà leur application quand
  // le moteur les voit : sans ce chiffre, la cible afficherait une
  // concurrence entre applications qui n'existe pas pour cette part-là.
  const provenance = useQuery({
    queryKey: ["repartition-provenance", PROVENANCE_JOURS],
    queryFn: () => lireRecruesSite(PROVENANCE_JOURS),
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
   * La part des prochaines recrues que le moteur ne placera pas, marché par
   * marché, et où le site les envoie.
   *
   * Appariée sur la clé de marché BRUTE, comme les deux autres lectures : les
   * trois RPC rendent la langue et le pays tels qu'ils sont en base, et
   * normaliser ici désaccorderait silencieusement les tableaux.
   */
  const partParMarche = React.useMemo(() => {
    const flotte = provenance.data ?? [];
    const parCle = new Map(flotte.map((p) => [`${p.langue}|${p.pays ?? ""}`, p]));
    const out = new Map<string, PartSite>();
    for (const m of marchesApps.data ?? []) {
      const k = `${m.langue}|${m.pays ?? ""}`;
      out.set(k, partSite(parCle.get(k), flotte));
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
          <CarteRecruesSite
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
 * L'interrupteur de la bascule.
 *
 * Tant qu'il est éteint, tout ce que montre cette page est une projection :
 * l'application d'un nouveau compte reste celle que le recruteur coche.
 * Allumé, c'est le moteur qui décide, par la même règle que la projection
 * ci-dessous, et la case disparaît des écrans de création.
 *
 * DEUX CHOSES NE BOUGENT PAS, même allumé. Les comptes EXISTANTS : aucune
 * rebascule, jamais. Et les recrues venues du site : c'est le site qui
 * choisit pour ses candidats, le moteur leur laisse la main.
 *
 * LA FILE PASSE TOUJOURS AVANT. Un label mis dans la File d'une application
 * attire le compte vers cette application, même si le classement aurait
 * préféré une autre. C'est ce qui permet d'amorcer un label neuf sur deux ou
 * trois comptes : sans ça, un label sans historique ne serait jamais choisi,
 * donc n'aurait jamais d'historique.
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
  // et tout repartirait sur Sophia. Autant l'interdire ici plutôt que de
  // laisser croire que c'est branché.
  const sansCible = cible.source === "defaut";

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("repartition.basculeTitre")}</p>
          <p className="text-xs text-muted-foreground">
            {sansCible ? t("repartition.basculeSansCible") : t("repartition.basculeAide")}
          </p>
        </div>
        <Switch
          checked={actif}
          disabled={auto.isPending || basculer.isPending || sansCible}
          onCheckedChange={(v) => basculer.mutate(v)}
          aria-label={t("repartition.basculeTitre")}
        />
      </div>
      {actif && (
        <p className="mt-2 text-xs font-medium text-amber-700">{t("repartition.basculeActifAvis")}</p>
      )}
      {basculer.isError && (
        <p className="mt-2 text-xs text-destructive">{messageErreur(basculer.error)}</p>
      )}
    </div>
  );
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
        <InterrupteurChoixAuto cible={cible} />
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
 * Les recrues que le moteur ne place pas.
 *
 * Une partie des créateurs arrive par le site, et c'est le SITE qui choisit
 * leur application, candidat par candidat. Ce n'est pas une anomalie, c'est
 * la règle : la décision vient de là. Côté moteur, ça veut dire que ces
 * recrues-là sont déjà attribuées quand il les voit.
 *
 * En français, sur 30 jours glissants, c'est 5 recrues sur 11. Près de la
 * moitié des prochains comptes sont placés avant que le moindre classement ne
 * tourne. Une cible qui demanderait, pour une application, moins que ce que
 * le site lui envoie déjà n'est pas ambitieuse : elle est impossible, et la
 * page doit le dire plutôt que d'afficher un écart que personne ne comblera.
 *
 * La colonne « Planchers » est ce que chaque application reçoit quoi qu'il
 * arrive. Tout est MESURÉ : le jour où le site enverra des comptes ailleurs,
 * les planchers suivront sans qu'on touche à une ligne.
 */
function CarteRecruesSite({
  marches,
  cible,
  applications,
  partParMarche,
  flotte,
}: {
  marches: MarcheApplications[];
  cible: CibleApplications;
  applications: ApplicationCandidate[];
  partParMarche: Map<string, PartSite>;
  flotte: RecruesMarche[];
}) {
  const { t } = useTranslation();

  const totalRecrues = flotte.reduce((a, m) => a + m.recrues, 0);
  const totalSite = flotte.reduce((a, m) => a + m.recruesSite, 0);
  const totalParApp: Record<string, number> = {};
  for (const m of flotte) {
    for (const [slug, v] of Object.entries(m.siteParApp)) {
      totalParApp[slug] = (totalParApp[slug] ?? 0) + v;
    }
  }
  const destinations = Object.entries(totalParApp)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, n]) => `${slug} ${Math.round(n)}`)
    .join(" · ");

  const parCle = new Map(flotte.map((x) => [`${x.langue}|${x.pays ?? ""}`, x]));

  const lignes = marches
    .map((m) => {
      const cle = `${m.langue}|${m.pays ?? ""}`;
      const p = partParMarche.get(cle) ?? partSite(undefined, flotte);
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
      const verdict = cibleHorsSite(cibleMarche, p.part, p.parApp);
      // L'application qui coince : celle dont le plancher dépasse le plus sa
      // part visée. C'est elle qu'il faut nommer, pas « la cible » en bloc.
      const bloquante = Object.entries(verdict.planchers)
        .map(([slug, plancher]) => ({
          slug,
          exces: plancher - (cibleMarche.parts[slug] ?? 0),
          plancher,
        }))
        .sort((a, b) => b.exces - a.exces)[0];
      return {
        cle,
        marche: m,
        part: p,
        recrues: sien?.recrues ?? 0,
        site: sien?.recruesSite ?? 0,
        verdict,
        bloquante,
      };
    })
    .sort(
      (a, b) =>
        b.site - a.site ||
        b.part.part - a.part.part ||
        a.marche.langue.localeCompare(b.marche.langue),
    );

  type Ligne = (typeof lignes)[number];

  /** « sophia 45 % », ou « sophia 36 % · unswipe 9 % » si le site partage. */
  function planchers(l: Ligne): string {
    const entrees = Object.entries(l.verdict.planchers)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (entrees.length === 0) return "—";
    return entrees.map(([slug, v]) => `${slug} ${pourcent(v, 0)}`).join(" · ");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repartition.siteTitre")}</CardTitle>
        <CardDescription>{t("repartition.siteAide", { jours: PROVENANCE_JOURS })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <UserCheck className="h-4 w-4" />
          <AlertDescription>
            {t("repartition.siteResume", {
              jours: PROVENANCE_JOURS,
              recrues: totalRecrues,
              site: totalSite,
              part: totalRecrues > 0 ? pourcent((100 * totalSite) / totalRecrues, 0) : "—",
            })}{" "}
            {totalSite > 0 && t("repartition.siteDestinations", { liste: destinations })}
          </AlertDescription>
        </Alert>
        <Tableau
          lignes={lignes}
          cleLigne={(l) => l.cle}
          vide={t("repartition.siteVide")}
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
                cle: "site",
                titre: t("repartition.colDuSite"),
                align: "droite",
                rendu: (l) => (
                  <span className={l.site > 0 ? "font-semibold" : "text-muted-foreground/60"}>
                    {l.site}
                  </span>
                ),
              },
              {
                cle: "part",
                titre: t("repartition.colHorsMoteur"),
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
                cle: "planchers",
                titre: t("repartition.colPlanchers"),
                classe: "font-mono text-xs text-muted-foreground",
                rendu: planchers,
              },
              {
                cle: "verdict",
                titre: t("repartition.colAtteignable"),
                rendu: (l) => {
                  // Sans cible posée, `lireCibleApplications` rend des parts
                  // ÉGALES pour montrer le manque. Juger « impossible » une
                  // cible que personne n'a choisie serait un faux reproche :
                  // les planchers, eux, restent vrais, ils ne dépendent que
                  // de ce que le site envoie.
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
                  const quoi = {
                    app: l.bloquante?.slug ?? "",
                    minimum: pourcent(l.bloquante?.plancher ?? 0, 0),
                  };
                  // 29 marchés sur 36 n'ont pas assez de recrues pour parler
                  // d'eux-mêmes et empruntent la part de la flotte. Déclarer
                  // une cible impossible sur un chiffre emprunté, c'est
                  // pousser l'admin à la gonfler pour rien.
                  if (l.part.base !== "marche") {
                    return (
                      <span className="text-xs text-muted-foreground">
                        {t("repartition.verdictEchantillon", quoi)}
                      </span>
                    );
                  }
                  return (
                    <Badge variant="destructive">{t("repartition.atteignableNon", quoi)}</Badge>
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
  partParMarche: Map<string, PartSite>;
}) {
  const { t } = useTranslation();
  const lignes = marches
    .map((m) => {
      const cle = `${m.langue}|${m.pays ?? ""}`;
      // La cible passe TELLE QUELLE : les comptes venus du site sont comptés
      // comme les autres, donc Sainte-Laguë envoie d'autant moins de recrues
      // placées par le moteur vers leur application. Lui passer une cible
      // déjà corrigée la corrigerait deux fois.
      const provenance = partParMarche.get(cle);
      const tirages = simulerTirages(
        m,
        statsParAppEtMarche[cle] ?? {},
        cible,
        applications,
        reglages,
        TIRAGES_DEFAUT,
        { partSite: provenance?.part ?? 0, siteParApp: provenance?.parApp ?? {} },
      );
      const places = tirages.reduce((a, x) => a + x.comptes, 0);
      return {
        cle,
        marche: m,
        comptes: m.parts.reduce((a, p) => a + p.comptes, 0),
        tirages,
        site: tirages.reduce((a, x) => a + x.comptesSite, 0),
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
              cle: "site",
              titre: t("repartition.colDuSite"),
              align: "droite",
              classe: "text-muted-foreground",
              rendu: (l) => (
                <>
                  {l.site > 0
                    ? t("repartition.dontSite", { n: l.site, total: TIRAGES_DEFAUT })
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
                        {x.comptesSite > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({t("repartition.dontSiteCourt", { n: x.comptesSite })})
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
