import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listerLabels } from "@/features/moteur/api";
import { listerAnglesPlacement } from "@/features/moteur/apiAngles";
import { listerLiensLabels } from "@/features/moteur/apiMultiApp";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { ANGLE_LONGUEUR_MAX, groupesAnglesApplication, MAX_ANGLES_TEST } from "@/features/moteur/multiapp/angles";
import { CarteAnglesLabel } from "@/features/moteur/multiapp/CarteAnglesLabel";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * Angles de placement (Configuration) : pour l'application du sélecteur, une
 * carte par label qui la sert, avec son angle ACTIF (utilisé partout) et ses
 * angles en TEST (utilisés seulement par le test à blanc « contenus », une
 * variante par angle pour comparer).
 */
export function AdminAnglesPage() {
  const { t } = useTranslation();
  const { application, applicationId, slug } = useApplication();
  const nom = application ? nomApplication(application) : nomApplication({ slug });
  const angles = useQuery({ queryKey: ["angles-placement"], queryFn: listerAnglesPlacement });
  const liens = useQuery({ queryKey: ["label-applications"], queryFn: listerLiensLabels });
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels() });
  const groupes = React.useMemo(
    () =>
      applicationId && angles.data && liens.data && labels.data
        ? groupesAnglesApplication(applicationId, labels.data, liens.data, angles.data)
        : [],
    [applicationId, angles.data, liens.data, labels.data],
  );
  const erreur = angles.error ?? liens.error ?? labels.error;
  const pret = Boolean(applicationId && angles.data && liens.data && labels.data);

  return (
    <div className="space-y-6" data-testid="page-angles">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("angles.titre", { nom })}</h2>
        <p className="text-xs text-muted-foreground">{t("angles.description", { nom })}</p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>{t("angles.regleActif")}</li>
          <li>
            {t("angles.regleTest", { max: MAX_ANGLES_TEST })}{" "}
            <Link to="/admin/tests" className="underline">
              {t("angles.lienTests")}
            </Link>
          </li>
          <li>{t("angles.regleProchaines")}</li>
          <li>{t("angles.regleConsigne", { max: ANGLE_LONGUEUR_MAX })}</li>
          <li>{t("angles.reglePods")}</li>
        </ul>
      </div>
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {!erreur && !pret && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {pret && groupes.length === 0 && <p className="text-sm text-muted-foreground">{t("angles.aucunLabel", { nom })}</p>}
      {pret &&
        applicationId &&
        groupes.map((g) => (
          <CarteAnglesLabel key={`${applicationId}:${g.labelId}`} groupe={g} applicationId={applicationId} nomApplication={nom} />
        ))}
    </div>
  );
}
