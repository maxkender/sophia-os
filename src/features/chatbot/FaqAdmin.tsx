import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AjouterAFaqSituation, BadgeSituation } from "@/features/faq/situations";
import { Tableau } from "@/features/moteur/repartition/Tableau";
import { cn } from "@/lib/utils";

import {
  ecrireReglagesFaq,
  ignorerQuestionFaq,
  lireReglagesFaqAdmin,
  listerGuidesCopies,
  recopierGuides,
  traiterQuestionFaq,
  type QuestionFaq,
} from "./api";
import { auteur, CLE_FAQ } from "./faqDonnees";
import {
  compterDecisions,
  dansFiltre,
  FILTRES_JOURNAL,
  type FiltreJournal,
  lienSlack,
  type ModeOs,
  type ModeSlack,
  NOMS_CANAUX,
  type ReglagesFaq,
  VARIANTE_ETAT,
} from "./faq";
import { ilYA, sujetCourt } from "./statsFaq";
import { localeDate } from "@/locales/localeDate";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function libelleRole(role: string, t: (k: string) => string): string {
  if (role === "poster") return t("chatbot.rolePoster");
  if (role === "directing_manager") return t("chatbot.roleDm");
  if (role === "hiring_manager" || role === "head_of_ops") return t("chatbot.roleHm");
  return t("chatbot.roleAdmin");
}

function libelleSource(q: QuestionFaq, t: (k: string) => string): string {
  if (q.source !== "slack") return t("chatbot.faq.sourceOs");
  const canal = q.slack_canal ? (NOMS_CANAUX[q.slack_canal] ?? "") : "";
  return `${t("chatbot.faq.sourceSlack")} ${canal}`.trim();
}

/** L'état d'une question : son badge, ou « ancien assistant » avant le cerveau. */
function BadgeEtat({ q }: { q: QuestionFaq }) {
  const { t } = useTranslation();
  return q.etat ? (
    <Badge variant={VARIANTE_ETAT[q.etat]}>{t(`chatbot.faq.etats.${q.etat}`)}</Badge>
  ) : (
    <Badge variant="outline">{t("chatbot.faq.ancien")}</Badge>
  );
}

