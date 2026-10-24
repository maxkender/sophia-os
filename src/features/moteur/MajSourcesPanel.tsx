import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, RefreshCw, Search, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  annulerMajSourcesServeur,
  contenusParSource,
  demarrerMajSourcesServeur,
  lireMajSourcesRun,
} from "@/features/moteur/api";
import { syncMajJobDepuisRun } from "@/features/moteur/importJobs";
import { nomLangue } from "@/features/moteur/langues";
import {
  finDuRun,
  joursDepuis,
  sourcesMettables,
  suiviParSource,
  totalEnfilees,
  type StatutSource,
  type SuiviSource,
} from "@/features/moteur/majSourcesVue";
import type { CompteReference } from "@/features/moteur/types";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

/** Au-delà, la source est « ancienne » : la date passe en orange. */
const JOURS_ANCIENNE = 7;
/** Une séquence finie depuis moins longtemps garde son détail ouvert. */
const RECENTE_MS = 3_600_000;

/**
 * « Mettre à jour les sources », SOURCE PAR SOURCE.
 *
 * Avant, un seul bouton enfilait toutes les sources. Maintenant on coche
 * celles qu'on veut (avec la date de leur dernier import et leur stock), et la
 * séquence serveur les passe une par une : la suivante ne démarre que quand la
 * file d'import est vide. Chaque source enfile ses slideshows manquants comme
 * un import classique (même file, même historique). Le suivi dit, pour chaque
 * source, où elle en est et ce qu'elle a donné.
 *
 * La dernière séquence reste affichée une fois finie, AVEC SA DATE : sans
 * elle, un bilan de deux mois se lisait comme celui du jour. À côté de chaque
 * source, le nombre de slideshows importés depuis elle (pas le « stock » de
 * sujets reproductibles de la page, qui compte autre chose).
 */
