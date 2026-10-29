import type * as React from "react";
import { useTranslation } from "react-i18next";

import { EnteteMasquee } from "@/components/layout/enteteMasquee";
import { PageHeader } from "@/components/layout/PageHeader";

import type { PageAuto as Cle } from "./pages";

/**
 * Une page de « Recruitment Automation » : son nom et la phrase qui dit à
 * quoi elle sert, puis la page reprise (son propre en-tête se tait).
 */
export function PageAuto({ cle, children }: { cle: Cle; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6" data-page-auto={cle}>
      <PageHeader title={t(`auto.pages.${cle}.titre`)} description={t(`auto.pages.${cle}.phrase`)} />
      <EnteteMasquee.Provider value>{children}</EnteteMasquee.Provider>
    </div>
  );
}
