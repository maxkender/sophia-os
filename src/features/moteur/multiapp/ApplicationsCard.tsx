import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Circle, CircleAlert, CircleCheck, Plus } from "lucide-react";

import { trierApplications } from "@/components/brand/identiteApplications";
import { EtiquetteApplication } from "@/components/brand/LogoApplication";
import { LOGOS } from "@/components/brand/logosApplications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthContext";
import { lirePrompt } from "@/features/moteur/api";
import {
  creerApplication,
  SLUG_APPLICATION_VALIDE,
  slugApplicationDepuisNom,
  lireEtatBackfillPertinence,
  lireLiens1000,
  lireTiersApplicationsDernierRun,
  listerLiensLabels,
  majApplication,
  piloterBackfillPertinence,
  sonderTiersApplication,
  type ApplicationMulti,
  type EtatBackfillPertinence,
  type RunTiersApplications,
} from "@/features/moteur/apiMultiApp";
import { nomApplication } from "@/features/moteur/applications";
import { ficheApplication } from "@/features/moteur/catalogueApplications";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { ID_SOPHIA } from "@/features/moteur/multiApp";

import {
  avancementBackfill,
  CLE_RUN_TIERS_APPLICATIONS,
  clesPromptsApplication,
  derniereRequalifApplication,
  estErreurSchemaAbsent,
  langueCiblee,
  languesApresBascule,
  promptsBrouillons,
  promptsManquants,
} from "./logique";
import { preparationApplication, prochainPoint, type EtatPoint, type PointPreparation } from "./preparation";
import { optionsRequeteApplications } from "./requetesApplications";
import { cn } from "@/lib/utils";

/**
 * Le rattrapage avance par lots côté serveur : relire son état toutes les 10 s
 * suffit à voir bouger le compteur sans marteler l'Edge. À l'arrêt, plus de
 * sondage du tout.
 */
const SONDAGE_BACKFILL_MS = 10_000;

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Pas de nouvelle tentative sur un schéma absent : la réponse ne changera pas d'ici la seconde suivante. */
function retrySaufSchema(n: number, err: unknown): boolean {
  return n < 1 && !estErreurSchemaAbsent(err);
}

function BackfillPertinence({ application }: { application: ApplicationMulti }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cle = ["backfill-pertinence", application.id] as const;
  const etat = useQuery({
    queryKey: cle,
    queryFn: () => lireEtatBackfillPertinence(application.id),
    retry: retrySaufSchema,
    refetchInterval: (q) => (q.state.data?.actif ? SONDAGE_BACKFILL_MS : false),
  });
  const piloter = useMutation({
    mutationFn: (actif: boolean) => piloterBackfillPertinence(application.id, actif),
    onSuccess: (suivant: EtatBackfillPertinence) => qc.setQueryData(cle, suivant),
  });
  const e = etat.data;
  const pct = avancementBackfill(e);

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("multiApp.applications.backfillTitre")}</p>
        <Button
          size="sm"
          variant={e?.actif ? "outline" : "default"}
          disabled={piloter.isPending || etat.isPending || etat.isError}
          onClick={() => piloter.mutate(!e?.actif)}
        >
          {e?.actif ? t("multiApp.applications.backfillPause") : t("multiApp.applications.backfillLancer")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("multiApp.applications.backfillAide", { nom: nomApplication(application) })}
      </p>
      {e && (
        <>
          {pct !== null && <Progress value={pct} />}
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {t("multiApp.applications.backfillEtat", {
              restants: e.restants,
              faits: e.faits,
              erreurs: e.erreurs,
            })}
            {e.actif ? ` · ${t("multiApp.applications.backfillEnCours")}` : ""}
          </p>
        </>
      )}
      {etat.isError && (
        <p className="text-[11px] text-destructive">
          {estErreurSchemaAbsent(etat.error)
            ? t("multiApp.schemaAbsent")
            : t("multiApp.applications.backfillErreur", { message: messageErreur(etat.error) })}
        </p>
      )}
      {piloter.isError && (
        <p className="text-[11px] text-destructive">{messageErreur(piloter.error)}</p>
      )}
    </div>
  );
}

