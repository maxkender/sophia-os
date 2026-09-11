import { useTranslation } from "react-i18next";

import { cibleComptePapier } from "@/features/moteur/papierCmCompte";

/** Handle Instagram + Gmail générés depuis la langue (Schedule A). */
export function ApercuIdentitePapier({ langue }: { langue: string }) {
  const { t } = useTranslation();
  const cible = cibleComptePapier(langue);
  if (!langue) return null;
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("papierContrat.instagram")}
          </p>
          <p className="font-mono text-sm">@{cible.instagram}</p>
        </div>
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("papierContrat.gmail")}
          </p>
          <p className="truncate font-mono text-sm">{cible.email}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("cm.identiteAutoAide")}</p>
    </div>
  );
}
