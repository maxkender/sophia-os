import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";

import { ANCIENNES_PAGES, cheminAuto } from "./pages";

/**
 * 12/11 (OS clair) : « Réglages ». Les interrupteurs (Vue d'ensemble) et toutes les pages
 * sorties du menu, rangées ici avec leur phrase : rien n'est supprimé, les adresses restent.
 */
export function PageReglagesAuto() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const extras = role === "admin"
    ? [
      { to: "/admin/auto/regles-bots", titre: "Règles des bots (ancienne)", phrase: "Les règles des bots de la page Problèmes." },
      { to: "/admin/auto/problemes-v2", titre: "Problèmes v2 (aperçu)", phrase: "L'aperçu de la page Problèmes en français." },
    ]
    : [];
  const pages = [
    ...ANCIENNES_PAGES.map((c) => ({ to: cheminAuto(c), titre: t(`auto.pages.${c}.titre`), phrase: t(`auto.phrases.${c}`) })),
    ...extras,
  ];
  return (
    <div className="space-y-3" data-testid="page-reglages-auto">
      <h2 className="text-sm font-semibold text-muted-foreground">Pages rangées ici (adresses et données gardées)</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {pages.map((p) => (
          <Link key={p.to} to={p.to} className="block" data-testid="page-rangee">
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="space-y-1 p-4">
                <p className="font-medium">{p.titre}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{p.phrase}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
