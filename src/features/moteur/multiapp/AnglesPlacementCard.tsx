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

  // La valeur envoyée voyage avec la mutation : un brouillon retouché pendant
  // l'enregistrement n'est pas effacé par la réponse (seul celui envoyé l'est).
  const enregistrer = useMutation({
    mutationFn: (envoye: string) => majAngleLabel(labelId, applicationId, envoye),
    onSuccess: async (_r, envoye) => {
      await qc.invalidateQueries({ queryKey: ["label-applications"] });
      setBrouillon((b) => (b !== null && normaliserAngle(b) === normaliserAngle(envoye) ? null : b));
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
        disabled={enregistrer.isPending}
        onChange={(e) => setBrouillon(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          aria-label={t("prompts.angles.enregistrerLabel", { label: nomLabel })}
          disabled={!modifie || enregistrer.isPending}
          onClick={() => enregistrer.mutate(valeur)}
        >
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t("prompts.angles.compteur", { n: valeur.length, max: ANGLE_LONGUEUR_MAX })}
        </span>
        {!modifie && !angle && <span className="text-[11px] text-muted-foreground">{t("prompts.angles.vide")}</span>}
        {enregistrer.isSuccess && !modifie && (
          <span role="status" className="text-[11px] text-success">
            {t("prompts.saved")}
          </span>
        )}
      </div>
      {enregistrer.isError && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(enregistrer.error)}
        </p>
      )}
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
        {/* Une relecture ratée APRÈS un premier chargement n'efface pas les
            champs (ni les brouillons des autres labels) : l'erreur s'affiche
            au-dessus. Les champs ne sont remplacés que si rien n'a pu être lu. */}
        {erreur && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(erreur)}
          </p>
        )}
        {!liens.data || !labels.data ? (
          erreur ? null : <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !applicationId ? (
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
