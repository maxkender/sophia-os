import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MicroLabel } from "@/components/ui/micro-label";
import { Textarea } from "@/components/ui/textarea";
import { creerLabel, listerLabels, majLabel, supprimerLabel } from "@/features/moteur/api";
import { definirApplicationsLabel } from "@/features/moteur/apiMultiApp";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { exemplesFeedDepuisTexte, exemplesFeedVersTexte } from "@/features/moteur/creationManuelle";
import { applicationsDuLabel, ID_SOPHIA } from "@/features/moteur/multiApp";
import { ApplicationsCard } from "@/features/moteur/multiapp/ApplicationsCard";
import { LabelApplications } from "@/features/moteur/multiapp/LabelApplications";
import { ReplisCard } from "@/features/moteur/multiapp/ReplisCard";
import { useLabelsApplications, type LabelsApplications } from "@/features/moteur/multiapp/useLabelsApplications";
import { SEUIL_STOCK_JOURS } from "@/features/moteur/pilotage";
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
 * Les labels ne sont plus cloisonnés par application : la carte les montre
 * TOUS, chacun avec les applications qu'il sert. Le sélecteur d'application ne
 * fait plus que choisir la réserve affichée.
 */
const CLE_TOUS_LABELS = ["labels", "tous"] as const;

type ApplicationListee = ReturnType<typeof useApplication>["applications"][number];

