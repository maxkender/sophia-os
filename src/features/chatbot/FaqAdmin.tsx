import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  ecrireReglagesFaq,
  ignorerQuestionFaq,
  lireReglagesFaqAdmin,
  listerFaqATraiter,
  listerFaqJournal,
  listerGuidesCopies,
  recopierGuides,
  traiterQuestionFaq,
  type QuestionFaq,
} from "./api";
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

const CLE = ["faq"] as const;

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function auteur(q: QuestionFaq): string {
  const p = q.profiles;
  return [p?.prenom, p?.nom].filter(Boolean).join(" ") || q.slack_nom || p?.email || q.slack_user_id || "—";
}

/**
 * Page Assistant → la FAQ automatique (docs/faq-automatique.md) : les modes,
 * la copie du guide Notion, ce qui attend l'admin, et le journal des décisions.
 */
export function FaqAdmin({ onAjouterReponse }: { onAjouterReponse?: (q: QuestionFaq) => void }) {
  const reglages = useQuery({ queryKey: [...CLE, "reglages"], queryFn: lireReglagesFaqAdmin });
  return (
    <div className="space-y-6">
      <ReglagesFaqCard reglages={reglages.data} chargement={reglages.isPending} erreur={reglages.error} />
      <ATraiterCard reglages={reglages.data} />
      <JournalFaqCard onAjouterReponse={onAjouterReponse} />
    </div>
  );
}

function libelleRole(role: string, t: (k: string) => string): string {
  if (role === "poster") return t("chatbot.rolePoster");
  if (role === "directing_manager") return t("chatbot.roleDm");
  if (role === "hiring_manager" || role === "head_of_ops") return t("chatbot.roleHm");
  return t("chatbot.roleAdmin");
}

