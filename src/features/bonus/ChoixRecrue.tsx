import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { PosterProfil } from "@/features/moteur/types";

import { lierRecrue } from "./api";
import { recrueProbable } from "./logique";

const selectClass =
  "h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function nom(p: Pick<PosterProfil, "prenom" | "nom" | "email">): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

/**
 * Sur un parrainage accepté : le posteur recruté, pour le bonus de
 * parrainage (0374). L'OS propose celui qui porte le même nom ; l'admin relie.
 */
export function ChoixRecrue({
  referral,
  posteurs,
}: {
  referral: { id: string; prenom: string; nom: string | null; recrue_id: string | null };
  posteurs: PosterProfil[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const propose = referral.recrue_id ? null : recrueProbable(referral, posteurs);
  const [choix, setChoix] = React.useState(referral.recrue_id ?? propose?.id ?? "");
  const lier = useMutation({
    mutationFn: (id: string | null) => lierRecrue(referral.id, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-referrals"] }),
  });
  const actuelle = posteurs.find((p) => p.id === referral.recrue_id);
  const tries = [...posteurs].sort((a, b) => nom(a).localeCompare(nom(b)));

  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2" data-testid="choix-recrue">
      <p className="text-xs font-medium text-muted-foreground">
        {t("bonus.recrue.libelle")} : {actuelle ? nom(actuelle) : t("bonus.recrue.aucune")}
      </p>
      {propose && <p className="text-xs text-primary">{t("bonus.recrue.proposee", { nom: nom(propose) })}</p>}
      <div className="flex items-center gap-2">
        <select
          className={selectClass}
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label={t("bonus.recrue.libelle")}
        >
          <option value="">{t("bonus.recrue.choisir")}</option>
          {tries.map((p) => (
            <option key={p.id} value={p.id}>
              {nom(p)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={lier.isPending || !choix || choix === referral.recrue_id}
          onClick={() => lier.mutate(choix)}
        >
          {t("bonus.recrue.relier")}
        </Button>
        {referral.recrue_id && (
          <Button size="sm" variant="ghost" disabled={lier.isPending} onClick={() => lier.mutate(null)}>
            {t("bonus.recrue.delier")}
          </Button>
        )}
      </div>
      {lier.isError && <p className="text-xs text-destructive">{(lier.error as Error).message}</p>}
    </div>
  );
}
