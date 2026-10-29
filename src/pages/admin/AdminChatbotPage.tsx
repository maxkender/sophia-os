import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { BarChart, type PointBarre } from "@/components/charts/BarChart";
import { InlineBar } from "@/components/charts/InlineBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MicroLabel } from "@/components/ui/micro-label";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { Textarea } from "@/components/ui/textarea";
import {
  creerChatbotContexte,
  listerChatbotContexte,
  majChatbotContexte,
  PLAFOND_JOURNAL,
  supprimerChatbotContexte,
  type ChatbotContexte,
  type QuestionFaq,
} from "@/features/chatbot/api";
import { BoiteATraiter, EtatBot, JournalFaq, ReglagesFaqCarte } from "@/features/chatbot/FaqAdmin";
import { useQuestionsFaq } from "@/features/chatbot/faqDonnees";
import { OngletTestFaq, PanneauFaqSituations } from "@/features/faq/situations";
import type { AudienceSnippet } from "@/features/chatbot/prompt";
import { ilYA, ISSUES, nomsCourts, statsFaq, type Issue } from "@/features/chatbot/statsFaq";
// Les briques de la page Allocation : même lecture d'une page à l'autre.
import { Aide, BarreRepartition } from "@/features/moteur/repartition/graphes";
import type { Segment } from "@/features/moteur/repartition/segments";
import { Tableau } from "@/features/moteur/repartition/Tableau";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

function labelAudience(aud: AudienceSnippet, t: (k: string) => string): string {
  if (aud === "poster") return t("chatbot.rolePoster");
  if (aud === "hiring_manager") return t("chatbot.roleHm");
  if (aud === "admin") return t("chatbot.roleAdmin");
  return t("chatbot.audienceTous");
}

/** Une réponse validée se range pour le rôle de celui qui a demandé. */
function audienceDuRole(role: string): AudienceSnippet {
  if (role === "poster") return "poster";
  if (role === "hiring_manager" || role === "directing_manager" || role === "head_of_ops") return "hiring_manager";
  if (role === "admin") return "admin";
  return "all";
}

/** La couleur de chaque issue, la même que son badge dans le journal. */
const COULEUR_ISSUE: Record<Issue, string> = {
  repondu: "var(--success)",
  traite: "var(--app-autre)",
  a_traiter: "var(--warning)",
  bug: "var(--info)",
  hors_sujet: "color-mix(in srgb, var(--app-autre) 40%, transparent)",
};