/**
 * Dernière requalification de l'application (tier PAR APPLICATION, 0270), lue
 * dans `reglages.tierlist_applications_dernier_run`. En rouge sur une alerte
 * ou une erreur. Rien tant que le run ne la connaît pas.
 */
function DerniereRequalif({
  application,
  run,
}: {
  application: ApplicationMulti;
  run: RunTiersApplications | null | undefined;
}) {
  const { t } = useTranslation();
  const ligne = derniereRequalifApplication(run, application.slug);
  if (!ligne) return null;
  return (
    <p className={`text-[11px] ${ligne.rouge ? "text-destructive" : "text-muted-foreground"}`}>
      {t("multiApp.applications.derniereRequalif", {
        nom: nomApplication(application),
        jour: ligne.jour,
        examines: ligne.examines,
        requalifies: ligne.requalifies,
      })}
      {ligne.interrompu ? ` · ${t("minuit.tiersApplications.interrompue")}` : ""}
      {ligne.erreur ? ` · ${t("minuit.tiersApplications.erreur", { message: ligne.erreur })}` : ""}
      {ligne.alerte ? ` · ${ligne.alerte}` : ""}
    </p>
  );
}

/** Les langues ciblées en codes courts ; le nom complet au survol. */
function ResumeLangues({ application }: { application: ApplicationMulti }) {
  const { t } = useTranslation();
  if (application.id === ID_SOPHIA || application.langues === null) {
    return <Badge variant="secondary">{t("multiApp.applications.toutesLangues")}</Badge>;
  }
  if (application.langues.length === 0) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-400">{t("multiApp.applications.aucuneLangueAide")}</span>
    );
  }
  return (
    <span
      className="font-mono text-xs uppercase tracking-wide"
      title={application.langues.map((l) => nomLangue(l)).join(", ")}
    >
      {application.langues.join(" · ")}
    </span>
  );
}

const ICONE_POINT: Record<EtatPoint, { Icone: typeof Circle; classe: string }> = {
  ok: { Icone: CircleCheck, classe: "text-success" },
  a_relire: { Icone: CircleAlert, classe: "text-amber-600 dark:text-amber-400" },
  a_faire: { Icone: Circle, classe: "text-muted-foreground" },
};

/**
 * Ce qu'il faut à l'application pour publier, point par point et dans l'ordre
 * (`preparation.ts`) : le code, ses deux prompts, son lien à 1 000 abonnés,
 * ses labels, ses langues, puis l'interrupteur. Le prochain point à traiter
 * est en gras. Les prompts sont lus sous la même clé que l'éditeur de la page
 * Prompts et que l'activation : un prompt qu'on vient d'enregistrer est frais.
 */
