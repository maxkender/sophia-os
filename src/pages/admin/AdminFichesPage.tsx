import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  AppWindow,
  BookOpen,
  Calculator,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Languages,
  Library,
  Loader2,
  Megaphone,
  PenLine,
  Save,
  Search,
  Sparkles,
  Tag,
  Tags,
  type LucideIcon,
} from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownLeger } from "@/features/fiches/MarkdownLeger";
import { listerLabels } from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import {
  calculerFichesLabel,
  CLE_FICHE_CTA,
  compterVersionsFiches,
  enregistrerFicheAppli,
  enregistrerFicheCta,
  enregistrerFicheLangue,
  lireFicheCta,
  listerExemplesNatifs,
  listerFichesAppli,
  listerFichesLabel,
  listerFichesLangue,
} from "@/features/relectureNative/api";
import type { Ton } from "@/features/relectureNative/apparence";
import { modeleFicheAppli, modeleFicheCta, modeleFicheLangue } from "@/features/relectureNative/logique";
import { messageErreur } from "@/features/relectureNative/messageErreur";
import { MiniBarre, Puce, TuileIcone } from "@/features/relectureNative/Puces";
import { SectionCta } from "@/features/relectureNative/SectionCta";
import { CLE_REQUETE_EXEMPLES } from "@/features/relectureNative/SectionExemplesNatifs";
import { cn } from "@/lib/utils";

type Sorte = "appli" | "langue" | "label" | "cta";

const SORTES: ReadonlyArray<{ cle: Sorte; icone: LucideIcon; ton: Ton }> = [
  { cle: "appli", icone: AppWindow, ton: "violet" },
  { cle: "langue", icone: Languages, ton: "bleu" },
  { cle: "label", icone: Tags, ton: "vert" },
  { cle: "cta", icone: Megaphone, ton: "orange" },
];

/** Date et heure, sans les secondes. */
const HORODATAGE: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

const CLES = {
  appli: ["fiches-appli"],
  versionsAppli: ["fiches-appli-versions"],
  langue: ["fiches-langue"],
  label: ["fiches-label"],
  cta: ["fiche-cta"],
} as const;

/** Une ligne de la liste de gauche : ce qu'il faut pour la montrer et l'ouvrir. */
interface Entree {
  cle: string;
  nom: string;
  visuel: React.ReactNode;
  ecrite: boolean;
  detail: string;
}

/**
 * Les fiches que lit la réécriture native, au même endroit : la fiche de
 * l'appli (quoi dire), de la langue (comment le dire), du label (quel CTA
 * tirer) et la fiche CTA (comment écrire le CTA, commune à tous, 0623). Les
 * fiches appli, langue et CTA s'écrivent ici ; les fiches label sont calculées
 * chaque lundi (docs/cta.md).
 */
