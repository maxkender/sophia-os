import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { CLE_SITUATIONS, creerEntree, ecrireReponse, VARIABLES_FAQ } from "./api";
import { libelleSituation, messageErreur, useSituations } from "./outils";

/**
 * Prompt 21, Q : les briques partagées de la FAQ par situation (la page FAQ,
 * « New questions », l'onglet Test).
 */

/** La situation d'une personne, en badge (rien si elle n'a pas été calculée). */
export function BadgeSituation({ cle }: { cle: string | null | undefined }) {
  const { t } = useTranslation();
  const situations = useSituations();
  if (!cle) return null;
  return (
    <Badge variant="info" title={t("faqSituations.situation")}>
      {libelleSituation(cle, situations.data)}
    </Badge>
  );
}

/** Les variables que l'OS remplit, en rappel sous un éditeur de réponse. */
export function AideVariables() {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-muted-foreground">
      {t("faqSituations.variablesAide")}{" "}
      {VARIABLES_FAQ.map((v) => (
        <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5 text-[11px]">{`{${v}}`}</code>
      ))}
    </p>
  );
}

/**
 * Écrire la réponse d'une situation (null : par défaut) pour une entrée. Sans
 * entrée (`entreeId` null), l'entrée est créée avec `question`.
 */
export function EditeurReponse({
  entreeId,
  question,
  situation,
  texteInitial,
  onFini,
  onAnnuler,
}: {
  entreeId: string | null;
  question: string;
  situation: string | null;
  texteInitial: string;
  onFini?: () => void;
  onAnnuler?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const situations = useSituations();
  const [texte, setTexte] = React.useState(texteInitial);
  const sauver = useMutation({
    mutationFn: async () => {
      const id = entreeId ?? (await creerEntree(question));
      await ecrireReponse(id, situation, texte);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLE_SITUATIONS });
      onFini?.();
    },
  });
  return (
    <div className="space-y-2 rounded-md border border-border/80 bg-muted/30 p-3" data-testid="faq-editeur-reponse">
      <p className="text-xs text-muted-foreground">
        {situation
          ? t("faqSituations.pourSituation", { situation: libelleSituation(situation, situations.data) })
          : t("faqSituations.pourTous")}
        {" · "}
        <span className="font-medium text-foreground">{question}</span>
      </p>
      <Textarea
        aria-label={t("faqSituations.reponse")}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={4}
      />
      <AideVariables />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={texte.trim().length < 2 || sauver.isPending} onClick={() => sauver.mutate()}>
          {sauver.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {onAnnuler && (
          <Button size="sm" variant="ghost" onClick={onAnnuler}>
            {t("common.cancel")}
          </Button>
        )}
        {sauver.error && <p className="text-xs text-destructive">{messageErreur(sauver.error)}</p>}
      </div>
    </div>
  );
}
