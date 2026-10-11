import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { consignesDeMesPosts, type ConsignesPost } from "@/features/moteur/api";

/**
 * Consignes d'un ou plusieurs posts du posteur (0275) : « deuxième téléphone »
 * et lien d'exemple. Lues en une requête pour tous les ids reçus.
 */
export function useConsignesPosts(postIds: string[]) {
  const cle = [...postIds].sort().join(",");
  return useQuery({
    queryKey: ["consignes-posts", cle],
    queryFn: () => consignesDeMesPosts(postIds),
    enabled: postIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** Petit badge pour une carte de calendrier. */
export function BadgeDeuxiemeTelephone({ consigne }: { consigne?: ConsignesPost | null }) {
  const { t } = useTranslation();
  if (!consigne?.deuxieme_telephone) return null;
  return (
    <Badge variant="warning" className="gap-1">
      <Smartphone className="size-3" />
      {t("consignes.badge2tel")}
    </Badge>
  );
}

/** Bloc complet sur la page d'un post : encart 2e téléphone + bouton exemple. */
export function BlocConsignes({ consigne }: { consigne?: ConsignesPost | null }) {
  const { t } = useTranslation();
  if (!consigne || (!consigne.deuxieme_telephone && !consigne.exemple_url)) return null;
  return (
    <div className="space-y-3 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4">
      {consigne.deuxieme_telephone && (
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="space-y-1">
            <p className="text-base font-semibold">{t("consignes.deuxTelTitre")}</p>
            <p className="text-sm text-muted-foreground">{t("consignes.deuxTelCorps")}</p>
          </div>
        </div>
      )}
      {consigne.exemple_url && (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={consigne.exemple_url} target="_blank" rel="noreferrer">
            <ExternalLink />
            {t("consignes.voirExemple")}
          </a>
        </Button>
      )}
    </div>
  );
}
