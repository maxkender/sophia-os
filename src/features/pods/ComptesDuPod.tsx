import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { abrege } from "@/components/charts/echelle";
import { canoniserLangue, drapeauLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { lireLabels } from "@/features/bible/api";
import { idApplication } from "@/features/moteur/catalogueApplications";

import { deplacerCompte, listerComptesPod, type CompteDuPod } from "./api";

/**
 * Déplacer un compte vers un autre label (0782) : le choix du label d'arrivée, parmi ceux qui servent
 * une application du podz. Pour reloger les comptes d'un podz ou d'une langue qu'on ferme.
 */
function Deplacer({ compte, pod, labelId, apps }: { compte: CompteDuPod; pod: string; labelId: string; apps: string[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [vers, setVers] = React.useState("");
  const nom = compte.handle ? `@${compte.handle}` : compte.compte_id.slice(0, 8);
  const labels = useQuery({ queryKey: ["bible", "labels"], queryFn: lireLabels, enabled: ouvert, staleTime: 300_000 });
  const ids = apps.map((a) => idApplication(a));
  const choix = (labels.data ?? []).filter((l) => l.id !== labelId && l.apps.some((a) => ids.includes(a)));
  const deplacer = useMutation({
    mutationFn: () => deplacerCompte(compte.compte_id, labelId, vers, `depuis la fiche de ${pod}`),
    onSuccess: (res) => {
      setOuvert(false);
      // Le compte quitte cette fiche : on le dit tout de suite si sa langue n'est pas ouverte à l'arrivée.
      if (res.langue_ouverte === false) window.alert(t("pods.places.languePasOuverte", { compte: nom, label: res.label ?? "" }));
      void qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });
  if (!ouvert) {
    return (
      <Button size="xs" variant="ghost" onClick={() => setOuvert(true)}>
        {t("pods.places.deplacer")}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <select
        aria-label={t("pods.places.versLabel", { compte: nom })}
        value={vers}
        onChange={(e) => setVers(e.target.value)}
        className="h-7 max-w-40 rounded-md border bg-background px-1.5 text-xs"
      >
        <option value="">{labels.isLoading ? t("common.loading") : t("pods.places.choisirLabel")}</option>
        {choix.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nom}
          </option>
        ))}
      </select>
      <Button
        size="xs"
        disabled={!vers || deplacer.isPending}
        onClick={() =>
          window.confirm(
            t("pods.places.confirm", { compte: nom, de: t("pods.places.ceLabel"), vers: choix.find((l) => l.id === vers)?.nom ?? "" }),
          ) && deplacer.mutate()
        }
      >
        {t("pods.places.deplacer")}
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setOuvert(false)}>
        {t("common.cancel")}
      </Button>
      {deplacer.error && <span className="basis-full text-right text-xs text-destructive">{(deplacer.error as Error).message}</span>}
    </span>
  );
}

/** Les comptes qui portent le label d'un podz : langue, posts du label, vues moyennes. */
export function ComptesDuPod({
  pod,
  label,
  deplacer,
}: {
  pod: string;
  label: string | null;
  /** Avec le label et les applications du podz : un bouton « Déplacer » par compte (fiche du podz). */
  deplacer?: { labelId: string; apps: string[] };
}) {
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
              {deplacer && <th aria-hidden />}
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
                  {drapeauLangue(canoniserLangue(c.langue))} {canoniserLangue(c.langue)}
                  {c.pays ? ` · ${c.pays}` : ""}
                </td>
                <td className={cn("px-2 py-1 text-right tabular-nums", c.posts_15j === 0 && "font-semibold text-destructive")}>
                  {c.posts_15j === 0 ? t("pods.comptesPod.jamais") : c.posts_15j}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{c.vues_moyenne == null ? "—" : abrege(c.vues_moyenne, langue)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{c.vues_max == null ? "—" : abrege(c.vues_max, langue)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{date(c.dernier_post)}</td>
                {deplacer && (
                  <td className="px-2 py-1 text-right">
                    <Deplacer compte={c} pod={pod} labelId={deplacer.labelId} apps={deplacer.apps} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
