import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  CLE_SITUATIONS,
  chercherPosteurs,
  forcerSituation,
  listerEntrees,
  type PosteurTrouve,
  type ResultatTest,
  testerQuestion,
} from "./api";
import { EditeurReponse } from "./communs";
import { libelleSituation, messageErreur, useSituations } from "./outils";

type Cible = "situation" | "posteur";

/**
 * Prompt 21, Q : l'onglet « Test », pour entraîner le bot. On choisit une
 * situation (valeurs d'exemple) ou un vrai posteur, on écrit une question :
 * la réponse exacte que le bot enverrait, la situation détectée et l'entrée
 * de FAQ utilisée. Rien n'est envoyé, rien n'est écrit (faq-admin, « tester »).
 * « Corriger » ouvre l'entrée pour ajouter ou changer la réponse de cette
 * situation.
 */
export function OngletTestFaq() {
  const { t } = useTranslation();
  const situations = useSituations();
  const actives = (situations.data ?? []).filter((s) => s.actif);
  const [cible, setCible] = React.useState<Cible>("situation");
  const [situation, setSituation] = React.useState("");
  const [posteur, setPosteur] = React.useState<PosteurTrouve | null>(null);
  const [question, setQuestion] = React.useState("");
  const [corriger, setCorriger] = React.useState(false);
  const situationChoisie = situation || actives[0]?.cle || "";

  const tester = useMutation({
    mutationFn: () =>
      testerQuestion(question, cible === "situation" ? { situation: situationChoisie } : { posterId: posteur!.id }),
    onMutate: () => setCorriger(false),
  });
  const pret = question.trim().length > 1 && (cible === "situation" ? Boolean(situationChoisie) : Boolean(posteur));
  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-4" data-testid="faq-onglet-test">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <FlaskConical className="size-4" aria-hidden />
        {t("faqSituations.test.intro")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={t("faqSituations.test.cible")}
          className={selectClass}
          value={cible}
          onChange={(e) => setCible(e.target.value as Cible)}
        >
          <option value="situation">{t("faqSituations.test.uneSituation")}</option>
          <option value="posteur">{t("faqSituations.test.unPosteur")}</option>
        </select>
        {cible === "situation" ? (
          <select
            aria-label={t("faqSituations.situation")}
            className={selectClass}
            value={situationChoisie}
            onChange={(e) => setSituation(e.target.value)}
          >
            {actives.map((s) => (
              <option key={s.cle} value={s.cle}>
                {s.libelle}
              </option>
            ))}
          </select>
        ) : (
          <ChoixPosteur posteur={posteur} onChange={setPosteur} />
        )}
      </div>
      {cible === "posteur" && posteur && <ForcerSituation posteur={posteur} />}
      <Textarea
        aria-label={t("faqSituations.test.question")}
        placeholder={t("faqSituations.test.questionPlaceholder")}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
      />
      <Button size="sm" disabled={!pret || tester.isPending} onClick={() => tester.mutate()}>
        {tester.isPending ? t("faqSituations.test.enCours") : t("faqSituations.test.tester")}
      </Button>
      {tester.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(tester.error)}
        </p>
      )}
      {tester.data && (
        <Resultat
          r={tester.data}
          question={question}
          corriger={corriger}
          onCorriger={() => setCorriger(true)}
          onFini={() => {
            setCorriger(false);
            tester.mutate();
          }}
        />
      )}
    </div>
  );
}

