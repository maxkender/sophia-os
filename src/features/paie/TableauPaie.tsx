import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  enregistrerContrat,
  lireSemaineSuivante,
  marquerPayee,
  marquerSemaineSuivante,
  type LignePaie,
  type SemaineSuivante,
} from "./api";
import { consigneSuivante, dollars, milestone, nomPosteur } from "./logique";

const TH = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
const TD = "px-2 py-2 align-top";

/** Le lien du contrat Upwork, ou « lien manquant » et un champ pour le coller. */
function CelluleContrat({ ligne }: { ligne: LignePaie }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = React.useState("");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerContrat(ligne.poster_id, url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  const lien = ligne.poster?.upwork_contrat_url;
  if (lien) {
    return (
      <a href={lien} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
        {t("paie.contrat")}
      </a>
    );
  }
  return (
    <div className="min-w-48 space-y-1">
      <span className="text-xs font-medium text-destructive">{t("paie.lienManquant")}</span>
      <div className="flex gap-1">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.upwork.com/…"
          className="h-7 text-xs"
          aria-label={t("paie.collerLien")}
        />
        <Button size="sm" className="h-7" disabled={!url.trim() || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("common.save")}
        </Button>
      </div>
      {enregistrer.error && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
    </div>
  );
}

/** Une case de la ligne : « Payé » ou « Semaine suivante faite ». Recliquer annule. */
export function Case({
  coche,
  libelle,
  aideAnnuler,
  basculer,
}: {
  coche: boolean;
  libelle: string;
  aideAnnuler: string;
  basculer: (coche: boolean) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: () => basculer(!coche),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs transition-colors",
        coche ? "border-success/50 bg-success/8 font-medium" : "hover:bg-muted",
        action.isPending && "opacity-60",
      )}
      title={coche ? aideAnnuler : undefined}
    >
      <input
        type="checkbox"
        className="size-3.5 accent-[var(--color-primary)]"
        checked={coche}
        disabled={action.isPending}
        onChange={() => action.mutate()}
      />
      {libelle}
    </label>
  );
}

/** Que faire de la milestone de la semaine d'après (0369). */
function CelluleSuivante({ ligne, suivante }: { ligne: LignePaie; suivante?: SemaineSuivante }) {
  const { t, i18n } = useTranslation();
  if (!suivante) return <span className="text-muted-foreground">—</span>;
  const langue = i18n.resolvedLanguage ?? "fr";
  const c = consigneSuivante(ligne.semaine, suivante, ligne.tarif, (n) => dollars(n, langue));
  const valeurs = { ...c.valeurs, ...(c.valeurs.raison ? { raison: t(`paie.suivante.raisons.${c.valeurs.raison}`) } : {}) };
  return (
    <span
      className={cn(
        "block min-w-52 rounded-md border px-2 py-1 text-xs font-medium",
        c.ton === "ok" && "border-success/40 bg-success/8",
        c.ton === "stop" && "border-destructive/40 bg-destructive/8",
        c.ton === "alerte" && "border-warning/50 bg-warning/10",
      )}
    >
      {t(`paie.suivante.${c.cle}`, valeurs)}
      {suivante.action === "financer_normal" && (
        <span className="ml-1 font-normal text-muted-foreground">({t("paie.suivante.recree")})</span>
      )}
    </span>
  );
}

/** Le tableau de paie d'une semaine (HM ou admin). */
export function TableauPaie({ lignes }: { lignes: LignePaie[] }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const semaine = lignes[0]?.semaine;
  const suivantes = useQuery({
    queryKey: ["paie", "suivante", semaine],
    queryFn: () => lireSemaineSuivante(semaine!),
    enabled: Boolean(semaine),
  });
  if (lignes.length === 0) return <p className="text-sm text-muted-foreground">{t("paie.vide")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {[
              t("paie.colonnes.posteur"),
              t("paie.colonnes.contrat"),
              t("paie.colonnes.milestone"),
              t("paie.colonnes.comptes"),
              t("paie.colonnes.prevus"),
              t("paie.colonnes.faits"),
              t("paie.colonnes.manques"),
              t("paie.colonnes.tarif"),
              t("paie.colonnes.retenue"),
              t("paie.colonnes.montant"),
              t("paie.colonnes.statut"),
              t("paie.colonnes.suivante"),
              "",
            ].map((e, i) => (
              <th key={i} className={TH}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {lignes.map((l) => (
            <tr key={l.id} className={l.paye_at && l.semaine_suivante_faite_at ? "opacity-60" : undefined}>
              <td className={`${TD} whitespace-nowrap`}>{nomPosteur(l)}</td>
              <td className={TD}>
                <CelluleContrat ligne={l} />
              </td>
              <td className={`${TD} whitespace-nowrap`}>{l.comptes_payes > 0 ? milestone(l.semaine, l.comptes_payes) : "—"}</td>
              <td className={TD}>{l.nb_comptes}</td>
              <td className={TD}>{l.prevus}</td>
              <td className={TD}>{l.faits}</td>
              <td className={TD}>{l.manques}</td>
              <td className={`${TD} whitespace-nowrap`}>{l.tarif === null ? "—" : dollars(l.tarif, langue)}</td>
              <td className={`${TD} whitespace-nowrap`}>{l.retenue > 0 ? `−${dollars(l.retenue, langue)}` : "—"}</td>
              <td className={`${TD} whitespace-nowrap font-semibold`}>{dollars(l.montant, langue)}</td>
              <td className={`${TD} min-w-40`}>
                <Badge variant={l.statut === "ok" ? "success" : "warning"}>{t(`paie.statuts.${l.statut}`)}</Badge>
                {l.raison && <p className="mt-1 text-xs text-muted-foreground">{l.raison}</p>}
              </td>
              <td className={TD}>
                <CelluleSuivante ligne={l} suivante={suivantes.data?.get(l.poster_id)} />
              </td>
              <td className={TD}>
                <div className="flex flex-col gap-1">
                  <Case
                    coche={Boolean(l.paye_at)}
                    libelle={t("paie.paye")}
                    aideAnnuler={t("paie.annulerPaye")}
                    basculer={(c) => marquerPayee(l.id, c)}
                  />
                  <Case
                    coche={Boolean(l.semaine_suivante_faite_at)}
                    libelle={t("paie.suivante.faite")}
                    aideAnnuler={t("paie.suivante.annulerFaite")}
                    basculer={(c) => marquerSemaineSuivante(l.id, c)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