export function AdminFichesPage() {
  const { t, i18n } = useTranslation();
  const { applications } = useApplication();
  const [params, setParams] = useSearchParams();
  const sorte: Sorte = (["appli", "langue", "label", "cta"] as const).find((s) => s === params.get("sorte")) ?? "appli";
  const [recherche, setRecherche] = React.useState("");

  const fichesAppli = useQuery({ queryKey: CLES.appli, queryFn: listerFichesAppli });
  const versionsAppli = useQuery({ queryKey: CLES.versionsAppli, queryFn: compterVersionsFiches });
  const fichesLangue = useQuery({ queryKey: CLES.langue, queryFn: listerFichesLangue });
  const fichesLabel = useQuery({ queryKey: CLES.label, queryFn: listerFichesLabel });
  const ficheCta = useQuery({ queryKey: CLES.cta, queryFn: lireFicheCta });
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels() });
  const exemples = useQuery({ queryKey: CLE_REQUETE_EXEMPLES, queryFn: listerExemplesNatifs });

  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit" });
  const exemplesPrets = new Map<string, number>();
  for (const e of exemples.data ?? []) {
    if (e.statut === "pret") exemplesPrets.set(e.langue, (exemplesPrets.get(e.langue) ?? 0) + 1);
  }

  const entrees: Record<Sorte, Entree[]> = {
    appli: applications.map((a) => {
      const f = fichesAppli.data?.find((x) => x.application_id === a.id);
      return {
        cle: a.id,
        nom: nomApplication(a),
        visuel: <LogoApplication slug={a.slug} taille="sm" decoratif />,
        ecrite: Boolean(f?.contenu.trim()),
        detail: f?.contenu.trim() ? t("fiches.versions", { count: versionsAppli.data?.[a.id] ?? 0 }) : t("fiches.jamais"),
      };
    }),
    langue: LANGUES_CIBLES.map((code) => {
      const f = fichesLangue.data?.find((x) => x.cle === code);
      return {
        cle: code,
        nom: nomLangue(code),
        visuel: (
          <span className="text-lg leading-none" aria-hidden>
            {drapeauLangue(code)}
          </span>
        ),
        ecrite: Boolean(f?.contenu.trim()),
        detail: t("fiches.exemples", { count: exemplesPrets.get(code) ?? 0 }),
      };
    }),
    label: (labels.data ?? []).map((l) => {
      const f = fichesLabel.data?.find((x) => x.cle === l.nom);
      return {
        cle: l.nom,
        nom: l.nom,
        visuel: <Tag className="size-4 text-muted-foreground" aria-hidden />,
        ecrite: Boolean(f),
        detail: f ? t("fiches.metaCourte", { version: f.version, date: date(f.created_at) }) : t("fiches.pasCalculee"),
      };
    }),
    cta: [
      {
        cle: CLE_FICHE_CTA,
        nom: t("fiches.nomCta"),
        visuel: <Megaphone className="size-4 text-muted-foreground" aria-hidden />,
        ecrite: Boolean(ficheCta.data?.contenu.trim()),
        detail: ficheCta.data
          ? t("fiches.metaCourte", { version: ficheCta.data.version, date: date(ficheCta.data.created_at) })
          : t("fiches.jamais"),
      },
    ],
  };

  const liste = entrees[sorte];
  const filtree = recherche.trim()
    ? liste.filter((e) => `${e.nom} ${e.cle}`.toLowerCase().includes(recherche.trim().toLowerCase()))
    : liste;
  const choisie = liste.find((e) => e.cle === params.get("cle")) ?? liste[0] ?? null;

  const choisir = (s: Sorte, cle?: string) => {
    setRecherche("");
    setParams(cle ? { sorte: s, cle } : { sorte: s }, { replace: true });
  };

  const erreur = fichesAppli.error ?? fichesLangue.error ?? fichesLabel.error ?? ficheCta.error ?? labels.error;
  const chargement =
    fichesAppli.isPending || fichesLangue.isPending || fichesLabel.isPending || ficheCta.isPending || labels.isPending;

  return (
    <div className="space-y-6" data-testid="page-fiches">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Library className="size-6 text-muted-foreground" aria-hidden />
            {t("fiches.titre")}
          </span>
        }
        description={t("fiches.description")}
        actions={
          <Button size="sm" variant="outline" render={<Link to="/admin/relecture-native" />}>
            <Languages />
            {t("fiches.versRelecture")}
          </Button>
        }
      />

      <div role="group" aria-label={t("fiches.sortes")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SORTES.map(({ cle, icone, ton }) => {
          const total = entrees[cle].length;
          const faites = entrees[cle].filter((e) => e.ecrite).length;
          return (
            <button
              key={cle}
              type="button"
              aria-pressed={sorte === cle}
              onClick={() => choisir(cle)}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border bg-card p-4 text-left shadow-xs/5 transition",
                "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sorte === cle && "border-primary/60 ring-2 ring-primary/15",
              )}
            >
              <span className="flex items-start gap-3">
                <TuileIcone icone={icone} ton={ton} />
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-semibold">{t(`fiches.sorte.${cle}.titre`)}</span>
                  <span className="block text-xs text-muted-foreground">{t(`fiches.sorte.${cle}.role`)}</span>
                </span>
              </span>
              <span className="mt-auto space-y-2">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-semibold tabular-nums">
                    {chargement ? "–" : faites}
                    <span className="text-sm font-normal text-muted-foreground"> / {chargement ? "–" : total}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{t(`fiches.sorte.${cle}.compte`)}</span>
                </span>
                <MiniBarre valeur={faites} total={total} ton={ton} />
              </span>
            </button>
          );
        })}
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="overflow-hidden lg:sticky lg:top-4">
          {liste.length > 8 && (
            <div className="border-b p-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <span className="sr-only">{t(`fiches.chercher.${sorte}`)}</span>
                <Input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder={t(`fiches.chercher.${sorte}`)}
                  className="pl-8"
                />
              </label>
            </div>
          )}
          <ul className="max-h-[65vh] space-y-0.5 overflow-y-auto p-1.5" aria-label={t(`fiches.sorte.${sorte}.titre`)}>
            {filtree.map((e) => (
              <li key={e.cle}>
                <button
                  type="button"
                  aria-current={choisie?.cle === e.cle ? "true" : undefined}
                  onClick={() => choisir(sorte, e.cle)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    choisie?.cle === e.cle ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center">{e.visuel}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.nom}</span>
                    <span className="block truncate text-xs text-muted-foreground">{e.detail}</span>
                  </span>
                  {e.ecrite ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label={t("fiches.ecrite")} />
                  ) : (
                    <span className="size-2 shrink-0 rounded-full bg-warning" aria-label={t("fiches.aEcrire")} />
                  )}
                </button>
              </li>
            ))}
            {filtree.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("fiches.aucunResultat")}</li>}
          </ul>
        </Card>

        {chargement ? (
          <Card className="p-6 text-sm text-muted-foreground">{t("common.loading")}</Card>
        ) : !choisie ? (
          <Card className="p-6 text-sm text-muted-foreground">{t("fiches.rien")}</Card>
        ) : sorte === "appli" ? (
          <FicheAppli
            key={choisie.cle}
            applicationId={choisie.cle}
            nom={choisie.nom}
            slug={applications.find((a) => a.id === choisie.cle)?.slug ?? ""}
            fiche={fichesAppli.data?.find((f) => f.application_id === choisie.cle) ?? null}
            versions={versionsAppli.data?.[choisie.cle] ?? 0}
          />
        ) : sorte === "langue" ? (
          <FicheLangue
            key={choisie.cle}
            langue={choisie.cle}
            fiche={fichesLangue.data?.find((f) => f.cle === choisie.cle) ?? null}
            exemples={exemplesPrets.get(choisie.cle) ?? 0}
          />
        ) : sorte === "label" ? (
          <FicheLabel key={choisie.cle} nom={choisie.cle} fiche={fichesLabel.data?.find((f) => f.cle === choisie.cle) ?? null} />
        ) : (
          <div className="space-y-4">
            <FicheCta fiche={ficheCta.data ?? null} />
            <SectionCta />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La fiche ouverte
// ---------------------------------------------------------------------------

/** L'en-tête et le cadre d'une fiche : visuel, titre, version, état, actions. */
function CadreFiche({
  visuel,
  titre,
  meta,
  ecrite,
  badges,
  actions,
  children,
  testId,
}: {
  visuel: React.ReactNode;
  titre: string;
  meta: string;
  ecrite: boolean;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-5 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background">{visuel}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-base font-semibold">{titre}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            {meta}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badges}
          {ecrite ? (
            <Puce icone={CheckCircle2} ton="vert">
              {t("fiches.ecrite")}
            </Puce>
          ) : (
            <Puce icone={PenLine} ton="ambre">
              {t("fiches.aEcrire")}
            </Puce>
          )}
          {actions}
        </div>
      </div>
      <div className="px-5 py-5 sm:px-8 sm:py-6">{children}</div>
    </Card>
  );
}

type Mode = "lire" | "modifier";

function ChoixMode({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <Segments<Mode>
      libelle={t("fiches.mode")}
      actif={mode}
      onChange={onChange}
      options={[
        {
          cle: "lire",
          contenu: (
            <>
              <Eye className="size-3.5" aria-hidden />
              {t("fiches.lire")}
            </>
          ),
        },
        {
          cle: "modifier",
          contenu: (
            <>
              <PenLine className="size-3.5" aria-hidden />
              {t("fiches.modifier")}
            </>
          ),
        },
      ]}
    />
  );
}

/** Une fiche vide : ce qui manque, et le bouton pour l'écrire. */
function FicheVide({ texte, onEcrire, action }: { texte: string; onEcrire?: () => void; action?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FileText className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{texte}</p>
      {onEcrire && (
        <Button onClick={onEcrire}>
          <Sparkles />
          {t("fiches.ecrire")}
        </Button>
      )}
      {action}
    </div>
  );
}

/** Le bas d'un éditeur : enregistrer, et l'état de l'enregistrement. */
function BarreEnregistrement({
  modifie,
  enCours,
  fait,
  erreur,
  onEnregistrer,
}: {
  modifie: boolean;
  enCours: boolean;
  fait: boolean;
  erreur: unknown;
  onEnregistrer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <Button disabled={!modifie || enCours} onClick={onEnregistrer}>
        {enCours ? <Loader2 className="animate-spin" /> : <Save />}
        {t("fiches.enregistrer")}
      </Button>
      {modifie && <span className="text-xs text-muted-foreground">{t("fiches.nonEnregistre")}</span>}
      {fait && !modifie && <span className="text-xs text-success-foreground">{t("fiches.enregistre")}</span>}
      {Boolean(erreur) && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
    </div>
  );
}

function FicheAppli({
  applicationId,
  nom,
  slug,
  fiche,
  versions,
}: {
  applicationId: string;
  nom: string;
  slug: string;
  fiche: { contenu: string; presentation_relecteur: string; updated_at: string | null } | null;
  versions: number;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [contenu, setContenu] = React.useState(fiche?.contenu ?? "");
  const [presentation, setPresentation] = React.useState(fiche?.presentation_relecteur ?? "");
  const ecrite = Boolean(fiche?.contenu.trim());
  const [mode, setMode] = React.useState<Mode>(ecrite ? "lire" : "modifier");
  const [ouverte, setOuverte] = React.useState(ecrite);

  React.useEffect(() => {
    setContenu(fiche?.contenu ?? "");
    setPresentation(fiche?.presentation_relecteur ?? "");
  }, [fiche?.contenu, fiche?.presentation_relecteur]);

  const modifie = contenu !== (fiche?.contenu ?? "") || presentation !== (fiche?.presentation_relecteur ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerFicheAppli(applicationId, contenu, presentation),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLES.appli });
      void queryClient.invalidateQueries({ queryKey: CLES.versionsAppli });
    },
  });

  return (
    <CadreFiche
      testId={`fiche-appli-${applicationId}`}
      visuel={<LogoApplication slug={slug} taille="lg" decoratif className="size-8" />}
      titre={t("fiches.titreAppli", { nom })}
      meta={
        fiche?.updated_at
          ? t("fiches.metaAppli", { date: new Date(fiche.updated_at).toLocaleString(i18n.language, HORODATAGE), count: versions })
          : t("fiches.jamais")
      }
      ecrite={ecrite}
      actions={ouverte ? <ChoixMode mode={mode} onChange={setMode} /> : undefined}
    >
      {!ouverte ? (
        <FicheVide
          texte={t("fiches.videAppli", { nom })}
          onEcrire={() => {
            setContenu(modeleFicheAppli(nom));
            setOuverte(true);
            setMode("modifier");
          }}
        />
      ) : mode === "lire" ? (
        <div className="space-y-6">
          <MarkdownLeger texte={contenu} sansTitre />
          {presentation.trim() && (
            <section className="space-y-2 rounded-xl border bg-muted/30 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen className="size-3.5" aria-hidden />
                {t("fiches.presentation")}
              </p>
              <p className="text-sm whitespace-pre-wrap">{presentation}</p>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("fiches.contenu")}</span>
            <span className="block text-xs text-muted-foreground">{t("fiches.contenuAideAppli")}</span>
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={22}
              className="font-mono text-xs"
              aria-label={t("fiches.contenu")}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("fiches.presentation")}</span>
            <span className="block text-xs text-muted-foreground">{t("fiches.presentationAide", { nom })}</span>
            <Textarea
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
              rows={4}
              aria-label={t("fiches.presentation")}
            />
          </label>
          <BarreEnregistrement
            modifie={modifie}
            enCours={enregistrer.isPending}
            fait={enregistrer.isSuccess}
            erreur={enregistrer.error}
            onEnregistrer={() => enregistrer.mutate()}
          />
        </div>
      )}
    </CadreFiche>
  );
}