function LienSlack({ q }: { q: QuestionFaq }) {
  const { t } = useTranslation();
  if (!q.slack_canal || !q.slack_ts) return null;
  return (
    <a
      href={lienSlack(q.slack_canal, q.slack_ts)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      <ExternalLink className="size-3" aria-hidden />
      {t("chatbot.faq.voirSlack")}
    </a>
  );
}

function Encadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{titre}</p>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function PastilleMode({ mode }: { mode: ModeSlack | ModeOs }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        mode === "actif" ? "bg-success" : mode === "test" ? "bg-warning" : "bg-muted-foreground/50",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// L'état du bot, dans l'en-tête de la page
// ---------------------------------------------------------------------------

/** Trois pastilles : où le bot répond pour de vrai, où il est en test, et la fraîcheur du guide. */
export function EtatBot() {
  const { t, i18n } = useTranslation();
  const reglages = useQuery({ queryKey: [...CLE_FAQ, "reglages"], queryFn: lireReglagesFaqAdmin });
  const guides = useQuery({ queryKey: [...CLE_FAQ, "guides"], queryFn: listerGuidesCopies });
  const r = reglages.data;
  if (!r) return null;
  const derniere = (guides.data ?? []).reduce<string | null>((max, p) => (!max || p.copie_at > max ? p.copie_at : max), null);
  const pastille = "inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={pastille}>
        <PastilleMode mode={r.mode_slack} />
        {t("chatbot.etatSlack", { mode: t(`chatbot.faq.modes.${r.mode_slack}`) })}
      </span>
      <span className={pastille}>
        <PastilleMode mode={r.mode_os} />
        {t("chatbot.etatBulle", { mode: t(`chatbot.faq.modes.${r.mode_os}`) })}
      </span>
      <span className={pastille}>
        <BookOpen className="size-3" aria-hidden />
        {derniere ? t("chatbot.etatGuide", { quand: ilYA(derniere, i18n.language) }) : t("chatbot.etatGuideJamais")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages du bot, repliés comme les réglages fins de la page Allocation
// ---------------------------------------------------------------------------

export function ReglagesFaqCarte() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [deplie, setDeplie] = React.useState(false);
  const reglages = useQuery({ queryKey: [...CLE_FAQ, "reglages"], queryFn: lireReglagesFaqAdmin });
  const guides = useQuery({ queryKey: [...CLE_FAQ, "guides"], queryFn: listerGuidesCopies });

  const ecrire = useMutation({
    mutationFn: (r: ReglagesFaq) => ecrireReglagesFaq(r),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE_FAQ, "reglages"] }),
  });
  const recopier = useMutation({
    mutationFn: () => recopierGuides(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE_FAQ, "guides"] }),
  });

  const r = reglages.data;
  const changer = (patch: Partial<ReglagesFaq>, quoi?: string) => {
    if (!r) return;
    if (quoi && !window.confirm(t("chatbot.faq.confirmerActif", { quoi }))) return;
    ecrire.mutate({ ...r, ...patch });
  };

  const pages = guides.data ?? [];
  const derniere = pages.reduce<string | null>((max, p) => (!max || p.copie_at > max ? p.copie_at : max), null);
  const bilan = recopier.data;
  const erreursCopie = [
    ...(bilan?.guides ?? []).flatMap((g) => g.erreurs),
    ...(bilan && !bilan.ok && bilan.error ? [bilan.error] : []),
  ];
  const enTest = r && (r.mode_slack !== "actif" || r.mode_os !== "actif");
  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <Card data-testid="faq-reglages">
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
              {t("chatbot.reglagesTitre")}
            </CardTitle>
            <CardDescription>{t("chatbot.reglagesResume")}</CardDescription>
          </span>
          {deplie ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </CardHeader>
      {deplie && (
        <CardContent className="space-y-4">
          <p className="max-w-3xl text-xs text-muted-foreground">{t("chatbot.faq.description")}</p>
          {reglages.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : r ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{t("chatbot.faq.modeSlack")}</span>
                  <select
                    aria-label={t("chatbot.faq.modeSlack")}
                    className={selectClass}
                    value={r.mode_slack}
                    disabled={ecrire.isPending}
                    onChange={(e) => {
                      const mode = e.target.value as ModeSlack;
                      changer({ mode_slack: mode }, mode === "actif" ? t("chatbot.faq.modeSlack") : undefined);
                    }}
                  >
                    {(["eteint", "test", "actif"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`chatbot.faq.modes.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{t("chatbot.faq.modeOs")}</span>
                  <select
                    aria-label={t("chatbot.faq.modeOs")}
                    className={selectClass}
                    value={r.mode_os}
                    disabled={ecrire.isPending}
                    onChange={(e) => {
                      const mode = e.target.value as ModeOs;
                      changer({ mode_os: mode }, mode === "actif" ? t("chatbot.faq.modeOs") : undefined);
                    }}
                  >
                    {(["test", "actif"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`chatbot.faq.modes.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={r.message_attente}
                  disabled={ecrire.isPending}
                  onCheckedChange={(v) => changer({ message_attente: v === true })}
                />
                <span>{t("chatbot.faq.messageAttente")}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("chatbot.faq.canaux", {
                  canaux: r.canaux_slack.map((c) => NOMS_CANAUX[c] ?? c).join(", ") || "—",
                })}
              </p>
              {enTest && <p className="text-xs text-warning-foreground">{t("chatbot.faq.aideTest")}</p>}
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border border-border/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t("chatbot.faq.guideTitre")}</p>
                <p className="text-xs text-muted-foreground">
                  {pages.length && derniere
                    ? t("chatbot.faq.guidePages", {
                        n: pages.length,
                        date: new Date(derniere).toLocaleString(localeDate(i18n.language)),
                      })
                    : t("chatbot.faq.guideVide")}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={recopier.isPending} onClick={() => recopier.mutate()}>
                <RefreshCw className={cn(recopier.isPending && "animate-spin")} />
                {recopier.isPending ? t("chatbot.faq.recopieEnCours") : t("chatbot.faq.recopier")}
              </Button>
            </div>
            {bilan?.guides && !erreursCopie.length && (
              <p className="text-xs text-success">
                {t("chatbot.faq.recopieOk", {
                  recopiees: bilan.guides.reduce((n, g) => n + g.recopiees, 0),
                  inchangees: bilan.guides.reduce((n, g) => n + g.inchangees, 0),
                })}
              </p>
            )}
            {erreursCopie.map((e) => (
              <p key={e} role="alert" className="text-xs text-destructive">
                {e}
              </p>
            ))}
            {pages.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("chatbot.faq.voirPages")}</summary>
                <ul className="mt-1 space-y-0.5">
                  {pages.map((p) => (
                    <li key={p.page_id}>
                      <a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {p.chemin}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {(reglages.error || ecrire.error || recopier.error) && (
            <p role="alert" className="text-xs text-destructive">
              {messageErreur(reglages.error ?? ecrire.error ?? recopier.error)}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// À traiter : une boîte de réception, la file à gauche, la réponse à droite
// ---------------------------------------------------------------------------

export function BoiteATraiter({ questions }: { questions: QuestionFaq[] }) {
  const { t, i18n } = useTranslation();
  const reglages = useQuery({ queryKey: [...CLE_FAQ, "reglages"], queryFn: lireReglagesFaqAdmin });
  const [choisie, setChoisie] = React.useState<string | null>(null);
  // Une question traitée disparaît de la file : on passe à la suivante.
  const active = questions.find((q) => q.id === choisie) ?? questions[0] ?? null;

  if (questions.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{t("chatbot.faq.aTraiterVide")}</p>;
  }

  return (
    <div className="grid overflow-hidden rounded-lg border md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <ul className="divide-y border-b md:border-r md:border-b-0" aria-label={t("chatbot.onglets.aTraiter")}>
        {questions.map((q) => {
          const actif = active?.id === q.id;
          return (
            <li key={q.id}>
              <button
                type="button"
                aria-current={actif || undefined}
                onClick={() => setChoisie(q.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-0 bg-transparent px-3.5 py-3 text-left transition-colors hover:bg-muted/50",
                  actif && "bg-muted/60",
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate text-sm font-medium text-foreground">{auteur(q)}</span>
                  <span className="shrink-0 font-mono text-[11px]">{q.source === "slack" ? "Slack" : t("chatbot.faq.sourceOs")}</span>
                  <span className="ml-auto shrink-0">{ilYA(q.created_at, i18n.language)}</span>
                </span>
                <span className="line-clamp-2 text-sm">{q.question}</span>
                <span className="flex flex-wrap gap-1">
                  <BadgeEtat q={q} />
                  {/* Prompt 21, Q : la situation de la personne quand elle a écrit. */}
                  <BadgeSituation cle={q.situation} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {active && <DetailATraiter key={active.id} q={active} reglages={reglages.data} />}
    </div>
  );
}

function DetailATraiter({ q, reglages }: { q: QuestionFaq; reglages: ReglagesFaq | undefined }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  // Pas sûr : sa réponse est déjà là, il reste à la relire et l'envoyer.
  const aValider = q.etat === "a_valider" && Boolean(q.reponse_faq);
  const [reponse, setReponse] = React.useState(aValider ? (q.reponse_faq ?? "") : "");
  const [base, setBase] = React.useState(true);
  const actif = q.source === "slack" ? reglages?.mode_slack === "actif" : reglages?.mode_os === "actif";
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE_FAQ });

  const traiter = useMutation({
    mutationFn: () => traiterQuestionFaq(q.id, reponse.trim(), base),
    onSuccess: (r) => {
      // Quelqu'un de l'équipe a répondu dans le fil entre-temps : rien n'est
      // parti, la ligne va disparaître de la liste, on dit pourquoi.
      if (r.deja && r.raison) window.alert(r.raison);
      void rafraichir();
    },
  });
  const ignorer = useMutation({ mutationFn: () => ignorerQuestionFaq(q.id), onSuccess: rafraichir });

  return (
    <div className="min-w-0 space-y-3 p-4" data-testid={`faq-question-${q.id}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">{auteur(q)}</span>
        <Badge variant="outline">{libelleRole(q.role, t)}</Badge>
        <span>{libelleSource(q, t)}</span>
        <span>·</span>
        <span title={new Date(q.created_at).toLocaleString(localeDate(i18n.language))}>{ilYA(q.created_at, i18n.language)}</span>
        {q.test && <Badge variant="outline">{t("chatbot.faq.test")}</Badge>}
        <BadgeSituation cle={q.situation} />
        <span className="ml-auto">
          <LienSlack q={q} />
        </span>
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">{q.question}</p>
      {q.reponse_situation && <Encadre titre={t("faqSituations.reponseSituation")}>{q.reponse_situation}</Encadre>}
      {aValider ? (
        <p className="text-xs text-warning-foreground">
          {t("chatbot.faq.aValiderAide")}
          {q.section_guide ? ` · ${q.section_guide}` : ""}
        </p>
      ) : (
        q.reponse_faq && <Encadre titre={t("chatbot.faq.propositionCerveau")}>{q.reponse_faq}</Encadre>
      )}
      {q.reponse_humaine && (
        <Encadre titre={t("chatbot.faq.reponseHumaine", { nom: q.reponse_humaine_par ?? "—" })}>{q.reponse_humaine}</Encadre>
      )}
      <Textarea
        aria-label={t("chatbot.faq.tonTexte")}
        placeholder={t("chatbot.faq.tonTexte")}
        value={reponse}
        onChange={(e) => setReponse(e.target.value)}
        rows={aValider ? 5 : 4}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!reponse.trim() || traiter.isPending} onClick={() => traiter.mutate()}>
          {!actif
            ? t("chatbot.faq.enregistrerTest")
            : aValider
              ? t("chatbot.faq.validerEnvoyer")
              : t("chatbot.faq.envoyer")}
        </Button>
        <Button size="sm" variant="ghost" disabled={ignorer.isPending} onClick={() => ignorer.mutate()}>
          {t("chatbot.faq.ignorer")}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={base} onCheckedChange={(v) => setBase(v === true)} />
          <span>{t("chatbot.faq.ajouterBase")}</span>
        </label>
      </div>
      {(traiter.error || ignorer.error) && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(traiter.error ?? ignorer.error)}
        </p>
      )}
      {/* Prompt 21, Q : l'ajouter à la FAQ par situation, pour sa situation seulement ou pour tous. */}
      <AjouterAFaqSituation
        question={q.question}
        situation={q.situation ?? null}
        entreeId={q.faq_entree_id ?? null}
        reponse={reponse.trim() || q.reponse_humaine || q.reponse_faq}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journal : une ligne par question, le détail en dépliant
// ---------------------------------------------------------------------------

const CANAL_TICKETS = "https://sophia-system.slack.com/archives/C0C92QP1R28";

/** Un bug laissé à l'IT guy : pas encore vu, pris en charge (« on it »), ou réglé. */
function SuiviIt({ q }: { q: QuestionFaq }) {
  const { t, i18n } = useTranslation();
  const heure = q.it_maj_at
    ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(q.it_maj_at))
    : "";
  if (q.it_statut === "repondu") {
    return <p className="text-xs text-success">{t("chatbot.faq.itRepondu", { heure })}</p>;
  }
  if (q.it_statut === "pris_en_charge") {
    return (
      <p className="text-xs text-info-foreground">
        {t("chatbot.faq.itPris", { heure })}{" "}
        <a href={CANAL_TICKETS} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          #a-os-tickets
        </a>
      </p>
    );
  }
  return <p className="text-xs text-warning-foreground">{t("chatbot.faq.itAttente")}</p>;
}

function DetailJournal({ q, onAjouterReponse }: { q: QuestionFaq; onAjouterReponse?: (q: QuestionFaq) => void }) {
  const { t } = useTranslation();
  // Ce que la personne a vraiment reçu, quand ce n'est pas la proposition
  // telle quelle : la réponse de l'ancien assistant (bulle en test, ou
  // questions d'avant), le message d'attente, la réponse de l'admin.
  const recu = q.reponse && q.reponse !== q.reponse_faq ? q.reponse : null;
  const cerveau = q.etat !== null || q.reponse_faq !== null;
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{q.question}</p>
        <LienSlack q={q} />
      </div>
      {/* Sur un bug, on montre où en est l'IT guy. Bug ou hors sujet : le bot
          se tait exprès, rien à « proposer ». */}
      {q.etat === "bug" && <SuiviIt q={q} />}
      {cerveau && !q.reponse_faq && q.etat === "hors_sujet"
        ? <p className="text-xs text-muted-foreground">{t("chatbot.faq.rienARepondre")}</p>
        : cerveau && (q.reponse_faq || q.etat !== "bug") && (
          <Encadre titre={t("chatbot.faq.propositionCerveau")}>{q.reponse_faq || t("chatbot.faq.rienPropose")}</Encadre>
        )}
      {recu && <Encadre titre={t("chatbot.faq.recu")}>{recu}</Encadre>}
      {q.reponse_humaine && (
        <Encadre titre={t("chatbot.faq.reponseHumaine", { nom: q.reponse_humaine_par ?? "—" })}>{q.reponse_humaine}</Encadre>
      )}
      {q.erreur && <p className="text-xs text-destructive">{q.erreur}</p>}
      {onAjouterReponse && (
        q.ajoute_base_at
          ? <Badge variant="success">{t("chatbot.faq.dansLaBase")}</Badge>
          : (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAjouterReponse(q);
              }}
            >
              {t("chatbot.ajouterContexte")}
            </Button>
          )
      )}
    </div>
  );
}

const SOURCES = ["toutes", "slack", "os"] as const;
type SourceJournal = (typeof SOURCES)[number];
/** Le journal en montre autant d'un coup, puis « Voir plus ». */
const PAR_PAGE = 50;

export function JournalFaq({
  questions,
  onAjouterReponse,
}: {
  questions: QuestionFaq[];
  onAjouterReponse?: (q: QuestionFaq) => void;
}) {
  const { t, i18n } = useTranslation();
  const [filtre, setFiltre] = React.useState<FiltreJournal>("tous");
  const [source, setSource] = React.useState<SourceJournal>("toutes");
  const [recherche, setRecherche] = React.useState("");
  const [ouverte, setOuverte] = React.useState<string | null>(null);
  const [combien, setCombien] = React.useState(PAR_PAGE);

  const texte = recherche.trim().toLowerCase();
  const lignes = questions.filter((q) => {
    if (source !== "toutes" && q.source !== source) return false;
    if (!texte) return true;
    return [q.question, q.reponse, q.reponse_faq, q.reponse_humaine, auteur(q)]
      .some((champ) => (champ ?? "").toLowerCase().includes(texte));
  });
  const compte = compterDecisions(lignes.map((l) => l.etat));
  const filtrees = lignes.filter((q) => dansFiltre(q.etat, filtre));

  return (
    <div className="space-y-3" data-testid="faq-journal">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("chatbot.filtrePlaceholder")}
          className="max-w-sm"
        />
        <select
          aria-label={t("chatbot.faq.source")}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value as SourceJournal)}
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`chatbot.faq.sources.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTRES_JOURNAL.map((f) => (
          <Button key={f} size="xs" variant={filtre === f ? "default" : "outline"} onClick={() => setFiltre(f)}>
            {t(`chatbot.faq.filtres.${f}`)} · {compte[f]}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Tableau
          lignes={filtrees.slice(0, combien)}
          cleLigne={(q) => q.id}
          vide={t("chatbot.faq.journalVide")}
          onLigne={(q) => setOuverte(ouverte === q.id ? null : q.id)}
          ligneActive={(q) => ouverte === q.id}
          detail={(q) => <DetailJournal q={q} onAjouterReponse={onAjouterReponse} />}
          colonnes={[
            {
              // Qui, d'où et quand dans une seule colonne : trois colonnes en
              // tout, lisibles aussi sur un téléphone.
              cle: "qui",
              titre: t("chatbot.colQui"),
              rendu: (q) => (
                <span className="block min-w-28">
                  <span className="block truncate">{auteur(q)}</span>
                  <span
                    className="block text-xs text-muted-foreground"
                    title={new Date(q.created_at).toLocaleString(localeDate(i18n.language))}
                  >
                    {[libelleRole(q.role, t), q.source === "slack" ? "Slack" : t("chatbot.faq.sourceOs"), ilYA(q.created_at, i18n.language)].join(" · ")}
                  </span>
                </span>
              ),
            },
            {
              cle: "question",
              titre: t("chatbot.colQuestion"),
              rendu: (q) => (
                <span className="block max-w-md">
                  <span className="line-clamp-2">{q.question}</span>
                  {q.section_guide && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" title={q.section_guide}>
                      <BookOpen className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{sujetCourt(q.section_guide)}</span>
                    </span>
                  )}
                </span>
              ),
            },
            {
              cle: "resultat",
              titre: t("chatbot.colResultat"),
              rendu: (q) => (
                <span className="flex flex-wrap items-center gap-1">
                  <BadgeEtat q={q} />
                  {q.test && <Badge variant="outline">{t("chatbot.faq.test")}</Badge>}
                </span>
              ),
            },
          ]}
        />
      </div>
      {filtrees.length > combien && (
        <Button size="sm" variant="outline" onClick={() => setCombien((n) => n + PAR_PAGE)}>
          {t("chatbot.voirPlus", { n: Math.min(PAR_PAGE, filtrees.length - combien) })}
        </Button>
      )}
    </div>
  );
}
