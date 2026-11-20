import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { BarChart, type PointBarre } from "@/components/charts/BarChart";
import { abrege } from "@/components/charts/echelle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { type Jalon, lireSeriesPods, serieDuPod } from "./api";

const JALONS: { cle: Jalon; libelle: string }[] = [
  { cle: "moy_j1", libelle: "J+1" },
  { cle: "moy_j3", libelle: "J+3" },
  { cle: "moy_j7", libelle: "J+7" },
];

/**
 * Vues par jour, par podz (0727) : pour voir quand un podz s'épuise ou tient.
 * Barres : vues moyennes à J+1, J+3 ou J+7 (au choix) des posts publiés ce jour-là (comparables d'un
 * jour à l'autre) ; trait : la même moyenne pour tous les podz.
 */
export function CarteSeriesPods({ pods, fixe }: { pods: { slug: string; nom: string }[]; /** Un seul podz, sans sélecteur (fiche du podz). */ fixe?: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { data, error } = useQuery({ queryKey: ["pods", "series"], queryFn: () => lireSeriesPods(21), staleTime: 300_000 });
  const avecPosts = React.useMemo(() => {
    const vus = new Set((data ?? []).map((l) => l.pod));
    return pods.filter((p) => vus.has(p.slug));
  }, [data, pods]);
  const [choisi, setChoisi] = React.useState<string>("");
  const [jalon, setJalon] = React.useState<Jalon>("moy_j1");
  const pod = fixe ?? (choisi || avecPosts[0]?.slug || "");

  if (error) return <p className="text-sm text-destructive">{t("pods.series.erreur", { message: (error as Error).message })}</p>;
  if (!data || !pod) return null;
  if (fixe && !data.some((l) => l.pod === fixe)) return null;

  const serie = serieDuPod(data, pod, jalon);
  const age = JALONS.find((j) => j.cle === jalon)?.libelle ?? "J+1";
  const aujourdHui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const points: PointBarre[] = serie.map((j) => {
    const d = new Date(`${j.jour}T12:00:00Z`);
    return {
      key: j.jour,
      axisLabel: d.toLocaleDateString(localeDate(langue), { day: "2-digit", month: "2-digit" }),
      tooltipTitle: d.toLocaleDateString(localeDate(langue), { weekday: "long", day: "numeric", month: "long" }),
      value: j.valeur,
      provisional: j.jour >= aujourdHui,
      detail: t("pods.series.detail", {
        posts: j.posts,
        moy: j.moy == null ? "—" : abrege(j.moy, langue),
        p10k: j.p10k,
      }),
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {fixe ? t("pods.series.titreFixe") : t("pods.series.titre")}
          <span className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("pods.series.age")}
            className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
            value={jalon}
            onChange={(e) => setJalon(e.target.value as Jalon)}
          >
            {JALONS.map((j) => (
              <option key={j.cle} value={j.cle}>
                {j.libelle}
              </option>
            ))}
          </select>
          {!fixe && <select
            aria-label={t("pods.series.choisir")}
            className="h-8 rounded-md border bg-background px-2 text-sm font-normal"
            value={pod}
            onChange={(e) => setChoisi(e.target.value)}
          >
            {avecPosts.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nom}
              </option>
            ))}
          </select>}
          </span>
        </CardTitle>
        <CardDescription>{t("pods.series.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarChart
          points={points}
          average={serie.map((j) => j.flotte)}
          averageLabel={t("pods.series.flotte")}
          valueLabel={t("pods.series.serie", { age })}
          provisionalLabel={t("pods.series.enCours")}
          height={200}
          formatTick={(n) => abrege(n, langue)}
          formatValue={(n) => n.toLocaleString(langue === "fr" ? "fr-FR" : "en-US")}
          ariaLabel={t("pods.series.titre")}
        />
      </CardContent>
    </Card>
  );
}
