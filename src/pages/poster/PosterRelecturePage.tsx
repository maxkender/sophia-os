import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { enregistrerReponse, lireReponses, terminerQuestionnaire, type Relecteur } from "@/features/relectureNative/api";
import {
  CHOIX_MOT,
  progressionQuestionnaire,
  type ChoixMot,
  type ReponseQuestionnaire,
} from "@/features/relectureNative/logique";
import { messageErreur } from "@/features/relectureNative/messageErreur";
import {
  cleMot,
  CONSIGNES_QUESTIONNAIRE,
  MOTS_ANGLAIS,
  PARTIES_QUESTIONNAIRE,
  QUESTION_INTRO,
  questionsNumerotees,
  type QuestionRelecteur,
} from "@/features/relectureNative/questionnaire";
import { SectionKitRelecteur } from "@/features/relectureNative/SectionKitRelecteur";
import { CLE_REQUETE_MES_RELECTEURS, useEspaceRelecteur } from "@/features/relectureNative/useEspaceRelecteur";

/**
 * « Native review » : l'espace du relecteur natif, visible seulement si
 * l'admin l'a désigné ET a ouvert l'espace. D'abord le questionnaire « Your
 * country, part by part », enregistré au fil de l'eau ; une fois envoyé, le
 * kit natif (les posts à écrire de A à Z).
 */
