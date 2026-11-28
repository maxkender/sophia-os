import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import { trierApplications } from "@/components/brand/identiteApplications";
import { LogoApplication } from "@/components/brand/LogoApplication";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MicroLabel } from "@/components/ui/micro-label";
import { creerLabel, listerLabels, majLabel, supprimerLabel } from "@/features/moteur/api";
import { definirApplicationsLabel } from "@/features/moteur/apiMultiApp";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { ficheApplication } from "@/features/moteur/catalogueApplications";
import { type AnglePlacement, listerAnglesPlacement } from "@/features/moteur/apiAngles";
import { DetailLabel } from "@/features/moteur/labels/DetailLabel";
import { ReferencesLabel } from "@/features/moteur/labels/ReferencesLabel";
import { applicationsDuLabel } from "@/features/moteur/multiApp";
import type { GroupeAngles } from "@/features/moteur/multiapp/angles";
import { ApplicationsCard } from "@/features/moteur/multiapp/ApplicationsCard";
import { CarteAnglesLabel } from "@/features/moteur/multiapp/CarteAnglesLabel";
import { grouperLabelsParApplication, identiteDuNom } from "@/features/moteur/multiapp/groupesLabels";
import { LabelApplications } from "@/features/moteur/multiapp/LabelApplications";
import { ReplisCard } from "@/features/moteur/multiapp/ReplisCard";
import { useLabelsApplications, type LabelsApplications } from "@/features/moteur/multiapp/useLabelsApplications";
import { SEUIL_STOCK_JOURS } from "@/features/moteur/pilotage";
import { genreDuLabel } from "@/features/moteur/themeLabel";
// Les briques de la page Allocation : même lecture d'une page à l'autre.
import { Aide, BarreReserve } from "@/features/moteur/repartition/graphes";
import type { Label as LabelMoteur, LabelGenre } from "@/features/moteur/types";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Mêmes classes que le tableau de la page Allocation. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-4 align-middle last:pr-0";

/**
 * La carte montre TOUS les labels, rangés par application (19/11) : un groupe
 * par application, avec les labels qui la servent et leur stock POUR ELLE,
 * puis les labels sans application. Un label qui sert deux applications est
 * dans les deux groupes.
 */
const CLE_TOUS_LABELS = ["labels", "tous"] as const;

type ApplicationListee = ReturnType<typeof useApplication>["applications"][number];

/**
 * 23/11 : les angles du label pour l'application de son groupe (actif, en test, ajout), à la place de l'ancien style
 * d'écriture (thème, prompt, feed). Les mêmes cartes que dans Chaîne → Placement.
 */
