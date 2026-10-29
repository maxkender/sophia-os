import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Coins, Trophy } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { listerValeursFamille, type ContenuBleo, type ValeurLangue } from "./api";
import { formaterNombre, formaterQuand } from "./format";
import { EnteteTableau, EtatRequete, Generation, Ligne, TD, TD_NUM, TH, TH_NUM, Tableau, TitreCarte } from "./ui";
import { grilleValeurs } from "./valeurs";

/**
 * BLEO, fiche famille : la valeur de chaque contenu dans chaque langue des
 * comptes de son label (A5, dernière nuit). En vert, le contenu que BLEO
 * préfère dans la langue ; l'infobulle d'une case donne le calcul.
 */
export function CarteValeursParLangue({ contenus }: { contenus: ContenuBleo[] }) {
  const { t, i18n } = useTranslation();
  const ids = contenus.map((c) => c.id);
  const valeurs = useQuery({
    queryKey: ["bleo", "valeurs", ids.join(",")],
    queryFn: () => listerValeursFamille(ids),
    enabled: ids.length > 0,
  });
  const grille = grilleValeurs(valeurs.data ?? []);
  const calculeLe = valeurs.data?.[0]?.calcule_le;
  const lignes = contenus.filter((c) => grille.cellules.has(c.id));

  const detail = (v: ValeurLangue) =>
    t("bleo.famille.valeurDetail", {
      forme: formaterNombre(v.forme, 2),
      post: v.n_post,
      acc: v.n_accroche,
      age: formaterNombre(v.facteur_age, 2),
      valeur: formaterNombre(v.valeur, 2),
    });

  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={Coins}>{t("bleo.famille.valeurs")}</TitreCarte>
        <CardDescription>
          {t("bleo.famille.valeursDesc")}
          {calculeLe ? ` ${t("bleo.famille.valeursLe", { quand: formaterQuand(calculeLe, i18n.language) })}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EtatRequete erreur={valeurs.error} chargement={valeurs.isLoading} />
        {valeurs.data && lignes.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("bleo.famille.aucuneValeur")}</p>
        )}
        {lignes.length > 0 && (
          <Tableau minWidth={`${14 + grille.langues.length * 4.5}rem`}>
            <EnteteTableau>
              <th className={TH}>{t("bleo.colonnes.generation")}</th>
              <th className={TH}>{t("bleo.colonnes.titre")}</th>
              {grille.langues.map((l) => (
                <th key={l} className={TH_NUM} title={nomLangue(l)}>
                  <span className="whitespace-nowrap">
                    {drapeauLangue(l)} {l}
                  </span>
                </th>
              ))}
            </EnteteTableau>
            <tbody>
              {lignes.map((c) => (
                <Ligne key={c.id}>
                  <td className={TD}>
                    <Generation g={c.generation} />
                  </td>
                  <td className={`${TD} max-w-[16rem]`}>
                    <span className="line-clamp-2" title={c.titre ?? undefined}>
                      {c.titre ?? "—"}
                    </span>
                  </td>
                  {grille.langues.map((l) => {
                    const v = grille.cellules.get(c.id)?.get(l);
                    const prefere = grille.meilleur.get(l) === c.id;
                    return (
                      <td
                        key={l}
                        className={cn(TD_NUM, v && "cursor-help", prefere && "font-semibold text-success")}
                        title={v ? detail(v) : undefined}
                      >
                        {v ? (
                          <span className="inline-flex items-center gap-0.5">
                            {prefere && <Trophy className="size-3" aria-label={t("bleo.famille.prefere")} />}
                            {formaterNombre(v.valeur, 2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </Ligne>
              ))}
            </tbody>
          </Tableau>
        )}
      </CardContent>
    </Card>
  );
}