export function MajSourcesPanel({ sources }: { sources: CompteReference[] }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [choix, setChoix] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState<string | null>(null);
  /** Détail de la séquence ouvert ou fermé ; `null` = selon son âge. */
  const [ouvert, setOuvert] = React.useState<boolean | null>(null);

  const mettables = React.useMemo(() => sourcesMettables(sources), [sources]);
  const run = useQuery({ queryKey: ["maj-sources-run"], queryFn: lireMajSourcesRun, refetchInterval: 4_000 });
  const importes = useQuery({ queryKey: ["contenus-par-source"], queryFn: contenusParSource });
  React.useEffect(() => {
    syncMajJobDepuisRun(run.data ?? null);
  }, [run.data]);

  // Chaque source passée change sa date de mise à jour et son nombre
  // d'importés : on relit la liste au lieu de garder les chiffres d'avant.
  const avancement = run.data ? `${run.data.statut}:${run.data.faits}` : null;
  const avancementPrecedent = React.useRef(avancement);
  React.useEffect(() => {
    if (avancementPrecedent.current === avancement) return;
    avancementPrecedent.current = avancement;
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
    void queryClient.invalidateQueries({ queryKey: ["contenus-par-source"] });
  }, [avancement, queryClient]);

  const enCours = run.data?.statut === "running";
  // Une nouvelle séquence (lancée d'ici, d'un autre onglet ou par le serveur)
  // repart sans le choix ouvert/fermé fait sur la précédente.
  React.useEffect(() => {
    if (enCours) setOuvert(null);
  }, [enCours]);
  const suivi = React.useMemo(() => suiviParSource(run.data ?? null), [run.data]);

  const rafraichir = async (etat: Parameters<typeof syncMajJobDepuisRun>[0]) => {
    syncMajJobDepuisRun(etat);
    await queryClient.invalidateQueries({ queryKey: ["maj-sources-run"] });
  };

  const lancer = useMutation({
    mutationFn: () =>
      demarrerMajSourcesServeur(
        mettables
          .filter((s) => choix.has(s.id))
          .map((s) => ({ id: s.id, handle: s.handle_tiktok, langue: s.langue })),
      ),
    onSuccess: async (r) => {
      await rafraichir(r.etat);
      setMessage(r.deja ? t("sources.majDeja") : null);
      setChoix(new Set());
      setOuvert(null);
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const arreter = useMutation({
    mutationFn: annulerMajSourcesServeur,
    onSuccess: (r) => rafraichir(r.etat),
  });

  const rtf = React.useMemo(() => new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }), [i18n.language]);
  const quand = (iso: string | null) => {
    const j = joursDepuis(iso);
    if (j === null || !iso) return t("sources.jamais");
    const date = new Date(iso).toLocaleDateString(localeDate(i18n.language), { day: "2-digit", month: "2-digit" });
    return `${rtf.format(-j, "day")} · ${date}`;
  };

  const basculer = (id: string) =>
    setChoix((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const passees = suivi.filter((s) => s.statut === "fait").length;
  const fin = finDuRun(run.data ?? null);
  // Calculé quand la séquence bouge, pas à chaque rendu : un clic sans rapport
  // ne doit pas replier le détail parce que l'heure vient de passer.
  const recente = React.useMemo(() => fin !== null && Date.now() - Date.parse(fin) < RECENTE_MS, [fin]);
  const detailOuvert = enCours || (ouvert ?? recente);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="maj-sources">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">{t("sources.majTitre")}</h3>
          <p className="text-xs text-muted-foreground">{t("sources.majAide")}</p>
        </div>
        {enCours ? (
          <Button variant="outline" onClick={() => arreter.mutate()} disabled={arreter.isPending}>
            {t("sources.majStop")}
          </Button>
        ) : (
          <Button disabled={choix.size === 0 || lancer.isPending} onClick={() => lancer.mutate()}>
            <RefreshCw className="size-3.5" />
            {t("sources.majGo", { count: choix.size })}
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      {run.data && suivi.length > 0 && (
        <div className="space-y-2 rounded-md border bg-background p-3" data-testid="maj-suivi">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {enCours
                ? t("sources.majEnCours", { faits: passees, total: suivi.length })
                : t(`sources.majFin_${run.data.statut}`, { total: suivi.length, enfilees: totalEnfilees(suivi) })}
            </span>
            {enCours && run.data.restant > 0 && (
              <span className="text-xs text-muted-foreground">{t("sources.majFile", { count: run.data.restant })}</span>
            )}
            {!enCours && fin && (
              <span className="text-xs text-muted-foreground" data-testid="maj-suivi-date">
                {t("sources.majLe", { quand: quand(fin) })}
              </span>
            )}
          </div>
          {enCours && <Progress value={(100 * passees) / suivi.length} />}
          {!enCours && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={detailOuvert}
              onClick={() => setOuvert(!detailOuvert)}
            >
              <ChevronDown className={cn("size-3.5 transition-transform", detailOuvert && "rotate-180")} aria-hidden />
              {detailOuvert ? t("sources.majMasquer") : t("sources.majVoirDetail", { count: suivi.length })}
            </button>
          )}
          {detailOuvert && (
            <>
              <ol className="space-y-1">
                {suivi.map((s) => (
                  <LigneSuivi key={`${s.rang}-${s.compte.id}`} suivi={s} restant={run.data?.restant ?? 0} />
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">{t("sources.majVoirImports")}</p>
            </>
          )}
        </div>
      )}

      {!enCours && (
        <div className="space-y-2">
          {mettables.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("sources.majVide")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("sources.majSelection", { count: choix.size, total: mettables.length })}</span>
                <Button size="xs" variant="outline" onClick={() => setChoix(new Set(mettables.map((s) => s.id)))}>
                  {t("sources.majToutes")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    setChoix(new Set(mettables.filter((s) => (joursDepuis(s.dernier_scrape_at) ?? 0) >= JOURS_ANCIENNE).map((s) => s.id)))
                  }
                >
                  {t("sources.majAnciennes", { jours: JOURS_ANCIENNE })}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setChoix(new Set())}>
                  {t("sources.majAucune")}
                </Button>
              </div>
              <ul className="max-h-80 space-y-0.5 overflow-auto rounded-md border bg-background p-1" aria-label={t("sources.majTitre")}>
                {mettables.map((s) => {
                  const jours = joursDepuis(s.dernier_scrape_at) ?? 0;
                  const n = importes.data?.[s.id] ?? { importes: 0, valides: 0 };
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-2 py-1.5 hover:bg-muted/60">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={choix.has(s.id)}
                          onChange={() => basculer(s.id)}
                          aria-label={`@${s.handle_tiktok}`}
                        />
                        <span className="font-mono text-sm">@{s.handle_tiktok}</span>
                        <span className="text-xs text-muted-foreground">{nomLangue(s.langue)}</span>
                        <span
                          className={cn(
                            "ml-auto text-xs tabular-nums",
                            jours >= JOURS_ANCIENNE ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                          )}
                          data-testid={`maj-date-${s.handle_tiktok}`}
                        >
                          {t("sources.majDernier", { quand: quand(s.dernier_scrape_at) })}
                        </span>
                        <span
                          className="w-28 text-right text-xs tabular-nums text-muted-foreground"
                          title={t("sources.majImportesTitre", { importes: n.importes, valides: n.valides })}
                          data-testid={`maj-importes-${s.handle_tiktok}`}
                        >
                          {importes.data ? t("sources.majImportes", { count: n.importes }) : "…"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const ICONES: Record<StatutSource, React.ReactNode> = {
  fait: <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />,
  file: <Loader2 className="size-4 animate-spin text-primary" aria-hidden />,
  liste: <Search className="size-4 text-primary" aria-hidden />,
  attente: <Clock className="size-4 text-muted-foreground" aria-hidden />,
  annule: <XCircle className="size-4 text-muted-foreground" aria-hidden />,
  bloquee: <AlertTriangle className="size-4 text-destructive" aria-hidden />,
};

function LigneSuivi({ suivi, restant }: { suivi: SuiviSource; restant: number }) {
  const { t } = useTranslation();
  const r = suivi.resultat;
  let texte: string;
  if (suivi.statut === "fait") {
    texte = r?.echec
      ? t("sources.majEchec")
      : r && r.enfilees > 0
        ? t("sources.majEnvoyes", { count: r.enfilees })
        : t("sources.majRien");
  } else if (suivi.statut === "file") {
    texte = t("sources.majImport", { count: r?.enfilees ?? 0, restant });
  } else {
    texte = t(`sources.majStatut_${suivi.statut}`);
  }
  const detail =
    r && r.profil !== null && !r.echec
      ? t("sources.majDetail", { profil: r.profil, stock: r.enStock ?? 0, manquants: r.manquants ?? 0 })
      : null;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-sm",
        (suivi.statut === "file" || suivi.statut === "liste") && "bg-primary/5",
      )}
      data-testid={`maj-suivi-${suivi.compte.handle}`}
      data-statut={suivi.statut}
    >
      <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{suivi.rang}</span>
      {ICONES[suivi.statut]}
      <span className="font-mono">@{suivi.compte.handle}</span>
      <span className={cn("text-xs", suivi.statut === "attente" || suivi.statut === "annule" ? "text-muted-foreground" : "")}>
        {texte}
      </span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </li>
  );
}
