import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { monSlackRelie, urlConnecterSlack } from "./slackApi";

/**
 * Prompt 25 MAJ, 7a : « Connect my Slack » sur le dashboard, tant que le
 * posteur n'est pas relié. L'étape 0 n'est cochée qu'une fois relié.
 */
export function ConnecterSlack() {
  const { t } = useTranslation();
  const relie = useQuery({ queryKey: ["mon-slack"], queryFn: monSlackRelie });
  const connecter = useMutation({
    mutationFn: () => urlConnecterSlack(),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
    },
  });
  if (relie.data !== false) return null;
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
