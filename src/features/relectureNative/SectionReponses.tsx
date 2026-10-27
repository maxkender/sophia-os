import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { lireReponses, listerRelecteurs } from "./api";
import { progressionQuestionnaire, type ReponseQuestionnaire } from "./logique";
import { messageErreur } from "./messageErreur";
import { cleMot, MOTS_ANGLAIS, PARTIES_QUESTIONNAIRE, QUESTION_INTRO, questionsNumerotees } from "./questionnaire";
import { CLE_REQUETE_RELECTEURS } from "./SectionRelecteurs";

const selectClass =
  "h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Les réponses d'un relecteur, question par question, dans sa langue. */
export function SectionReponses({
  relecteurId,
  onChoisir,
}: {
  relecteurId: string | null;
  onChoisir: (relecteurId: string) => void;
}) {
  const { t } = useTranslation();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const choisi = relecteurId ?? relecteurs.data?.[0]?.id ?? null;
  const reponses = useQuery({
    queryKey: ["relecteur-reponses", choisi],
    queryFn: () => lireReponses(choisi as string),
    enabled: Boolean(choisi),
  });

  if (relecteurs.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(relecteurs.error)}
      </p>
    );
  }
  if (relecteurs.data?.length === 0) return <EmptyState title={t("relectureNative.relecteurs.vide")} />;

  const parCle = new Map((reponses.data ?? []).map((r) => [r.question_cle, r]));
  const relecteur = relecteurs.data?.find((r) => r.id === choisi);
  const numeros = new Map(questionsNumerotees().map((q) => [q.cle, q.numero]));
  const p = progressionQuestionnaire(reponses.data ?? []);

  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">{t("relectureNative.reponses.relecteur")}</span>
        <select className={selectClass} value={choisi ?? ""} onChange={(e) => onChoisir(e.target.value)}>
          {(relecteurs.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {drapeauLangue(r.langue)} {nomLangue(r.langue)} · {[r.prenom, r.nom].filter(Boolean).join(" ") || r.email}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{t("relectureNative.reponses.aide")}</p>

      {relecteur && (
        <p className="text-sm">
          {t("relectureNative.relecteurs.progression", { repondues: p.repondues, total: p.total })}
        </p>
      )}
      {reponses.error && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(reponses.error)}
        </p>
      )}

      <Card>
        <CardPanel className="space-y-1">
          <p className="text-sm font-medium">{QUESTION_INTRO.texte}</p>
          <TexteReponse r={parCle.get(QUESTION_INTRO.cle)} />
        </CardPanel>
      </Card>

      {PARTIES_QUESTIONNAIRE.map((partie) => (
        <Card key={partie.cle}>
          <CardHeader>
            <CardTitle className="text-sm">{partie.titre}</CardTitle>
            {partie.mots && <CardDescription>{t("relectureNative.reponses.motsAide")}</CardDescription>}
          </CardHeader>
          <CardPanel className="space-y-3">
            {partie.mots ? (
              <table className="w-full text-sm">
                <tbody>
                  {MOTS_ANGLAIS.map((mot) => {
                    const r = parCle.get(cleMot(mot));
                    return (
                      <tr key={mot} className="border-t">
                        <td className="py-1.5 pr-3 font-medium">{mot}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {r?.choix ? t(`relectureNative.choixMot.${r.choix}`) : "—"}
                        </td>
                        <td className="py-1.5" dir="auto">
                          {r?.choix === "notre_mot" ? r.reponse : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              partie.questions.map((q) => (
                <div key={q.cle} className="space-y-1">
                  <p className="text-sm font-medium">
                    {numeros.get(q.cle)}. {q.texte}
                  </p>
                  <TexteReponse r={parCle.get(q.cle)} />
                </div>
              ))
            )}
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function TexteReponse({ r }: { r: ReponseQuestionnaire | undefined }) {
  const { t } = useTranslation();
  if (!r?.reponse.trim()) return <p className="text-sm text-muted-foreground">{t("relectureNative.reponses.pasDeReponse")}</p>;
  return (
    <p className="whitespace-pre-wrap text-sm" dir="auto">
      {r.reponse}
    </p>
  );
}
