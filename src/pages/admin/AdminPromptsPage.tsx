import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ecrirePrompt, lirePrompt } from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import {
  clePromptPertinence,
  clePromptPlacement,
  estSlugSophia,
  nomApplication,
} from "@/features/moteur/applications";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";

/**
 * Les prompts qui pilotent le moteur, modifiables sans redéploiement.
 *
 * Pertinence et placement sont PROPRES à l'application du sélecteur (clés
 * `pertinence` / `placement_sophia` pour Sophia, `pertinence_<slug>` /
 * `placement_<slug>` pour les autres) ; tout le reste est commun.
 */
const PROMPTS_COMMUNS = [
  { cle: "traduction", titre: "prompts.traductionTitle", desc: "prompts.traductionDesc" },
  { cle: "ugc_face_swap", titre: "prompts.ugcFaceSwapTitle", desc: "prompts.ugcFaceSwapDesc" },
  { cle: "composition_recycle", titre: "prompts.recycleTitle", desc: "prompts.recycleDesc" },
  { cle: "composition_nouveau", titre: "prompts.nouveauTitle", desc: "prompts.nouveauDesc" },
  { cle: "composition_remanie", titre: "prompts.remanieTitle", desc: "prompts.remanieDesc" },
] as const;

// « fr » utilise le prompt « traduction » de base ci-dessus. Les autres langues
// ont leur prompt dédié `traduction_xx` : sans lui, le moteur traduit avec des
// règles neutres. C'est ici qu'on soigne le ton par langue.
const LANGUES_TRADUCTION = LANGUES_CIBLES.filter((l) => l !== "fr");

function EditeurPrompt({ cle, titre, desc }: { cle: string; titre: string; desc: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["prompt", cle],
    queryFn: () => lirePrompt(cle),
  });

  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const valeur = brouillon ?? data ?? "";
  const modifie = brouillon !== null && brouillon !== (data ?? "");

  const enregistrer = useMutation({
    mutationFn: () => ecrirePrompt(cle, valeur),
    onSuccess: () => {
      setBrouillon(null);
      queryClient.invalidateQueries({ queryKey: ["prompt", cle] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={valeur}
              onChange={(e) => setBrouillon(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                {enregistrer.isPending ? t("common.saving") : t("common.save")}
              </Button>
              {enregistrer.isSuccess && !modifie && (
                <span className="text-sm text-success">{t("prompts.saved")}</span>
              )}
            </div>
            {enregistrer.isError && (
              <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminPromptsPage() {
  const { t } = useTranslation();
  const { slug, application } = useApplication();
  const nom = application ? nomApplication(application) : nomApplication({ slug });
  const sophia = estSlugSophia(slug);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">{t("prompts.sectionApplication", { nom })}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.application", { nom })}</p>
        {/* Hors Sophia, un prompt vide n'est jamais remplacé par celui de
            Sophia : le moteur échoue franchement. On le rappelle ici, là où on
            l'écrit. */}
        {!sophia && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {t("prompts.sansRepli", { nom })}
          </p>
        )}
      </div>
      <EditeurPrompt
        key={clePromptPertinence(slug)}
        cle={clePromptPertinence(slug)}
        titre={t("prompts.pertinenceTitleApp", { nom })}
        desc={t("prompts.pertinenceDescApp", { nom })}
      />
      <EditeurPrompt
        key={clePromptPlacement(slug)}
        cle={clePromptPlacement(slug)}
        titre={t("prompts.placementTitleApp", { nom })}
        desc={t("prompts.placementDescApp", { nom })}
      />

      <div className="pt-2">
        <h2 className="text-sm font-semibold">{t("prompts.communsTitre")}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.communsDesc")}</p>
      </div>
      {PROMPTS_COMMUNS.map((p) => (
        <EditeurPrompt
          key={p.cle}
          cle={p.cle}
          titre={t(p.titre)}
          desc={t(p.desc)}
        />
      ))}

      <div className="pt-2">
        <h2 className="text-sm font-semibold">{t("prompts.traductionsLanguesTitre")}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.traductionsLanguesDesc")}</p>
      </div>
      {LANGUES_TRADUCTION.map((l) => (
        <EditeurPrompt
          key={`traduction_${l}`}
          cle={`traduction_${l}`}
          titre={t("prompts.traductionLangue", { langue: nomLangue(l) })}
          desc={t("prompts.traductionLangueDesc", { langue: nomLangue(l) })}
        />
      ))}
    </div>
  );
}
