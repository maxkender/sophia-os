import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { abrege } from "@/components/charts/echelle";
import { drapeauLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { listerComptesPod } from "./api";

/** Les comptes qui portent le label d'un podz : langue, posts du label, vues moyennes. */
export function ComptesDuPod({ pod, label }: { pod: string; label: string | null }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { data, error, isLoading } = useQuery({ queryKey: ["pods", "comptes", pod], queryFn: () => listerComptesPod(pod) });
  if (error) return <p className="text-sm text-destructive">{t("pods.comptesPod.erreur", { message: (error as Error).message })}</p>;
  if (isLoading || !data) return null;
  if (!data.length) return <p className="text-sm text-muted-foreground">{t("pods.comptesPod.vide")}</p>;
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(langue === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short" }) : "—");
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t("pods.comptesPod.titre", { label: label ?? pod })}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-2 py-1 font-medium">{t("pods.comptesPod.compte")}</th>
              <th className="px-2 py-1 font-medium">{t("pods.comptesPod.langue")}</th>
              <th className="px-2 py-1 text-right font-medium">{t("pods.comptesPod.posts")}</th>
              <th className="px-2 py-1 text-right font-medium">{t("pods.comptesPod.moyenne")}</th>
              <th className="px-2 py-1 text-right font-medium">{t("pods.comptesPod.max")}</th>
              <th className="px-2 py-1 text-right font-medium">{t("pods.comptesPod.dernier")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.compte_id} className="border-b border-border/40 last:border-0">
                <td className="px-2 py-1">
                  {c.handle ? (
                    <a
                      href={`https://www.tiktok.com/@${c.handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      @{c.handle}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1">
                  {drapeauLangue(c.langue)} {c.langue}
                  {c.pays ? ` · ${c.pays}` : ""}
                </td>
                <td className={cn("px-2 py-1 text-right tabular-nums", c.posts_15j === 0 && "font-semibold text-destructive")}>
                  {c.posts_15j === 0 ? t("pods.comptesPod.jamais") : c.posts_15j}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{c.vues_moyenne == null ? "—" : abrege(c.vues_moyenne, langue)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{c.vues_max == null ? "—" : abrege(c.vues_max, langue)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{date(c.dernier_post)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
