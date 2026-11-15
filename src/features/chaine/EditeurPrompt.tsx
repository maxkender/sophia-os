import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ecrirePrompt, lirePrompt } from "@/features/moteur/api";

/**
 * Un prompt de la table `prompts`, lu et enregistré par sa clé. Le brouillon
 * reste local tant qu'il n'est pas enregistré. `nu` : sans carte autour, pour
 * s'inscrire dans un panneau qui a déjà son titre.
 */
export function EditeurPrompt({
  cle,
  titre,
  desc,
  rows = 14,
  nu = false,
  onEnregistre,
}: {
  cle: string;
  titre?: React.ReactNode;
  desc?: React.ReactNode;
  rows?: number;
  nu?: boolean;
  onEnregistre?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["prompt", cle], queryFn: () => lirePrompt(cle) });

  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const valeur = brouillon ?? data ?? "";
  const modifie = brouillon !== null && brouillon !== (data ?? "");

  const enregistrer = useMutation({
    mutationFn: () => ecrirePrompt(cle, valeur),
    onSuccess: () => {
      setBrouillon(null);
      void queryClient.invalidateQueries({ queryKey: ["prompt", cle] });
      void queryClient.invalidateQueries({ queryKey: ["prompts-meta"] });
      onEnregistre?.();
    },
  });

  const corps = isPending ? (
    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
  ) : (
    <>
      <Textarea
        rows={rows}
        className="font-mono text-xs"
        aria-label={typeof titre === "string" ? titre : cle}
        value={valeur}
        onChange={(e) => setBrouillon(e.target.value)}
        data-testid={`prompt-${cle}`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {modifie && (
          <Button variant="ghost" size="sm" onClick={() => setBrouillon(null)}>
            {t("chaine.annuler")}
          </Button>
        )}
        {enregistrer.isSuccess && !modifie && <span className="text-sm text-success">{t("prompts.saved")}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground">{t("chaine.caracteres", { n: valeur.length })}</span>
      </div>
      {enregistrer.isError && <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>}
    </>
  );

  if (nu) return <div className="space-y-3">{corps}</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{corps}</CardContent>
    </Card>
  );
}
