import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Languages, Quote, Send, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import {
  enregistrerReponse,
  listerEcrituresKit,
  listerKit,
  lireReponses,
  terminerQuestionnaire,
  type Relecteur,
} from "@/features/relectureNative/api";
import { BarreParcours, type EtapeParcours } from "@/features/relectureNative/BarreParcours";
import { avancementKit, postsDuKit } from "@/features/relectureNative/kit";
import {
  CHOIX_MOT,
  progressionQuestionnaire,
  type ChoixMot,
  type ReponseQuestionnaire,
} from "@/features/relectureNative/logique";
import { messageErreur } from "@/features/relectureNative/messageErreur";
import {
  avancementBloc,
  blocsQuestionnaire,
  premierBlocAFaire,
  type BlocQuestionnaire,
} from "@/features/relectureNative/parcours";
import { Puce, TuileIcone } from "@/features/relectureNative/Puces";
import {
  cleMot,
  CONSIGNES_QUESTIONNAIRE,
  QUESTION_INTRO,
  questionsNumerotees,
  type QuestionRelecteur,
} from "@/features/relectureNative/questionnaire";
import { SectionKitRelecteur } from "@/features/relectureNative/SectionKitRelecteur";
import { CLE_REQUETE_MES_RELECTEURS, useEspaceRelecteur } from "@/features/relectureNative/useEspaceRelecteur";
import { cn } from "@/lib/utils";

/**
 * « Native review » : l'espace du relecteur natif, visible seulement si
 * l'admin l'a désigné ET a ouvert l'espace. Un bloc après l'autre : le
 * questionnaire « Your country, part by part », puis le kit natif. La barre
 * du parcours reste en haut de l'écran, avec le rappel qu'on ne demande
 * jamais une traduction mot à mot.
 */
