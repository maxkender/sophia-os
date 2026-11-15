import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Replie } from "@/components/ui/replie";
import { Segments } from "@/components/ui/segments";
import { listerLabels } from "@/features/moteur/api";
import { listerAnglesPlacement } from "@/features/moteur/apiAngles";
import { listerLiensLabels } from "@/features/moteur/apiMultiApp";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { clePromptPlacement, estSlugSophia, nomApplication } from "@/features/moteur/applications";
import { ANGLE_LONGUEUR_MAX, groupesAnglesApplication, MAX_ANGLES_TEST } from "@/features/moteur/multiapp/angles";
import { CarteAnglesLabel } from "@/features/moteur/multiapp/CarteAnglesLabel";
import { messageErreur } from "@/features/bleo/format";

import { EditeurPrompt } from "./EditeurPrompt";

type Filtre = "tous" | "actif" | "sans" | "test";

/**
 * Le placement de l'application du sélecteur : son prompt (replié), puis les
 * angles, une carte par label qui la sert, avec l'angle actif (utilisé
 * partout) et les angles en test (test à blanc seulement). Le filtre ne
 * cache que des cartes.
 */
export function SectionPlacement() {
  const { t } = useTranslation();
  const { application, applicationId, slug } = useApplication();
  const nom = application ? nomApplication(application) : nomApplication({ slug });
  const sophia = estSlugSophia(slug);
  const [filtre, setFiltre] = React.useState<Filtre>("tous");
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
  const nActifs = groupes.filter((g) => g.actif).length;
  const nTests = groupes.reduce((n, g) => n + g.tests.length, 0);
  const visibles = groupes.filter((g) =>
    filtre === "actif" ? Boolean(g.actif) : filtre === "sans" ? !g.actif : filtre === "test" ? g.tests.length > 0 : true,
  );

  return (
    <div className="space-y-4" data-testid="section-placement">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t("chaine.placement.titre", { nom })}</h2>
        <p className="text-xs text-muted-foreground">{t("chaine.placement.aide", { nom })}</p>
        {!sophia && <p className="text-xs text-amber-700 dark:text-amber-400">{t("prompts.sansRepli", { nom })}</p>}
      </div>

      <Replie titre={t("prompts.placementTitleApp", { nom })} aide={t("prompts.placementDescApp", { nom })}>
        <EditeurPrompt key={clePromptPlacement(slug)} cle={clePromptPlacement(slug)} rows={20} nu />
      </Replie>

      <div className="space-y-2 pt-2" data-testid="page-angles">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("angles.titre", { nom })}</h3>
          {pret && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">{t("chaine.placement.nActifs", { count: nActifs })}</Badge>
              <Badge variant="warning">{t("chaine.placement.nTests", { count: nTests })}</Badge>
              <Badge variant="outline">{t("chaine.placement.nLabels", { count: groupes.length })}</Badge>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("angles.description", { nom })}</p>
        <Replie titre={t("chaine.placement.regles")}>
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
            <li>{t("angles.regleMultiLabels", { nom })}</li>
          </ul>
        </Replie>
        {pret && groupes.length > 0 && (
          <Segments<Filtre>
            libelle={t("chaine.placement.filtre")}
            actif={filtre}
            onChange={setFiltre}
            options={[
              { cle: "tous", contenu: t("chaine.placement.filtres.tous") },
              { cle: "actif", contenu: t("chaine.placement.filtres.actif") },
              { cle: "sans", contenu: t("chaine.placement.filtres.sans") },
              { cle: "test", contenu: t("chaine.placement.filtres.test") },
            ]}
          />
        )}
        {erreur && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(erreur)}
          </p>
        )}
        {!erreur && !pret && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {pret && groupes.length === 0 && <p className="text-sm text-muted-foreground">{t("angles.aucunLabel", { nom })}</p>}
        {pret && groupes.length > 0 && visibles.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("chaine.placement.aucunDansFiltre")}</p>
        )}
        {pret &&
          applicationId &&
          visibles.map((g) => (
            <CarteAnglesLabel key={`${applicationId}:${g.labelId}`} groupe={g} applicationId={applicationId} nomApplication={nom} />
          ))}
      </div>
    </div>
  );
}
