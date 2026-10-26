import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { semaineIso } from "@/features/moteur/cohortes";

import { dollars, totaux, trier } from "./logique";
import { usePaieHm } from "./usePaieHm";
import { TableauPaie } from "./TableauPaie";

export function SectionPaieHm({ hmId }: { hmId: string | undefined }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const { semaine, paie } = usePaieHm(hmId);
  const lignes = trier(paie.data ?? []);
  const tot = totaux(lignes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paie.titreHm", { semaine: semaineIso(semaine) })}</CardTitle>
        <CardDescription>
          {t("paie.totalHm", { total: dollars(tot.total, langue), reste: dollars(tot.resteAPayer, langue) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {paie.error ? (
          <p className="text-sm text-destructive">{(paie.error as Error).message}</p>
        ) : (
          <TableauPaie lignes={lignes} />
        )}
      </CardContent>
    </Card>
  );
}
