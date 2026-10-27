import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import {
  enregistrerRecrutement,
  listerPaysActifs,
  listerPersonnes,
  listerRecrutement,
  type ControleCkd,
  type RecrutementCkd,
} from "./api";

function LignePays({ controle, pays, ligne, hmNom }: { controle: ControleCkd; pays: string; ligne?: RecrutementCkd; hmNom?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [valeur, setValeur] = React.useState(ligne ? String(ligne.nombre) : "");
  const enregistrer = useMutation({
    mutationFn: (n: number) => enregistrerRecrutement(controle.id, pays, n),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ckd", "recrutement", controle.id] }),
  });
  const sauver = () => {
    const n = valeur.trim() === "" ? 0 : Number(valeur);
    if (!Number.isInteger(n) || n < 0) return;
    if (n === (ligne?.nombre ?? 0)) return;
    enregistrer.mutate(n);
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 truncate">
        {drapeauPays(pays)} {nomPaysIso(pays)}
      </span>
      <Input
        type="number"
        min={0}
        step={1}
        className="h-8 w-20"
        aria-label={t("ckd.recrutement.aRecruterPays", { pays: nomPaysIso(pays) })}
        value={valeur}
        placeholder="0"
        onChange={(e) => setValeur(e.target.value)}
        onBlur={sauver}
        onKeyDown={(e) => {
          if (e.key === "Enter") sauver();
        }}
      />
      <span className="truncate text-xs text-muted-foreground">
        {ligne ? (hmNom ? t("ckd.recrutement.pour", { hm: hmNom }) : t("ckd.recrutement.sansHm")) : ""}
        {ligne?.envoye_at ? ` · ${t("ckd.recrutement.envoye")}` : ""}
      </span>
      {enregistrer.error && <span className="text-xs text-destructive">{(enregistrer.error as Error).message}</span>}
    </div>
  );
}

/** Le samedi, avec les décisions : combien recruter par pays (0364). */
export function CarteRecrutement({ controle }: { controle: ControleCkd }) {
  const { t } = useTranslation();
  const donnees = useQuery({
    queryKey: ["ckd", "recrutement", controle.id],
    queryFn: async () => {
      const [lignes, pays] = await Promise.all([listerRecrutement(controle.id), listerPaysActifs()]);
      const hms = [...new Set(lignes.map((l) => l.hm_id).filter((x): x is string => Boolean(x)))];
      const personnes = new Map((await listerPersonnes(hms)).map((p) => [p.id, [p.prenom, p.nom].filter(Boolean).join(" ")]));
      return { lignes, pays: [...new Set([...pays, ...lignes.map((l) => l.pays)])].sort(), personnes };
    },
  });
  const parPays = new Map((donnees.data?.lignes ?? []).map((l) => [l.pays, l]));
  const total = (donnees.data?.lignes ?? []).reduce((a, l) => a + l.nombre, 0);
  return (
    <Card data-testid="carte-recrutement">
      <CardHeader>
        <CardTitle className="text-base">
          {t("ckd.recrutement.titre")} · {total}
        </CardTitle>
        <CardDescription>
          {t("ckd.recrutement.desc", { cohorte: ajouterJours(controle.jour, 9) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {(donnees.data?.pays ?? []).map((p) => (
          <LignePays
            key={`${p}-${parPays.get(p)?.nombre ?? 0}`}
            controle={controle}
            pays={p}
            ligne={parPays.get(p)}
            hmNom={parPays.get(p)?.hm_id ? donnees.data?.personnes.get(parPays.get(p)!.hm_id!) : undefined}
          />
        ))}
        {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
