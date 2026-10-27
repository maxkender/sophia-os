import * as React from "react";
import { useTranslation } from "react-i18next";

import { Segments } from "@/components/ui/segments";
import { CarteInterrupteurs } from "@/features/relectureNative/CarteInterrupteurs";
import { SectionEcrituresKit } from "@/features/relectureNative/SectionEcrituresKit";
import { SectionFichesAppli } from "@/features/relectureNative/SectionFichesAppli";
import { SectionKitAdmin } from "@/features/relectureNative/SectionKitAdmin";
import { SectionRelecteurs } from "@/features/relectureNative/SectionRelecteurs";
import { SectionReponses } from "@/features/relectureNative/SectionReponses";

type Onglet = "relecteurs" | "fiches" | "reponses" | "kit" | "ecritures";

/**
 * Relecture native : tout ce qu'il faut écrire avant de lancer le système.
 * Étape 1 : les relecteurs choisis, les fiches des applications, les réponses
 * au questionnaire. Étape 2 : le kit natif et les versions des relecteurs.
 * La production reste coupée.
 */
export function AdminRelectureNativePage() {
  const { t } = useTranslation();
  const [onglet, setOnglet] = React.useState<Onglet>("relecteurs");
  const [relecteurId, setRelecteurId] = React.useState<string | null>(null);

  return (
    <div className="space-y-6" data-testid="page-relecture-native">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("relectureNative.titre")}</h2>
        <p className="text-xs text-muted-foreground">{t("relectureNative.description")}</p>
      </div>

      <CarteInterrupteurs />

      <Segments<Onglet>
        libelle={t("relectureNative.titre")}
        actif={onglet}
        onChange={setOnglet}
        options={[
          { cle: "relecteurs", contenu: t("relectureNative.onglets.relecteurs") },
          { cle: "fiches", contenu: t("relectureNative.onglets.fiches") },
          { cle: "reponses", contenu: t("relectureNative.onglets.reponses") },
          { cle: "kit", contenu: t("relectureNative.onglets.kit") },
          { cle: "ecritures", contenu: t("relectureNative.onglets.ecritures") },
        ]}
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
      {onglet === "fiches" && <SectionFichesAppli />}
      {onglet === "reponses" && <SectionReponses relecteurId={relecteurId} onChoisir={setRelecteurId} />}
      {onglet === "kit" && <SectionKitAdmin />}
      {onglet === "ecritures" && <SectionEcrituresKit relecteurId={relecteurId} onChoisir={setRelecteurId} />}
    </div>
  );
}