function FicheLangue({
  langue,
  fiche,
  exemples,
}: {
  langue: string;
  fiche: { contenu: string; version: number; created_at: string; versions: number } | null;
  exemples: number;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const nom = nomLangue(langue);
  const [contenu, setContenu] = React.useState(fiche?.contenu ?? "");
  const ecrite = Boolean(fiche?.contenu.trim());
  const [mode, setMode] = React.useState<Mode>(ecrite ? "lire" : "modifier");
  const [ouverte, setOuverte] = React.useState(ecrite);

  React.useEffect(() => setContenu(fiche?.contenu ?? ""), [fiche?.contenu]);

  const modifie = contenu !== (fiche?.contenu ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerFicheLangue(langue, contenu),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLES.langue }),
  });

  return (
    <CadreFiche
      testId={`fiche-langue-${langue}`}
      visuel={
        <span className="text-2xl leading-none" aria-hidden>
          {drapeauLangue(langue)}
        </span>
      }
      titre={t("fiches.titreLangue", { nom })}
      meta={
        fiche
          ? t("fiches.metaVersion", {
              version: fiche.version,
              date: new Date(fiche.created_at).toLocaleString(i18n.language, HORODATAGE),
              count: fiche.versions,
            })
          : t("fiches.jamais")
      }
      ecrite={ecrite}
      badges={
        <Puce icone={BookOpen} ton={exemples > 0 ? "violet" : "neutre"}>
          {t("fiches.exemples", { count: exemples })}
        </Puce>
      }
      actions={ouverte ? <ChoixMode mode={mode} onChange={setMode} /> : undefined}
    >
      {!ouverte ? (
        <FicheVide
          texte={t("fiches.videLangue", { nom })}
          onEcrire={() => {
            setContenu(modeleFicheLangue(i18n.getFixedT("en")(`langues.${langue}`), langue));
            setOuverte(true);
            setMode("modifier");
          }}
        />
      ) : mode === "lire" ? (
        <MarkdownLeger texte={contenu} sansTitre />
      ) : (
        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("fiches.contenu")}</span>
            <span className="block text-xs text-muted-foreground">{t("fiches.contenuAideLangue")}</span>
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={26}
              className="font-mono text-xs"
              aria-label={t("fiches.contenu")}
            />
          </label>
          <BarreEnregistrement
            modifie={modifie}
            enCours={enregistrer.isPending}
            fait={enregistrer.isSuccess}
            erreur={enregistrer.error}
            onEnregistrer={() => enregistrer.mutate()}
          />
        </div>
      )}
    </CadreFiche>
  );
}

