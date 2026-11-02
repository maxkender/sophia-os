import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { lireTarif, modifierTarif } from "./api";

/** Fiche posteur (admin) : le tarif hebdo de la paie, par compte (0361). */
export function TarifPoster({ posterId }: { posterId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tarif = useQuery({ queryKey: ["paie", "tarif", posterId], queryFn: () => lireTarif(posterId) });
  const [valeur, setValeur] = React.useState<string | null>(null);
  const enregistrer = useMutation({
    mutationFn: () => modifierTarif(posterId, valeur === null || valeur.trim() === "" ? null : Number(valeur)),
    onSuccess: () => {
      setValeur(null);
      return queryClient.invalidateQueries({ queryKey: ["paie"] });
    },
  });
  // Migration pas encore passée, ou autre erreur : on n'encombre pas la fiche.
  if (tarif.error) return null;
  const affiche = valeur ?? (tarif.data === null || tarif.data === undefined ? "" : String(tarif.data));
  const invalide = affiche.trim() !== "" && !(Number(affiche) >= 0);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor={`tarif-${posterId}`} className="text-muted-foreground">
        {t("paie.tarifFiche")}
      </label>
      <Input
        id={`tarif-${posterId}`}
        type="number"
        min={0}
        step={1}
        className="h-7 w-20 text-xs"
        value={affiche}
        placeholder="—"
        onChange={(e) => setValeur(e.target.value)}
      />
      <span className="text-muted-foreground">$</span>
      {valeur !== null && (
        <Button size="sm" className="h-7" disabled={invalide || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("common.save")}
        </Button>
      )}
      {enregistrer.error && <span className="text-destructive">{(enregistrer.error as Error).message}</span>}
    </div>
  );
}
