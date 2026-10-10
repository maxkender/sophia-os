import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { messageErreur } from "@/lib/utils";
import { majPartsApplicationsCompte } from "../apiMultiApp";
import { nomLangue } from "../langues";
import type { CompteAvecDetails, Label as LabelType } from "../types";
import {
  etatPartsCompte,
  PAS_PARTS,
  partsDepuisCurseurs,
  resumeParts,
  type AvertissementParts,
} from "./logique";
import { useApplicationsMulti, useLiensLabels } from "./useMultiApp";

/**
 * Répartition d'un compte entre les applications que ses labels servent
 * (`comptes.parts_applications`, tenue par le moteur sur ses 10 derniers
 * posts). Un curseur par application hors Sophia, par pas de 10 ; Sophia prend
 * le reste. Rien ne s'écrit sans « Enregistrer ».
 *
 * DEUX NIVEAUX, comme le moteur : les labels disent ce que le compte peut
 * promouvoir, la répartition ce qu'il promeut. Une répartition qui donne 0 %
 * à Sophia coupe le repli Sophia, même si un label la sert : la carte le dit,
 * et dit en rouge quand plus rien ne peut être publié.
 *
 * Invisible tant que les labels du compte ne servent que Sophia ET qu'aucune
 * répartition n'est enregistrée : le cas de tous les comptes aujourd'hui. Les
 * avertissements ne bloquent rien — le moteur restreint de toute façon aux
 * applications éligibles (actives, langue ciblée, compte non UGC) et reporte
 * le reste sur les autres applications à part > 0.
 *
 * Compte dont aucun label ne sert Sophia (« 100 % Unswipe ») : pas de curseur
 * ni de ligne Sophia, seulement ce qui sera appliqué — ou, si aucune
 * application ne peut le servir, un avertissement rouge et sa cause : sans
 * repli Sophia, ce compte ne publierait rien, en silence.
 */