function FicheLabel({
  nom,
  fiche,
}: {
  nom: string;
  fiche: { contenu: string; version: number; created_at: string; versions: number } | null;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const calculer = useMutation({
    mutationFn: calculerFichesLabel,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLES.label }),
  });
  const bouton = (
    <Button variant="outline" size="sm" disabled={calculer.isPending} onClick={() => calculer.mutate()}>
      {calculer.isPending ? <Loader2 className="animate-spin" /> : <Calculator />}
      {t("fiches.calculer")}
    </Button>
  );

  return (
    <CadreFiche
      testId={`fiche-label-${nom}`}
      visuel={<Tags className="size-5 text-muted-foreground" aria-hidden />}
      titre={t("fiches.titreLabel", { nom })}
      meta={
        fiche
          ? t("fiches.metaVersion", {
              version: fiche.version,
              date: new Date(fiche.created_at).toLocaleString(i18n.language, HORODATAGE),
              count: fiche.versions,
            })
          : t("fiches.pasCalculee")
      }
      ecrite={Boolean(fiche)}
      actions={fiche ? bouton : undefined}
    >
      <div className="space-y-4">
        {calculer.data && (
          <p className="text-xs text-success-foreground">{t("fiches.calcule", { fiches: calculer.data.fiches })}</p>
        )}
        {calculer.error && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(calculer.error)}
          </p>
        )}
        {fiche ? (
          <>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden />
              {t("fiches.genereeAuto")}
            </p>
            <MarkdownLeger texte={fiche.contenu} sansTitre />
          </>
        ) : (
          <FicheVide texte={t("fiches.videLabel", { nom })} action={bouton} />
        )}
      </div>
    </CadreFiche>
  );
}

