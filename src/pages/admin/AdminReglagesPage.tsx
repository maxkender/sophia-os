import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ecrireReglage, lireReglages } from "@/features/moteur/api";
import type { Reglages } from "@/features/moteur/types";

function ChampNombre({
  id,
  label,
  valeur,
  onChange,
  min = 0,
  step,
}: {
  id: string;
  label: string;
  valeur: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        step={step}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function AdminReglagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });

  const [brouillon, setBrouillon] = React.useState<Reglages | null>(null);
  const reglages = brouillon ?? data ?? null;

  const enregistrer = useMutation({
    mutationFn: async (r: Reglages) => {
      await ecrireReglage("repartition", r.repartition);
      await ecrireReglage("frequence", r.frequence);
      await ecrireReglage("semaine1", r.semaine1);
      await ecrireReglage("scoring", r.scoring);
      await ecrireReglage("paiement", r.paiement);
      await ecrireReglage("moteur_vnext", r.moteur_vnext);
      await ecrireReglage("nettoyage", r.nettoyage);
    },
    onSuccess: () => {
      setBrouillon(null);
      queryClient.invalidateQueries({ queryKey: ["reglages"] });
    },
  });

  if (isPending || !reglages) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const maj = (patch: Partial<Reglages>) => setBrouillon({ ...reglages, ...patch });
  const majScoring = (patch: Partial<Reglages["scoring"]>) =>
    maj({ scoring: { ...reglages.scoring, ...patch } });
  const total =
    reglages.repartition.recycle + reglages.repartition.remanie + reglages.repartition.nouveau;
  const totalValide = total === 100;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.vnextTitle")}</CardTitle>
          <CardDescription>{t("reglages.vnextSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reglages.moteur_vnext.actif}
              onChange={(e) => maj({ moteur_vnext: { actif: e.target.checked } })}
            />
            {t("reglages.vnextActif")}
          </label>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.nettoyageTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("reglages.nettoyageAide")}</p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="nettoyage-provider"
                  className="mt-1"
                  checked={reglages.nettoyage.provider_principal === "fal"}
                  onChange={() =>
                    maj({ nettoyage: { provider_principal: "fal" } })
                  }
                />
                <span>
                  <span className="font-medium">{t("reglages.nettoyageFalPremier")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("reglages.nettoyageFalPremierAide")}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="nettoyage-provider"
                  className="mt-1"
                  checked={reglages.nettoyage.provider_principal === "replicate"}
                  onChange={() =>
                    maj({ nettoyage: { provider_principal: "replicate" } })
                  }
                />
                <span>
                  <span className="font-medium">{t("reglages.nettoyageReplicatePremier")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("reglages.nettoyageReplicatePremierAide")}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.scoring")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="ewma"
                label={t("reglages.ewma")}
                step={0.05}
                valeur={reglages.scoring.ewma_alpha}
                onChange={(n) => majScoring({ ewma_alpha: n })}
              />
              <ChampNombre
                id="regk"
                label={t("reglages.regularisation")}
                valeur={reglages.scoring.regularisation_k}
                onChange={(n) => majScoring({ regularisation_k: n })}
              />
              <ChampNombre
                id="transfert"
                label={t("reglages.transfert")}
                step={0.05}
                valeur={reglages.scoring.transfert_inter_langue}
                onChange={(n) => majScoring({ transfert_inter_langue: n })}
              />
              <ChampNombre
                id="topk"
                label={t("reglages.topK")}
                min={1}
                valeur={reglages.scoring.top_k}
                onChange={(n) => majScoring({ top_k: n })}
              />
              <ChampNombre
                id="temp"
                label={t("reglages.temperature")}
                step={0.1}
                valeur={reglages.scoring.temperature}
                onChange={(n) => majScoring({ temperature: n })}
              />
              <ChampNombre
                id="satj"
                label={t("reglages.saturationJours")}
                min={1}
                valeur={reglages.scoring.saturation_jours}
                onChange={(n) => majScoring({ saturation_jours: n })}
              />
              <ChampNombre
                id="satp"
                label={t("reglages.saturationPenalite")}
                step={0.05}
                valeur={reglages.scoring.saturation_penalite}
                onChange={(n) => majScoring({ saturation_penalite: n })}
              />
              <ChampNombre
                id="vseuil"
                label={t("reglages.varSeuil")}
                valeur={reglages.scoring.variation_seuil_score}
                onChange={(n) => majScoring({ variation_seuil_score: n })}
              />
              <ChampNombre
                id="vpass"
                label={t("reglages.varPassages")}
                min={1}
                valeur={reglages.scoring.variation_min_passages}
                onChange={(n) => majScoring({ variation_min_passages: n })}
              />
              <ChampNombre
                id="vage"
                label={t("reglages.varAge")}
                min={1}
                valeur={reglages.scoring.variation_age_jours}
                onChange={(n) => majScoring({ variation_age_jours: n })}
              />
              <ChampNombre
                id="vprof"
                label={t("reglages.varProfondeur")}
                min={1}
                valeur={reglages.scoring.variation_profondeur_max}
                onChange={(n) => majScoring({ variation_profondeur_max: n })}
              />
              <ChampNombre
                id="pert"
                label={t("reglages.pertinence")}
                valeur={reglages.scoring.pertinence_seuil}
                onChange={(n) => majScoring({ pertinence_seuil: n })}
              />
              <ChampNombre
                id="elo"
                label={t("reglages.eloSeuil")}
                valeur={reglages.scoring.elo_seuil_import}
                onChange={(n) => majScoring({ elo_seuil_import: n })}
              />
              <ChampNombre
                id="eloPoids"
                label={t("reglages.eloPoidsVues")}
                min={0}
                step={0.05}
                valeur={reglages.scoring.elo_poids_vues}
                onChange={(n) => majScoring({ elo_poids_vues: Math.min(1, Math.max(0, n)) })}
              />
              <ChampNombre
                id="eloPlafond"
                label={t("reglages.eloVuesPlafond")}
                min={10_000}
                step={10_000}
                valeur={reglages.scoring.elo_vues_plafond}
                onChange={(n) => majScoring({ elo_vues_plafond: n })}
              />
              <ChampNombre
                id="eloK"
                label={t("reglages.eloRegularisation")}
                min={0.1}
                step={0.1}
                valeur={reglages.scoring.elo_regularisation_k}
                onChange={(n) =>
                  majScoring({ elo_regularisation_k: Math.max(0.1, n) })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("reglages.eloVuesAide")}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("paiement.title")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChampNombre
                id="pbase"
                label={t("paiement.base")}
                valeur={reglages.paiement.tarif_base_mensuel}
                onChange={(n) =>
                  maj({ paiement: { ...reglages.paiement, tarif_base_mensuel: n } })
                }
              />
              <ChampNombre
                id="punit"
                label={t("paiement.unitaire")}
                valeur={reglages.paiement.tarif_par_post_jour}
                onChange={(n) =>
                  maj({ paiement: { ...reglages.paiement, tarif_par_post_jour: n } })
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.frequence")}</h3>
            <div className="sm:max-w-xs">
              <ChampNombre
                id="parJour"
                label={t("reglages.postsParJour")}
                min={1}
                valeur={reglages.frequence.posts_par_jour}
                onChange={(n) => maj({ frequence: { posts_par_jour: n } })}
              />
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reglages.legacyTitle")}</CardTitle>
          <CardDescription>{t("reglages.legacySubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.repartition")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <ChampNombre
                id="recycle"
                label={t("reglages.recycle")}
                valeur={reglages.repartition.recycle}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, recycle: n } })}
              />
              <ChampNombre
                id="remanie"
                label={t("reglages.remanie")}
                valeur={reglages.repartition.remanie}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, remanie: n } })}
              />
              <ChampNombre
                id="nouveau"
                label={t("reglages.nouveau")}
                valeur={reglages.repartition.nouveau}
                onChange={(n) => maj({ repartition: { ...reglages.repartition, nouveau: n } })}
              />
            </div>
            <p className={totalValide ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {totalValide ? t("reglages.total", { total }) : t("reglages.totalInvalide")}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("reglages.semaine1")}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reglages.semaine1.actif}
                onChange={(e) =>
                  maj({ semaine1: { ...reglages.semaine1, actif: e.target.checked } })
                }
              />
              {t("reglages.semaine1Actif")}
            </label>
            {reglages.semaine1.actif && (
              <div className="grid gap-4 sm:grid-cols-3">
                <ChampNombre
                  id="s1jours"
                  label={t("reglages.semaine1Jours")}
                  min={1}
                  valeur={reglages.semaine1.jours}
                  onChange={(n) => maj({ semaine1: { ...reglages.semaine1, jours: n } })}
                />
                <ChampNombre
                  id="s1posts"
                  label={t("reglages.semaine1Posts")}
                  min={1}
                  valeur={reglages.semaine1.posts_par_jour}
                  onChange={(n) =>
                    maj({ semaine1: { ...reglages.semaine1, posts_par_jour: n } })
                  }
                />
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reglages.semaine1.tout_recycle}
                    onChange={(e) =>
                      maj({ semaine1: { ...reglages.semaine1, tout_recycle: e.target.checked } })
                    }
                  />
                  {t("reglages.semaine1Recycle")}
                </label>
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          disabled={!brouillon || !totalValide || enregistrer.isPending}
          onClick={() => enregistrer.mutate(reglages)}
        >
          {enregistrer.isPending ? t("common.saving") : t("common.save")}
        </Button>
        {enregistrer.isError && (
          <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
