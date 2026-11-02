import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronRight, ExternalLink, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Segments } from "@/components/ui/segments";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { LabelEditor } from "@/features/moteur/LabelPicker";
import {
  apercuOubliSource,
  creerSource,
  labelsDeLaSource,
  listerLabels,
  listerSources,
  majSource,
  oublierSource,
  setLabelsSource,
  supprimerSource,
  type LigneJournalOubli,
  lireMajSourcesRun,
  performanceSources,
} from "@/features/moteur/api";
import type { PerfSource } from "@/features/moteur/perfSource";
import { RSource, RVsLabel } from "@/features/moteur/RSource";
import { Aide } from "@/features/moteur/repartition/graphes";
import {
  filtrerGroupes,
  groupesSources,
  resumeSources,
  type GroupeSource,
} from "@/features/moteur/groupesSources";
import { demarrerImportCompte, demarrerImportLien } from "@/features/moteur/importJobs";
import { ImportHistoriquePanel } from "@/features/moteur/ImportHistoriquePanel";
import { ImportJobsPanel } from "@/features/moteur/ImportJobsPanel";
import { MajSourcesPanel } from "@/features/moteur/MajSourcesPanel";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import type { CompteReference, Label as NicheLabel } from "@/features/moteur/types";
import { cn } from "@/lib/utils";
import { aujourdhuiEnLettres, localeDate } from "@/locales/localeDate";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Les tableaux de la page Allocation : en-têtes en petites capitales, lignes fines. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-4 align-top last:pr-0";

function LangueSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      disabled={disabled}
      required
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        {t("sources.langueChoisir")}
      </option>
      {LANGUES_CIBLES.map((l) => (
        <option key={l} value={l}>
          {nomLangue(l)}
        </option>
      ))}
    </select>
  );
}

function NicheSelect({
  id,
  niches,
  value,
  onChange,
  allowEmpty = false,
}: {
  id: string;
  niches: NicheLabel[];
  value: string;
  onChange: (labelId: string) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={!allowEmpty}
    >
      <option value="">{t("sources.nicheChoisir")}</option>
      {niches.map((n) => (
        <option key={n.id} value={n.id}>
          {n.nom}
        </option>
      ))}
    </select>
  );
}

/**
 * Prompt adapté à une source : la voix / le ton que la traduction doit prendre
 * pour cette niche. C'est ici qu'il se règle (pas sur le compte du poster) —
 * c'est la source qui dicte le registre. Injecté à la traduction de ses sujets.
 */
