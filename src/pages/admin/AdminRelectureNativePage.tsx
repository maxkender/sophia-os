import * as React from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, FileText, Languages, Users, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Segments } from "@/components/ui/segments";
import { CarteInterrupteurs } from "@/features/relectureNative/CarteInterrupteurs";
import { ChiffresRelecture } from "@/features/relectureNative/ChiffresRelecture";
import { SectionExemplesNatifs } from "@/features/relectureNative/SectionExemplesNatifs";
import { SectionFichesAppli } from "@/features/relectureNative/SectionFichesAppli";
import { SectionRelecteurs } from "@/features/relectureNative/SectionRelecteurs";

type Onglet = "relecteurs" | "exemples" | "fiches";

const ONGLETS: ReadonlyArray<{ cle: Onglet; icone: LucideIcon }> = [
  { cle: "relecteurs", icone: Users },
  { cle: "exemples", icone: BookOpenText },
  { cle: "fiches", icone: FileText },
];

/**
 * Relecture native : les relecteurs (qui corrigeront les posts publiés), la
 * banque d'exemples natifs par langue et les fiches des applications. La
 * production reste coupée.
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
      {onglet === "fiches" && <SectionFichesAppli />}
    </div>
  );
}
