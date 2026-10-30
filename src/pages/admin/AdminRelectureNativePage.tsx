import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BookOpenText, Languages, Library, Users, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Segments } from "@/components/ui/segments";
import { CarteInterrupteurs } from "@/features/relectureNative/CarteInterrupteurs";
import { ChiffresRelecture } from "@/features/relectureNative/ChiffresRelecture";
import { SectionExemplesNatifs } from "@/features/relectureNative/SectionExemplesNatifs";
import { SectionRelecteurs } from "@/features/relectureNative/SectionRelecteurs";

type Onglet = "relecteurs" | "exemples";

const ONGLETS: ReadonlyArray<{ cle: Onglet; icone: LucideIcon }> = [
  { cle: "relecteurs", icone: Users },
  { cle: "exemples", icone: BookOpenText },
];

/**
 * Relecture native : les relecteurs (qui corrigeront les posts publiés) et la
 * banque d'exemples natifs par langue. Les fiches (CTA, applis, langues,
 * labels) ont leur page, /admin/fiches. La production reste coupée.
 */
export function AdminRelectureNativePage() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = React.useState<Onglet>("relecteurs");

  return (
    <div className="space-y-6" data-testid="page-relecture-native">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Languages className="size-6 text-muted-foreground" aria-hidden />
            {t("relectureNative.titre")}
          </span>
        }
        description={t("relectureNative.description")}
        actions={
          <Button size="sm" variant="outline" render={<Link to="/admin/fiches" />}>
            <Library />
            {t("relectureNative.voirFiches")}
          </Button>
        }
      />

      <ChiffresRelecture />
      <CarteInterrupteurs />

      <Segments<Onglet>
        libelle={t("relectureNative.titre")}
        actif={onglet}
        onChange={setOnglet}
        options={ONGLETS.map(({ cle, icone: Icone }) => ({
          cle,
          contenu: (
            <>
              <Icone className="size-3.5" aria-hidden />
              {t(`relectureNative.onglets.${cle}`)}
            </>
          ),
        }))}
      />

      {onglet === "relecteurs" && <SectionRelecteurs />}
      {onglet === "exemples" && <SectionExemplesNatifs />}
    </div>
  );
}
