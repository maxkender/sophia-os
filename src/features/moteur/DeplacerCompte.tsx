import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nomProfil } from "@/features/hiring/suiviEquipe";
import { deplacerCompte } from "@/features/moteur/api";
import {
  destinationsDeplacementCompte,
  estCompteCm,
} from "@/features/moteur/comptesCm";
import type { PosterProfil } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export type CompteDeplacable = {
  id: string;
  type_compte?: string | null;
  langue: string;
  handle_tiktok?: string | null;
  persona_nom?: string | null;
};

function libelleCompte(c: CompteDeplacable): string {
  const handle = c.handle_tiktok?.replace(/^@+/, "");
  if (handle) return `@${handle}`;
  return c.persona_nom?.trim() || c.id.slice(0, 8);
}

/** Formulaire HM / admin : rattache un compte existant à un autre créateur. */
export function DeplacerCompte({
  compte,
  source,
  createurs,
  queryKeys = [["posters"]],
}: {
  compte: CompteDeplacable;
  source: PosterProfil;
  createurs: PosterProfil[];
  queryKeys?: unknown[][];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dests = React.useMemo(
    () => destinationsDeplacementCompte(compte, source.id, createurs),
    [compte, source.id, createurs],
  );
  const destIds = dests.map((d) => d.id).join(",");
  const [ouvert, setOuvert] = React.useState(false);
  const [destId, setDestId] = React.useState(dests[0]?.id ?? "");

  React.useEffect(() => {
    const ids = destIds ? destIds.split(",") : [];
    setDestId((actuel) => (actuel && ids.includes(actuel) ? actuel : (ids[0] ?? "")));
  }, [destIds]);

  const deplacer = useMutation({
    mutationFn: () => deplacerCompte({ compteId: compte.id, destPosterId: destId }),
    onSuccess: () => {
      setOuvert(false);
      for (const key of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  if (dests.length === 0) {
    const autresCreateurs = createurs.some(
      (c) => c.id !== source.id && (c.role ?? "poster") === "poster",
    );
    return (
      <p className="text-xs text-muted-foreground">
        {estCompteCm(compte) && autresCreateurs
          ? t("cm.languePrise")
          : t("hiring.deplacerCompteAucun")}
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary"
      >
        <ArrowRightLeft className="size-3" />
        {t("hiring.deplacerCompte")}
      </button>
    );
  }

  const dest = dests.find((d) => d.id === destId);
  const erreur = deplacer.error as Error | undefined;
  const msg = erreur?.message ?? "";
  const messageErreur =
    /DEST_PAS_CREATEUR|forbidden/.test(msg)
      ? t("hiring.deplacerCompteDestPasCreateur")
      : /CM_LANGUE_PRISE/.test(msg)
        ? t("cm.languePrise")
        : msg;

  return (
    <form
      className="space-y-2 rounded-md border p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dest) return;
        if (
          !window.confirm(
            t("hiring.deplacerCompteConfirm", {
              compte: libelleCompte(compte),
              depuis: nomProfil(source),
              vers: nomProfil(dest),
            }),
          )
        ) {
          return;
        }
        deplacer.mutate();
      }}
    >
      <p className="text-xs font-medium">{t("hiring.deplacerCompte")}</p>
      <p className="text-[11px] text-muted-foreground">{t("hiring.deplacerCompteAide")}</p>
      <div className="space-y-1">
        <Label htmlFor={`deplacer-${compte.id}`} className="text-xs">
          {t("hiring.deplacerCompteCible")}
        </Label>
        <select
          id={`deplacer-${compte.id}`}
          className={selectClass}
          value={destId}
          onChange={(e) => setDestId(e.target.value)}
          required
        >
          {dests.map((d) => (
            <option key={d.id} value={d.id}>
              {nomProfil(d)}
              {d.email && d.email !== nomProfil(d) ? ` · ${d.email}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={deplacer.isPending || !destId}>
          <ArrowRightLeft className="size-4" />
          {deplacer.isPending ? t("common.saving") : t("hiring.deplacerCompteAction")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          {t("common.cancel")}
        </Button>
      </div>
      {deplacer.isError && <p className="text-xs text-destructive">{messageErreur}</p>}
    </form>
  );
}