export function PartsApplicationsCompte({
  compte,
  labels,
}: {
  compte: CompteAvecDetails;
  labels: LabelType[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const applications = useApplicationsMulti();
  const liens = useLiensLabels();

  const etat = React.useMemo(
    () =>
      applications.data && liens.data
        ? etatPartsCompte({
            compte,
            labels,
            liens: liens.data,
            applications: applications.data,
          })
        : null,
    [applications.data, liens.data, compte, labels],
  );

  // Curseurs : repartent de la valeur en base quand elle change (enregistrement
  // ici, ou ailleurs puis refetch).
  const cleInitiale = JSON.stringify(etat?.curseurs ?? {});
  const [curseurs, setCurseurs] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setCurseurs(JSON.parse(cleInitiale) as Record<string, number>);
  }, [cleInitiale, compte.id]);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["comptes"] });
    void queryClient.invalidateQueries({ queryKey: ["posters"] });
  };
  const enregistrer = useMutation({
    mutationFn: () => majPartsApplicationsCompte(compte.id, partsDepuisCurseurs(curseurs)),
    onSuccess: rafraichir,
  });
  const reinitialiser = useMutation({
    mutationFn: () => majPartsApplicationsCompte(compte.id, null),
    onSuccess: rafraichir,
  });

  const erreurLecture = applications.error ?? liens.error;
  if (erreurLecture) {
    return (
      <p className="text-xs text-destructive">
        {t("multiAppPosts.repartition.erreur", { message: messageErreur(erreurLecture) })}
      </p>
    );
  }
  if (!etat || !etat.afficher) return null;

  const totalAutres = Object.values(curseurs).reduce((s, v) => s + v, 0);
  const resteSophia = Math.max(0, 100 - totalAutres);
  const modifie = JSON.stringify(curseurs) !== cleInitiale;
  const enCours = enregistrer.isPending || reinitialiser.isPending;
  const erreurEcriture = enregistrer.error ?? reinitialiser.error;
  const apps = applications.data ?? [];
  // Les curseurs n'ont de sens que si Sophia est servie : c'est elle qui prend
  // le reste. Sans elle, le moteur applique les parts effectives telles quelles.
  const avecCurseurs = etat.sophiaServie && etat.autres.length > 0;
  const sophia = etat.sophiaServie;
  // Le moteur peut-il se replier sur Sophia ? Faux dès que la répartition
  // enregistrée lui donne 0 %, même si un label la sert.
  const repli = etat.repliSophia;

  // Sans repli Sophia, une application exclue ne « revient » pas à Sophia :
  // les textes « sa part revient à Sophia » mentiraient.
  const texteAvertissement = (a: AvertissementParts): string => {
    switch (a.type) {
      case "inactive":
        return repli
          ? t("multiAppPosts.repartition.avertInactive", { app: a.app })
          : t("multiAppPosts.repartition.avertInactiveSansSophia", { app: a.app });
      case "langue":
        return repli
          ? t("multiAppPosts.repartition.avertLangue", { app: a.app, langue: nomLangue(a.langue) })
          : t("multiAppPosts.repartition.avertLangueSansSophia", { app: a.app, langue: nomLangue(a.langue) });
      case "ugc":
        return repli
          ? t("multiAppPosts.repartition.avertUgc")
          : sophia
            ? t("multiAppPosts.repartition.avertUgcSansRepli")
            : t("multiAppPosts.repartition.avertUgcSansSophia");
      case "obsolete":
        return repli
          ? t("multiAppPosts.repartition.avertObsolete", { app: a.app })
          : t("multiAppPosts.repartition.avertObsoleteSansSophia", { app: a.app });
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label className="text-xs">{t("multiAppPosts.repartition.titre")}</Label>
        <span className="text-[11px] text-muted-foreground">
          {t("multiAppPosts.repartition.effectif", {
            parts: Object.keys(etat.effectives).length > 0 ? resumeParts(etat.effectives, apps) : "—",
          })}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {repli
          ? t("multiAppPosts.repartition.aide")
          : sophia
            ? t("multiAppPosts.repartition.aideSansRepli")
            : t("multiAppPosts.repartition.aideSansSophia")}
      </p>

      {etat.bloque && (
        <p className="text-xs font-medium text-destructive">
          {etat.stockees !== null
            ? t("multiAppPosts.repartition.bloqueRepartition")
            : t("multiAppPosts.repartition.bloque")}
        </p>
      )}

      {avecCurseurs && (
        <div className="space-y-1.5">
          {etat.autres.map((app) => {
            const valeur = curseurs[app.slug] ?? 0;
            const max = valeur + resteSophia;
            const id = `parts-${compte.id}-${app.slug}`;
            return (
              <div key={app.id} className="flex items-center gap-2">
                <label htmlFor={id} className="w-20 shrink-0 truncate text-xs">
                  {app.nom}
                </label>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={PAS_PARTS}
                  value={valeur}
                  disabled={enCours}
                  onChange={(e) => {
                    const v = Math.min(max, Number(e.target.value));
                    setCurseurs((prev) => ({ ...prev, [app.slug]: v }));
                  }}
                  className="min-w-0 flex-1 accent-primary"
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums">{valeur} %</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Sophia</span>
            <span className="flex-1" />
            <span className="w-10 shrink-0 text-right tabular-nums">{resteSophia} %</span>
          </div>
          {/* Ce que les curseurs vont enregistrer : Sophia à 0 %, plus de repli. */}
          {resteSophia === 0 && (
            <p className="text-[11px] text-warning">{t("multiAppPosts.repartition.sansRepliCurseurs")}</p>
          )}
        </div>
      )}

      {etat.avertissements.length > 0 && (
        <ul className="space-y-0.5">
          {etat.avertissements.map((a, i) => (
            <li
              key={`${a.type}-${i}`}
              className={etat.bloque ? "text-[11px] text-destructive" : "text-[11px] text-warning"}
            >
              {texteAvertissement(a)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {avecCurseurs && (
          <Button size="sm" disabled={!modifie || enCours} onClick={() => enregistrer.mutate()}>
            {enregistrer.isPending ? t("common.saving") : t("multiAppPosts.repartition.enregistrer")}
          </Button>
        )}
        {etat.stockees !== null && (
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() => reinitialiser.mutate()}
          >
            {sophia
              ? t("multiAppPosts.repartition.reinitialiser")
              : t("multiAppPosts.repartition.reinitialiserSansSophia")}
          </Button>
        )}
      </div>
      {erreurEcriture && (
        <p className="text-xs text-destructive">{messageErreur(erreurEcriture)}</p>
      )}
    </div>
  );
}
