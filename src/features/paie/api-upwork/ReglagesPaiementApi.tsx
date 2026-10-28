import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";

import { enregistrerReglagesPaiementApi, lireReglagesPaiementApi, type ReglagesPaiementApi as TReglages } from "./api";

/**
 * Paiement par l'API Upwork (prompt 14, point 3, 0399) : le mode (éteint,
 * test sur les contrats choisis, tout le monde), les dates d'ouverture et les
 * plafonds. Modifiables par l'admin seulement ; le Head of Ops les lit.
 */
export function ReglagesPaiementApi() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const queryClient = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "paie-api"], queryFn: lireReglagesPaiementApi });
  const [r, setR] = React.useState<TReglages | null>(null);
  const [contrats, setContrats] = React.useState("");
  React.useEffect(() => {
    if (lu.data) {
      setR(lu.data);
      setContrats(lu.data.contrats_test.join(", "));
    }
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: () =>
      enregistrerReglagesPaiementApi({
        ...r!,
        contrats_test: contrats.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reglages", "paie-api"] }),
  });
  if (!r) return null;
  const nombre = (libelle: string, valeur: number, onChange: (n: number) => void) => (
    <label className="space-y-1 text-sm">
      <span className="block text-xs text-muted-foreground">{libelle}</span>
      <Input type="number" min={0} step="1" value={String(valeur)} onChange={(e) => onChange(Number(e.target.value))} aria-label={libelle} />
    </label>
  );
  const date = (libelle: string, valeur: string, onChange: (v: string) => void) => (
    <label className="space-y-1 text-sm">
      <span className="block text-xs text-muted-foreground">{libelle}</span>
      <Input type="date" value={valeur} onChange={(e) => onChange(e.target.value)} aria-label={libelle} />
    </label>
  );
  return (
    <details className="rounded-xl border px-4 py-3" data-testid="reglages-paie-api">
      <summary className="cursor-pointer text-sm font-medium">
        {t("paie.api.reglages.titre")} · <span className="text-muted-foreground">{t(`paie.api.reglages.modes.${r.mode}`)}</span>
      </summary>
      <p className="pt-2 text-xs text-muted-foreground">{t("paie.api.reglages.aide")}</p>
      {!admin && <p className="pt-1 text-xs text-muted-foreground">{t("paie.reglagesV3.lectureSeule")}</p>}
      <fieldset disabled={!admin} className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">{t("paie.api.reglages.mode")}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={r.mode}
            onChange={(e) => setR({ ...r, mode: e.target.value as TReglages["mode"] })}
            aria-label={t("paie.api.reglages.mode")}
          >
            {(["off", "test", "on"] as const).map((m) => (
              <option key={m} value={m}>
                {t(`paie.api.reglages.modes.${m}`)}
              </option>
            ))}
          </select>
        </label>
        {date(t("paie.api.reglages.testDes"), r.test_des, (v) => setR({ ...r, test_des: v }))}
        {date(t("paie.api.reglages.tousDes"), r.tous_des, (v) => setR({ ...r, tous_des: v }))}
        <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">
          <span className="block text-xs text-muted-foreground">{t("paie.api.reglages.contratsTest")}</span>
          <Input value={contrats} onChange={(e) => setContrats(e.target.value)} placeholder="44784407" aria-label={t("paie.api.reglages.contratsTest")} />
        </label>
        {nombre(t("paie.api.reglages.plafondLigne"), r.plafond_ligne, (n) => setR({ ...r, plafond_ligne: n }))}
        {nombre(t("paie.api.reglages.plafondJour"), r.plafond_jour, (n) => setR({ ...r, plafond_jour: n }))}
      </fieldset>
      <div className={admin ? "flex items-center gap-2 pt-3" : "hidden"}>
        <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("paie.reglagesV3.enregistrer")}
        </Button>
        {enregistrer.isSuccess && <span className="text-xs text-success-foreground">{t("paie.reglagesV3.enregistre")}</span>}
        {enregistrer.isError && <span className="text-xs text-destructive">{(enregistrer.error as Error).message}</span>}
      </div>
    </details>
  );
}
