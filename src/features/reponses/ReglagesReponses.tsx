import * as React from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { Pied } from "@/features/reglagesOs/CartesReglages";
import { useReglages } from "@/features/reglagesOs/useReglages";

import { lireValeursReponses, valeursReponsesValides, type ValeursReponses } from "./reglages";

const CLES = ["reponses_reglages"] as const;

/**
 * Replies (partie E, 0411) : le seuil de confiance de l'IA, le maximum de
 * réponses automatiques par jour et par posteur, la pause maximum (malade,
 * absent). Admin seulement ; chaque changement est journalisé.
 */
export function ReglagesReponses() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const { lu, enregistrer } = useReglages(CLES);
  const [b, setB] = React.useState<ValeursReponses | null>(null);
  React.useEffect(() => {
    if (lu.data) setB(lireValeursReponses(lu.data.reponses_reglages));
  }, [lu.data]);
  if (!b) return null;
  const champ = (k: keyof ValeursReponses, pas: string, min: number, max?: number) => (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{t(`reponses.reglages.${k}`)}</span>
      <Input
        type="number"
        step={pas}
        min={min}
        max={max}
        value={String(b[k])}
        disabled={!admin}
        aria-label={t(`reponses.reglages.${k}`)}
        onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })}
      />
      <span className="block text-xs text-muted-foreground">{t(`reponses.reglages.${k}Aide`)}</span>
    </label>
  );
  return (
    <Card data-testid="reponses-reglages">
      <CardHeader>
        <CardTitle>{t("reponses.reglages.titre")}</CardTitle>
        <CardDescription>{t("reponses.reglages.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {champ("seuil", "0.05", 0, 1)}
          {champ("max_jour", "1", 0)}
          {champ("pause_max_jours", "1", 1)}
        </div>
        <Pied
          admin={admin}
          enregistrer={enregistrer}
          cles={CLES}
          desactive={!valeursReponsesValides(b)}
          onSave={() => {
            // Une autre clé de reponses_reglages, s'il y en a, reste telle quelle.
            const lue = lu.data?.reponses_reglages;
            const base = lue && typeof lue === "object" ? (lue as Record<string, unknown>) : {};
            enregistrer.mutate({ reponses_reglages: { ...base, ...b } });
          }}
        />
      </CardContent>
    </Card>
  );
}
