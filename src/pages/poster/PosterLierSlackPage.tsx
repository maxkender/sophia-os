import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { finirConnexionSlack, lierParJeton } from "@/features/onboarding/slackApi";

/**
 * Prompt 25 MAJ, 7a : relier son Slack. Deux entrées : le lien personnel du
 * DM du bot (`?t=…`), ou le retour de « Sign in with Slack » (`?code=…&state=…`).
 */
export function PosterLierSlackPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [etat, setEtat] = React.useState<{ ok: boolean; error?: string } | null>(null);
  const fait = React.useRef(false);

  React.useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    const jeton = params.get("t");
    const code = params.get("code");
    const travail = jeton
      ? lierParJeton(jeton)
      : code
        ? finirConnexionSlack(code, params.get("state") ?? "")
        : Promise.resolve({ ok: false, error: params.get("error") ?? "parametres" });
    travail
      .then((r) => {
        setEtat(r);
        if (r.ok) void qc.invalidateQueries({ queryKey: ["mon-slack"] });
      })
      .catch((e: unknown) => setEtat({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  }, [params, qc]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-3 p-6 text-sm" data-testid="lier-slack">
        {!etat && <p>{t("slackLier.enCours")}</p>}
        {etat?.ok && <p className="font-medium text-success" role="status">{t("slackLier.ok")}</p>}
        {etat && !etat.ok && (
          <p className="text-warning" role="status">
            {t(`slackLier.erreurs.${etat.error ?? "autre"}`, { defaultValue: t("slackLier.erreurs.autre") })}
          </p>
        )}
        <Link to="/calendrier" className="text-primary underline underline-offset-2">{t("slackLier.retour")}</Link>
      </CardContent>
    </Card>
  );
}
