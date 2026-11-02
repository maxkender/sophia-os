import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Probleme } from "./problemes";
import { useProblemes } from "./useProblemes";

const P = "auto.problemes";

function CarteProbleme({ p }: { p: Probleme }) {
  const { t, i18n } = useTranslation();
  const depuis = p.depuis
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(p.depuis))
    : null;
  return (
    <Card className={p.gravite === "grave" ? "border-l-4 border-l-destructive" : "border-l-4 border-l-warning"} data-probleme={p.cle}>
      <CardContent className="space-y-1.5 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={p.gravite === "grave" ? "error" : "warning"}>{t(`${P}.gravites.${p.gravite}`)}</Badge>
          <span className="font-medium">{t(`${P}.types.${p.type}.titre`, p.params)}</span>
          {depuis && <span className="text-xs text-muted-foreground">{t(`${P}.depuis`, { date: depuis })}</span>}
        </div>
        <p className="text-xs">
          <span className="font-medium">{t(`${P}.debug`)} </span>
          {t(`${P}.types.${p.type}.proposition`, p.params)}
        </p>
        {p.lien && (
          <Button size="xs" variant="outline" asChild>
            <Link to={p.lien}>{t(`${P}.ouvrir`)}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recruitment Automation → Problems : seulement ce qui est grave (les messages
 * ne partent plus, trop d'appels à l'API, une connexion ou une tâche en panne,
 * l'automatisation en pause), avec une piste de débogage pour chacun.
 */
export function PageProblemes() {
  const { t } = useTranslation();
  const { problemes, charge, erreur } = useProblemes();
  return (
    <div className="space-y-3" data-testid="page-problemes">
      {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
      {charge && problemes.length === 0 && <p className="text-sm text-muted-foreground" data-testid="aucun-probleme">{t(`${P}.aucun`)}</p>}
      {problemes.map((p) => (
        <CarteProbleme key={p.cle} p={p} />
      ))}
    </div>
  );
}