export function PosterRelecturePage() {
  const { t } = useTranslation();
  const espace = useEspaceRelecteur();
  const [langue, setLangue] = React.useState<string | null>(null);

  if (espace.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (espace.error) return <p className="text-sm text-destructive">{messageErreur(espace.error)}</p>;
  if (espace.relecteurs.length === 0) return <EmptyState title={t("relectureNative.poster.pasOuvert")} />;

  const relecteur = espace.relecteurs.find((r) => r.langue === langue) ?? espace.relecteurs[0];
  const questionnaireFini = Boolean(relecteur.questionnaire_termine_at);

  return (
    <div className="space-y-6" data-testid="page-relecture-poster">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-primary" />
            {t("relectureNative.poster.bienvenueTitre")}
          </CardTitle>
          <CardDescription>{t("relectureNative.poster.bienvenue")}</CardDescription>
        </CardHeader>
        <CardPanel className="space-y-3 text-sm">
          <p className="font-medium">{t("relectureNative.poster.regleOr")}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li className={questionnaireFini ? "text-muted-foreground" : undefined}>
              {t("relectureNative.poster.etape1")}{" "}
              {questionnaireFini ? (
                <Badge variant="success">{t("relectureNative.poster.fait")}</Badge>
              ) : (
                <Badge variant="info">{t("relectureNative.poster.maintenant")}</Badge>
              )}
            </li>
            <li className={questionnaireFini ? undefined : "text-muted-foreground"}>
              {t("relectureNative.poster.etape2")}{" "}
              {questionnaireFini ? (
                <Badge variant="info">{t("relectureNative.poster.maintenant")}</Badge>
              ) : (
                <Badge variant="secondary">{t("relectureNative.poster.apresEtape1")}</Badge>
              )}
            </li>
            <li className="text-muted-foreground">
              {t("relectureNative.poster.etape3")} <Badge variant="secondary">{t("relectureNative.poster.bientot")}</Badge>
            </li>
          </ol>
          <p className="text-muted-foreground">{t("relectureNative.poster.paye")}</p>
        </CardPanel>
      </Card>

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

type PartieEspace = "questionnaire" | "kit";

/** Le questionnaire, puis le kit une fois le questionnaire envoyé. */
function EspaceRelecteur({ relecteur }: { relecteur: Relecteur }) {
  const { t } = useTranslation();
  const questionnaireFini = Boolean(relecteur.questionnaire_termine_at);
  const [partie, setPartie] = React.useState<PartieEspace>(questionnaireFini ? "kit" : "questionnaire");

  if (!questionnaireFini) return <Questionnaire relecteur={relecteur} />;
  return (
    <div className="space-y-4">
      <Segments<PartieEspace>
        libelle={t("relectureNative.poster.parties")}
        actif={partie}
        onChange={setPartie}
        options={[
          { cle: "questionnaire", contenu: t("relectureNative.poster.partieQuestionnaire") },
          { cle: "kit", contenu: t("relectureNative.poster.partieKit") },
        ]}
      />
      {partie === "questionnaire" ? <Questionnaire relecteur={relecteur} /> : <SectionKitRelecteur relecteur={relecteur} />}
    </div>
  );
}

function Questionnaire({ relecteur }: { relecteur: Relecteur }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const cle = ["relecteur-mes-reponses", relecteur.id] as const;
  const reponses = useQuery({ queryKey: cle, queryFn: () => lireReponses(relecteur.id) });
  const parCle = React.useMemo(
    () => new Map((reponses.data ?? []).map((r) => [r.question_cle, r])),
    [reponses.data],
  );
  const numeros = React.useMemo(() => new Map(questionsNumerotees().map((q) => [q.cle, q.numero])), []);
  const progression = progressionQuestionnaire(reponses.data ?? []);

  // Une réponse enregistrée met le cache à jour : l'avancement suit sans recharger.
  const memoriser = (r: ReponseQuestionnaire) =>
    queryClient.setQueryData<ReponseQuestionnaire[]>(cle, (avant = []) => [
      ...avant.filter((x) => x.question_cle !== r.question_cle),
      r,
    ]);

  const terminer = useMutation({
    mutationFn: () => terminerQuestionnaire(relecteur.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_MES_RELECTEURS }),
  });
  const termineLe = relecteur.questionnaire_termine_at;

  if (reponses.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (reponses.error) return <p className="text-sm text-destructive">{messageErreur(reponses.error)}</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("relectureNative.poster.questionnaireTitre")}</CardTitle>
          <CardDescription>{t("relectureNative.poster.questionnaireAide")}</CardDescription>
        </CardHeader>
        <CardPanel className="space-y-3">
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            {CONSIGNES_QUESTIONNAIRE.map((c) => (
              <p key={c} className="font-medium">
                {c}
              </p>
            ))}
          </div>
          <div className="space-y-1">
            <Progress value={(progression.repondues / progression.total) * 100} />
            <p className="text-xs text-muted-foreground">
              {t("relectureNative.poster.progression", { repondues: progression.repondues, total: progression.total })}
            </p>
          </div>
        </CardPanel>
      </Card>

      <Card>
        <CardPanel>
          <ChampQuestion
            relecteurId={relecteur.id}
            question={QUESTION_INTRO}
            reponse={parCle.get(QUESTION_INTRO.cle)}
            onEnregistre={memoriser}
          />
        </CardPanel>
      </Card>

      {PARTIES_QUESTIONNAIRE.map((partie) => (
        <Card key={partie.cle}>
          <CardHeader>
            <CardTitle className="text-sm">{partie.titre}</CardTitle>
            {partie.mots && <CardDescription>{t("relectureNative.poster.motsAide")}</CardDescription>}
          </CardHeader>
          <CardPanel className="space-y-5">
            {partie.mots
              ? MOTS_ANGLAIS.map((mot) => (
                  <ChampMot
                    key={mot}
                    relecteurId={relecteur.id}
                    mot={mot}
                    reponse={parCle.get(cleMot(mot))}
                    onEnregistre={memoriser}
                  />
                ))
              : partie.questions.map((q) => (
                  <ChampQuestion
                    key={q.cle}
                    relecteurId={relecteur.id}
                    question={q}
                    numero={numeros.get(q.cle)}
                    reponse={parCle.get(q.cle)}
                    onEnregistre={memoriser}
                  />
                ))}
          </CardPanel>
        </Card>
      ))}

      <Card>
        <CardPanel className="flex flex-wrap items-center gap-3">
          <Button disabled={terminer.isPending} onClick={() => terminer.mutate()}>
            {t("relectureNative.poster.jaiFini")}
          </Button>
          {(termineLe || terminer.isSuccess) && (
            <span className="text-sm text-muted-foreground">
              {termineLe
                ? t("relectureNative.poster.finiLe", { date: new Date(termineLe).toLocaleDateString(i18n.language) })
                : t("relectureNative.poster.fini")}
            </span>
          )}
          {terminer.error && <span className="text-sm text-destructive">{messageErreur(terminer.error)}</span>}
        </CardPanel>
      </Card>
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