function EditeurSnippet({
  initial,
  onAnnuler,
  onSauve,
}: {
  initial?: { id?: string; titre: string; contenu: string; audience?: AudienceSnippet };
  onAnnuler?: () => void;
  onSauve: () => void;
}) {
  const { t } = useTranslation();
  const [titre, setTitre] = React.useState(initial?.titre ?? "");
  const [contenu, setContenu] = React.useState(initial?.contenu ?? "");
  const [audience, setAudience] = React.useState<AudienceSnippet>(initial?.audience ?? "all");

  const sauver = useMutation({
    mutationFn: async () => {
      if (initial?.id) await majChatbotContexte(initial.id, { titre, contenu, audience });
      else await creerChatbotContexte(titre, contenu, audience);
    },
    onSuccess: onSauve,
  });

  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-muted/30 p-3">
      <Input
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder={t("chatbot.titrePlaceholder")}
      />
      <select
        aria-label={t("chatbot.audience")}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={audience}
        onChange={(e) => setAudience(e.target.value as AudienceSnippet)}
      >
        <option value="all">{t("chatbot.audienceTous")}</option>
        <option value="admin">{t("chatbot.roleAdmin")}</option>
        <option value="hiring_manager">{t("chatbot.roleHm")}</option>
        <option value="poster">{t("chatbot.rolePoster")}</option>
      </select>
      <Textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        rows={6}
        placeholder={t("chatbot.contenuPlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!contenu.trim() || sauver.isPending}
          onClick={() => sauver.mutate()}
        >
          {sauver.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {onAnnuler && (
          <Button variant="ghost" onClick={onAnnuler}>
            {t("common.cancel")}
          </Button>
        )}
        {sauver.isError && (
          <p className="text-xs text-destructive">{(sauver.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

function LigneContexte({
  snippet,
  onChange,
}: {
  snippet: ChatbotContexte;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = React.useState(false);
  const supprimer = useMutation({
    mutationFn: () => supprimerChatbotContexte(snippet.id),
    onSuccess: onChange,
  });

  if (edit) {
    return (
      <EditeurSnippet
        initial={snippet}
        onAnnuler={() => setEdit(false)}
        onSauve={() => {
          setEdit(false);
          onChange();
        }}
      />
    );
  }

  return (
    <div className="space-y-2 border-b border-border/40 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{snippet.titre}</p>
          <Badge variant="secondary">{labelAudience(snippet.audience ?? "all", t)}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={supprimer.isPending}
            onClick={() => {
              if (window.confirm(t("chatbot.confirmSuppr"))) supprimer.mutate();
            }}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{snippet.contenu}</p>
    </div>
  );
}

function ReponsesValidees({
  brouillon,
  onFini,
}: {
  brouillon: { titre: string; contenu: string; audience: AudienceSnippet } | null;
  onFini: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nouveau, setNouveau] = React.useState(brouillon !== null);
  const contexte = useQuery({ queryKey: ["chatbot-contexte"], queryFn: listerChatbotContexte });

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["chatbot-contexte"] });
    setNouveau(false);
    onFini();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {t("chatbot.reponsesResume")}
          <Aide libelle={t("chatbot.contextTitle")}>{t("chatbot.contextSubtitle")}</Aide>
        </p>
        {!nouveau && (
          <Button size="sm" variant="outline" onClick={() => setNouveau(true)}>
            <Plus />
            {t("chatbot.nouveau")}
          </Button>
        )}
      </div>
      {nouveau && (
        <EditeurSnippet
          key={brouillon ? `q-${brouillon.titre}` : "nouveau"}
          initial={brouillon ?? undefined}
          onAnnuler={() => {
            setNouveau(false);
            onFini();
          }}
          onSauve={rafraichir}
        />
      )}
      {contexte.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {contexte.data?.length === 0 && !nouveau && (
        <EmptyState title={t("chatbot.contexteVide")} description={t("chatbot.contexteVideAide")} />
      )}
      <div>
        {contexte.data?.map((s) => (
          <LigneContexte key={s.id} snippet={s} onChange={rafraichir} />
        ))}
      </div>
    </div>
  );
}

// Prompt 21, Q : « FAQ by situation » et « Test » à côté des réponses validées.
const ONGLETS = ["aTraiter", "journal", "reponses", "situations", "test"] as const;
type Onglet = (typeof ONGLETS)[number];

/** Les onglets, au motif ARIA de la page Allocation (flèches, Début, Fin). */
function Onglets({
  actif,
  onChange,
  compteurs,
}: {
  actif: Onglet;
  onChange: (o: Onglet) => void;
  compteurs: Record<Onglet, number | undefined>;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("chatbot.ongletsAria")}
      className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
      onKeyDown={(ev) => {
        const i = ONGLETS.indexOf(actif);
        const n = ONGLETS.length;
        const vers =
          ev.key === "ArrowRight" ? (i + 1) % n
          : ev.key === "ArrowLeft" ? (i - 1 + n) % n
          : ev.key === "Home" ? 0
          : ev.key === "End" ? n - 1
          : -1;
        if (vers < 0) return;
        ev.preventDefault();
        onChange(ONGLETS[vers]!);
        document.getElementById(`onglet-assistant-${ONGLETS[vers]}`)?.focus();
      }}
    >
      {ONGLETS.map((o) => (
        <button
          key={o}
          id={`onglet-assistant-${o}`}
          type="button"
          role="tab"
          aria-selected={o === actif}
          aria-controls="panneau-assistant"
          tabIndex={o === actif ? 0 : -1}
          onClick={() => onChange(o)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
            o === actif ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`chatbot.onglets.${o}`)}
          {compteurs[o] !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                o === "aTraiter" && (compteurs[o] ?? 0) > 0
                  ? "bg-warning/15 text-warning-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {compteurs[o]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Assistant — les questions de Slack et de la bulle d'aide, et ce que le bot
 * en a fait. Dans le gabarit de la page Allocation : l'état du bot dans
 * l'en-tête, quatre chiffres, deux graphes, puis la file à traiter, le
 * journal et les réponses validées en onglets. Les réglages sont repliés en
 * bas : on y vient pour en changer un, pas pour lire la page.
 */
export function AdminChatbotPage() {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { aTraiter, journal } = useQuestionsFaq();
  const contexte = useQuery({ queryKey: ["chatbot-contexte"], queryFn: listerChatbotContexte });
  const [onglet, setOnglet] = React.useState<Onglet>("aTraiter");
  const [brouillon, setBrouillon] = React.useState<{
    titre: string;
    contenu: string;
    audience: AudienceSnippet;
  } | null>(null);

  // Recalculé à chaque rendu : « il y a 3 h » doit bouger avec l'heure.
  const stats = journal.data ? statsFaq(journal.data, new Date(), PLAFOND_JOURNAL) : null;
  const file = aTraiter.data ?? [];
  const relances = file.filter((q) => q.etat === "relance").length;
  const plusAncienne = file.reduce<string | null>((min, q) => (!min || q.created_at < min ? q.created_at : min), null);

  /** Depuis le journal : la question, et la réponse de l'équipe s'il y en a une. */
  function ajouterDepuisQuestion(q: QuestionFaq) {
    const reponse = q.reponse_humaine ?? q.reponse_admin ?? "";
    setBrouillon({
      titre: q.question.slice(0, 80),
      contenu: `${t("chatbot.questionLabel")} : ${q.question}\n\n${t("chatbot.reponseLabel")} :\n${reponse}`,
      audience: audienceDuRole(q.role),
    });
    setOnglet("reponses");
  }

  const segments: Segment[] = stats
    ? ISSUES.map((i) => ({
        cle: i,
        valeur: stats.parIssue[i],
        couleur: COULEUR_ISSUE[i],
        libelle: t(`chatbot.issues.${i}`),
        valeurAffichee: t("chatbot.nQuestions", { n: stats.parIssue[i] }),
      }))
    : [];
  const points: PointBarre[] = (stats?.parJour ?? []).map((j) => {
    const d = new Date(`${j.jour}T12:00:00`);
    return {
      key: j.jour,
      axisLabel: d.toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" }),
      tooltipTitle: d.toLocaleDateString(localeDate(langue), { weekday: "long", day: "numeric", month: "long" }),
      value: j.n,
    };
  });
  const sujets = (stats?.sujets ?? []).slice(0, 8);
  const noms = nomsCourts(sujets.map((s) => s.section));
  const plusDemande = Math.max(1, ...sujets.map((s) => s.n));

  return (
    <div className="space-y-6">
      <PageHeader title={t("chatbot.pageTitle")} description={t("chatbot.pageSubtitle")} actions={<EtatBot />} />

      {(journal.error || aTraiter.error) && (
        <p role="alert" className="text-sm text-destructive">
          {((journal.error ?? aTraiter.error) as Error).message}
        </p>
      )}

      <StatGroup>
        <StatTile
          label={t("chatbot.statQuestions")}
          value={stats?.semaine ?? "—"}
          detail={stats ? t("chatbot.statQuestionsAvant", { n: stats.semaineAvant }) : undefined}
          trend={stats?.parJour.map((j) => j.n)}
        />
        <StatTile
          label={t("chatbot.statBot")}
          value={stats?.tauxBot != null ? `${Math.round(stats.tauxBot * 100)} %` : "—"}
          aide={<Aide libelle={t("chatbot.statBot")}>{t("chatbot.statBotAide")}</Aide>}
          detail={
            stats ? t("chatbot.statBotDetail", { n: stats.parIssue.repondu, total: stats.vraiesQuestions }) : undefined
          }
        />
        <StatTile
          label={t("chatbot.statATraiter")}
          value={aTraiter.data ? file.length : "—"}
          tone={file.length > 0 ? "alerte" : "neutre"}
          detail={
            plusAncienne
              ? [
                  t("chatbot.statATraiterAncienne", { quand: ilYA(plusAncienne, langue) }),
                  relances > 0 ? t("chatbot.statATraiterRelances", { n: relances }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        />
        <StatTile
          label={t("chatbot.statBugs")}
          value={stats?.bugs.total ?? "—"}
          detail={
            stats && stats.bugs.total > 0
              ? t("chatbot.statBugsDetail", { regles: stats.bugs.regles, enCours: stats.bugs.enCours })
              : undefined
          }
        />
      </StatGroup>
      {stats?.tronque && (
        <p className="text-xs text-muted-foreground">{t("chatbot.tronque", { n: PLAFOND_JOURNAL })}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("chatbot.parJourTitre")}</CardTitle>
            <CardDescription>{t("chatbot.parJourDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {journal.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <BarChart
                points={points}
                height={170}
                valueLabel={t("chatbot.serieQuestions")}
                formatTick={(n) => String(n)}
                formatValue={(n) => String(n)}
                ariaLabel={t("chatbot.parJourTitre")}
              />
            )}
            {stats && stats.semaine > 0 && (
              <div className="space-y-2">
                <MicroLabel>{t("chatbot.issuesTitre")}</MicroLabel>
                <BarreRepartition segments={segments} aria-label={t("chatbot.issuesTitre")} />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {segments
                    .filter((s) => s.valeur > 0)
                    .map((s) => (
                      <li key={s.cle} className="flex items-center gap-1.5">
                        <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.couleur }} aria-hidden />
                        <span>{s.libelle}</span>
                        <span className="tabular-nums text-muted-foreground">{s.valeur}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("chatbot.sujetsTitre")}
              <Aide libelle={t("chatbot.sujetsTitre")}>{t("chatbot.sujetsAide")}</Aide>
            </CardTitle>
            <CardDescription>{t("chatbot.sujetsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Tableau
              lignes={sujets}
              cleLigne={(s) => s.section}
              vide={t("chatbot.sujetsVide")}
              colonnes={[
                {
                  cle: "section",
                  titre: t("chatbot.colSujet"),
                  rendu: (s) => (
                    <span className="block max-w-[16rem] truncate" title={s.section}>
                      {noms.get(s.section)}
                    </span>
                  ),
                },
                { cle: "n", titre: t("chatbot.colQuestions"), align: "droite", rendu: (s) => s.n },
                { cle: "barre", titre: "", classe: "w-1/3", rendu: (s) => <InlineBar value={s.n} max={plusDemande} /> },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Onglets
            actif={onglet}
            onChange={setOnglet}
            compteurs={{
              aTraiter: aTraiter.data?.length,
              journal: journal.data?.length,
              reponses: contexte.data?.length,
              situations: undefined,
              test: undefined,
            }}
          />
        </CardHeader>
        <CardContent id="panneau-assistant" role="tabpanel" aria-labelledby={`onglet-assistant-${onglet}`}>
          {onglet === "aTraiter" &&
            (aTraiter.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <BoiteATraiter questions={file} />
            ))}
          {onglet === "journal" &&
            (journal.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <JournalFaq questions={journal.data ?? []} onAjouterReponse={ajouterDepuisQuestion} />
            ))}
          {onglet === "reponses" && (
            <ReponsesValidees key={brouillon?.titre ?? "liste"} brouillon={brouillon} onFini={() => setBrouillon(null)} />
          )}
          {onglet === "situations" && <PanneauFaqSituations />}
          {onglet === "test" && <OngletTestFaq />}
        </CardContent>
      </Card>

      <ReglagesFaqCarte />
    </div>
  );
}
