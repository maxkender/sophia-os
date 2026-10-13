import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { listerLabels } from "@/features/moteur/api";
import { listerLiensLabels, majAngleLabel } from "@/features/moteur/apiMultiApp";

import { ANGLE_LONGUEUR_MAX, lignesAnglesApplication, normaliserAngle } from "./angles";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Un label : son angle pour l'application, modifiable et enregistré à la demande. */
function LigneAngle({
  labelId,
  applicationId,
  nomLabel,
  angle,
}: {
  labelId: string;
  applicationId: string;
  nomLabel: string;
  angle: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const valeur = brouillon ?? angle;
  const modifie = brouillon !== null && normaliserAngle(brouillon) !== angle;
  const id = `angle-${labelId}-${applicationId}`;

  const enregistrer = useMutation({
    mutationFn: () => majAngleLabel(labelId, applicationId, valeur),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["label-applications"] });
      setBrouillon(null);
    },
  });

  return (
    <div className="space-y-1.5 rounded-md border p-3" data-testid="ligne-angle">
      <label htmlFor={id} className="text-sm font-medium">
        {nomLabel}
      </label>
      <Textarea
        id={id}
        rows={3}
        maxLength={ANGLE_LONGUEUR_MAX}
        className="text-xs"
        placeholder={t("prompts.angles.placeholder")}
        value={valeur}
        onChange={(e) => setBrouillon(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t("prompts.angles.compteur", { n: valeur.length, max: ANGLE_LONGUEUR_MAX })}
        </span>
        {!modifie && !angle && <span className="text-[11px] text-muted-foreground">{t("prompts.angles.vide")}</span>}
        {enregistrer.isSuccess && !modifie && (
          <span className="text-[11px] text-success">{t("prompts.saved")}</span>
        )}
      </div>
      {enregistrer.isError && <p className="text-xs text-destructive">{messageErreur(enregistrer.error)}</p>}
    </div>
  );
}

/**
 * Angles de placement de l'application du sélecteur : une consigne par label
 * qui la sert, ajoutée au prompt de placement (juste au-dessus) pour les
 * slideshows de ce label. Vide = placement seul.
 */
export function AnglesPlacementCard({
  applicationId,
  nom,
  sophia,
}: {
  applicationId: string | null;
  nom: string;
  sophia: boolean;
}) {
  const { t } = useTranslation();
  const liens = useQuery({ queryKey: ["label-applications"], queryFn: listerLiensLabels });
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels() });

  const lignes = React.useMemo(
    () =>
      applicationId && liens.data && labels.data
        ? lignesAnglesApplication(applicationId, labels.data, liens.data)
        : [],
    [applicationId, liens.data, labels.data],
  );
  const erreur = liens.error ?? labels.error;

  return (
    <Card data-testid="angles-placement">
      <CardHeader>
        <CardTitle>{t("prompts.angles.titre", { nom })}</CardTitle>
        <CardDescription>{t("prompts.angles.description", { nom })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
          <li>{t("prompts.angles.prochaines")}</li>
          <li>{t("prompts.angles.consigne", { nom, max: ANGLE_LONGUEUR_MAX })}</li>
          <li>{t("prompts.angles.pods")}</li>
          <li>{sophia ? t("prompts.angles.testSophia") : t("prompts.angles.test")}</li>
        </ul>
        {erreur ? (
          <p className="text-sm text-destructive">{messageErreur(erreur)}</p>
        ) : !applicationId || liens.isPending || labels.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("prompts.angles.aucunLabel", { nom })}</p>
        ) : (
          lignes.map((l) => (
            <LigneAngle
              key={`${applicationId}:${l.labelId}`}
              labelId={l.labelId}
              applicationId={applicationId}
              nomLabel={l.nom}
              angle={l.angle}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
