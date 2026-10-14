import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  activerAnglePlacement,
  creerAnglePlacement,
  modifierTexteAngle,
  passerAngleEnTest,
  supprimerAnglePlacement,
  type AnglePlacement,
  type StatutAngle,
} from "@/features/moteur/apiAngles";

import {
  ANGLE_LONGUEUR_MAX,
  anglesTestCompares,
  MAX_ANGLES_TEST,
  normaliserAngle,
  type GroupeAngles,
  type MotifAngleNonCompare,
} from "./angles";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const CLE_ANGLES = ["angles-placement"] as const;

const CLE_MOTIF: Record<MotifAngleNonCompare, string> = {
  identique_actif: "angles.nonCompareIdentique",
  doublon: "angles.nonCompareDoublon",
  au_dela_max: "angles.nonCompareAuDela",
};

/** Un angle : statut, texte (modifiable), passage actif ↔ test, suppression. */
function LigneAngle({
  angle,
  nomLabel,
  autresTextes,
  nonCompare,
}: {
  angle: AnglePlacement;
  nomLabel: string;
  /** Textes (normalisés) des autres angles de la paire : pas de doublon. */
  autresTextes: ReadonlySet<string>;
  nonCompare: MotifAngleNonCompare | undefined;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edition, setEdition] = React.useState<string | null>(null);
  const action = useMutation({
    mutationFn: async (quoi: "activer" | "tester" | "supprimer" | "enregistrer") => {
      if (quoi === "activer") return activerAnglePlacement(angle.id);
      if (quoi === "tester") return passerAngleEnTest(angle.id);
      if (quoi === "supprimer") return supprimerAnglePlacement(angle.id);
      return modifierTexteAngle(angle.id, edition ?? angle.texte);
    },
    onSuccess: (_r, quoi) => {
      if (quoi === "enregistrer") setEdition(null);
    },
    // Succès ou échec : la liste est relue (un échec peut cacher un état changé).
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_ANGLES }),
  });
  const actif = angle.statut === "actif";
  const occupe = action.isPending;
  const propre = edition === null ? "" : normaliserAngle(edition);
  const doublon = edition !== null && autresTextes.has(propre);
  const modifie = edition !== null && propre !== angle.texte && propre !== "" && !doublon;

  return (
    <li className="space-y-2 rounded-md border p-3" data-testid="angle" data-statut={angle.statut}>
      <div className="flex flex-wrap items-start gap-2">
        <Badge variant={actif ? "success" : "warning"}>{actif ? t("angles.statutActif") : t("angles.statutTest")}</Badge>
        {nonCompare && (
          <Badge variant="outline" data-testid="non-compare">
            {t(CLE_MOTIF[nonCompare], { max: MAX_ANGLES_TEST })}
          </Badge>
        )}
        {edition === null ? (
          <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{angle.texte}</p>
        ) : (
          <Textarea
            rows={3}
            maxLength={ANGLE_LONGUEUR_MAX}
            className="min-w-0 flex-1 text-xs"
            aria-label={t("angles.modifierLabel", { label: nomLabel })}
            value={edition}
            disabled={occupe}
            onChange={(e) => setEdition(e.target.value)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {edition === null ? (
          <>
            <Button size="sm" variant="outline" disabled={occupe} onClick={() => setEdition(angle.texte)}>
              {t("angles.modifier")}
            </Button>
            {actif ? (
              <Button size="sm" variant="outline" disabled={occupe} onClick={() => action.mutate("tester")}>
                {t("angles.passerEnTest")}
              </Button>
            ) : (
              <Button size="sm" disabled={occupe} onClick={() => action.mutate("activer")}>
                {t("angles.activer")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={occupe}
              onClick={() => {
                if (window.confirm(t("angles.confirmerSuppression", { texte: angle.texte }))) action.mutate("supprimer");
              }}
            >
              {t("angles.supprimer")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={!modifie || occupe} onClick={() => action.mutate("enregistrer")}>
              {occupe ? t("common.saving") : t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" disabled={occupe} onClick={() => setEdition(null)}>
              {t("common.cancel")}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t("angles.compteur", { n: edition.length, max: ANGLE_LONGUEUR_MAX })}
            </span>
            {doublon && <span className="text-[11px] text-warning">{t("angles.existeDeja")}</span>}
          </>
        )}
      </div>
      {action.isError && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(action.error)}
        </p>
      )}
    </li>
  );
}

/** Ajout d'un angle à la paire, en test ou directement actif. */
function NouvelAngle({
  labelId,
  applicationId,
  nomLabel,
  textes,
}: {
  labelId: string;
  applicationId: string;
  nomLabel: string;
  /** Textes (normalisés) des angles de la paire : pas de doublon. */
  textes: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [texte, setTexte] = React.useState("");
  const creer = useMutation({
    mutationFn: (statut: StatutAngle) => creerAnglePlacement(labelId, applicationId, texte, statut),
    onSuccess: () => setTexte(""),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_ANGLES }),
  });
  const doublon = textes.has(normaliserAngle(texte));
  const vide = normaliserAngle(texte) === "" || doublon;
  return (
    <div className="space-y-1.5 border-t pt-3">
      <Textarea
        rows={2}
        maxLength={ANGLE_LONGUEUR_MAX}
        className="text-xs"
        aria-label={t("angles.nouveauLabel", { label: nomLabel })}
        placeholder={t("angles.placeholder")}
        value={texte}
        disabled={creer.isPending}
        onChange={(e) => setTexte(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={vide || creer.isPending} onClick={() => creer.mutate("test")}>
          {t("angles.ajouterTest")}
        </Button>
        <Button size="sm" disabled={vide || creer.isPending} onClick={() => creer.mutate("actif")}>
          {t("angles.ajouterActif")}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t("angles.compteur", { n: texte.length, max: ANGLE_LONGUEUR_MAX })}
        </span>
        {doublon && <span className="text-[11px] text-warning">{t("angles.existeDeja")}</span>}
      </div>
      {creer.isError && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(creer.error)}
        </p>
      )}
    </div>
  );
}

/** Un label pour l'application du sélecteur : son angle actif, ses angles en test, l'ajout. */
export function CarteAnglesLabel({
  groupe,
  applicationId,
  nomApplication,
}: {
  groupe: GroupeAngles<AnglePlacement>;
  applicationId: string;
  nomApplication: string;
}) {
  const { t } = useTranslation();
  const angles = groupe.actif ? [groupe.actif, ...groupe.tests] : groupe.tests;
  const { compares, nonCompares } = anglesTestCompares(groupe.actif, groupe.tests);
  const textes = new Set(angles.map((a) => normaliserAngle(a.texte)));
  const autresTextes = (a: AnglePlacement) =>
    new Set(angles.filter((b) => b.id !== a.id).map((b) => normaliserAngle(b.texte)));
  return (
    <Card data-testid="carte-angles" data-label={groupe.nom}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {groupe.nom}
          {!groupe.sert && <Badge variant="outline">{t("angles.neSertPlus", { nom: nomApplication })}</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {groupe.actif ? t("angles.resumeActif") : t("angles.resumeSansActif")}
          {" · "}
          {t("angles.resumeTests", { count: compares.length })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {angles.length > 0 && (
          <ul className="space-y-2">
            {angles.map((a) => (
              <LigneAngle
                key={a.id}
                angle={a}
                nomLabel={groupe.nom}
                autresTextes={autresTextes(a)}
                nonCompare={nonCompares.get(a.id)}
              />
            ))}
          </ul>
        )}
        {[...nonCompares.values()].includes("au_dela_max") && (
          <p className="text-xs text-warning">{t("angles.tropDeTests", { max: MAX_ANGLES_TEST })}</p>
        )}
        <NouvelAngle labelId={groupe.labelId} applicationId={applicationId} nomLabel={groupe.nom} textes={textes} />
      </CardContent>
    </Card>
  );
}
