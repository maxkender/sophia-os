import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nomApplication } from "../applications";
import { estLabelFileSlideshow } from "../fileLabelsSlideshow";
import { LANGUES_CIBLES, nomLangue } from "../langues";
import { ID_SOPHIA, SLUG_SOPHIA } from "../multiApp";
import type { FileLabelCompteItem, Label as LabelOs, ReglagesFileLabels } from "../types";
import { applicationsProposees } from "./choixCreation";
import {
  avecItemsApplication,
  entreeHorsApplication,
  fileDeLApplication,
  itemsDeLaFile,
  labelsAjoutables,
  ugcPossible,
  type CleFile,
} from "./fileApplication";
import { estErreurSchemaAbsent } from "../multiapp/logique";
import { useApplicationsMulti, useLiensLabels } from "./useMultiApp";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm";

/**
 * File des créateurs, PAR APPLICATION (Réglages → « Warmup & file de
 * labels »). Un sélecteur d'application (actives, Sophia par défaut) choisit la
 * tranche éditée (`par_application[slug]`, items + par_langue), avec la même
 * ergonomie qu'avant. Les labels proposés à l'ajout sont ceux qui servent
 * l'application (`label_applications`, héritage Sophia) ; une entrée dont le
 * label ne la sert plus est signalée, pas masquée. La case « Compte UGC »
 * n'existe que pour Sophia.
 *
 * `onChange` reçoit le réglage COMPLET (toutes les applications), pour
 * l'affichage, et le CHANGEMENT (tranche, file, entrées) : la page le réapplique
 * sur la valeur relue en base avant d'écrire, pour ne pas ressusciter une entrée
 * qu'une embauche a tirée entre-temps. La tranche Sophia est écrite comme avant.
 */
export interface ChangementFileLabels {
  slug: string;
  cle: CleFile;
  items: FileLabelCompteItem[];
}

