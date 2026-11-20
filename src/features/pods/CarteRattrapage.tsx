// Le rattrapage d'un podz en images finies : les posts gagnants qui manquent dans des langues où son label a un compte.
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { abrege } from "@/components/charts/echelle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Replie } from "@/components/ui/replie";
import { canoniserLangue, drapeauLangue } from "@/features/moteur/langues";

import { listerRattrapage, type CommandeRattrapage } from "./api";

/** Les commandes montrées d'emblée ; le reste est replié. */
const VISIBLES = 8;

function Ligne({ c }: { c: CommandeRattrapage }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{c.rang}</span>
      <span className="min-w-0 flex-1 basis-64">
        <span className="font-medium">{c.titre ?? c.accroche ?? c.contenu_id.slice(0, 8)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {[c.source_id, c.vues_famille != null ? t("pods.rattrapage.vues", { n: abrege(c.vues_famille, i18n.language) }) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1 text-base leading-none" title={c.langues.map(canoniserLangue).join(", ")}>
        {c.langues.map((l) => (
          <span key={l}>{drapeauLangue(canoniserLangue(l))}</span>
        ))}
      </span>
      {c.en_attente && <span className="text-xs text-warning-foreground">{t("pods.rattrapage.enAttente")}</span>}
    </li>
  );
}

/** Carte « Rattrapage par langue » de la fiche d'un podz en images finies. Rien si la lecture échoue. */
export function CarteRattrapage({ pod }: { pod: string }) {
  const { t } = useTranslation();
  const { data, error } = useQuery({ queryKey: ["pods", "rattrapage", pod], queryFn: () => listerRattrapage(pod), staleTime: 60_000 });
  if (error || !data) return null;
  const langues = new Set(data.flatMap((c) => c.langues.map(canoniserLangue)));
  return (
    <Card id="rattrapage" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t("pods.rattrapage.titre")}</CardTitle>
        <CardDescription>
          {data.length ? t("pods.rattrapage.description", { n: data.length, langues: langues.size }) : t("pods.rattrapage.vide")}
        </CardDescription>
      </CardHeader>
      {data.length > 0 && (
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border/50 text-sm">
            {data.slice(0, VISIBLES).map((c) => (
              <Ligne key={c.contenu_id} c={c} />
            ))}
          </ul>
          {data.length > VISIBLES && (
            <Replie titre={t("pods.rattrapage.suite", { n: data.length - VISIBLES })} paresseux>
              <ul className="divide-y divide-border/50 text-sm">
                {data.slice(VISIBLES).map((c) => (
                  <Ligne key={c.contenu_id} c={c} />
                ))}
              </ul>
            </Replie>
          )}
        </CardContent>
      )}
    </Card>
  );
}