function ReglagesFaqCard({
  reglages,
  chargement,
  erreur,
}: {
  reglages: ReglagesFaq | undefined;
  chargement: boolean;
  erreur: unknown;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const guides = useQuery({ queryKey: [...CLE, "guides"], queryFn: listerGuidesCopies });

  const ecrire = useMutation({
    mutationFn: (r: ReglagesFaq) => ecrireReglagesFaq(r),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "reglages"] }),
  });
  const recopier = useMutation({
    mutationFn: () => recopierGuides(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "guides"] }),
  });

  const changer = (patch: Partial<ReglagesFaq>, quoi?: string) => {
    if (!reglages) return;
    if (quoi && !window.confirm(t("chatbot.faq.confirmerActif", { quoi }))) return;
    ecrire.mutate({ ...reglages, ...patch });
  };

  const pages = guides.data ?? [];
  const derniere = pages.reduce<string | null>((max, p) => (!max || p.copie_at > max ? p.copie_at : max), null);
  const bilan = recopier.data;
  const erreursCopie = [
    ...(bilan?.guides ?? []).flatMap((g) => g.erreurs),
    ...(bilan && !bilan.ok && bilan.error ? [bilan.error] : []),
  ];
  const enTest = reglages && (reglages.mode_slack !== "actif" || reglages.mode_os !== "actif");

  return (
    <Card data-testid="faq-reglages">
      <CardHeader>
        <CardTitle>{t("chatbot.faq.titre")}</CardTitle>
        <CardDescription>{t("chatbot.faq.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {chargement ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : reglages ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium">{t("chatbot.faq.modeSlack")}</span>
                <select
                  aria-label={t("chatbot.faq.modeSlack")}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={reglages.mode_slack}
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
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={reglages.mode_os}
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
                checked={reglages.message_attente}
                disabled={ecrire.isPending}
                onCheckedChange={(v) => changer({ message_attente: v === true })}
              />
              <span>{t("chatbot.faq.messageAttente")}</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {t("chatbot.faq.canaux", {
                canaux: reglages.canaux_slack.map((c) => NOMS_CANAUX[c] ?? c).join(", ") || "—",
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
                    date: new Date(derniere).toLocaleString(i18n.language),
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

        {(erreur || ecrire.error || recopier.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(erreur ?? ecrire.error ?? recopier.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Entete({ q }: { q: QuestionFaq }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{auteur(q)}</span>
      <Badge variant="outline">{libelleRole(q.role, t)}</Badge>
      <Badge variant="secondary">
        {q.source === "slack"
          ? `${t("chatbot.faq.sourceSlack")} ${q.slack_canal ? (NOMS_CANAUX[q.slack_canal] ?? "") : ""}`.trim()
          : t("chatbot.faq.sourceOs")}
      </Badge>
      {q.etat
        ? <Badge variant={VARIANTE_ETAT[q.etat]}>{t(`chatbot.faq.etats.${q.etat}`)}</Badge>
        : <Badge variant="outline">{t("chatbot.faq.ancien")}</Badge>}
      {q.test && <Badge variant="outline">{t("chatbot.faq.test")}</Badge>}
      <span className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleString(i18n.language)}</span>
      {q.slack_canal && q.slack_ts && (
        <a
          href={lienSlack(q.slack_canal, q.slack_ts)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3" />
          {t("chatbot.faq.voirSlack")}
        </a>
      )}
    </div>
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

function ATraiterCard({ reglages }: { reglages: ReglagesFaq | undefined }) {
  const { t } = useTranslation();
  const liste = useQuery({ queryKey: [...CLE, "a-traiter"], queryFn: listerFaqATraiter });
  return (
    <Card data-testid="faq-a-traiter">
      <CardHeader>
        <CardTitle className="text-base">
          {t("chatbot.faq.aTraiterTitre")}
          {liste.data?.length ? ` (${liste.data.length})` : ""}
        </CardTitle>
        <CardDescription>{t("chatbot.faq.aTraiterDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {liste.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {liste.error && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(liste.error)}
          </p>
        )}
        {liste.data?.length === 0 && <EmptyState title={t("chatbot.faq.aTraiterVide")} />}
        {liste.data?.map((q) => <LigneATraiter key={q.id} q={q} reglages={reglages} />)}
      </CardContent>
    </Card>
  );
}

function LigneATraiter({ q, reglages }: { q: QuestionFaq; reglages: ReglagesFaq | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Pas sûr : sa réponse est déjà là, il reste à la relire et l'envoyer.
  const aValider = q.etat === "a_valider" && Boolean(q.reponse_faq);
  const [reponse, setReponse] = React.useState(aValider ? (q.reponse_faq ?? "") : "");
  const [base, setBase] = React.useState(true);
  const actif = q.source === "slack" ? reglages?.mode_slack === "actif" : reglages?.mode_os === "actif";
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE });

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
    <div className="space-y-2 rounded-md border border-border/80 p-3" data-testid={`faq-question-${q.id}`}>
      <Entete q={q} />
      <p className="whitespace-pre-wrap text-sm">{q.question}</p>
      {aValider
        ? (
          <p className="text-xs text-warning-foreground">
            {t("chatbot.faq.aValiderAide")}
            {q.section_guide ? ` 📖 ${q.section_guide}` : ""}
          </p>
        )
        : q.reponse_faq && <Encadre titre={t("chatbot.faq.propositionCerveau")}>{q.reponse_faq}</Encadre>}
      {q.reponse_humaine && (
        <Encadre titre={t("chatbot.faq.reponseHumaine", { nom: q.reponse_humaine_par ?? "—" })}>
          {q.reponse_humaine}
        </Encadre>
      )}
      <Textarea
        aria-label={t("chatbot.faq.tonTexte")}
        placeholder={t("chatbot.faq.tonTexte")}
        value={reponse}
        onChange={(e) => setReponse(e.target.value)}
        rows={aValider ? 5 : 3}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={base} onCheckedChange={(v) => setBase(v === true)} />
        <span>{t("chatbot.faq.ajouterBase")}</span>
      </label>
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
        {(traiter.error || ignorer.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(traiter.error ?? ignorer.error)}
          </p>
        )}
      </div>
    </div>
  );
}

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

const SOURCES = ["toutes", "slack", "os"] as const;
type SourceJournal = (typeof SOURCES)[number];

function JournalFaqCard({ onAjouterReponse }: { onAjouterReponse?: (q: QuestionFaq) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = React.useState<FiltreJournal>("tous");
  const [source, setSource] = React.useState<SourceJournal>("toutes");
  const [recherche, setRecherche] = React.useState("");
  const journal = useQuery({ queryKey: [...CLE, "journal"], queryFn: listerFaqJournal });

  const texte = recherche.trim().toLowerCase();
  const lignes = (journal.data ?? []).filter((q) => {
    if (source !== "toutes" && q.source !== source) return false;
    if (!texte) return true;
    return [q.question, q.reponse, q.reponse_faq, q.reponse_humaine, auteur(q)]
      .some((champ) => (champ ?? "").toLowerCase().includes(texte));
  });
  const compte = compterDecisions(lignes.map((l) => l.etat));

  return (
    <Card data-testid="faq-journal">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{t("chatbot.faq.journalTitre")}</CardTitle>
            <CardDescription>{t("chatbot.faq.journalDescription")}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void queryClient.invalidateQueries({ queryKey: [...CLE, "journal"] })}
          >
            {t("common.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <Button
              key={f}
              size="sm"
              variant={filtre === f ? "default" : "outline"}
              onClick={() => setFiltre(f)}
            >
              {t(`chatbot.faq.filtres.${f}`)} · {compte[f]}
            </Button>
          ))}
        </div>
        {journal.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {journal.error && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(journal.error)}
          </p>
        )}
        {journal.data?.length === 0 && <EmptyState title={t("chatbot.faq.journalVide")} />}
        {lignes
          .filter((q) => dansFiltre(q.etat, filtre))
          .map((q) => {
            // Ce que la personne a vraiment reçu, quand ce n'est pas la proposition
            // telle quelle : la réponse de l'ancien assistant (bulle en test, ou
            // questions d'avant), le message d'attente, la réponse de l'admin.
            const recu = q.reponse && q.reponse !== q.reponse_faq ? q.reponse : null;
            const cerveau = q.etat !== null || q.reponse_faq !== null;
            return (
              <div key={q.id} className="space-y-2 rounded-md border border-border/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Entete q={q} />
                  {onAjouterReponse && (
                    q.ajoute_base_at
                      ? <Badge variant="success">{t("chatbot.faq.dansLaBase")}</Badge>
                      : (
                        <Button size="sm" variant="outline" onClick={() => onAjouterReponse(q)}>
                          {t("chatbot.ajouterContexte")}
                        </Button>
                      )
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{q.question}</p>
                {/* Bug ou hors sujet sur Slack : le bot se tait exprès, rien à « proposer ».
                    Sur un bug, on montre où en est l'IT guy. */}
                {cerveau && !q.reponse_faq && q.etat === "bug"
                  ? <SuiviIt q={q} />
                  : cerveau && !q.reponse_faq && q.etat === "hors_sujet"
                  ? <p className="text-xs text-muted-foreground">{t("chatbot.faq.rienARepondre")}</p>
                  : cerveau && (
                    <Encadre titre={t("chatbot.faq.propositionCerveau")}>
                      {q.reponse_faq || t("chatbot.faq.rienPropose")}
                      {q.section_guide ? `\n📖 ${q.section_guide}` : ""}
                    </Encadre>
                  )}
                {recu && <Encadre titre={t("chatbot.faq.recu")}>{recu}</Encadre>}
                {q.reponse_humaine && (
                  <Encadre titre={t("chatbot.faq.reponseHumaine", { nom: q.reponse_humaine_par ?? "—" })}>
                    {q.reponse_humaine}
                  </Encadre>
                )}
                {q.erreur && <p className="text-xs text-destructive">{q.erreur}</p>}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