/** La fiche CTA : les règles communes pour écrire le CTA, une seule fiche versionnée. */
function FicheCta({ fiche }: { fiche: { contenu: string; version: number; created_at: string; versions: number } | null }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [contenu, setContenu] = React.useState(fiche?.contenu ?? "");
  const ecrite = Boolean(fiche?.contenu.trim());
  const [mode, setMode] = React.useState<Mode>(ecrite ? "lire" : "modifier");
  const [ouverte, setOuverte] = React.useState(ecrite);

  React.useEffect(() => setContenu(fiche?.contenu ?? ""), [fiche?.contenu]);

  const modifie = contenu !== (fiche?.contenu ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerFicheCta(contenu),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLES.cta }),
  });

  return (
    <CadreFiche
      testId="fiche-cta"
      visuel={<Megaphone className="size-5 text-muted-foreground" aria-hidden />}
      titre={t("fiches.titreCta")}
      meta={
        fiche
          ? t("fiches.metaVersion", {
              version: fiche.version,
              date: new Date(fiche.created_at).toLocaleString(i18n.language, HORODATAGE),
              count: fiche.versions,
            })
          : t("fiches.jamais")
      }
      ecrite={ecrite}
      actions={ouverte ? <ChoixMode mode={mode} onChange={setMode} /> : undefined}
    >
      {!ouverte ? (
        <FicheVide
          texte={t("fiches.videCta")}
          onEcrire={() => {
            setContenu(modeleFicheCta());
            setOuverte(true);
            setMode("modifier");
          }}
        />
      ) : mode === "lire" ? (
        <MarkdownLeger texte={contenu} sansTitre />
      ) : (
        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("fiches.contenu")}</span>
            <span className="block text-xs text-muted-foreground">{t("fiches.contenuAideCta")}</span>
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={26}
              className="font-mono text-xs"
              aria-label={t("fiches.contenu")}
            />
          </label>
          <BarreEnregistrement
            modifie={modifie}
            enCours={enregistrer.isPending}
            fait={enregistrer.isSuccess}
            erreur={enregistrer.error}
            onEnregistrer={() => enregistrer.mutate()}
          />
        </div>
      )}
    </CadreFiche>
  );
}