function Resultat({
  r,
  question,
  corriger,
  onCorriger,
  onFini,
}: {
  r: ResultatTest;
  question: string;
  corriger: boolean;
  onCorriger: () => void;
  onFini: () => void;
}) {
  const { t } = useTranslation();
  const situations = useSituations();
  const entrees = useQuery({ queryKey: [...CLE_SITUATIONS, "entrees"], queryFn: listerEntrees, enabled: corriger });
  const situation = r.situation;
  // La réponse actuelle de cette situation, pour la corriger (sinon la défaut, sinon vide).
  const existante = entrees.data
    ?.find((e) => e.id === r.entree?.id)
    ?.reponses.find((x) => x.actif && x.situation === situation)?.texte;

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="faq-test-resultat">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("faqSituations.test.situationDetectee")}</span>
        {r.situations.length ? (
          r.situations.map((s, i) => (
            <Badge key={s} variant={i === 0 ? "info" : "outline"}>
              {libelleSituation(s, situations.data)}
            </Badge>
          ))
        ) : (
          <Badge variant="outline">{t("faqSituations.test.aucuneSituation")}</Badge>
        )}
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">{t("faqSituations.test.entree")} </span>
        {r.entree ? (
          <>
            <span className="font-medium">{r.entree.question}</span>
            <span className="text-xs text-muted-foreground">
              {" · "}
              {t(`faqSituations.test.correspondance.${r.correspondance ?? "ia"}`)}
            </span>
          </>
        ) : (
          <span>{t("faqSituations.test.aucuneEntree")}</span>
        )}
      </p>

      {r.reponse ? (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            {r.reponse.situation
              ? t("faqSituations.test.reponseDe", { situation: libelleSituation(r.reponse.situation, situations.data) })
              : t("faqSituations.test.reponseDefaut")}
          </p>
          <p className="whitespace-pre-wrap" data-testid="faq-test-reponse">
            {r.reponse.texte}
          </p>
        </div>
      ) : (
        <div className="space-y-1 rounded-md bg-warning/8 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-warning-foreground">
            {r.entree ? t("faqSituations.test.rienPourSituation") : t("faqSituations.test.repliCerveau")}
          </p>
          {r.cerveau && (
            <p className="whitespace-pre-wrap">
              <Badge variant="outline">{t(`chatbot.faq.etats.${etatCerveau(r.cerveau.decision)}`, r.cerveau.decision)}</Badge>{" "}
              {r.cerveau.reponse || t("faqSituations.test.rienNePart")}
            </p>
          )}
        </div>
      )}
      {r.sautees.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {r.sautees.map((s) => (
            <li key={s.situation ?? "*"}>
              {t("faqSituations.test.sautee", {
                situation: s.situation ? libelleSituation(s.situation, situations.data) : t("faqSituations.parDefaut"),
                variables: s.manquantes.map((v) => `{${v}}`).join(", "),
              })}
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("faqSituations.test.variables")}</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {Object.entries(r.variables).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="font-mono">{`{${k}}`}</dt>
              <dd>{v || "—"}</dd>
            </React.Fragment>
          ))}
        </dl>
      </details>
      <p className="text-xs text-muted-foreground">{t("faqSituations.test.rienEnvoye")}</p>

      {corriger ? (
        entrees.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <EditeurReponse
            key={`${r.entree?.id ?? "nouvelle"}-${situation ?? "*"}`}
            entreeId={r.entree?.id ?? null}
            question={r.entree?.question ?? question.trim()}
            situation={situation}
            texteInitial={existante ?? r.reponse?.modele ?? ""}
            onFini={onFini}
          />
        )
      ) : (
        <Button size="sm" variant="outline" onClick={onCorriger}>
          <Wrench />
          {t("faqSituations.test.corriger")}
        </Button>
      )}
    </div>
  );
}

/** La décision du cerveau → l'état affiché dans le journal (mêmes libellés). */
function etatCerveau(decision: string): string {
  if (decision === "inconnu") return "a_traiter";
  if (decision === "incertain") return "a_valider";
  return decision;
}

function ChoixPosteur({ posteur, onChange }: { posteur: PosteurTrouve | null; onChange: (p: PosteurTrouve | null) => void }) {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState("");
  const [cherche, setCherche] = React.useState("");
  React.useEffect(() => {
    const id = window.setTimeout(() => setCherche(texte), 300);
    return () => window.clearTimeout(id);
  }, [texte]);
  const resultats = useQuery({
    queryKey: [...CLE_SITUATIONS, "posteurs", cherche],
    queryFn: () => chercherPosteurs(cherche),
    enabled: cherche.trim().length >= 2 && !posteur,
  });
  if (posteur) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="font-medium">{posteur.nom}</span>
        <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
          {t("faqSituations.test.changer")}
        </Button>
      </span>
    );
  }
  return (
    <div className="relative">
      <Input
        aria-label={t("faqSituations.test.chercherPosteur")}
        placeholder={t("faqSituations.test.chercherPosteur")}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        className="w-64"
      />
      {(resultats.data?.length ?? 0) > 0 && (
        <ul className="absolute z-10 mt-1 w-64 divide-y rounded-md border bg-background shadow-sm">
          {resultats.data!.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                onClick={() => onChange(p)}
              >
                {p.nom}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Forcer la situation d'un posteur : elle passe avant celle que l'OS calcule. */
function ForcerSituation({ posteur }: { posteur: PosteurTrouve }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const situations = useSituations();
  const [choix, setChoix] = React.useState("");
  const forcer = useMutation({
    mutationFn: (s: string | null) => forcerSituation(posteur.id, s),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLE_SITUATIONS }),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{t("faqSituations.test.forcer")}</span>
      <select
        aria-label={t("faqSituations.test.forcer")}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value={choix}
        onChange={(e) => setChoix(e.target.value)}
      >
        <option value="">{t("faqSituations.test.calculee")}</option>
        {(situations.data ?? [])
          .filter((s) => s.actif)
          .map((s) => (
            <option key={s.cle} value={s.cle}>
              {s.libelle}
            </option>
          ))}
      </select>
      <Button size="xs" variant="outline" disabled={forcer.isPending} onClick={() => forcer.mutate(choix || null)}>
        {t("common.save")}
      </Button>
      {forcer.isSuccess && <span className="text-success">{t("faqSituations.test.forceeOk")}</span>}
      {forcer.error && <span className="text-destructive">{messageErreur(forcer.error)}</span>}
    </div>
  );
}
