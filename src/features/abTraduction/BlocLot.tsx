import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { formaterNombre, messageErreur } from "@/features/bleo/format";

import { composerLot, couvertureLot, etatLot, servirLot, TAILLE_LOT } from "./api";

export const CLE_REQUETE_LOT = ["ab-traduction", "lot", 1] as const;

/**
 * Le lot commun (0627) : 15 slideshows choisis pour couvrir les labels, les
 * mêmes pour toutes les langues. Le serveur prépare leurs duels langue par
 * langue, pour chaque langue qui a un relecteur, et les envoie aux relecteurs
 * à la création. Ici : composer le lot, voir sa composition et l'avancement.
 */
export function BlocLot({ onChange }: { onChange?: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const lot = useQuery({ queryKey: CLE_REQUETE_LOT, queryFn: () => etatLot(1) });
  const [resultat, setResultat] = React.useState<string | null>(null);
  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_LOT });
    onChange?.();
  };
  const composer = useMutation({ mutationFn: () => composerLot(1, TAILLE_LOT), onSuccess: rafraichir });
  const servir = useMutation({
    mutationFn: servirLot,
    onSuccess: (r) => {
      const ok = r.faits.filter((f) => f.ok).length;
      const rates = r.faits.filter((f) => !f.ok);
      setResultat(
        t("abTraduction.lot.tourFait", { ok, rates: rates.length, restants: r.restants }) +
          (rates.length ? ` ${rates.map((f) => `${f.langue} : ${f.raison ?? "?"}`).join(" · ")}` : "") +
          (r.sans_circuit.length ? ` ${t("abTraduction.lot.sansCircuit", { candidats: r.sans_circuit.join(", ") })}` : ""),
      );
      rafraichir();
    },
  });

  const etat = lot.data ?? null;
  const taille = etat?.lot.taille ?? TAILLE_LOT;
  const erreur = lot.error ?? composer.error ?? servir.error;

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm" data-testid="ab-lot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Layers className="size-4 text-muted-foreground" aria-hidden />
          {etat ? t("abTraduction.lot.titre", { numero: etat.lot.numero, n: etat.contenus.length }) : t("abTraduction.lot.titreVide", { n: TAILLE_LOT })}
        </p>
        <div className="flex flex-wrap gap-2">
          {(!etat || etat.duels === 0) && (
            <Button size="sm" variant={etat ? "outline" : "default"} disabled={composer.isPending} onClick={() => composer.mutate()}>
              {composer.isPending ? t("common.loading") : etat ? t("abTraduction.lot.recomposer") : t("abTraduction.lot.composer", { n: TAILLE_LOT })}
            </Button>
          )}
          {etat && (
            <Button size="sm" disabled={servir.isPending} onClick={() => servir.mutate()}>
              {servir.isPending ? t("abTraduction.lot.tourEnCours") : t("abTraduction.lot.tour")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("abTraduction.lot.aide")}</p>
      {erreur && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {resultat && <p className="text-xs">{resultat}</p>}

      {etat && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {couvertureLot(etat.contenus).map((c) => (
              <Badge key={c.label} variant="outline">
                {c.label} · {c.n}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              {t("abTraduction.lot.candidat", { candidat: etat.lot.candidat })}
            </span>
          </div>

          <details>
            <summary className="cursor-pointer text-xs font-medium">{t("abTraduction.lot.contenus", { n: etat.contenus.length })}</summary>
            <ol className="mt-2 space-y-1 text-xs">
              {etat.contenus.map((c) => (
                <li key={c.contenu_id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted-foreground">{c.position}.</span>
                  <Badge variant="secondary">{c.label ?? "—"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{c.accroche || c.titre || c.contenu_id}</span>
                  <span className="text-muted-foreground">
                    {t("abTraduction.lot.mesure", { langues: c.nb_langues ?? 0, r: formaterNombre(c.r_med, 2), publies: c.publies ?? 0 })}
                  </span>
                </li>
              ))}
            </ol>
          </details>

          {etat.langues.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("abTraduction.lot.aucuneLangue")}</p>
          ) : (
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {etat.langues.map((l) => {
                const complet = l.prets + l.echecs >= taille;
                return (
                  <li key={l.langue} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1">
                    <span>
                      {drapeauLangue(l.langue)} {nomLangue(l.langue)}
                    </span>
                    <Badge variant={complet ? "success" : l.prets > 0 ? "info" : "outline"}>
                      {t("abTraduction.lot.avancement", { prets: l.prets, taille })}
                    </Badge>
                    <span className="text-muted-foreground">
                      {t("abTraduction.lot.langueDetail", { relecteurs: l.relecteurs, votes: l.votes, echecs: l.echecs })}
                      {l.dernier && ` · ${new Date(l.dernier).toLocaleTimeString(i18n.language.startsWith("en") ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
