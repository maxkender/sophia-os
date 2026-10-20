import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ecrirePrompt, lirePrompt } from "@/features/moteur/api";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { drapeauPays } from "@/features/moteur/pays";
import {
  CLE_PROMPT_COMMENT_MASTER,
  lireConfigCommentMasters,
  testerPromptCommentaires,
  VARIABLES_PROMPT,
} from "./api";

function vuesCourtes(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

/**
 * Le prompt des commentaires envoyés aux comment masters, avec un essai à
 * blanc : « Tester » génère les commentaires de vrais posts au-dessus du seuil
 * de leur pays (régions actives, ou une langue choisie, même pas encore
 * ouverte) avec le texte de la zone, enregistré ou non, sans rien envoyer sur
 * Slack.
 */
export function PromptCommentMasterCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cle = CLE_PROMPT_COMMENT_MASTER;
  const { data, isPending } = useQuery({ queryKey: ["prompt", cle], queryFn: () => lirePrompt(cle) });

  const config = useQuery({ queryKey: ["comment-masters", "config"], queryFn: lireConfigCommentMasters });
  const [langueTest, setLangueTest] = React.useState("");
  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const valeur = brouillon ?? data ?? "";
  const modifie = brouillon !== null && brouillon !== (data ?? "");

  const enregistrer = useMutation({
    mutationFn: () => ecrirePrompt(cle, valeur),
    onSuccess: () => {
      setBrouillon(null);
      queryClient.invalidateQueries({ queryKey: ["prompt", cle] });
    },
  });
  const tester = useMutation({ mutationFn: () => testerPromptCommentaires(valeur, langueTest || null) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("prompts.commentMaster.titre")}</CardTitle>
        <CardDescription>{t("prompts.commentMaster.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("prompts.commentMaster.variables")}{" "}
          {VARIABLES_PROMPT.map((v) => (
            <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5">{`{{${v}}}`}</code>
          ))}
        </p>
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            <Textarea
              rows={18}
              className="font-mono text-xs"
              value={valeur}
              onChange={(e) => setBrouillon(e.target.value)}
              placeholder={t("prompts.commentMaster.vide")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label={t("prompts.commentMaster.testerLangue")}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                value={langueTest}
                onChange={(e) => setLangueTest(e.target.value)}
              >
                <option value="">{t("prompts.commentMaster.testerActives")}</option>
                {(config.data?.regions ?? [])
                  .map((r) => r.langue)
                  .sort((a, b) => nomLangue(a).localeCompare(nomLangue(b)))
                  .map((l) => (
                    <option key={l} value={l}>
                      {drapeauLangue(l)} {nomLangue(l)}
                    </option>
                  ))}
              </select>
              <Button variant="outline" disabled={tester.isPending} onClick={() => tester.mutate()}>
                {tester.isPending ? t("prompts.commentMaster.enCours") : t("prompts.commentMaster.tester")}
              </Button>
              <Button disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                {enregistrer.isPending ? t("common.saving") : t("common.save")}
              </Button>
              {enregistrer.isSuccess && !modifie && (
                <span className="text-sm text-success">{t("prompts.saved")}</span>
              )}
              {modifie && <span className="text-xs text-muted-foreground">{t("prompts.commentMaster.nonEnregistre")}</span>}
            </div>
            {enregistrer.isError && (
              <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>
            )}
            {tester.isError && <p className="text-sm text-destructive">{(tester.error as Error).message}</p>}
            {tester.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("prompts.commentMaster.aucunPost")}</p>
            )}
            {tester.data && tester.data.length > 0 && (
              <ul className="space-y-2">
                {tester.data.map((a) => (
                  <li key={a.lien} className="rounded-lg border p-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {drapeauPays(a.pays) || drapeauLangue(a.langue)} {a.handle ? `@${a.handle}` : ""} · {a.appli} ·{" "}
                      {t("prompts.commentMaster.vues", { vues: vuesCourtes(a.vues) })} ·{" "}
                      <a href={a.lien} target="_blank" rel="noreferrer" className="underline">
                        TikTok
                      </a>
                    </p>
                    {a.accroche && <p className="mt-1 text-xs italic text-muted-foreground">{a.accroche}</p>}
                    <p className="mt-2 font-medium">{a.commentaire}</p>
                    {a.traduction && <p className="text-xs text-muted-foreground">🇬🇧 {a.traduction}</p>}
                    {a.problemes.length > 0 && (
                      <p className="mt-1 text-xs text-destructive">{a.problemes.join(" · ")}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
