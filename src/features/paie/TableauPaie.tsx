import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { enregistrerContrat, marquerPayee, type LignePaie } from "./api";
import { dollars, milestone, nomPosteur } from "./logique";

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

function BoutonPaye({ ligne }: { ligne: LignePaie }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const basculer = useMutation({
    mutationFn: () => marquerPayee(ligne.id, !ligne.paye_at),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  if (ligne.paye_at) {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="success">
          <Check className="size-3" />
          {t("paie.paye")}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={t("paie.annulerPaye")}
          title={t("paie.annulerPaye")}
          disabled={basculer.isPending}
          onClick={() => basculer.mutate()}
        >
          <Undo2 className="size-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <Button size="sm" variant="outline" className="h-7" disabled={basculer.isPending} onClick={() => basculer.mutate()}>
      {t("paie.marquerPaye")}
    </Button>
  );
}

/** Le tableau de paie d'une semaine (HM ou admin). */
export function TableauPaie({ lignes }: { lignes: LignePaie[] }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
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
            <tr key={l.id} className={l.paye_at ? "opacity-60" : undefined}>
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
                <BoutonPaye ligne={l} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
