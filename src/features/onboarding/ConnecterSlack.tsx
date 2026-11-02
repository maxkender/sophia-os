import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { BoutonDeclarer } from "./BoutonDeclarer";
import { lienDmSlackActif, monSlackRelie, urlConnecterSlack } from "./slackApi";

/**
 * Prompt 25 MAJ, 7a : relier son Slack, tant que le posteur ne l'est pas.
 * « Connect my Slack » (et le lien du DM) seulement quand slack_lien_dm_auto
 * est sur on ; sinon (aucun DM ne part) : rejoindre avec son nom complet et
 * son email perso, l'OS relie tout seul, et « I've joined » relance la vérification.
 * `masquer` : les 5 étapes sont affichées (leur étape 2 dit déjà tout).
 */
export function ConnecterSlack({ masquer = false }: { masquer?: boolean }) {
  const { t } = useTranslation();
  const relie = useQuery({ queryKey: ["mon-slack"], queryFn: monSlackRelie });
  const dmActif = useQuery({ queryKey: ["slack-lien-dm-auto"], queryFn: lienDmSlackActif, staleTime: 10 * 60_000 });
  const connecter = useMutation({
    mutationFn: () => urlConnecterSlack(),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
    },
  });
  if (masquer || relie.data !== false || dmActif.data === undefined) return null;
  if (!dmActif.data) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm" data-testid="connecter-slack">
        <span>{t("calendrier.cinq.slackPasVu")}</span>
        <BoutonDeclarer etape="slack" libelle={t("calendrier.cinq.declarer.slack")} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm" data-testid="connecter-slack">
      <span>{t("slackLier.aide")}</span>
      <Button size="sm" variant="outline" loading={connecter.isPending} onClick={() => connecter.mutate()}>
        {t("slackLier.bouton")}
      </Button>
      {connecter.data === null && <span className="text-xs text-muted-foreground">{t("slackLier.indisponible")}</span>}
      {connecter.isError && <span className="text-xs text-destructive">{(connecter.error as Error).message}</span>}
    </div>
  );
}