function AnglesDuLabel({ label, applicationId, nomApp, sert }: { label: LabelMoteur; applicationId: string | null; nomApp: string; sert: boolean }) {
  const { t } = useTranslation();
  const angles = useQuery({ queryKey: ["angles-placement"], queryFn: listerAnglesPlacement, enabled: Boolean(applicationId) });
  if (!applicationId) return <p className="text-xs text-muted-foreground">{t("labelsPage.anglesSansApp")}</p>;
  if (angles.isError) return <p className="text-xs text-destructive">{(angles.error as Error).message}</p>;
  if (!angles.data) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  const siens = angles.data
    .filter((a) => a.label_id === label.id && a.application_id === applicationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groupe: GroupeAngles<AnglePlacement> = {
    labelId: label.id,
    nom: label.nom,
    sert,
    actif: siens.find((a) => a.statut === "actif") ?? null,
    tests: siens.filter((a) => a.statut === "test"),
  };
  return <CarteAnglesLabel groupe={groupe} applicationId={applicationId} nomApplication={nomApp} />;
}

/** Le stock du label pour l'application de son groupe, avec la barre de l'Allocation. */
function StockLabel({ jours, sert }: { jours: number | null | undefined; sert: boolean }) {
  const { t, i18n } = useTranslation();
  if (!sert) return <span className="text-xs text-muted-foreground/60">{t("labelsPage.pasServie")}</span>;
  if (jours === undefined) return null;
  if (jours === null) return <span className="text-xs text-muted-foreground">{t("labels.reserveAucunCompte")}</span>;
  const bas = jours < SEUIL_STOCK_JOURS;
  return (
    <span className="flex items-center gap-3">
      <span className={cn("w-10 shrink-0 text-right tabular-nums", bas && "font-semibold text-destructive")}>
        {jours.toLocaleString(localeDate(i18n.language), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </span>
      <span className="w-28">
        <BarreReserve jours={jours} seuil={SEUIL_STOCK_JOURS} libelleSeuil={t("pilotage.seuilStock", { n: SEUIL_STOCK_JOURS })} />
      </span>
    </span>
  );
}

function LigneLabel({
  label,
  multi,
  applications,
  applicationId,
}: {
  label: LabelMoteur;
  multi: LabelsApplications;
  applications: ApplicationListee[];
  applicationId: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);

  const changerGenre = useMutation({
    mutationFn: (genre: LabelGenre) => majLabel(label.id, { genre }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerLabel(label.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      qc.invalidateQueries({ queryKey: ["label-applications"] });
    },
  });

  const servies = multi.liens ? applicationsDuLabel(label.id, multi.liens) : null;
  const sertChoisie = servies === null || (applicationId !== null && servies.includes(applicationId));
  const reserve = applicationId
    ? (multi.reservesParLabel?.get(label.id)?.get(applicationId) ?? multi.reservesHistoriques?.get(label.id))
    : undefined;
  const Chevron = ouvert ? ChevronDown : ChevronRight;
  const arreter = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <tr
        className={cn("cursor-pointer border-b border-border/40 hover:bg-muted/50", ouvert && "bg-muted/40")}
        onClick={() => setOuvert(!ouvert)}
      >
        <td className={TD}>
          <span className="flex min-w-0 items-center gap-2">
            <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.couleur ?? "#888" }} aria-hidden />
            <span className="truncate font-mono text-xs">{label.nom}</span>
          </span>
        </td>
        <td className={TD} onClick={arreter}>
          <select
            className="h-7 rounded border border-input bg-background px-1 text-xs"
            value={label.genre === "homme" || label.genre === "femme" ? label.genre : ""}
            disabled={changerGenre.isPending}
            aria-label={t("labels.genre")}
            onChange={(e) => changerGenre.mutate(e.target.value as LabelGenre)}
          >
            {/* 26/11 : un label sans genre s'affichait « Femme » (looksmaxxing_man) ; ses comptes prenaient le genre par défaut. */}
            {label.genre !== "homme" && label.genre !== "femme" && <option value="" disabled>{t("labels.genreAChoisir")}</option>}
            <option value="femme">{t("labels.genreFemme")}</option>
            <option value="homme">{t("labels.genreHomme")}</option>
          </select>
        </td>
        <td className={TD}>
          {servies && servies.length > 0 ? (
            <span className="flex items-center gap-1">
              {applications
                .filter((a) => servies.includes(a.id))
                .map((a) => (
                  <LogoApplication key={a.id} slug={a.slug} taille="xs" />
                ))}
            </span>
          ) : servies ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">{t("labelsPage.aucuneAppli")}</span>
          ) : null}
        </td>
        <td className={TD}>
          <StockLabel jours={reserve === undefined ? undefined : reserve.reserve_jours} sert={sertChoisie} />
        </td>
        <td className={cn(TD, "whitespace-nowrap text-right")} onClick={arreter}>
          <Button size="xs" variant="outline" render={<Link to={`/admin/creation?label=${label.id}`} />}>
            {t("labels.creerPost")}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-1 text-muted-foreground hover:text-destructive"
            aria-label={t("labelsPage.supprimer", { nom: label.nom })}
            disabled={supprimer.isPending}
            onClick={() => {
              if (window.confirm(t("labels.confirmDelete"))) supprimer.mutate();
            }}
          >
            <Trash2 />
          </Button>
        </td>
      </tr>
      {ouvert && (
        <tr>
          <td colSpan={5} className="pb-4">
            <div className="space-y-4 rounded-md bg-muted/30 p-3">
              <div className="space-y-1.5">
                <MicroLabel>{t("labelsPage.detail.titre")}</MicroLabel>
                <DetailLabel labelId={label.id} nom={label.nom} applicationIds={servies ?? []} />
              </div>
              {multi.multiDispo && multi.liens && (
                <div className="space-y-1.5">
                  <MicroLabel>{t("labelsPage.applisServies")}</MicroLabel>
                  <LabelApplications
                    labelId={label.id}
                    labelNom={label.nom}
                    applications={applications}
                    liens={multi.liens}
                    reserves={multi.reservesParLabel?.get(label.id)}
                    applicationSelectionneeId={applicationId}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <MicroLabel>{t("labelsPage.daTitre")}</MicroLabel>
                <ReferencesLabel labelId={label.id} />
              </div>
              <div className="space-y-1.5">
                <MicroLabel>{t("labelsPage.anglesTitre")}</MicroLabel>
                <AnglesDuLabel
                  label={label}
                  applicationId={applicationId}
                  sert={sertChoisie}
                  nomApp={nomApplication(applications.find((a) => a.id === applicationId) ?? { slug: "" })}
                />
              </div>
              {(changerGenre.isError || supprimer.isError) && (
                <p className="text-xs text-destructive">{((changerGenre.error ?? supprimer.error) as Error).message}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Créer un label, en trois questions : pour quelle application, comment il
 * s'appelle, et le genre de ses comptes. Le nom n'est pas décoratif : il fixe
 * le thème du @ et de la bio des comptes (« _run » → running), que le
 * formulaire annonce avant de créer. Le label sert l'application choisie, et
 * elle seule (une autre se coche ensuite sur sa ligne, cas rare).
 */
function FormulaireLabel({
  multi,
  applications,
  applicationInitiale,
  onFini,
}: {
  multi: LabelsApplications;
  applications: ApplicationListee[];
  /** L'application du groupe d'où le formulaire est ouvert ; `null` = à choisir. */
  applicationInitiale: string | null;
  onFini: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [applicationId, setApplicationId] = React.useState<string | null>(
    applicationInitiale ?? (applications.length === 1 ? applications[0]!.id : null),
  );
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");
  // Le genre suit le nom (« male_run » → homme) tant qu'on ne l'a pas choisi à la main.
  const [genreChoisi, setGenreChoisi] = React.useState<LabelGenre | null>(null);
  const genre: LabelGenre = genreChoisi ?? genreDuLabel(nom) ?? "femme";
  const [cree, setCree] = React.useState<{ nom: string; application: string } | null>(null);

  const application = applications.find((a) => a.id === applicationId) ?? null;
  const identite = identiteDuNom(nom, application?.slug ?? null);
  // Sans la table des liens (0256 absente), le label se crée comme avant, sans application.
  const choixRequis = multi.multiDispo && applications.length > 0;
  const valide = nom.trim().length > 0 && (!choixRequis || applicationId !== null);

  const creer = useMutation({
    mutationFn: async () => {
      const lab = await creerLabel(nom.trim(), couleur, { genre });
      // Le label existe déjà si cette écriture échoue : il ne sert alors
      // personne, et l'erreur dit quoi recocher.
      if (choixRequis && applicationId) {
        try {
          await definirApplicationsLabel(lab.id, [applicationId]);
        } catch (err) {
          throw new Error(
            t("multiApp.labels.creeSansApplications", {
              nom: lab.nom,
              message: err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err),
            }),
          );
        }
      }
      return lab;
    },
    onSuccess: (lab) => {
      setCree({ nom: lab.nom, application: application ? nomApplication(application) : "" });
      setNom("");
      setGenreChoisi(null);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      qc.invalidateQueries({ queryKey: ["label-applications"] });
      qc.invalidateQueries({ queryKey: ["label-application-reserve"] });
    },
  });

  return (
    <form
      className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3"
      data-testid="form-label"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) creer.mutate();
      }}
    >
      {choixRequis && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t("labelsPage.form.application")}</legend>
          <div className="flex flex-wrap gap-2">
            {applications.map((app) => {
              const choisie = app.id === applicationId;
              return (
                <label
                  key={app.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs transition-colors",
                    choisie ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="labApplication"
                    className="sr-only"
                    checked={choisie}
                    onChange={() => setApplicationId(app.id)}
                  />
                  <LogoApplication slug={app.slug} taille="md" decoratif />
                  <span>
                    <span className="block font-medium">{nomApplication(app)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {[ficheApplication(app.slug)?.concept, app.actif ? null : t("multiApp.applications.inactif").toLowerCase()]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {applicationId === null && (
            <p className="text-[11px] text-muted-foreground">{t("labelsPage.form.applicationAide")}</p>
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="labNom">{t("labels.nom")}</Label>
          <Input
            id="labNom"
            className="font-mono"
            placeholder={identite.attendu ? `…${identite.attendu.suffixe}` : "clean_girl_run"}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="labGenre">{t("labels.genre")}</Label>
            <Aide libelle={t("labels.genre")}>{t("labels.genreAide")}</Aide>
          </div>
          <select
            id="labGenre"
            className={selectClass}
            value={genre}
            onChange={(e) => setGenreChoisi(e.target.value as LabelGenre)}
          >
            <option value="femme">{t("labels.genreFemme")}</option>
            <option value="homme">{t("labels.genreHomme")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="labCoul">{t("labels.couleur")}</Label>
          <Input id="labCoul" type="color" className="h-9 w-14 p-1" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={creer.isPending || !valide}>
            {creer.isPending
              ? t("common.saving")
              : application
                ? t("labelsPage.form.creerPour", { app: nomApplication(application) })
                : t("labels.creer")}
          </Button>
          <Button type="button" variant="ghost" onClick={onFini}>
            {cree ? t("labelsPage.form.fermer") : t("common.cancel")}
          </Button>
        </div>
      </div>
      {nom.trim() && (
        <p className="text-[11px] text-muted-foreground" data-testid="identite-label">
          {t(identite.varies ? "labelsPage.form.identiteVariee" : "labelsPage.form.identite", {
            theme: t(`labelsPage.themes.${identite.theme}`),
            exemple: identite.exemple,
            exemples: (identite.varies ?? []).map((h) => `@${h}`).join(", "),
            genre: genre === "homme" ? t("labels.genreHomme").toLowerCase() : t("labels.genreFemme").toLowerCase(),
          })}
          {identite.attendu && application && (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}
              {t("labelsPage.form.themeAttendu", {
                app: nomApplication(application),
                suffixe: identite.attendu.suffixe,
                theme: t(`labelsPage.themes.${identite.attendu.theme}`),
              })}
            </span>
          )}
        </p>
      )}
      {cree && (
        <div className="rounded-md border border-success/40 bg-success/5 p-2.5 text-xs" data-testid="label-cree">
          <p className="font-medium">{t("labelsPage.form.cree", { nom: cree.nom, app: cree.application })}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
            <li>
              {t("labelsPage.form.suite.sources")}{" "}
              <Link className="text-primary underline-offset-2 hover:underline" to="/admin/sources">
                {t("labelsPage.form.suite.sourcesLien")}
              </Link>
            </li>
            <li>
              {t("labelsPage.form.suite.file", { app: cree.application })}{" "}
              <Link className="text-primary underline-offset-2 hover:underline" to="/admin/reglages">
                {t("labelsPage.form.suite.fileLien")}
              </Link>
            </li>
            <li>{t("labelsPage.form.suite.style")}</li>
          </ol>
        </div>
      )}
      {creer.isError && <p className="text-xs text-destructive">{(creer.error as Error).message}</p>}
    </form>
  );
}

/** L'en-tête d'un groupe : l'application, ce qu'elle fait, son état, et le bouton pour lui ajouter un label. */
function EnTeteGroupe({
  application,
  nb,
  onAjouter,
}: {
  application: ApplicationListee | null;
  nb: number;
  onAjouter?: () => void;
}) {
  const { t } = useTranslation();
  if (!application) {
    return (
      <div className="space-y-0.5 border-b pb-1.5">
        <p className="text-sm font-semibold">{t("labelsPage.groupes.sansTitre", { count: nb })}</p>
        <p className="text-[11px] text-muted-foreground">{t("labelsPage.groupes.sansAide")}</p>
      </div>
    );
  }
  const nom = nomApplication(application);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <LogoApplication slug={application.slug} taille="md" decoratif />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {nom}
            {!application.actif && <Badge variant="outline">{t("multiApp.applications.inactif")}</Badge>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {[ficheApplication(application.slug)?.concept, t("labelsPage.groupes.nb", { count: nb })].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {onAjouter && (
        <Button size="xs" variant="outline" onClick={onAjouter}>
          <Plus />
          {t("labelsPage.groupes.ajouter", { app: nom })}
        </Button>
      )}
    </div>
  );
}

function TableLabels({
  labels,
  multi,
  applications,
  application,
}: {
  labels: LabelMoteur[];
  multi: LabelsApplications;
  applications: ApplicationListee[];
  application: ApplicationListee | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-x-auto">
      {/* relative : les textes sr-only (en position absolue) restent dans la zone qui défile. */}
      {/* Largeurs fixes : les colonnes tombent au même endroit d'un groupe à l'autre. */}
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[24%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead>
          <tr className="border-b">
            <th scope="col" className={TH}>{t("labelsPage.colLabel")}</th>
            <th scope="col" className={TH}>{t("labels.genre")}</th>
            <th scope="col" className={TH}>{t("labelsPage.colApplis")}</th>
            <th scope="col" className={TH}>
              {application && (
                <span className="inline-flex items-center gap-1.5">
                  {t("labelsPage.colStock")}
                  <LogoApplication slug={application.slug} taille="xs" decoratif />
                  <span className="sr-only">{nomApplication(application)}</span>
                </span>
              )}
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">{t("labelsPage.colActions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {labels.map((lab) => (
            <LigneLabel
              key={lab.id}
              label={lab}
              multi={multi}
              applications={applications}
              applicationId={application?.id ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Où le formulaire est ouvert : en haut de la carte (application à choisir) ou dans le groupe d'une application. */
type FormulaireOuvert = { applicationId: string | null } | null;

function LabelsCard() {
  const { t } = useTranslation();
  const { applications: applicationsBrutes } = useApplication();
  // L'ordre du catalogue, le même que dans les graphes : Sophia, micabo, Unswipe, Atala.
  const applications = React.useMemo(
    () => trierApplications(applicationsBrutes, (a) => a.slug),
    [applicationsBrutes],
  );
  const labels = useQuery({ queryKey: CLE_TOUS_LABELS, queryFn: () => listerLabels() });
  // Requêtes à part, et pas un enrichissement de `listerLabels` : la gestion
  // des labels doit rester utilisable même si 0256 (liens label × application,
  // vue `label_application_reserve`) n'est pas encore appliquée en base. Un
  // badge manquant n'empêche pas de créer un label.
  const multi = useLabelsApplications(null);
  const [formulaire, setFormulaire] = React.useState<FormulaireOuvert>(null);

  // Sans les liens (0256 absente, ou pas encore lus), une seule liste, comme avant.
  const groupes = React.useMemo(
    () =>
      labels.data && multi.liens && applications.length > 0
        ? grouperLabelsParApplication(labels.data, applications, multi.liens)
        : null,
    [labels.data, multi.liens, applications],
  );
  const formulaireEnHaut = formulaire !== null && (formulaire.applicationId === null || groupes === null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {t("labels.gestion")}
              <Aide libelle={t("labels.gestion")}>
                {t("labelsPage.labelsAide")} {multi.multiDispo ? t("multiApp.labels.aide") : ""}
              </Aide>
            </CardTitle>
            <CardDescription>{t("labelsPage.labelsDesc", { n: labels.data?.length ?? 0 })}</CardDescription>
          </div>
          {formulaire === null && (
            <Button size="sm" variant="outline" onClick={() => setFormulaire({ applicationId: null })}>
              <Plus />
              {t("labelsPage.nouveauLabel")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {multi.schemaAbsent && <p className="text-[11px] text-muted-foreground">{t("multiApp.labels.schemaAbsent")}</p>}
        {multi.erreurLiens != null && (
          <p className="text-xs text-destructive">
            {t("multiApp.labels.erreurLiens", {
              message: (multi.erreurLiens as { message?: string }).message ?? String(multi.erreurLiens),
            })}
          </p>
        )}
        {formulaireEnHaut && (
          <FormulaireLabel
            multi={multi}
            applications={applications}
            applicationInitiale={null}
            onFini={() => setFormulaire(null)}
          />
        )}
        {labels.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {labels.isError && <p className="text-xs text-destructive">{(labels.error as Error).message}</p>}
        {labels.data && labels.data.length === 0 && <p className="text-sm text-muted-foreground">{t("labels.aucunIci")}</p>}
        {groupes?.map((g) => (
          <section
            key={g.application?.id ?? "sans"}
            className="space-y-2"
            data-testid={`groupe-labels-${g.application?.slug ?? "sans"}`}
          >
            <EnTeteGroupe
              application={g.application}
              nb={g.labels.length}
              onAjouter={
                g.application && formulaire === null
                  ? () => setFormulaire({ applicationId: g.application!.id })
                  : undefined
              }
            />
            {g.application && formulaire?.applicationId === g.application.id && (
              <FormulaireLabel
                multi={multi}
                applications={applications}
                applicationInitiale={g.application.id}
                onFini={() => setFormulaire(null)}
              />
            )}
            {g.labels.length > 0 ? (
              <TableLabels labels={g.labels} multi={multi} applications={applications} application={g.application} />
            ) : (
              g.application && (
                <p className="text-xs text-muted-foreground">
                  {t("labelsPage.groupes.vide", { app: nomApplication(g.application) })}
                </p>
              )
            )}
          </section>
        ))}
        {!groupes && labels.data && labels.data.length > 0 && (
          <TableLabels labels={labels.data} multi={multi} applications={applications} application={null} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Labels & applications : la configuration qui vivait en bas du Pilotage,
 * dans le gabarit de la page Allocation. Les labels d'abord (on y vient le
 * plus souvent), rangés par application et chacun dépliable sur ses
 * applications et son style, puis les applications (leur état de préparation)
 * et les replis sur Sophia. Le mode d'emploi : `docs/applications.md`.
 */
export function AdminLabelsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("labelsPage.title")} description={t("labelsPage.description")} />
      <LabelsCard />
      <ApplicationsCard />
      <ReplisCard />
    </div>
  );
}