/** Le style d'écriture d'un label : ce que le modèle doit imiter quand il crée un post. */
function EditeurStyle({ label }: { label: LabelMoteur }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [styleTheme, setStyleTheme] = React.useState(label.style_theme ?? "");
  const [promptCreation, setPromptCreation] = React.useState(label.prompt_creation ?? "");
  const [feed, setFeed] = React.useState(exemplesFeedVersTexte(label.exemples_feed));

  const sauver = useMutation({
    mutationFn: () =>
      majLabel(label.id, {
        style_theme: styleTheme.trim() || null,
        prompt_creation: promptCreation.trim() || null,
        exemples_feed: exemplesFeedDepuisTexte(feed),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });

  const id = (champ: string) => `label-${label.id}-${champ}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={id("theme")}>{t("labels.styleTheme")}</Label>
            <Aide libelle={t("labels.styleTheme")}>{t("labels.styleThemeAide")}</Aide>
          </div>
          <Textarea id={id("theme")} rows={3} value={styleTheme} onChange={(e) => setStyleTheme(e.target.value)} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={id("prompt")}>{t("labels.promptCreation")}</Label>
            <Aide libelle={t("labels.promptCreation")}>{t("labels.promptCreationAide")}</Aide>
          </div>
          <Textarea id={id("prompt")} rows={3} value={promptCreation} onChange={(e) => setPromptCreation(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id("feed")}>{t("labels.feed")}</Label>
          <Aide libelle={t("labels.feed")}>{t("labels.feedAide")}</Aide>
        </div>
        <Textarea id={id("feed")} rows={5} value={feed} onChange={(e) => setFeed(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={sauver.isPending} onClick={() => sauver.mutate()}>
          {sauver.isPending ? t("common.saving") : t("labels.enregistrerStyle")}
        </Button>
        {sauver.isSuccess && <span className="text-xs text-success">{t("labelsPage.styleEnregistre")}</span>}
        {sauver.isError && <span className="text-xs text-destructive">{(sauver.error as Error).message}</span>}
      </div>
    </div>
  );
}

/** Le stock du label dans l'application choisie, avec la barre de l'Allocation. */
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
            value={label.genre === "homme" ? "homme" : "femme"}
            disabled={changerGenre.isPending}
            aria-label={t("labels.genre")}
            onChange={(e) => changerGenre.mutate(e.target.value as LabelGenre)}
          >
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
                <MicroLabel>{t("labelsPage.styleTitre")}</MicroLabel>
                <EditeurStyle label={label} />
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

function FormulaireLabel({ multi, onFini }: { multi: LabelsApplications; onFini: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { applications } = useApplication();
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");
  const [genre, setGenre] = React.useState<LabelGenre>("femme");
  // Défaut Sophia seule : un label créé sans toucher aux cases sert Sophia,
  // comme avant (sans case cochée, il ne servirait personne).
  const [appsNouveau, setAppsNouveau] = React.useState<string[]>([ID_SOPHIA]);

  const creer = useMutation({
    mutationFn: async () => {
      const lab = await creerLabel(nom.trim(), couleur, { genre });
      // Le label existe déjà si cette écriture échoue : il ne sert alors
      // personne, et l'erreur dit quoi recocher.
      if (multi.multiDispo) {
        try {
          await definirApplicationsLabel(lab.id, appsNouveau);
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
    onSuccess: onFini,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
      qc.invalidateQueries({ queryKey: ["label-applications"] });
      qc.invalidateQueries({ queryKey: ["label-application-reserve"] });
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-md border border-border/80 bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (nom.trim() && appsNouveau.length > 0) creer.mutate();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="labNom">{t("labels.nom")}</Label>
        <Input id="labNom" value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="labCoul">{t("labels.couleur")}</Label>
        <Input id="labCoul" type="color" className="h-9 w-14 p-1" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="labGenre">{t("labels.genre")}</Label>
          <Aide libelle={t("labels.genre")}>{t("labels.genreAide")}</Aide>
        </div>
        <select id="labGenre" className={selectClass} value={genre} onChange={(e) => setGenre(e.target.value as LabelGenre)}>
          <option value="femme">{t("labels.genreFemme")}</option>
          <option value="homme">{t("labels.genreHomme")}</option>
        </select>
      </div>
      {multi.multiDispo && applications.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t("multiApp.labels.applicationsServies")}</legend>
          <div className="flex h-9 flex-wrap items-center gap-3">
            {applications.map((app) => (
              <label key={app.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={appsNouveau.includes(app.id)}
                  onChange={(e) =>
                    setAppsNouveau((avant) => (e.target.checked ? [...avant, app.id] : avant.filter((id) => id !== app.id)))
                  }
                />
                <LogoApplication slug={app.slug} taille="xs" decoratif />
                {nomApplication(app)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={creer.isPending || !nom.trim() || appsNouveau.length === 0}>
          {creer.isPending ? t("common.saving") : t("labels.creer")}
        </Button>
        <Button type="button" variant="ghost" onClick={onFini}>
          {t("common.cancel")}
        </Button>
      </div>
      {creer.isError && <p className="w-full text-xs text-destructive">{(creer.error as Error).message}</p>}
    </form>
  );
}

function LabelsCard() {
  const { t } = useTranslation();
  const { applicationId, applications, application, slug } = useApplication();
  const labels = useQuery({ queryKey: CLE_TOUS_LABELS, queryFn: () => listerLabels() });
  // Requêtes à part, et pas un enrichissement de `listerLabels` : la gestion
  // des labels doit rester utilisable même si 0256 (liens label × application,
  // vue `label_application_reserve`) n'est pas encore appliquée en base. Un
  // badge manquant n'empêche pas de créer un label.
  const multi = useLabelsApplications(applicationId);
  const [nouveau, setNouveau] = React.useState(false);
  const nomApp = application ? nomApplication(application) : nomApplication({ slug });

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
          {!nouveau && (
            <Button size="sm" variant="outline" onClick={() => setNouveau(true)}>
              <Plus />
              {t("labelsPage.nouveauLabel")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {multi.schemaAbsent && <p className="text-[11px] text-muted-foreground">{t("multiApp.labels.schemaAbsent")}</p>}
        {multi.erreurLiens != null && (
          <p className="text-xs text-destructive">
            {t("multiApp.labels.erreurLiens", {
              message: (multi.erreurLiens as { message?: string }).message ?? String(multi.erreurLiens),
            })}
          </p>
        )}
        {nouveau && <FormulaireLabel multi={multi} onFini={() => setNouveau(false)} />}
        {labels.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {labels.isError && <p className="text-xs text-destructive">{(labels.error as Error).message}</p>}
        {labels.data && labels.data.length === 0 && <p className="text-sm text-muted-foreground">{t("labels.aucunIci")}</p>}
        {labels.data && labels.data.length > 0 && (
          <div className="relative overflow-x-auto">
            {/* relative : les textes sr-only (en position absolue) restent dans la zone qui défile. */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className={TH}>{t("labelsPage.colLabel")}</th>
                  <th scope="col" className={TH}>{t("labels.genre")}</th>
                  <th scope="col" className={TH}>{t("labelsPage.colApplis")}</th>
                  <th scope="col" className={TH}>
                    <span className="inline-flex items-center gap-1.5">
                      {t("labelsPage.colStock")}
                      {application && <LogoApplication slug={application.slug} taille="xs" />}
                      <span className="sr-only">{nomApp}</span>
                    </span>
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">{t("labelsPage.colActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {labels.data.map((lab) => (
                  <LigneLabel
                    key={lab.id}
                    label={lab}
                    multi={multi}
                    applications={applications}
                    applicationId={applicationId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Labels & applications : la configuration qui vivait en bas du Pilotage,
 * dans le gabarit de la page Allocation. Les labels d'abord (on y vient le
 * plus souvent), chacun dépliable sur ses applications et son style, puis les
 * applications et les replis sur Sophia.
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
