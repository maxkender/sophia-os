import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { EnteteMasquee } from "@/components/layout/enteteMasquee";
import { PageHeader } from "@/components/layout/PageHeader";

import type { PageAuto as Cle } from "./pages";

/**
 * Une page de « Recruitment Automation » : son nom et la phrase qui dit à
 * quoi elle sert (prompt 22, partie 11 : `auto.phrases.<page>`, fr et en),
 * puis la page reprise (son propre en-tête se tait). Un lien avec `#ancre`
 * (Overview → Today, Settings) descend jusqu'à la bonne carte.
 */
export function PageAuto({ cle, children }: { cle: Cle; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { hash } = useLocation();
  React.useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(id);
  }, [hash]);
  return (
    <div className="space-y-6" data-page-auto={cle}>
      <PageHeader title={t(`auto.pages.${cle}.titre`)} description={t(`auto.phrases.${cle}`)} />
      <EnteteMasquee.Provider value>{children}</EnteteMasquee.Provider>
    </div>
  );
}