function VoixSource({ source }: { source: CompteReference }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [texte, setTexte] = React.useState(source.style_profile ?? "");
  const modifie = texte !== (source.style_profile ?? "");

  const enregistrer = useMutation({
    mutationFn: () => majSource(source.id, { style_profile: texte.trim() || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  return (
    <div className="space-y-2">
      <Label htmlFor={`voix-${source.id}`} className="text-xs">
        {t("sources.voix")}
      </Label>
      <Textarea
        id={`voix-${source.id}`}
        rows={2}
        className="text-xs"
        placeholder={t("sources.voixPlaceholder")}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t("sources.voixAide")}</p>
      {modifie && (
        <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
      )}
    </div>
  );
}

/** Scrape + pipeline v-next en arrière-plan (ne bloque pas la page). */
function BoutonExtraire({
  sourceId,
  handle,
  langue,
}: {
  sourceId: string;
  handle: string;
  langue: string;
}) {
  const { t } = useTranslation();
  const [resultat, setResultat] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        title={t("sources.extraireAide")}
        disabled={!langue}
        onClick={() => {
          // Prompt 15, point 1 : la date et le coût avant de lancer.
          if (!window.confirm(t("sources.confirmExtraire", { handle, date: aujourdhuiEnLettres() }))) return;
          demarrerImportCompte({
            compteReferenceId: sourceId,
            handle,
            langue,
          });
          setResultat(t("sources.importJobLance"));
        }}
      >
        {t("sources.extraire")}
      </Button>
      {resultat && <span className="text-xs text-muted-foreground">{resultat}</span>}
    </div>
  );
}

/** Nouveaux TikToks depuis le dernier import — pas les anciens déjà en stock. */
function BoutonUpdateSource({
  sourceId,
  handle,
  langue,
  dejaImportee,
}: {
  sourceId: string;
  handle: string;
  langue: string;
  dejaImportee: boolean;
}) {
  const { t } = useTranslation();
  const [resultat, setResultat] = React.useState<string | null>(null);

  if (!dejaImportee) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        title={t("sources.updateAide")}
        disabled={!langue}
        onClick={() => {
          if (!window.confirm(t("sources.confirmUpdate", { handle, date: aujourdhuiEnLettres() }))) return;
          demarrerImportCompte({
            compteReferenceId: sourceId,
            handle,
            langue,
            nouveauxSeulement: true,
          });
          setResultat(t("sources.updateLance"));
        }}
      >
        <RefreshCw className="size-3.5" />
        {t("sources.update")}
      </Button>
      {resultat && <span className="text-xs text-muted-foreground">{resultat}</span>}
    </div>
  );
}

/** Import v-next d'un seul TikTok rattaché à cette source (+ ses labels). */
function ImportLienSource({
  sourceId,
  langueSource,
  className,
}: {
  sourceId: string;
  langueSource: string;
  /** Appliquée au formulaire ouvert (pas au bouton) : il prend toute la ligne. */
  className?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = React.useState("");
  const [langue, setLangue] = React.useState(langueSource || "");
  const [ouvert, setOuvert] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLangue(langueSource || "");
  }, [langueSource]);

  const lancer = async () => {
    const lien = url.trim();
    if (!lien) {
      setMessage(t("sources.importLienRequis"));
      return;
    }
    if (!langue) {
      setMessage(t("sources.langueRequis"));
      return;
    }
    try {
      const labelIds = await labelsDeLaSource(sourceId);
      demarrerImportLien({
        url: lien,
        compteReferenceId: sourceId,
        labelIds,
        langue,
        titre: lien,
      });
      setMessage(t("sources.importJobLance"));
      setUrl("");
      setOuvert(false);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  if (!ouvert) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        {t("sources.importLien")}
      </Button>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-md border border-dashed bg-background p-2.5", className)}>
      <p className="text-xs font-medium">{t("sources.importLien")}</p>
      <p className="text-[11px] text-muted-foreground">{t("sources.importLienAide")}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lancer();
        }}
      >
        <Input
          type="url"
          required
          placeholder="https://www.tiktok.com/@…/photo/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 basis-64 text-xs"
        />
        <div className="w-40 space-y-1">
          <Label htmlFor={`langue-lien-${sourceId}`} className="text-[11px]">
            {t("sources.langueOrigine")}
          </Label>
          <LangueSelect
            id={`langue-lien-${sourceId}`}
            value={langue}
            onChange={setLangue}
          />
        </div>
        <Button type="submit" size="sm" disabled={!url.trim() || !langue}>
          {t("sources.importLienGo")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOuvert(false);
            setMessage(null);
          }}
        >
          {t("common.cancel")}
        </Button>
      </form>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

function niveauJournalClass(niveau: LigneJournalOubli["niveau"]): string {
  if (niveau === "ok") return "text-emerald-700 dark:text-emerald-400";
  if (niveau === "warn") return "text-amber-700 dark:text-amber-400";
  if (niveau === "error") return "text-destructive";
  return "text-muted-foreground";
}

