import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { enregistrerReglagesBonus, lireReglagesBonus, type ReglagesBonus } from "@/features/bonus/api";

import { enregistrerReglagesPaie, lireReglagesPaie, type ReglagesPaie as TReglagesPaie } from "./liste/api";

/**
 * Les réglages de la paie et des bonus (0380, 0374, 0388) : seuil d'une
 * semaine pleine, retenue par post raté, bonus de la 1re semaine, bonus
 * Comment Master, premier lundi bonus, et le bonus de parrainage (en pause
 * tant que la case est décochée : ses champs sont alors cachés).
 * Modifiables par l'admin seulement (prompt 15, point 1 ; politique 0390) :
 * le Head of Ops les lit.
 */
export function ReglagesPaie() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const queryClient = useQueryClient();
  const paie = useQuery({ queryKey: ["reglages", "paie"], queryFn: lireReglagesPaie });
  const bonus = useQuery({ queryKey: ["reglages", "bonus"], queryFn: lireReglagesBonus });
  const [p, setP] = React.useState<TReglagesPaie | null>(null);
  const [parrainage, setParrainage] = React.useState(false);
  const [bonusPremiere, setBonusPremiere] = React.useState(1);
  const [b, setB] = React.useState<ReglagesBonus | null>(null);
  React.useEffect(() => {
    if (paie.data) {
      setP(paie.data.paie);
      setParrainage(paie.data.parrainageActif);
      setBonusPremiere(paie.data.bonusPremiereSemaine);
    }
  }, [paie.data]);
  React.useEffect(() => {
    if (bonus.data) setB(bonus.data);
  }, [bonus.data]);

  const enregistrer = useMutation({
    mutationFn: async () => {
      await enregistrerReglagesPaie(p!, parrainage, bonusPremiere);
      await enregistrerReglagesBonus(b!);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reglages"] });
      void queryClient.invalidateQueries({ queryKey: ["paie"] });
    },
  });
  if (!p || !b) return null;
  const pasLundi = new Date(`${b.premier_lundi}T12:00:00Z`).getUTCDay() !== 1;

  const nombre = (libelle: string, valeur: number, onChange: (n: number) => void, pas = "1") => (
    <label className="space-y-1 text-sm">
      <span className="block text-xs text-muted-foreground">{libelle}</span>
      <Input type="number" min={0} step={pas} value={String(valeur)} onChange={(e) => onChange(Number(e.target.value))} aria-label={libelle} />
    </label>
  );

  return (
    <details className="rounded-xl border px-4 py-3" data-testid="reglages-paie">
      <summary className="cursor-pointer text-sm font-medium">{t("paie.reglagesV3.titre")}</summary>
      {!admin && <p className="pt-2 text-xs text-muted-foreground">{t("paie.reglagesV3.lectureSeule")}</p>}
      <fieldset disabled={!admin} className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        {nombre(t("paie.reglagesV3.seuil"), p.seuil_posts_complets, (n) => setP({ ...p, seuil_posts_complets: n }))}
        {nombre(t("paie.reglagesV3.retenue"), p.retenue_par_post, (n) => setP({ ...p, retenue_par_post: n }), "0.01")}
        {nombre(t("paie.reglagesV3.bonusPremiere"), bonusPremiere, setBonusPremiere, "0.01")}
        {nombre(t("bonus.reglages.comment_master_par_commentaire"), b.comment_master_par_commentaire, (n) =>
          setB({ ...b, comment_master_par_commentaire: n }), "0.01")}
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">{t("bonus.reglages.premier_lundi")}</span>
          <Input
            type="date"
            value={b.premier_lundi}
            onChange={(e) => setB({ ...b, premier_lundi: e.target.value })}
            aria-label={t("bonus.reglages.premier_lundi")}
          />
          {pasLundi && <span className="block text-xs text-destructive">{t("bonus.reglages.pasLundi")}</span>}
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={parrainage}
            onChange={(e) => setParrainage(e.target.checked)}
          />
          {t("paie.reglagesV3.parrainage")}
        </label>
        {parrainage && (
          <>
            {nombre(t("bonus.reglages.parrainage_montant"), b.parrainage_montant, (n) => setB({ ...b, parrainage_montant: n }), "0.01")}
            {nombre(t("bonus.reglages.parrainage_semaines_min"), b.parrainage_semaines_min, (n) =>
              setB({ ...b, parrainage_semaines_min: n }))}
            {nombre(t("bonus.reglages.parrainage_posts_min_semaine"), b.parrainage_posts_min_semaine, (n) =>
              setB({ ...b, parrainage_posts_min_semaine: n }))}
          </>
        )}
      </fieldset>
      <div className={admin ? "flex items-center gap-2 pt-3" : "hidden"}>
        <Button size="sm" disabled={enregistrer.isPending || pasLundi} onClick={() => enregistrer.mutate()}>
          {t("paie.reglagesV3.enregistrer")}
        </Button>
        {enregistrer.isSuccess && <span className="text-xs text-success-foreground">{t("paie.reglagesV3.enregistre")}</span>}
        {enregistrer.isError && <span className="text-xs text-destructive">{(enregistrer.error as Error).message}</span>}
      </div>
    </details>
  );
}
