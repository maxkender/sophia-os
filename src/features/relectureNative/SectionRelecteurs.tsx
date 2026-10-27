import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle, EmptyState } from "@/components/ui/card";
import { listerPosters } from "@/features/moteur/api";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";

import {
  ajouterRelecteur,
  listerRelecteurs,
  listerToutesReponses,
  majRelecteur,
  supprimerRelecteur,
  type RelecteurAvecNom,
} from "./api";
import { languesDuPoster, progressionQuestionnaire, STATUTS_RELECTEUR, type StatutRelecteur } from "./logique";
import { messageErreur } from "./messageErreur";

export const CLE_REQUETE_RELECTEURS = ["relecteurs-natifs"] as const;
export const CLE_REQUETE_REPONSES = ["relecteurs-natifs-reponses"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function nomPoster(p: { prenom: string | null; nom: string | null; email: string | null }): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

/**
 * Les relecteurs natifs : choisir un posteur pour une langue, suivre son
 * questionnaire, changer son statut. Le relecteur ne voit son espace que s'il
 * est invité ou actif ET que l'espace est ouvert.
 */
export function SectionRelecteurs({ onVoirReponses }: { onVoirReponses: (relecteurId: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const reponses = useQuery({ queryKey: CLE_REQUETE_REPONSES, queryFn: listerToutesReponses });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });

  const [posterId, setPosterId] = React.useState("");
  const [langue, setLangue] = React.useState("");

  const candidats = React.useMemo(
    () =>
      (posters.data ?? [])
        .filter((p) => p.role === "poster" && p.is_active)
        .sort((a, b) => nomPoster(a).localeCompare(nomPoster(b))),
    [posters.data],
  );

  const choisirPoster = (id: string) => {
    setPosterId(id);
    const p = candidats.find((c) => c.id === id);
    const langues = p ? languesDuPoster(p) : [];
    setLangue(langues[0] ?? "");
  };

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_RELECTEURS });
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_REPONSES });
  };

  const ajouter = useMutation({
    mutationFn: () => ajouterRelecteur(posterId, langue),
    onSuccess: () => {
      setPosterId("");
      setLangue("");
      rafraichir();
    },
  });
  const changerStatut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: StatutRelecteur }) => majRelecteur(id, { statut }),
    onSuccess: rafraichir,
  });
  const retirer = useMutation({ mutationFn: (id: string) => supprimerRelecteur(id), onSuccess: rafraichir });

  const progressionDe = (r: RelecteurAvecNom) =>
    progressionQuestionnaire((reponses.data ?? []).filter((x) => x.relecteur_id === r.id));

  const erreur = relecteurs.error ?? posters.error ?? reponses.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("relectureNative.relecteurs.ajouterTitre")}</CardTitle>
          <CardDescription>{t("relectureNative.relecteurs.ajouterAide")}</CardDescription>
        </CardHeader>
        <CardPanel>
          <form
            className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (posterId && langue) ajouter.mutate();
            }}
          >
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.relecteurs.poster")}</span>
              <select
                className={selectClass}
                value={posterId}
                onChange={(e) => choisirPoster(e.target.value)}
                disabled={posters.isPending}
              >
                <option value="">{t("relectureNative.relecteurs.choisirPoster")}</option>
                {candidats.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomPoster(p)}
                    {languesDuPoster(p).length > 0 ? ` · ${languesDuPoster(p).map(drapeauLangue).join(" ")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.relecteurs.langue")}</span>
              <select className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
                <option value="">{t("relectureNative.relecteurs.choisirLangue")}</option>
                {LANGUES_CIBLES.map((l) => (
                  <option key={l} value={l}>
                    {drapeauLangue(l)} {nomLangue(l)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={!posterId || !langue || ajouter.isPending}>
              {t("relectureNative.relecteurs.ajouter")}
            </Button>
          </form>
          {ajouter.error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {messageErreur(ajouter.error)}
            </p>
          )}
        </CardPanel>
      </Card>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {relecteurs.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {relecteurs.data?.length === 0 && <EmptyState title={t("relectureNative.relecteurs.vide")} />}

      {(relecteurs.data?.length ?? 0) > 0 && (
        <Card>
          <CardPanel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("relectureNative.relecteurs.langue")}</th>
                  <th className="py-2 pr-3 font-medium">{t("relectureNative.relecteurs.relecteur")}</th>
                  <th className="py-2 pr-3 font-medium">{t("relectureNative.relecteurs.statut")}</th>
                  <th className="py-2 pr-3 font-medium">{t("relectureNative.relecteurs.questionnaire")}</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(relecteurs.data ?? []).map((r) => {
                  const p = progressionDe(r);
                  return (
                    <tr key={r.id} className="border-t align-top" data-testid={`relecteur-${r.id}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {drapeauLangue(r.langue)} {nomLangue(r.langue)}
                      </td>
                      <td className="py-2 pr-3">
                        <p>{nomPoster(r)}</p>
                        {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          className={selectClass}
                          aria-label={t("relectureNative.relecteurs.statut")}
                          value={r.statut}
                          disabled={changerStatut.isPending}
                          onChange={(e) => changerStatut.mutate({ id: r.id, statut: e.target.value as StatutRelecteur })}
                        >
                          {STATUTS_RELECTEUR.map((s) => (
                            <option key={s} value={s}>
                              {t(`relectureNative.statuts.${s}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <p>{t("relectureNative.relecteurs.progression", { repondues: p.repondues, total: p.total })}</p>
                        {r.questionnaire_termine_at && (
                          <Badge variant="success">{t("relectureNative.relecteurs.termine")}</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => onVoirReponses(r.id)}>
                            {t("relectureNative.relecteurs.voirReponses")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={retirer.isPending}
                            onClick={() => {
                              if (window.confirm(t("relectureNative.relecteurs.confirmerRetrait", { nom: nomPoster(r) })))
                                retirer.mutate(r.id);
                            }}
                          >
                            {t("relectureNative.relecteurs.retirer")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(changerStatut.error ?? retirer.error) && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {messageErreur(changerStatut.error ?? retirer.error)}
              </p>
            )}
          </CardPanel>
        </Card>
      )}
    </div>
  );
}