function PreparationApplication({
  application,
  nbLabels,
  lien1000,
}: {
  application: ApplicationMulti;
  nbLabels: number;
  lien1000: string | undefined;
}) {
  const { t } = useTranslation();
  const [clePertinence, clePlacement] = clesPromptsApplication(application.slug);
  const pertinence = useQuery({ queryKey: ["prompt", clePertinence], queryFn: () => lirePrompt(clePertinence) });
  const placement = useQuery({ queryKey: ["prompt", clePlacement], queryFn: () => lirePrompt(clePlacement) });
  if (pertinence.isPending || placement.isPending) {
    return <p className="text-[11px] text-muted-foreground">{t("common.loading")}</p>;
  }
  const points = preparationApplication({
    slug: application.slug,
    actif: application.actif,
    langues: application.langues,
    logo: application.slug in LOGOS,
    prompts: { [clePertinence]: pertinence.data, [clePlacement]: placement.data },
    lien1000,
    nbLabels,
  });
  const prochain = prochainPoint(points);
  const texte = (p: PointPreparation) =>
    t(`multiApp.applications.preparation.${p.cle}.${p.cle === "langues" && p.etat === "ok" && !p.detail ? "toutes" : p.etat}`, {
      nom: nomApplication(application),
      detail: p.detail ?? "",
    });
  return (
    <div className="space-y-1.5" data-testid={`preparation-${application.slug}`}>
      <p className="text-xs font-medium">{t("multiApp.applications.preparation.titre")}</p>
      <ol className="space-y-1">
        {points.map((p) => {
          const { Icone, classe } = ICONE_POINT[p.etat];
          return (
            <li key={p.cle} className="flex items-start gap-1.5 text-[11px]" data-etat={p.etat}>
              <Icone className={cn("mt-px size-3.5 shrink-0", classe)} aria-hidden />
              <span className={cn(p.etat === "ok" && "text-muted-foreground", p === prochain && "font-semibold")}>
                {texte(p)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        {prochain ? t("multiApp.applications.preparation.ordre") : t("multiApp.applications.preparation.pret")}
      </p>
    </div>
  );
}

/** Mêmes classes que le tableau de la page Allocation. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2.5 pr-4 align-top last:pr-0";

function LigneApplication({
  application,
  run,
  nbLabels,
  lien1000,
}: {
  application: ApplicationMulti;
  run?: RunTiersApplications | null;
  /** Nombre de labels qui la servent ; `undefined` tant que les liens ne sont pas lus. */
  nbLabels?: number;
  lien1000?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const sophia = application.id === ID_SOPHIA;
  const [blocage, setBlocage] = React.useState<string | null>(null);
  const [ouvert, setOuvert] = React.useState(false);

  const rafraichir = () => qc.invalidateQueries({ queryKey: ["applications"] });

  const maj = useMutation({
    mutationFn: (patch: { langues?: string[] | null; actif?: boolean }) =>
      majApplication(application.id, patch),
    onSuccess: rafraichir,
  });

  // Avant d'activer : les deux prompts de l'application doivent exister et ne
  // pas être vides. Le moteur ne retombe jamais sur le texte Sophia, donc une
  // activation sans eux ferait échouer chaque notation et chaque deck.
  // Même clé que l'éditeur de la page Prompts : un prompt qu'on vient d'y
  // enregistrer est relu frais.
  const activer = useMutation({
    mutationFn: async () => {
      // Tiers par application (0270) d'abord : sans elle, le moteur ne sert
      // aucune autre application que Sophia. Une panne de la sonde lève (pas
      // d'activation sur une lecture ratée).
      if ((await sonderTiersApplication()) === "absent") {
        setBlocage(t("multiApp.applications.migration0270", { nom: nomApplication(application) }));
        return;
      }
      const cles = clesPromptsApplication(application.slug);
      const textes = await Promise.all(
        cles.map((cle) => qc.fetchQuery({ queryKey: ["prompt", cle], queryFn: () => lirePrompt(cle), staleTime: 0 })),
      );
      const manquants = promptsManquants(
        application.slug,
        Object.fromEntries(cles.map((cle, i) => [cle, textes[i]])),
      );
      if (manquants.length > 0) {
        setBlocage(
          t("multiApp.applications.promptsManquants", {
            nom: nomApplication(application),
            cles: manquants.join(", "),
          }),
        );
        return;
      }
      // Un prompt écrit d'avance, pas encore relu : pas de publication sur un pitch supposé.
      const brouillons = promptsBrouillons(
        application.slug,
        Object.fromEntries(cles.map((cle, i) => [cle, textes[i]])),
      );
      if (brouillons.length > 0) {
        setBlocage(
          t("multiApp.applications.promptsBrouillons", {
            nom: nomApplication(application),
            cles: brouillons.join(", "),
          }),
        );
        return;
      }
      setBlocage(null);
      await majApplication(application.id, { actif: true });
      await rafraichir();
    },
  });

  const basculerActif = (actif: boolean) => {
    if (sophia) return;
    if (actif) activer.mutate();
    else {
      setBlocage(null);
      maj.mutate({ actif: false });
    }
  };

  const enCours = maj.isPending || activer.isPending;
  const erreur = maj.error ?? activer.error;
  const Chevron = ouvert ? ChevronDown : ChevronRight;
  const concept = ficheApplication(application.slug)?.concept;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/40",
          !sophia && "cursor-pointer hover:bg-muted/50",
          ouvert && "bg-muted/40",
        )}
        onClick={sophia ? undefined : () => setOuvert(!ouvert)}
      >
        <td className={TD}>
          <span className="flex items-center gap-1.5">
            {sophia ? (
              <span className="inline-block size-3.5" aria-hidden />
            ) : (
              <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <EtiquetteApplication slug={application.slug} className="font-medium" />
          </span>
          {concept && <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{concept}</p>}
          {sophia && (
            <p className="mt-0.5 max-w-xs pl-5 text-[11px] text-muted-foreground">
              {t("multiApp.applications.sophiaVerrouillee")}
            </p>
          )}
        </td>
        <td className={cn(TD, "tabular-nums")}>
          {nbLabels === undefined ? null : nbLabels > 0 ? (
            nbLabels
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-400">{t("multiApp.applications.aucunLabel")}</span>
          )}
        </td>
        <td className={TD}>
          <ResumeLangues application={application} />
          {!sophia && <DerniereRequalif application={application} run={run} />}
        </td>
        <td className={cn(TD, "text-right")} onClick={(e) => e.stopPropagation()}>
          <label className="inline-flex items-center gap-2 text-xs">
            <Switch
              checked={application.actif}
              disabled={sophia || enCours}
              onCheckedChange={(v) => basculerActif(v === true)}
              aria-label={t("multiApp.applications.actif")}
            />
            {application.actif ? t("multiApp.applications.actif") : t("multiApp.applications.inactif")}
          </label>
          {blocage && <p className="ml-auto mt-1 max-w-64 text-left text-xs text-destructive">{blocage}</p>}
          {erreur && (
            <p className="ml-auto mt-1 max-w-64 text-left text-xs text-destructive">
              {estErreurSchemaAbsent(erreur) ? t("multiApp.schemaAbsent") : messageErreur(erreur)}
            </p>
          )}
        </td>
      </tr>
      {ouvert && !sophia && (
        <tr>
          <td colSpan={4} className="pb-3">
            <div className="space-y-3 rounded-md bg-muted/30 p-3">
              <PreparationApplication application={application} nbLabels={nbLabels ?? 0} lien1000={lien1000} />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium">{t("multiApp.applications.langues")}</p>
                <button
                  type="button"
                  className="text-[11px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={enCours || application.langues === null}
                  onClick={() => maj.mutate({ langues: null })}
                >
                  {t("multiApp.applications.toutes")}
                </button>
                <button
                  type="button"
                  className="text-[11px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={enCours || (application.langues?.length ?? -1) === 0}
                  onClick={() => maj.mutate({ langues: [] })}
                >
                  {t("multiApp.applications.aucune")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 lg:grid-cols-6">
                {LANGUES_CIBLES.map((l) => (
                  <label key={l} className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={langueCiblee(application.langues, l)}
                      disabled={enCours}
                      onChange={() =>
                        maj.mutate({ langues: languesApresBascule(application.langues, l, LANGUES_CIBLES) })
                      }
                    />
                    {nomLangue(l)}
                  </label>
                ))}
              </div>
              <BackfillPertinence application={application} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Le formulaire « Ajouter une application » : un nom, un identifiant, et elle naît inactive. */
function FormulaireApplication({ onFini }: { onFini: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nom, setNom] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouche, setSlugTouche] = React.useState(false);
  const slugEffectif = slugTouche ? slug : slugApplicationDepuisNom(nom);
  const valide = nom.trim().length > 0 && SLUG_APPLICATION_VALIDE.test(slugEffectif);
  const creer = useMutation({
    mutationFn: () => creerApplication({ nom, slug: slugEffectif }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      onFini();
    },
  });
  return (
    <form
      className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3"
      data-testid="form-application"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) creer.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="appNom">{t("multiApp.applications.ajout.nom")}</Label>
          <Input id="appNom" value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="appSlug">{t("multiApp.applications.ajout.slug")}</Label>
          <Input
            id="appSlug"
            className="font-mono"
            value={slugEffectif}
            onChange={(e) => {
              setSlugTouche(true);
              setSlug(e.target.value);
            }}
            required
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!valide || creer.isPending}>
            {creer.isPending ? t("common.saving") : t("multiApp.applications.ajout.creer")}
          </Button>
          <Button type="button" variant="ghost" onClick={onFini}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("multiApp.applications.ajout.aide")}</p>
      {creer.isError && <p className="text-xs text-destructive">{messageErreur(creer.error)}</p>}
    </form>
  );
}

/**
 * Pilotage → Applications : une ligne par application (ajoutées par le bouton
 * « Ajouter une application » depuis le 17/11 ; avant, par migration). Interrupteur, langues ciblées et, hors Sophia, le
 * rattrapage de pertinence du stock existant — à lancer AVANT l'activation,
 * sinon le pool de l'application est vide le premier soir.
 */
export function ApplicationsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const apps = useQuery(optionsRequeteApplications(user?.id ?? null));
  // Trace de la tierlist par application (0270) : illisible → rien d'affiché.
  const run = useQuery({
    queryKey: CLE_RUN_TIERS_APPLICATIONS,
    queryFn: lireTiersApplicationsDernierRun,
    enabled: Boolean(user?.id),
    retry: false,
  });

  // Labels par application et liens à 1 000 abonnés : pour la colonne « Labels »
  // et l'état de préparation. Illisibles → la carte reste utilisable sans eux.
  const liens = useQuery({ queryKey: ["label-applications"], queryFn: listerLiensLabels, retry: retrySaufSchema });
  const liens1000 = useQuery({ queryKey: ["liens-1000"], queryFn: lireLiens1000, enabled: Boolean(user?.id), retry: false });
  const nbLabels = (applicationId: string) =>
    liens.data ? new Set(liens.data.filter((l) => l.application_id === applicationId).map((l) => l.label_id)).size : undefined;

  const [ajout, setAjout] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t("multiApp.applications.titre")}</CardTitle>
            <CardDescription>{t("multiApp.applications.descCourte")}</CardDescription>
          </div>
          {!ajout && (
            <Button size="sm" variant="outline" onClick={() => setAjout(true)}>
              <Plus />
              {t("multiApp.applications.ajout.bouton")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ajout && <FormulaireApplication onFini={() => setAjout(false)} />}
        {apps.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {apps.isError && <p className="text-sm text-destructive">{messageErreur(apps.error)}</p>}
        {apps.data && (
          <div className="relative overflow-x-auto">
            {/* relative : les textes sr-only (en position absolue) restent dans la zone qui défile. */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className={TH}>{t("multiApp.applications.colApp")}</th>
                  <th scope="col" className={TH}>{t("multiApp.applications.colLabels")}</th>
                  <th scope="col" className={TH}>{t("multiApp.applications.langues")}</th>
                  <th scope="col" className={cn(TH, "text-right")}>{t("multiApp.applications.colEtat")}</th>
                </tr>
              </thead>
              <tbody>
                {/* L'ordre du catalogue, le même que les groupes de la carte Labels. */}
                {trierApplications(apps.data, (a) => a.slug).map((a) => (
                  <LigneApplication
                    key={a.id}
                    application={a}
                    run={run.data}
                    nbLabels={nbLabels(a.id)}
                    lien1000={liens1000.data?.[a.slug]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("multiApp.applications.etapes")}</p>
      </CardContent>
    </Card>
  );
}
