import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nomApplication } from "../applications";
import { estLabelFileSlideshow } from "../fileLabelsSlideshow";
import { LANGUES_CIBLES, nomLangue } from "../langues";
import { ID_SOPHIA, SLUG_SOPHIA } from "../multiApp";
import type { FileLabelCompteItem, Label as LabelOs, ReglagesFileLabels } from "../types";
import {
  AJOUT_MAX_FILE,
  applicationsDeLaFile,
  avecEntreesAjoutees,
  avecGroupeDeplace,
  avecItemsApplication,
  entreeHorsApplication,
  fileDeLApplication,
  groupesDeLaFile,
  itemsDeLaFile,
  labelsAjoutables,
  nombreAjout,
  sansEntreesDuGroupe,
  ugcPossible,
  type CleFile,
} from "./fileApplication";
import { useApplicationsMulti, useLiensLabels } from "./useMultiApp";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm";

/**
 * File des créateurs, PAR APPLICATION (page Allocation). Un sélecteur
 * d'application (actives et en préparation, Sophia par défaut) choisit la
 * tranche éditée (`par_application[slug]`, items + par_langue). Les labels
 * proposés à l'ajout sont ceux qui servent l'application (cochée dans
 * `label_applications`) ; une entrée dont le label ne la sert plus est
 * signalée, pas masquée. La case « Compte UGC » n'existe que pour Sophia.
 *
 * UNE ENTRÉE = UN COMPTE, tirée dans l'ordre. Pour décider le label des
 * cinquante prochains comptes, on ajoute cinquante entrées d'un coup (« Nombre
 * de comptes ») ; la liste les montre par groupes (« ×50 »), mais la File
 * reste une liste à plat en base.
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
  slugsEnPreparation,
  partsCible,
}: {
  file: ReglagesFileLabels;
  onChange: (file: ReglagesFileLabels, changement: ChangementFileLabels) => void;
  /** Sauvegarde en cours : boutons désactivés. */
  enCours: boolean;
  labels: readonly LabelOs[] | undefined;
  labelsUgc: readonly string[] | undefined;
  /**
   * Slugs des applications EN PRÉPARATION (inactives, déjà dotées d'un label) :
   * elles reçoivent des recrues, leur File s'édite donc aussi. Absent : les
   * applications actives seules.
   */
  slugsEnPreparation?: readonly string[];
  /**
   * La cible posée dans « Répartition entre applis », en pourcentage par slug.
   * Sert à prévenir quand la File éditée ne sera pas lue. `null` ou absent :
   * cible inconnue ou non posée, rien n'est dit.
   */
  partsCible?: Readonly<Record<string, number>> | null;
}) {
  const { t } = useTranslation();
  const applications = useApplicationsMulti();
  const liensQ = useLiensLabels();
  // Lecture en cours, en panne ou table absente (avant 0256) : `null`, rien
  // n'est signalé.
  const liens = liensQ.data ?? null;

  const [slug, setSlug] = React.useState<string>(SLUG_SOPHIA);
  // Liens illisibles : la File Sophia propose tous les labels slideshow, comme
  // avant (manage-users saute une entrée qui ne sert pas Sophia) ; une autre
  // application ne propose rien tant qu'on ne sait pas ce qui la sert.
  const liensAjout = liens ?? (slug === SLUG_SOPHIA ? "tous" : null);
  const [cle, setCle] = React.useState<CleFile>("general");
  const [labelAjout, setLabelAjout] = React.useState("");
  const [ugcAjout, setUgcAjout] = React.useState(false);
  const [nombre, setNombre] = React.useState("1");

  const apps = applicationsDeLaFile(applications.data ?? [], slugsEnPreparation);
  const app = (applications.data ?? []).find((a) => a.slug === slug) ?? null;
  // Sophia est connue sans lecture : son édition ne dépend pas du catalogue.
  const applicationId = slug === SLUG_SOPHIA ? ID_SOPHIA : (app?.id ?? null);
  const nomApp = app ? nomApplication(app) : nomApplication({ slug });
  const ugcOk = ugcPossible(slug);

  const fileApp = fileDeLApplication(file, slug);
  const fileActive = itemsDeLaFile(fileApp, cle);
  const groupes = groupesDeLaFile(fileActive);
  // Le moteur ne donne un compte qu'à une application qui a une part dans la
  // cible (`classerApplications` écarte une part nulle) : à 0 %, sa File n'est
  // jamais lue. Sophia est à part : interrupteur éteint, tout compte part chez
  // elle et sa File sert, on ne dit donc rien pour elle.
  const sansPart =
    !!partsCible && slug !== SLUG_SOPHIA && !((partsCible[slug] ?? 0) > 0);
  const ajoutables = applicationId ? labelsAjoutables(applicationId, labels ?? [], liensAjout) : [];
  const ugcIds = labelsUgc ?? [];

  const majFile = (items: FileLabelCompteItem[]) =>
    onChange(avecItemsApplication(file, slug, cle, items), { slug, cle, items });

  const changerApplication = React.useCallback((s: string) => {
    setSlug(s);
    setLabelAjout("");
    setUgcAjout(false);
    setNombre("1");
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
                  {nomApplication(a)} ({total}){a.actif ? "" : ` — ${t("warmup.fileAppInactive")}`}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-muted-foreground">{t("warmup.fileApplicationAide")}</p>
        </div>
      )}

      <p className="text-xs font-medium text-foreground">{t("warmup.fileApp", { app: nomApp })}</p>
      <p className="text-xs text-muted-foreground">{t("warmup.fileDesc", { app: nomApp })}</p>
      {sansPart && (
        <p className="rounded-md border border-warning/50 bg-warning/5 px-2.5 py-2 text-xs text-foreground" data-testid="file-sans-part">
          {t("warmup.fileSansPart", { app: nomApp })}
        </p>
      )}

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

      {fileActive.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="file-total">
          {t("warmup.fileTotal", { count: fileActive.length })}
        </p>
      )}
      <ol className="space-y-1.5" data-testid="file-labels-items">
        {fileActive.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {cle === "general" ? t("warmup.fileVideListe") : t("warmup.fileLangueVide")}
          </li>
        )}
        {groupes.map((g, gi) => {
          const item = g.item;
          const lab = (labels ?? []).find((l) => l.id === item.label_id);
          const nomLabel = lab?.nom ?? item.label_id.slice(0, 8);
          const horsSlideshow = lab ? !estLabelFileSlideshow(lab) : false;
          const horsApp = applicationId ? entreeHorsApplication(item, applicationId, liens) : false;
          return (
            <li
              key={`${slug}-${cle}-${item.label_id}-${item.ugc}-${g.debut}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <span className="tabular-nums text-muted-foreground">
                  {g.n > 1 ? `${g.debut + 1}–${g.debut + g.n}.` : `${g.debut + 1}.`}
                </span>
                <span className="truncate">{nomLabel}</span>
                {g.n > 1 && (
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {t("warmup.fileGroupe", { count: g.n })}
                  </Badge>
                )}
                {item.ugc && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    UGC
                  </Badge>
                )}
                {horsSlideshow && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t("warmup.fileIgnoreManuel")}
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
                  aria-label={t("warmup.fileMonter", { label: nomLabel })}
                  disabled={gi === 0 || enCours}
                  onClick={() => majFile(avecGroupeDeplace(fileActive, gi, -1))}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("warmup.fileDescendre", { label: nomLabel })}
                  disabled={gi >= groupes.length - 1 || enCours}
                  onClick={() => majFile(avecGroupeDeplace(fileActive, gi, 1))}
                >
                  ↓
                </Button>
                {g.n > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("warmup.fileRetirerUn", { label: nomLabel })}
                    disabled={enCours}
                    onClick={() => majFile(sansEntreesDuGroupe(fileActive, gi, 1))}
                  >
                    −1
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={t("warmup.fileRetirerGroupe", { label: nomLabel, count: g.n })}
                  disabled={enCours}
                  onClick={() => majFile(sansEntreesDuGroupe(fileActive, gi))}
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
        <div className="w-40 space-y-1">
          <Label htmlFor="ajoutNombre" className="whitespace-nowrap">{t("warmup.ajouterNombre")}</Label>
          <Input
            id="ajoutNombre"
            type="number"
            min={1}
            max={AJOUT_MAX_FILE}
            step={1}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-9 tabular-nums"
          />
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
            majFile(
              avecEntreesAjoutees(fileActive, { label_id: labelAjout, ugc: ugcOk && ugcAjout }, nombreAjout(nombre)),
            );
            setLabelAjout("");
            setUgcAjout(false);
            setNombre("1");
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
