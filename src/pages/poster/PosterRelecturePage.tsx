import * as React from "react";
import { useTranslation } from "react-i18next";
import { Clock, Languages, Quote, Wallet } from "lucide-react";

import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { Segments } from "@/components/ui/segments";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { messageErreur } from "@/features/relectureNative/messageErreur";
import { TuileIcone } from "@/features/relectureNative/Puces";
import { useEspaceRelecteur } from "@/features/relectureNative/useEspaceRelecteur";

/**
 * « Native review » : l'espace du relecteur natif, visible seulement si
 * l'admin l'a désigné ET a ouvert l'espace. Le relecteur y corrigera les posts
 * publiés dans sa langue ; d'ici là, l'espace dit ce qui l'attend.
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

      <Card>
        <CardPanel className="space-y-5">
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
          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm" data-testid="relecture-bientot">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">
                {t("relectureNative.poster.bientotTitre", {
                  langue: `${drapeauLangue(relecteur.langue)} ${nomLangue(relecteur.langue)}`,
                })}
              </p>
              <p className="text-muted-foreground">{t("relectureNative.poster.bientot")}</p>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="size-3.5" aria-hidden />
            {t("relectureNative.poster.paye")}
          </p>
        </CardPanel>
      </Card>
    </div>
  );
}