/** Journal scrollable — même lecture que les jobs d'import, pour ne pas se perdre. */
function JournalOubli({
  lignes,
  vide,
}: {
  lignes: LigneJournalOubli[];
  vide: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [lignes.length]);

  return (
    <div
      ref={ref}
      className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed"
    >
      {lignes.length === 0 && <p className="text-muted-foreground">{vide}</p>}
      {lignes.map((l, i) => (
        <div key={`${l.at}-${i}`} className={cn("break-words", niveauJournalClass(l.niveau))}>
          <span className="opacity-60">
            {new Date(l.at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>{" "}
          <span className="font-sans font-medium">{l.message}</span>
        </div>
      ))}
    </div>
  );
}

type BilanOubli = {
  handle: string;
  message: string;
  journal: LigneJournalOubli[];
};

/**
 * Repart de zéro sur ce compte : efface tout ce qu'il a produit, puis le retire
 * de la liste. Sans ça, un ré-import retombe sur les verrous d'unicité
 * (`handle_tiktok`, `contenus.source_url`) et rouvre les anciens slideshows au
 * lieu d'en créer de neufs.
 */
function OublierSource({
  source,
  onFini,
  className,
}: {
  source: CompteReference;
  onFini: (bilan: BilanOubli) => void;
  /** Appliquée au panneau ouvert (pas au bouton) : il prend toute la ligne. */
  className?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [progres, setProgres] = React.useState<string | null>(null);
  const [journal, setJournal] = React.useState<LigneJournalOubli[]>([]);

  const apercu = useQuery({
    queryKey: ["oubli-apercu", source.id],
    queryFn: () => apercuOubliSource(source.id),
    enabled: ouvert,
    gcTime: 0,
  });

  const oublier = useMutation({
    mutationFn: () =>
      oublierSource(source.id, (fait, restant, lignes) => {
        setJournal(lignes);
        if (restant >= 0) {
          setProgres(
            t("sources.oublierProgres", { contenus: fait.contenus, restant }),
          );
        }
      }),
    onSuccess: async (r) => {
      setJournal(r.journal);
      onFini({
        handle: source.handle_tiktok,
        journal: r.journal,
        message: t("sources.oublierFait", {
          handle: source.handle_tiktok,
          contenus: r.fait.contenus,
          medias: r.fait.medias,
          fichiers: r.fait.fichiers,
        }),
      });
      for (const key of [
        ["sources"],
        ["slideshows"],
        ["contenus"],
        ["historique-imports"],
        ["medias"],
      ]) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  if (!ouvert) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        title={t("sources.oublierAide")}
        onClick={() => setOuvert(true)}
      >
        <Trash2 className="size-3.5" />
        {t("sources.oublier")}
      </Button>
    );
  }

  const a = apercu.data?.apercu;

  return (
    <div className={cn("space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-2.5", className)}>
      <p className="text-xs font-medium text-destructive">
        {t("sources.oublierTitre", { handle: source.handle_tiktok })}
      </p>

      {apercu.isPending && (
        <p className="text-[11px] text-muted-foreground">{t("common.loading")}</p>
      )}
      {apercu.isError && (
        <p className="text-[11px] text-destructive">{(apercu.error as Error).message}</p>
      )}
      {a && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          <li>
            {t("sources.oublierDetail", {
              contenus: a.contenus,
              medias: a.medias,
              posts: a.posts,
              sujets: a.sujets,
              importFile: a.importFile,
            })}
          </li>
          {a.postersLies > 0 && (
            <li className="text-warning">
              {t("sources.oublierPosters", { count: a.postersLies })}
            </li>
          )}
          {a.conjoints > 0 && (
            <li className="text-warning">
              {t("sources.oublierConjoints", { count: a.conjoints })}
            </li>
          )}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">{t("sources.oublierIrreversible")}</p>
      {progres && <p className="text-[11px] text-muted-foreground">{progres}</p>}
      {(oublier.isPending || journal.length > 0) && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium">{t("sources.oublierJournal")}</p>
          <JournalOubli lignes={journal} vide={t("sources.oublierJournalVide")} />
        </div>
      )}
      {oublier.isError && (
        <p className="text-[11px] text-destructive">{(oublier.error as Error).message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={oublier.isPending || apercu.isPending}
          onClick={() => {
            setJournal([]);
            setProgres(null);
            oublier.mutate();
          }}
        >
          {oublier.isPending ? t("sources.oublierEnCours") : t("sources.oublierGo")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={oublier.isPending}
          onClick={() => {
            setOuvert(false);
            setProgres(null);
            setJournal([]);
          }}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Les réglages d'une source (principal OU conjoint), dépliés sous sa ligne.
 * Le conjoint est compact : pas de genre (hérité du principal) ni de prompt de
 * voix.
 */
function ReglagesSource({
  source,
  estConjoint = false,
  onOubli,
}: {
  source: CompteReference;
  estConjoint?: boolean;
  onOubli: (bilan: BilanOubli) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["sources"] });
  const basculer = useMutation({
    mutationFn: () => majSource(source.id, { is_active: !source.is_active }),
    onSuccess: rafraichir,
  });
  const changerGenre = useMutation({
    mutationFn: (g: "homme" | "femme") => majSource(source.id, { genre: g }),
    onSuccess: rafraichir,
  });
  const changerLangue = useMutation({
    mutationFn: (langue: string) => majSource(source.id, { langue }),
    onSuccess: rafraichir,
  });
  const retirer = useMutation({
    mutationFn: () => supprimerSource(source.id),
    onSuccess: rafraichir,
  });

  const lien = `https://www.tiktok.com/@${source.handle_tiktok.replace(/^@/, "")}`;

  return (
    <div className="space-y-4">
      {estConjoint && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={lien} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            @{source.handle_tiktok}
            <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
          </a>
          <span className="rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">{t("sources.conjoint")}</span>
          {!source.is_active && <span className="text-xs font-medium text-muted-foreground">{t("sources.inactive")}</span>}
          <span className="text-xs text-muted-foreground">
            {source.dernier_scrape_at
              ? t("sources.extraitLe", {
                  date: new Date(source.dernier_scrape_at).toLocaleDateString(localeDate(i18n.language)),
                })
              : t("sources.jamais")}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {!estConjoint && <p className={MICRO_LABEL}>{t("sources.parties.actions")}</p>}
        <div className="flex flex-wrap items-start gap-2">
          <BoutonUpdateSource
            sourceId={source.id}
            handle={source.handle_tiktok}
            langue={source.langue}
            dejaImportee={Boolean(source.dernier_scrape_at)}
          />
          <BoutonExtraire sourceId={source.id} handle={source.handle_tiktok} langue={source.langue} />
          <ImportLienSource sourceId={source.id} langueSource={source.langue} className="basis-full" />
          <Button size="sm" variant="outline" disabled={basculer.isPending} onClick={() => basculer.mutate()}>
            {source.is_active ? t("sources.deactivate") : t("sources.activate")}
          </Button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(lien)}
            className="h-8 px-1 text-xs text-muted-foreground underline-offset-2 hover:underline sm:h-7"
          >
            {t("sources.copierLien")}
          </button>
          <span className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(t("sources.confirmDelete"))) retirer.mutate();
              }}
            >
              {t("common.delete")}
            </Button>
            <OublierSource source={source} onFini={onOubli} className="basis-full" />
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`langue-source-${source.id}`} className={cn(MICRO_LABEL, "block")}>
            {t("sources.langueOrigine")}
          </label>
          <div className="max-w-56">
            <LangueSelect
              id={`langue-source-${source.id}`}
              value={source.langue || ""}
              disabled={changerLangue.isPending}
              onChange={(l) => changerLangue.mutate(l)}
            />
          </div>
        </div>
        {!estConjoint && (
          <div className="space-y-1.5">
            <p className={MICRO_LABEL}>{t("sources.genre").replace(/\s*:$/, "")}</p>
            <Segments
              libelle={t("sources.genre")}
              actif={source.genre}
              disabled={changerGenre.isPending}
              onChange={(g) => changerGenre.mutate(g)}
              options={[
                { cle: "femme", contenu: t("sources.genreFemme") },
                { cle: "homme", contenu: t("sources.genreHomme") },
              ]}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <LabelEditor
          queryKey={["source-labels", source.id]}
          load={() => labelsDeLaSource(source.id)}
          save={async (ids) => {
            // RPC : écrit les labels source + sync tous les slideshows + images.
            await setLabelsSource(source.id, ids);
          }}
        />
        <p className="text-[11px] text-muted-foreground">{t("labels.retroactif")}</p>
      </div>
      {!estConjoint && <VoixSource source={source} />}
    </div>
  );
}

/** Ajoute un compte conjoint sous un principal : même langue et même genre, ses labels par défaut. */
function AjoutConjoint({ principal, niches }: { principal: CompteReference; niches: NicheLabel[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const [nicheId, setNicheId] = React.useState("");

  const ajouter = useMutation({
    mutationFn: async () => {
      const niche = niches.find((n) => n.id === nicheId);
      const cree = await creerSource({
        handle,
        niche: niche?.nom ?? principal.niche ?? "",
        langue: principal.langue,
        genre: principal.genre,
        parent_id: principal.id,
      });
      const labels = nicheId ? [nicheId] : await labelsDeLaSource(principal.id);
      if (labels.length > 0) await setLabelsSource(cree.id, labels);
      return cree;
    },
    onSuccess: () => {
      setHandle("");
      setNicheId("");
      setOuvert(false);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  if (!ouvert) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        <Plus />
        {t("sources.ajouterConjoint")}
      </Button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (handle.trim()) ajouter.mutate();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Input
        placeholder="@compte_conjoint"
        aria-label={t("sources.handle")}
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        className="w-48"
        required
      />
      <div className="w-48">
        <NicheSelect id={`niche-conjoint-${principal.id}`} niches={niches} value={nicheId} onChange={setNicheId} allowEmpty />
      </div>
      <Button type="submit" size="sm" disabled={ajouter.isPending}>
        {ajouter.isPending ? t("common.saving") : t("sources.ajouterConjoint")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
        {t("common.cancel")}
      </Button>
      {ajouter.error && <p className="basis-full text-xs text-destructive">{(ajouter.error as Error).message}</p>}
    </form>
  );
}

/** Une ligne du tableau (le compte principal et ses conjoints), qui se déplie sur leurs réglages. */
function LigneGroupe({
  groupe,
  perf,
  niches,
  ouvert,
  onBasculer,
  onOubli,
}: {
  groupe: GroupeSource;
  perf: PerfSource | undefined;
  niches: NicheLabel[];
  ouvert: boolean;
  onBasculer: () => void;
  onOubli: (bilan: BilanOubli) => void;
}) {
  const { t, i18n } = useTranslation();
  const { principal, conjoints } = groupe;
  const lien = `https://www.tiktok.com/@${principal.handle_tiktok.replace(/^@/, "")}`;
  const Chevron = ouvert ? ChevronDown : ChevronRight;
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-border/40 hover:bg-muted/50",
          ouvert && "bg-muted/40",
          !principal.is_active && "text-muted-foreground",
        )}
        onClick={onBasculer}
      >
        <td className="w-6 py-2 align-top">
          <button
            type="button"
            aria-expanded={ouvert}
            aria-label={t("sources.tableau.details", { handle: principal.handle_tiktok })}
            onClick={(e) => {
              e.stopPropagation();
              onBasculer();
            }}
            className="mt-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            <Chevron className="size-4" />
          </button>
        </td>
        <td className={TD}>
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <a
              href={lien}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              @{principal.handle_tiktok}
              <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
            </a>
            {!principal.is_active && <span className="text-xs font-medium">{t("sources.inactive")}</span>}
          </span>
          {conjoints.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {t("sources.tableau.conjoints", { liste: conjoints.map((c) => `@${c.handle_tiktok}`).join(", ") })}
            </div>
          )}
          {/* Sur téléphone, les colonnes langue et niche passent ici. */}
          <div className="text-xs text-muted-foreground sm:hidden">
            {[principal.langue ? drapeauLangue(principal.langue) : null, principal.niche].filter(Boolean).join(" · ")}
          </div>
        </td>
        <td className={cn(TD, "hidden whitespace-nowrap sm:table-cell")}>
          {principal.langue ? `${drapeauLangue(principal.langue)} ${nomLangue(principal.langue)}` : "—"}
        </td>
        <td className={cn(TD, "hidden font-mono text-xs sm:table-cell")}>{principal.niche ?? "—"}</td>
        <td className={cn(TD, "whitespace-nowrap text-right")} data-testid={`r-${principal.handle_tiktok}`}>
          <RSource perf={perf} />
        </td>
        <td className={cn(TD, "whitespace-nowrap text-right")} data-testid={`vs-label-${principal.handle_tiktok}`}>
          <RVsLabel perf={perf} />
        </td>
        <td className={cn(TD, "whitespace-nowrap text-xs text-muted-foreground")}>
          {principal.dernier_scrape_at
            ? new Date(principal.dernier_scrape_at).toLocaleDateString(localeDate(i18n.language), { day: "2-digit", month: "2-digit" })
            : t("sources.jamais")}
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b border-border/40">
          <td colSpan={7} className="pb-4 pt-1">
            <div className="space-y-5 rounded-lg bg-muted/30 p-4">
              <ReglagesSource source={principal} onOubli={onOubli} />
              <div className="space-y-3 border-t pt-4">
                <p className={MICRO_LABEL}>{t("sources.parties.conjoints")}</p>
                {conjoints.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-background p-3">
                    <ReglagesSource source={c} estConjoint onOubli={onOubli} />
                  </div>
                ))}
                <AjoutConjoint principal={principal} niches={niches} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ChiffresSources({ groupes }: { groupes: GroupeSource[] }) {
  const { t, i18n } = useTranslation();
  const r = resumeSources(groupes);
  return (
    <StatGroup>
      <StatTile
        label={t("sources.chiffres.actives")}
        value={r.actives}
        unit={`/ ${r.total}`}
        detail={r.conjoints > 0 ? t("sources.chiffres.activesDetail", { n: r.conjoints }) : undefined}
      />
      <StatTile
        label={t("sources.chiffres.derniere")}
        value={
          r.derniereExtraction
            ? new Date(r.derniereExtraction).toLocaleDateString(localeDate(i18n.language), { day: "2-digit", month: "2-digit" })
            : "—"
        }
        detail={r.jamaisExtraites > 0 ? t("sources.chiffres.jamais", { n: r.jamaisExtraites }) : undefined}
      />
    </StatGroup>
  );
}

export function AdminSourcesPage() {
  const { t } = useTranslation();
  const [bilanOubli, setBilanOubli] = React.useState<BilanOubli | null>(null);
  const [ajout, setAjout] = React.useState(false);
  const [majOuverte, setMajOuverte] = React.useState(false);
  const [recherche, setRecherche] = React.useState("");
  const [ouverte, setOuverte] = React.useState<string | null>(null);
  // Toutes les sources : un post importé sert toutes les applications de ses
  // labels, le sélecteur d'application ne cloisonne plus les sources.
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: () => listerSources(),
  });
  const niches = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
  });
  const perf = useQuery({ queryKey: ["performance-sources"], queryFn: performanceSources });
  const [tri, setTri] = React.useState<"nom" | "r" | "label">("nom");
  const basculerTri = (cle: "r" | "label") => setTri((v) => (v === cle ? "nom" : cle));
  const valeurTri = (g: GroupeSource) => {
    const p = perf.data?.[g.principal.id];
    return (tri === "r" ? p?.r : p?.rVsLabel) ?? -1;
  };

  const toutes = sources.data ?? [];
  const groupes = groupesSources(toutes);
  const filtres = filtrerGroupes(groupes, recherche);
  // Tri par r ou par rapport au label : les actives d'abord, puis le
  // meilleur ; sans chiffre, en bas.
  const visibles =
    tri === "nom"
      ? filtres
      : [...filtres].sort(
          (a, b) => Number(b.principal.is_active) - Number(a.principal.is_active) || valeurTri(b) - valeurTri(a),
        );
  // Même requête que le panneau (cache partagé) : une mise à jour en cours
  // garde le panneau ouvert, pour suivre la séquence.
  const run = useQuery({ queryKey: ["maj-sources-run"], queryFn: lireMajSourcesRun, refetchInterval: 4_000 });
  const majVisible = majOuverte || run.data?.statut === "running";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sources.title")}
        description={t("sources.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setMajOuverte((v) => !v)} aria-expanded={majVisible}>
              <RefreshCw className="size-3.5" />
              {t("sources.majTitre")}
            </Button>
            <Button onClick={() => setAjout((v) => !v)} aria-expanded={ajout}>
              <Plus />
              {t("sources.ajouterSource")}
            </Button>
          </>
        }
      />

      {ajout && <FormAjoutSource niches={niches.data ?? []} onFermer={() => setAjout(false)} />}

      {majVisible && <MajSourcesPanel sources={toutes} />}

      <ImportJobsPanel />

      {bilanOubli && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
              <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden />
              {bilanOubli.message}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setBilanOubli(null)}>
              {t("common.close")}
            </Button>
          </div>
          <p className={MICRO_LABEL}>{t("sources.oublierJournal")}</p>
          <JournalOubli lignes={bilanOubli.journal} vide={t("sources.oublierJournalVide")} />
        </div>
      )}

      {groupes.length > 0 && <ChiffresSources groupes={groupes} />}

      <Card>
        <CardHeader>
          <CardTitle>{t("sources.tableau.titre")}</CardTitle>
          <CardDescription>{t("sources.tableau.description")}</CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-3 overflow-x-auto">
          {groupes.length > 0 && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="h-8 pl-8 text-sm"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("sources.tableau.rechercheCourt")}
                aria-label={t("sources.tableau.recherche")}
              />
            </div>
          )}
          {sources.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : groupes.length === 0 ? (
            <EmptyState title={t("sources.empty")} />
          ) : visibles.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t("sources.tableau.aucune")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-6 pb-2" aria-hidden />
                  <th className={TH}>{t("sources.tableau.source")}</th>
                  <th className={cn(TH, "hidden sm:table-cell")}>{t("sources.tableau.langue")}</th>
                  <th className={cn(TH, "hidden sm:table-cell")}>{t("sources.tableau.niche")}</th>
                  <th className={cn(TH, "text-right normal-case")} aria-sort={tri === "r" ? "descending" : "none"}>
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className={cn("uppercase tracking-wide hover:text-foreground", tri === "r" && "text-foreground")}
                        onClick={() => basculerTri("r")}
                        title={t("sources.perfTri")}
                      >
                        {t("sources.tableau.perf")}
                        {tri === "r" ? " ↓" : ""}
                      </button>
                      <Aide libelle={t("sources.tableau.perf")}>{t("sources.perfAide")}</Aide>
                    </span>
                  </th>
                  <th className={cn(TH, "text-right normal-case")} aria-sort={tri === "label" ? "descending" : "none"}>
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className={cn("uppercase tracking-wide hover:text-foreground", tri === "label" && "text-foreground")}
                        onClick={() => basculerTri("label")}
                        title={t("sources.vsLabelTri")}
                      >
                        {t("sources.tableau.vsLabel")}
                        {tri === "label" ? " ↓" : ""}
                      </button>
                      <Aide libelle={t("sources.tableau.vsLabel")}>{t("sources.vsLabelAide")}</Aide>
                    </span>
                  </th>
                  <th className={TH}>{t("sources.tableau.extraction")}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((g) => (
                  <LigneGroupe
                    key={g.principal.id}
                    groupe={g}
                    perf={perf.data?.[g.principal.id]}
                    niches={niches.data ?? []}
                    ouvert={ouverte === g.principal.id}
                    onBasculer={() => setOuverte((o) => (o === g.principal.id ? null : g.principal.id))}
                    onOubli={setBilanOubli}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ImportHistoriquePanel />
    </div>
  );
}
/** Formulaire d'ajout : soit un compte TikTok, soit un lien TikTok isolé. */
function FormAjoutSource({ niches, onFermer }: { niches: NicheLabel[]; onFermer: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<"compte" | "lien">("compte");
  const [handle, setHandle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [nicheId, setNicheId] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const nicheNom = niches.find((n) => n.id === nicheId)?.nom ?? "";

  const ajouter = useMutation({
    mutationFn: async () => {
      if (!nicheId) throw new Error(t("sources.nicheRequis"));
      if (!langue) throw new Error(t("sources.langueRequis"));

      if (mode === "compte") {
        if (!handle.trim()) throw new Error(t("sources.handleRequis"));
        const cree = await creerSource({
          handle,
          niche: nicheNom,
          langue,
        });
        await setLabelsSource(cree.id, [nicheId]);
        // Scrape + pipeline en arrière-plan — la page reste utilisable.
        demarrerImportCompte({
          compteReferenceId: cree.id,
          handle: cree.handle_tiktok,
          langue,
        });
        return { kind: "compte" as const, handle: cree.handle_tiktok };
      }

      const lien = url.trim();
      if (!lien) throw new Error(t("sources.importLienRequis"));
      demarrerImportLien({
        url: lien,
        compteReferenceId: null,
        labelIds: [nicheId],
        langue,
        titre: lien,
      });
      return { kind: "lien" as const };
    },
    onSuccess: (r) => {
      if (r.kind === "compte") {
        setMessage(t("sources.compteAjouteJob", { handle: r.handle }));
        setHandle("");
      } else {
        setMessage(t("sources.importJobLance"));
        setUrl("");
      }
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["slideshows"] });
      queryClient.invalidateQueries({ queryKey: ["contenus"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("sources.ajouterSource")}</CardTitle>
        <CardDescription>{mode === "compte" ? t("sources.modeCompteAide") : t("sources.modeLienAide")}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={onFermer}>
            {t("common.close")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
      <Segments
        libelle={t("sources.ajouterSource")}
        actif={mode}
        onChange={(id) => {
          setMode(id);
          setMessage(null);
        }}
        options={[
          { cle: "compte", contenu: t("sources.modeCompte") },
          { cle: "lien", contenu: t("sources.modeLien") },
        ]}
      />

      {niches.length === 0 ? (
        <p className="text-sm text-warning">
          {t("sources.nicheAucune")}{" "}
          <Link to="/admin/labels" className="underline underline-offset-2">
            {t("sources.creerNiche")}
          </Link>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ajouter.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {mode === "compte" ? (
            <div className="space-y-2">
              <Label htmlFor="handle">{t("sources.handle")}</Label>
              <Input
                id="handle"
                required
                placeholder="@mon_compte"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                disabled={ajouter.isPending}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tiktok-url">{t("sources.lienTikTok")}</Label>
              <Input
                id="tiktok-url"
                type="url"
                required
                placeholder="https://www.tiktok.com/@…/photo/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={ajouter.isPending}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="niche-ajout">{t("sources.niche")}</Label>
            <NicheSelect
              id="niche-ajout"
              niches={niches}
              value={nicheId}
              onChange={setNicheId}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="langue-ajout">{t("sources.langueOrigine")}</Label>
            <LangueSelect
              id="langue-ajout"
              value={langue}
              onChange={setLangue}
              disabled={ajouter.isPending}
            />
            <p className="text-[11px] text-muted-foreground">{t("sources.langueAide")}</p>
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              disabled={ajouter.isPending || !nicheId || !langue}
            >
              {ajouter.isPending
                ? mode === "lien"
                  ? t("sources.importLienEnCours")
                  : t("common.saving")
                : mode === "lien"
                  ? t("sources.importLienGo")
                  : t("sources.add")}
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p
          className={
            ajouter.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
      </CardContent>
    </Card>
  );
}

