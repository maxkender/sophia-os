import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { compterContestations } from "@/features/disputes/api";

import { CATEGORIES, lireNeedsYou } from "./api";
import { parCategorie, trier } from "./logique";

/**
 * Prompt 21, U6 : le haut d'Overview. Les compteurs de « Needs you » et les
 * 10 cas les plus urgents (ce qui bloque lundi ou la paie d'abord).
 */
export function ResumeNeedsYou() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["needs-you", "liste"], queryFn: lireNeedsYou, refetchInterval: 60_000 });
  const tous = lu.data ?? [];
  const compte = parCategorie(tous);
  const urgents = tous.filter((c) => c.urgence !== "rien").length;
  // Prompt 21, R : les contestations ouvertes (page Disputes).
  const disputes = useQuery({ queryKey: ["disputes", "compte"], queryFn: compterContestations, refetchInterval: 60_000 });
  return (
    <Card data-testid="resume-needs-you" className={urgents > 0 ? "border-warning/60" : undefined}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("needsYou.resume.titre", { n: tous.length, urgents })}</CardTitle>
        <Button size="sm" asChild>
          <Link to="/admin/auto/needs-you">{t("needsYou.resume.ouvrir")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Badge key={c} variant="secondary">{t(`needsYou.cat.${c}`)} : {compte[c]}</Badge>
          ))}
          {disputes.data && (
            <Link to="/admin/auto/disputes" data-testid="resume-disputes">
              <Badge variant={disputes.data.plus_24h > 0 ? "error" : "secondary"}>
                {t("disputes.resume", { n: disputes.data.ouvertes })}
                {disputes.data.plus_24h > 0 && ` · ${t("disputes.resumeRetard", { n: disputes.data.plus_24h })}`}
              </Badge>
            </Link>
          )}
        </div>
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        <ul className="divide-y">
          {trier(tous).slice(0, 10).map((c) => (
            <li key={c.cle} className="flex flex-wrap items-center gap-2 py-1.5">
              <Badge variant={c.urgence === "rien" ? "secondary" : "warning"}>{t(`needsYou.urgence.${c.urgence}`)}</Badge>
              <span className="font-medium">{c.nom ?? t("needsYou.inconnu")}</span>
              <span className="text-muted-foreground">{t(`needsYou.types.${c.type}`, { defaultValue: c.type })}</span>
              {/* Prompt 22, partie 3 : « Fix » mène là où le cas se règle (Needs you, filtré sur son type). */}
              <Button size="sm" variant="outline" className="ml-auto h-7" asChild>
                <Link to={`/admin/auto/needs-you?type=${encodeURIComponent(c.type)}`} data-fix={c.cle}>
                  {t("needsYou.resume.fix")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
