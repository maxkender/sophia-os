import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crosshair, Languages, MessageSquareQuote, type LucideIcon } from "lucide-react";

import { Segments } from "@/components/ui/segments";
import { SectionAutresPrompts } from "@/features/chaine/SectionAutresPrompts";
import { SectionLangues } from "@/features/chaine/SectionLangues";
import { SectionPlacement } from "@/features/chaine/SectionPlacement";

type Onglet = "langues" | "placement" | "autres";

const ONGLETS: ReadonlyArray<{ cle: Onglet; icone: LucideIcon }> = [
  { cle: "langues", icone: Languages },
  { cle: "placement", icone: Crosshair },
  { cle: "autres", icone: MessageSquareQuote },
];

function lireOnglet(valeur: string | null): Onglet {
  return valeur === "placement" || valeur === "autres" ? valeur : "langues";
}

/**
 * Traduction & placement (Configuration) : la chaîne qui écrit un deck dans
 * une langue, rangée comme elle tourne. Langues : le prompt de traduction
 * que chaque langue lit, avec ses comptes et ses relecteurs. Placement : le
 * prompt de placement de l'application du sélecteur et ses angles par label.
 * Autres prompts : pertinence, UGC, consignes de rédaction, comment masters.
 * L'onglet et la langue sont dans l'URL (`?onglet=…&langue=…`), pour les liens.
 */
export function AdminChainePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const onglet = lireOnglet(params.get("onglet"));
  const langue = params.get("langue");
  const regler = (cles: Record<string, string | null>) => {
    const suivants = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cles)) {
      if (v == null) suivants.delete(k);
      else suivants.set(k, v);
    }
    setParams(suivants, { replace: true });
  };

  return (
    <div className="space-y-4" data-testid="page-chaine">
      <div className="space-y-1">
        <h1 className="text-base font-semibold">{t("chaine.titre")}</h1>
        <p className="text-xs text-muted-foreground">{t("chaine.intro")}</p>
      </div>
      <Segments<Onglet>
        libelle={t("chaine.onglets.libelle")}
        actif={onglet}
        onChange={(cle) => regler({ onglet: cle === "langues" ? null : cle })}
        options={ONGLETS.map(({ cle, icone: Icone }) => ({
          cle,
          contenu: (
            <>
              <Icone className="size-3.5" aria-hidden />
              {t(`chaine.onglets.${cle}`)}
            </>
          ),
        }))}
      />
      {onglet === "langues" && <SectionLangues langue={langue} onLangue={(code) => regler({ langue: code })} />}
      {onglet === "placement" && <SectionPlacement />}
      {onglet === "autres" && <SectionAutresPrompts />}
    </div>
  );
}
