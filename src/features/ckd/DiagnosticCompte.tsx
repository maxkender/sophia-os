import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import { lignesDiagnostic, type BadgeDiagnostic, type DiagnosticCkd } from "./diagnostic";

const VARIANTE: Record<BadgeDiagnostic, "success" | "warning" | "error" | "info"> = {
  ok: "success",
  posts_manquants: "warning",
  vues_basses: "info",
  shadowban: "error",
};

/** Badge seul (OK / Posts manquants / Vues basses / Shadowban). */
export function BadgeDiagnosticCompte({ badge }: { badge: BadgeDiagnostic }) {
  const { t } = useTranslation();
  return <Badge variant={VARIANTE[badge]}>{t(`ckd.diagnostic.badges.${badge}`)}</Badge>;
}

/** Le diagnostic en 3 lignes, en haut, avant le détail (0362). */
export function DiagnosticCompte({ diagnostic }: { diagnostic: DiagnosticCkd | null | undefined }) {
  const { t, i18n } = useTranslation();
  if (!diagnostic) return null;
  const l = lignesDiagnostic(diagnostic, t, i18n.resolvedLanguage ?? "fr");
  return (
    <div className="space-y-0.5 rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="diagnostic-compte">
      <div className="flex flex-wrap items-center gap-2">
        <BadgeDiagnosticCompte badge={l.badge} />
        <span>{l.posts}</span>
      </div>
      <p>{l.vues}</p>
      <p className="font-medium">{l.verdict}</p>
    </div>
  );
}
