import * as React from "react";
import { useTranslation } from "react-i18next";
import { GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { OnboardingParcours } from "./OnboardingParcours";
import { ECRANS } from "./contenu";
import { NB_ETAPES } from "./parcours";

/**
 * Aperçu admin : voir exactement l'accueil que reçoit un créateur slideshow,
 * sans toucher à son propre profil.
 *
 * Le parcours tourne en mode `simulation` : aucune étape enregistrée, aucun
 * `onboarding_vu_at` posé, et la croix revient pour pouvoir en sortir. On peut
 * aussi démarrer à un écran précis, parce que relire les six écrans pour
 * vérifier une virgule du quiz serait absurde.
 */
export function SimulerOnboardingCard() {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const [depart, setDepart] = React.useState(0);

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4 text-primary" />
            {t("tests.onboardingTitre")}
          </CardTitle>
          <CardDescription>{t("tests.onboardingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">{t("tests.onboardingDepart")}</span>
            {ECRANS.map((e, i) => (
              <button
                key={e.cle}
                type="button"
                onClick={() => setDepart(i)}
                className={
                  i === depart
                    ? "rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs"
                    : "rounded-md border px-2.5 py-1 text-xs"
                }
              >
                {i + 1}. {e.titre}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDepart(NB_ETAPES - 1)}
              className={
                depart === NB_ETAPES - 1
                  ? "rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs"
                  : "rounded-md border px-2.5 py-1 text-xs"
              }
            >
              {NB_ETAPES}. {t("tests.onboardingQuiz")}
            </button>
          </div>
          <Button onClick={() => setOuvert(true)}>
            <GraduationCap />
            {t("tests.onboardingOuvrir")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("tests.onboardingNote")}</p>
        </CardContent>
      </Card>

      {ouvert && (
        <OnboardingParcours
          simulation
          etapeInitiale={depart}
          onTermine={() => setOuvert(false)}
        />
      )}
    </>
  );
}