export function PosterRelecturePage() {
  const { t } = useTranslation();
  const espace = useEspaceRelecteur();
  const [langue, setLangue] = React.useState<string | null>(null);

  if (espace.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (espace.error) return <p className="text-sm text-destructive">{messageErreur(espace.error)}</p>;
  if (espace.relecteurs.length === 0) return <EmptyState title={t("relectureNative.poster.pasOuvert")} />;

  const relecteur = espace.relecteurs.find((r) => r.langue === langue) ?? espace.relecteurs[0];

  return (
    <div className="space-y-5" data-testid="page-relecture-poster">
      {espace.relecteurs.length > 1 && (
        <Segments
          libelle={t("relectureNative.poster.langue")}
          actif={relecteur.langue}
          onChange={setLangue}
          options={espace.relecteurs.map((r) => ({
            cle: r.langue,
            contenu: `${drapeauLangue(r.langue)} ${nomLangue(r.langue)}`,
          }))}
        />
      )}
      <EspaceRelecteur key={relecteur.id} relecteur={relecteur} />
    </div>
  );
}

/** La barre du parcours, puis le questionnaire ou le kit. */
function EspaceRelecteur({ relecteur }: { relecteur: Relecteur }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const questionnaireFini = Boolean(relecteur.questionnaire_termine_at);
  const [etape, setEtape] = React.useState<EtapeParcours>(questionnaireFini ? "posts" : "pays");

  const cle = ["relecteur-mes-reponses", relecteur.id] as const;
  const reponses = useQuery({ queryKey: cle, queryFn: () => lireReponses(relecteur.id) });
  const kit = useQuery({ queryKey: ["kit-natif-relecteur"], queryFn: listerKit, enabled: questionnaireFini });
  const ecritures = useQuery({
    queryKey: ["kit-natif-mes-ecritures", relecteur.id],
    queryFn: () => listerEcrituresKit(relecteur.id),
    enabled: questionnaireFini,
  });

  // Une réponse enregistrée met le cache à jour : l'avancement suit sans recharger.
  const memoriser = (r: ReponseQuestionnaire) =>
    queryClient.setQueryData<ReponseQuestionnaire[]>(cle, (avant = []) => [
      ...avant.filter((x) => x.question_cle !== r.question_cle),
      r,
    ]);

  if (reponses.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (reponses.error) return <p className="text-sm text-destructive">{messageErreur(reponses.error)}</p>;

  const pays = progressionQuestionnaire(reponses.data ?? []);
  const posts = avancementKit(postsDuKit(kit.data ?? []), ecritures.data ?? []);

  return (
    <div className="space-y-5">
      <BarreParcours
        etape={etape}
        questionnaire={{ fait: pays.repondues, total: pays.total, envoye: questionnaireFini }}
        posts={{ fait: posts.rendus, total: posts.total }}
        postsOuverts={questionnaireFini}
        onEtape={setEtape}
      />
      {etape === "pays" || !questionnaireFini ? (
        <QuestionnaireParBlocs
          relecteur={relecteur}
          reponses={reponses.data ?? []}
          onEnregistre={memoriser}
          onAllerAuxPosts={() => setEtape("posts")}
        />
      ) : (
        <SectionKitRelecteur relecteur={relecteur} />
      )}
    </div>
  );
}

/** Le questionnaire, un bloc à la fois, avec la liste des blocs pour sauter de l'un à l'autre. */
function QuestionnaireParBlocs({
  relecteur,
  reponses,
  onEnregistre,
  onAllerAuxPosts,
}: {
  relecteur: Relecteur;
  reponses: ReponseQuestionnaire[];
  onEnregistre: (r: ReponseQuestionnaire) => void;
  onAllerAuxPosts: () => void;
}) {
  const { t } = useTranslation();
  const blocs = React.useMemo(() => blocsQuestionnaire(), []);
  const [index, setIndex] = React.useState(() => premierBlocAFaire(blocs, reponses));
  const haut = React.useRef<HTMLDivElement>(null);
  const bloc = blocs[index];
  const avancement = avancementBloc(bloc, reponses);

  const aller = (i: number) => {
    setIndex(Math.max(0, Math.min(blocs.length - 1, i)));
    haut.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={haut} className="scroll-mt-48 space-y-4">
      <nav aria-label={t("relectureNative.parcours.blocs")}>
        <ol className="flex flex-wrap gap-1.5">
          {blocs.map((b, i) => {
            const a = avancementBloc(b, reponses);
            const complet = a.total > 0 && a.repondues === a.total;
            const entame = a.repondues > 0 && !complet;
            return (
              <li key={b.cle}>
                <button
                  type="button"
                  onClick={() => aller(i)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`${t("relectureNative.parcours.bloc", { n: i + 1, total: blocs.length })} · ${titreBloc(b, t)}`}
                  title={titreBloc(b, t)}
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-semibold tabular-nums transition-colors",
                    complet && "border-success/30 bg-success/10 text-success-foreground",
                    entame && "border-warning/30 bg-warning/10 text-warning-foreground",
                    !complet && !entame && "bg-card text-muted-foreground",
                    i === index && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                >
                  {b.type === "envoi" ? <Send className="size-3" aria-hidden /> : complet ? <Check className="size-3" aria-hidden /> : i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card data-testid={`bloc-${bloc.cle}`}>
        <CardPanel className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className={MICRO_LABEL}>{t("relectureNative.parcours.bloc", { n: index + 1, total: blocs.length })}</p>
              <h2 className="text-lg font-semibold">{titreBloc(bloc, t)}</h2>
            </div>
            {avancement.total > 0 && (
              <Puce icone={avancement.repondues === avancement.total ? Check : undefined} ton={avancement.repondues === avancement.total ? "vert" : "neutre"}>
                {t("relectureNative.parcours.repondues", { n: avancement.repondues, total: avancement.total })}
              </Puce>
            )}
          </div>

          {bloc.type === "avant" && (
            <BlocAvant relecteurId={relecteur.id} reponse={reponses.find((r) => r.question_cle === QUESTION_INTRO.cle)} onEnregistre={onEnregistre} />
          )}
          {bloc.type === "questions" && (
            <BlocQuestions relecteurId={relecteur.id} questions={bloc.questions} reponses={reponses} onEnregistre={onEnregistre} />
          )}
          {bloc.type === "mots" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">{t("relectureNative.poster.motsAide")}</p>
              {bloc.mots.map((mot) => (
                <ChampMot
                  key={mot}
                  relecteurId={relecteur.id}
                  mot={mot}
                  reponse={reponses.find((r) => r.question_cle === cleMot(mot))}
                  onEnregistre={onEnregistre}
                />
              ))}
            </div>
          )}
          {bloc.type === "envoi" && (
            <BlocEnvoi relecteur={relecteur} blocs={blocs} reponses={reponses} onAller={aller} onAllerAuxPosts={onAllerAuxPosts} />
          )}

          {bloc.type !== "envoi" && (
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Button variant="outline" disabled={index === 0} onClick={() => aller(index - 1)}>
                <ChevronLeft />
                {t("relectureNative.parcours.precedent")}
              </Button>
              <Button onClick={() => aller(index + 1)}>
                {t("relectureNative.parcours.suivant")}
                <ChevronRight />
              </Button>
            </div>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

function titreBloc(bloc: BlocQuestionnaire, t: TFunction): string {
  switch (bloc.type) {
    case "avant":
      return t("relectureNative.parcours.avantTitre");
    case "questions":
      return bloc.titre;
    case "mots":
      return t("relectureNative.parcours.motsTitre", { titre: bloc.titre, n: bloc.morceau, total: bloc.morceaux });
    case "envoi":
      return t("relectureNative.parcours.envoiTitre");
  }
}

/** Le premier bloc : à quoi sert l'espace, les consignes, et le pays. */
function BlocAvant({
  relecteurId,
  reponse,
  onEnregistre,
}: {
  relecteurId: string;
  reponse: ReponseQuestionnaire | undefined;
  onEnregistre: (r: ReponseQuestionnaire) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <TuileIcone icone={Languages} ton="bleu" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{t("relectureNative.poster.bienvenueTitre")}</p>
          <p className="text-sm text-muted-foreground">{t("relectureNative.poster.bienvenue")}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/8 p-4 text-sm font-semibold text-violet-800 dark:text-violet-200">
        <Quote className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("relectureNative.poster.regleOr")}
      </p>
      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
        {CONSIGNES_QUESTIONNAIRE.map((c) => (
          <p key={c} className="font-medium">
            {c}
          </p>
        ))}
      </div>
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {(["etape1", "etape2", "etape3"] as const).map((e, i) => (
          <li key={e} className="flex items-start gap-2 rounded-xl border p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
            {t(`relectureNative.poster.${e}`)}
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet className="size-3.5" aria-hidden />
        {t("relectureNative.poster.paye")}
      </p>
      <div className="border-t pt-5">
        <ChampQuestion relecteurId={relecteurId} question={QUESTION_INTRO} reponse={reponse} onEnregistre={onEnregistre} />
      </div>
    </div>
  );
}

function BlocQuestions({
  relecteurId,
  questions,
  reponses,
  onEnregistre,
}: {
  relecteurId: string;
  questions: QuestionRelecteur[];
  reponses: ReponseQuestionnaire[];
  onEnregistre: (r: ReponseQuestionnaire) => void;
}) {
  const numeros = React.useMemo(() => new Map(questionsNumerotees().map((q) => [q.cle, q.numero])), []);
  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <ChampQuestion
          key={q.cle}
          relecteurId={relecteurId}
          question={q}
          numero={numeros.get(q.cle)}
          reponse={reponses.find((r) => r.question_cle === q.cle)}
          onEnregistre={onEnregistre}
        />
      ))}
    </div>
  );
}

/** Le dernier bloc : ce qui reste, et « I'm done ». */
function BlocEnvoi({
  relecteur,
  blocs,
  reponses,
  onAller,
  onAllerAuxPosts,
}: {
  relecteur: Relecteur;
  blocs: BlocQuestionnaire[];
  reponses: ReponseQuestionnaire[];
  onAller: (i: number) => void;
  onAllerAuxPosts: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const terminer = useMutation({
    mutationFn: () => terminerQuestionnaire(relecteur.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_MES_RELECTEURS }),
  });
  const termineLe = relecteur.questionnaire_termine_at;
  const p = progressionQuestionnaire(reponses);
  const incomplets = blocs
    .map((b, i) => ({ b, i, a: avancementBloc(b, reponses) }))
    .filter(({ a }) => a.total > 0 && a.repondues < a.total);

  return (
    <div className="space-y-5">
      <p className="text-sm">
        {t("relectureNative.parcours.envoiResume", { repondues: p.repondues, total: p.total })}{" "}
        <span className="text-muted-foreground">{t("relectureNative.parcours.envoiAide")}</span>
      </p>
      {incomplets.length > 0 && (
        <ul className="space-y-1.5">
          {incomplets.map(({ b, i, a }) => (
            <li key={b.cle}>
              <button
                type="button"
                onClick={() => onAller(i)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent/50"
              >
                <span>{titreBloc(b, t)}</span>
                <Puce ton="ambre">{t("relectureNative.parcours.manquent", { n: a.total - a.repondues })}</Puce>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        {termineLe || terminer.isSuccess ? (
          <>
            <span className="flex items-center gap-1.5 text-sm text-success-foreground">
              <Check className="size-4" aria-hidden />
              {termineLe
                ? t("relectureNative.poster.finiLe", { date: new Date(termineLe).toLocaleDateString(i18n.language) })
                : t("relectureNative.poster.fini")}
            </span>
            {termineLe && (
              <Button onClick={onAllerAuxPosts}>
                {t("relectureNative.parcours.allerAuxPosts")}
                <ArrowRight />
              </Button>
            )}
          </>
        ) : (
          <Button disabled={terminer.isPending} onClick={() => terminer.mutate()}>
            <Send />
            {t("relectureNative.poster.jaiFini")}
          </Button>
        )}
        {terminer.error && <span className="text-sm text-destructive">{messageErreur(terminer.error)}</span>}
      </div>
    </div>
  );
}

/** Une question ouverte : enregistrée quand on quitte le champ, si elle a changé. */
function ChampQuestion({
  relecteurId,
  question,
  numero,
  reponse,
  onEnregistre,
}: {
  relecteurId: string;
  question: QuestionRelecteur;
  numero?: number;
  reponse: ReponseQuestionnaire | undefined;
  onEnregistre: (r: ReponseQuestionnaire) => void;
}) {
  const [texte, setTexte] = React.useState(reponse?.reponse ?? "");
  const enregistrer = useMutation({
    mutationFn: (valeur: string) => enregistrerReponse(relecteurId, question.cle, valeur),
    onSuccess: (_, valeur) => onEnregistre({ question_cle: question.cle, choix: null, reponse: valeur }),
  });
  const id = `q-${question.cle}`;

  return (
    <div className="space-y-1.5" data-testid={`question-${question.cle}`}>
      <label htmlFor={id} className="block text-sm font-medium">
        {numero ? `${numero}. ` : ""}
        {question.texte}
      </label>
      {question.extrait && <p className="text-xs text-muted-foreground">📌 {question.extrait}</p>}
      <Textarea
        id={id}
        dir="auto"
        rows={2}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => {
          if (texte !== (reponse?.reponse ?? "")) enregistrer.mutate(texte);
        }}
      />
      <EtatEnregistrement pending={enregistrer.isPending} succes={enregistrer.isSuccess} erreur={enregistrer.error} />
    </div>
  );
}

/** Un mot de la Part 2 : trois choix, et le mot local quand il en faut un. */
function ChampMot({
  relecteurId,
  mot,
  reponse,
  onEnregistre,
}: {
  relecteurId: string;
  mot: string;
  reponse: ReponseQuestionnaire | undefined;
  onEnregistre: (r: ReponseQuestionnaire) => void;
}) {
  const { t } = useTranslation();
  const cle = cleMot(mot);
  const [choix, setChoix] = React.useState<ChoixMot | null>(reponse?.choix ?? null);
  const [notreMot, setNotreMot] = React.useState(reponse?.choix === "notre_mot" ? reponse.reponse : "");
  const enregistrer = useMutation({
    mutationFn: ({ c, valeur }: { c: ChoixMot; valeur: string }) => enregistrerReponse(relecteurId, cle, valeur, c),
    onSuccess: (_, { c, valeur }) => onEnregistre({ question_cle: cle, choix: c, reponse: valeur }),
  });

  const choisir = (c: ChoixMot) => {
    setChoix(c);
    enregistrer.mutate({ c, valeur: c === "notre_mot" ? notreMot : "" });
  };

  return (
    <div className="space-y-1.5" data-testid={`mot-${cle}`}>
      <p className="text-sm font-medium">{mot}</p>
      <Segments
        libelle={mot}
        actif={choix}
        onChange={choisir}
        options={CHOIX_MOT.map((c) => ({ cle: c, contenu: t(`relectureNative.choixMot.${c}`) }))}
      />
      {choix === "notre_mot" && (
        <Input
          dir="auto"
          aria-label={t("relectureNative.poster.notreMot", { mot })}
          placeholder={t("relectureNative.poster.notreMot", { mot })}
          value={notreMot}
          onChange={(e) => setNotreMot(e.target.value)}
          onBlur={() => {
            if (notreMot !== (reponse?.reponse ?? "")) enregistrer.mutate({ c: "notre_mot", valeur: notreMot });
          }}
        />
      )}
      <EtatEnregistrement pending={enregistrer.isPending} succes={enregistrer.isSuccess} erreur={enregistrer.error} />
    </div>
  );
}

function EtatEnregistrement({ pending, succes, erreur }: { pending: boolean; succes: boolean; erreur: unknown }) {
  const { t } = useTranslation();
  if (erreur) return <p className="text-xs text-destructive">{messageErreur(erreur)}</p>;
  if (pending) return <p className="text-xs text-muted-foreground">{t("relectureNative.poster.enregistrement")}</p>;
  if (succes) return <p className="text-xs text-muted-foreground">{t("relectureNative.poster.enregistre")}</p>;
  return null;
}
