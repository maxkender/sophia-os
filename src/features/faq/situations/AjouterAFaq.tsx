import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ListPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { CLE_SITUATIONS, listerEntrees } from "./api";
import { EditeurReponse } from "./communs";
import { libelleSituation, useSituations } from "./outils";

/**
 * Prompt 21, Q : « Add to FAQ » depuis « New questions ». La question de la
 * personne devient une entrée de la FAQ par situation (ou une réponse d'une
 * entrée qui existe), pour sa situation seulement ou pour tout le monde
 * (réponse par défaut).
 */
export function AjouterAFaqSituation({
  question,
  situation,
  entreeId,
  reponse,
}: {
  question: string;
  /** La situation de la personne quand elle a écrit (null : pas calculée). */
  situation: string | null;
  /** L'entrée que le bot a reconnue, s'il en a reconnu une. */
  entreeId?: string | null;
  /** Une réponse de départ (celle de l'équipe, ou celle du bot). */
  reponse?: string | null;
}) {
  const { t } = useTranslation();
  const situations = useSituations();
  const [ouvert, setOuvert] = React.useState(false);
  const [fait, setFait] = React.useState(false);
  const [pourTous, setPourTous] = React.useState(!situation);
  const [entree, setEntree] = React.useState<string>(entreeId ?? "");
  const entrees = useQuery({ queryKey: [...CLE_SITUATIONS, "entrees"], queryFn: listerEntrees, enabled: ouvert });

  if (fait) return <p className="text-xs text-success">{t("faqSituations.ajoutee")}</p>;
  if (!ouvert) {
    return (
      <Button size="xs" variant="outline" onClick={() => setOuvert(true)}>
        <ListPlus />
        {t("faqSituations.ajouterAFaq")}
      </Button>
    );
  }
  const choisie = (entrees.data ?? []).find((e) => e.id === entree) ?? null;
  const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
  return (
    <div className="space-y-2" data-testid="faq-ajouter-situation">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label={t("faqSituations.entreeCible")}
          className={selectClass}
          value={entree}
          onChange={(e) => setEntree(e.target.value)}
        >
          <option value="">{t("faqSituations.nouvelleEntree")}</option>
          {(entrees.data ?? [])
            .filter((e) => e.actif)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.question}
              </option>
            ))}
        </select>
        {situation && (
          <>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!pourTous} onChange={() => setPourTous(false)} />
              {t("faqSituations.seulementSituation", { situation: libelleSituation(situation, situations.data) })}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={pourTous} onChange={() => setPourTous(true)} />
              {t("faqSituations.pourTousCourt")}
            </label>
          </>
        )}
      </div>
      <EditeurReponse
        key={`${entree}-${pourTous}`}
        entreeId={entree || null}
        question={choisie?.question ?? question.replace(/\s+/g, " ").trim().slice(0, 300)}
        situation={pourTous ? null : situation}
        texteInitial={reponse ?? ""}
        onFini={() => setFait(true)}
        onAnnuler={() => setOuvert(false)}
      />
    </div>
  );
}