export function FileLabelsApplicationEditeur({
  file,
  onChange,
  enCours,
  labels,
  labelsUgc,
}: {
  file: ReglagesFileLabels;
  onChange: (file: ReglagesFileLabels, changement: ChangementFileLabels) => void;
  /** Sauvegarde en cours : boutons désactivés. */
  enCours: boolean;
  labels: readonly LabelOs[] | undefined;
  labelsUgc: readonly string[] | undefined;
}) {
  const { t } = useTranslation();
  const applications = useApplicationsMulti();
  const liensQ = useLiensLabels();
  // Table absente (avant 0256) : tout label sert Sophia (héritage), comme
  // avant. Lecture en cours ou en panne : `null`, rien n'est signalé.
  const liens = liensQ.data ?? (liensQ.isError && estErreurSchemaAbsent(liensQ.error) ? [] : null);

  const [slug, setSlug] = React.useState<string>(SLUG_SOPHIA);
  // Liens illisibles : la File Sophia propose tous les labels slideshow, comme
  // avant (manage-users saute une entrée qui ne sert pas Sophia) ; une autre
  // application ne propose rien tant qu'on ne sait pas ce qui la sert.
  const liensAjout = liens ?? (slug === SLUG_SOPHIA ? [] : null);
  const [cle, setCle] = React.useState<CleFile>("general");
  const [labelAjout, setLabelAjout] = React.useState("");
  const [ugcAjout, setUgcAjout] = React.useState(false);

  const apps = applicationsProposees(applications.data ?? []);
  const app = (applications.data ?? []).find((a) => a.slug === slug) ?? null;
  // Sophia est connue sans lecture : son édition ne dépend pas du catalogue.
  const applicationId = slug === SLUG_SOPHIA ? ID_SOPHIA : (app?.id ?? null);
  const nomApp = app ? nomApplication(app) : nomApplication({ slug });
  const ugcOk = ugcPossible(slug);

  const fileApp = fileDeLApplication(file, slug);
  const fileActive = itemsDeLaFile(fileApp, cle);
  const ajoutables = applicationId ? labelsAjoutables(applicationId, labels ?? [], liensAjout) : [];
  const ugcIds = labelsUgc ?? [];

  const majFile = (items: FileLabelCompteItem[]) =>
    onChange(avecItemsApplication(file, slug, cle, items), { slug, cle, items });

  const changerApplication = React.useCallback((s: string) => {
    setSlug(s);
    setLabelAjout("");
    setUgcAjout(false);
  }, []);
  // Application éteinte pendant l'édition : retour à Sophia, plutôt qu'un
  // sélecteur qui afficherait Sophia en écrivant dans l'autre tranche.
  const appsChargees = applications.data !== undefined;
  const slugProposable = slug === SLUG_SOPHIA || apps.some((a) => a.slug === slug);
  React.useEffect(() => {
    if (appsChargees && !slugProposable) changerApplication(SLUG_SOPHIA);
  }, [appsChargees, slugProposable, changerApplication]);

  return (
    <div className="space-y-3">
      {apps.length >= 2 && (
        <div className="space-y-1 sm:max-w-sm">
          <Label htmlFor="fileApplication">{t("warmup.fileApplication")}</Label>
          <select
            id="fileApplication"
            className={selectClass}
            value={slug}
            onChange={(e) => changerApplication(e.target.value)}
          >
            {apps.map((a) => {
              const n = fileDeLApplication(file, a.slug);
              const total =
                n.items.length + Object.values(n.par_langue).reduce((s, l) => s + l.length, 0);
              return (
                <option key={a.id} value={a.slug}>
                  {nomApplication(a)} ({total})
                </option>
              );
            })}
          </select>
          <p className="text-xs text-muted-foreground">{t("warmup.fileApplicationAide")}</p>
        </div>
      )}

      <p className="text-xs font-medium text-foreground">{t("warmup.fileApp", { app: nomApp })}</p>
      <p className="text-xs text-muted-foreground">{t("warmup.fileDesc", { app: nomApp })}</p>

      <div className="space-y-1 sm:max-w-sm">
        <Label htmlFor="fileQueueKey">{t("warmup.fileChoisir")}</Label>
        <select
          id="fileQueueKey"
          className={selectClass}
          value={cle}
          onChange={(e) => {
            const v = e.target.value;
            setCle(v === "general" || (LANGUES_CIBLES as readonly string[]).includes(v) ? v : "general");
          }}
        >
          <option value="general">
            {t("warmup.fileGenerale")} ({fileApp.items.length})
          </option>
          {LANGUES_CIBLES.map((code) => {
            const n = (fileApp.par_langue[code] ?? []).length;
            const nonCiblee = app !== null && app.langues !== null && !app.langues.includes(code);
            return (
              <option key={code} value={code}>
                {nomLangue(code)} ({n})
                {n > 0 ? ` — ${t("warmup.filePrioritaire")}` : ""}
                {nonCiblee ? ` — ${t("warmup.fileLangueNonCiblee")}` : ""}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-muted-foreground">
          {cle === "general"
            ? t("warmup.fileGeneraleAide")
            : t("warmup.fileLangueAide", { langue: nomLangue(cle) })}
        </p>
      </div>

      <ol className="space-y-1.5" data-testid="file-labels-items">
        {fileActive.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {cle === "general" ? t("warmup.fileVideListe") : t("warmup.fileLangueVide")}
          </li>
        )}
        {fileActive.map((item, i) => {
          const lab = (labels ?? []).find((l) => l.id === item.label_id);
          const horsSlideshow = lab ? !estLabelFileSlideshow(lab) : false;
          const horsApp = applicationId ? entreeHorsApplication(item, applicationId, liens) : false;
          return (
            <li
              key={`${slug}-${cle}-${item.label_id}-${item.ugc}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="truncate">{lab?.nom ?? item.label_id.slice(0, 8)}</span>
                {item.ugc && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    UGC
                  </Badge>
                )}
                {horsSlideshow && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t("warmup.fileIgnoreUgcVideo")}
                  </Badge>
                )}
                {horsApp && !horsSlideshow && (
                  <Badge variant="outline" className="shrink-0 border-warning text-[10px] text-warning">
                    {t("warmup.fileHorsApplication", { app: nomApp })}
                  </Badge>
                )}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={i === 0 || enCours}
                  onClick={() => {
                    const items = [...fileActive];
                    [items[i - 1], items[i]] = [items[i]!, items[i - 1]!];
                    majFile(items);
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={i >= fileActive.length - 1 || enCours}
                  onClick={() => {
                    const items = [...fileActive];
                    [items[i], items[i + 1]] = [items[i + 1]!, items[i]!];
                    majFile(items);
                  }}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={enCours}
                  onClick={() => majFile(fileActive.filter((_, j) => j !== i))}
                >
                  ×
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label htmlFor="ajoutLabel">{t("warmup.ajouterLabel")}</Label>
          <select
            id="ajoutLabel"
            className={selectClass}
            value={labelAjout}
            onChange={(e) => setLabelAjout(e.target.value)}
          >
            <option value="">{t("common.none")}</option>
            {ajoutables
              .filter((l) => !ugcAjout || ugcIds.includes(l.id))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
          </select>
        </div>
        {ugcOk && (
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ugcAjout}
              onChange={(e) => {
                const on = e.target.checked;
                setUgcAjout(on);
                if (on && labelAjout && !ugcIds.includes(labelAjout)) setLabelAjout("");
              }}
            />
            {t("warmup.ajouterUgc")}
          </label>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!labelAjout || enCours || (ugcOk && ugcAjout && !ugcIds.includes(labelAjout))}
          onClick={() => {
            majFile([...fileActive, { label_id: labelAjout, ugc: ugcOk && ugcAjout }]);
            setLabelAjout("");
            setUgcAjout(false);
          }}
        >
          {t("warmup.ajouter")}
        </Button>
      </div>
      {!ugcOk && <p className="text-xs text-muted-foreground">{t("warmup.fileJamaisUgc", { app: nomApp })}</p>}
      {ugcOk && ugcAjout && ugcIds.length === 0 && (
        <p className="text-xs text-destructive">{t("warmup.aucunLabelUgc")}</p>
      )}
      {applicationId && liens && ajoutables.length === 0 && (
        <p className="text-xs text-destructive">{t("warmup.fileAucunLabelApplication", { app: nomApp })}</p>
      )}
    </div>
  );
}
