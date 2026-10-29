import * as React from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, ClipboardList, FileText, Languages, Layers, PenLine, Users, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Segments } from "@/components/ui/segments";
import { CarteInterrupteurs } from "@/features/relectureNative/CarteInterrupteurs";
import { ChiffresRelecture } from "@/features/relectureNative/ChiffresRelecture";
import { SectionEcrituresKit } from "@/features/relectureNative/SectionEcrituresKit";
import { SectionExemplesNatifs } from "@/features/relectureNative/SectionExemplesNatifs";
import { SectionFichesAppli } from "@/features/relectureNative/SectionFichesAppli";
import { SectionKitAdmin } from "@/features/relectureNative/SectionKitAdmin";
import { SectionRelecteurs } from "@/features/relectureNative/SectionRelecteurs";
import { SectionReponses } from "@/features/relectureNative/SectionReponses";

type Onglet = "relecteurs" | "exemples" | "fiches" | "reponses" | "kit" | "ecritures";

const ONGLETS: ReadonlyArray<{ cle: Onglet; icone: LucideIcon }> = [
  { cle: "relecteurs", icone: Users },
  { cle: "exemples", icone: BookOpenText },
  { cle: "kit", icone: Layers },
  { cle: "ecritures", icone: PenLine },
  { cle: "reponses", icone: ClipboardList },
  { cle: "fiches", icone: FileText },
];

/**
 * Relecture native : tout ce qu'il faut écrire avant de lancer le système.
 * Les relecteurs, le kit natif et leurs versions, leurs réponses au
 * questionnaire, les fiches des applications. La production reste coupée.
 */
export function AdminRelectureNativePage() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = React.useState<Onglet>("relecteurs");
  const [relecteurId, setRelecteurId] = React.useState<string | null>(null);

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

      {onglet === "relecteurs" && (
        <SectionRelecteurs
          onVoirReponses={(id) => {
            setRelecteurId(id);
            setOnglet("reponses");
          }}
          onVoirKit={(id) => {
            setRelecteurId(id);
            setOnglet("ecritures");
          }}
        />
      )}
      {onglet === "exemples" && <SectionExemplesNatifs />}
      {onglet === "kit" && <SectionKitAdmin />}
      {onglet === "ecritures" && <SectionEcrituresKit relecteurId={relecteurId} onChoisir={setRelecteurId} />}
      {onglet === "reponses" && <SectionReponses relecteurId={relecteurId} onChoisir={setRelecteurId} />}
      {onglet === "fiches" && <SectionFichesAppli />}
    </div>
  );
}
