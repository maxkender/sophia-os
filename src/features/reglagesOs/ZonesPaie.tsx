import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

import { enregistrerTarifZone, enregistrerZonePays, lignesPays, lireZonesPaie } from "./api";
import { JournalReglages } from "./JournalReglages";

/**
 * Payroll → Zones (0361, partie E) : le tarif de chaque zone et la zone de
 * chaque pays. Un pays des comptes actifs sans zone est en rouge : sa paie
 * n'a pas de tarif. Admin seulement (0411) ; chaque changement est journalisé.
 */
export function ZonesPaie() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["zones-paie"], queryFn: lireZonesPaie });
  const [tarifs, setTarifs] = React.useState<Record<string, string>>({});
  const [nouveauPays, setNouveauPays] = React.useState("");
  React.useEffect(() => {
    if (lu.data) setTarifs(Object.fromEntries(lu.data.zones.map((z) => [z.zone, String(z.tarif)])));
  }, [lu.data]);
  const apres = () => {
    void qc.invalidateQueries({ queryKey: ["zones-paie"] });
    void qc.invalidateQueries({ queryKey: ["reglages-journal"] });
    void qc.invalidateQueries({ queryKey: ["paie"] });
  };
  const tarif = useMutation({
    mutationFn: ({ zone, valeur }: { zone: string; valeur: number }) => enregistrerTarifZone(zone, valeur),
    onSuccess: apres,
  });
  const pays = useMutation({
    mutationFn: ({ code, zone }: { code: string; zone: string }) => enregistrerZonePays(code, zone),
    onSuccess: () => {
      setNouveauPays("");
      apres();
    },
  });
  if (lu.error) return <p className="text-sm text-destructive">{(lu.error as Error).message}</p>;
  if (!lu.data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const zones = lu.data.zones;
  const lignes = lignesPays(lu.data);
  const sansZone = lignes.filter((l) => !l.zone);
  const erreur = tarif.error ?? pays.error;
  return (
    <Card data-testid="zones-paie">
      <CardHeader>
        <CardTitle>{t("reglagesOs.zones.titre")}</CardTitle>
        <CardDescription>{t("reglagesOs.zones.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("reglagesOs.zones.tarifs")}</h3>
          <div className="flex flex-wrap gap-3">
            {zones.map((z) => {
              const v = tarifs[z.zone] ?? "";
              const n = Number(v);
              const change = v !== String(z.tarif);
              return (
                <div key={z.zone} className="flex items-end gap-2 rounded-md border p-2" data-zone={z.zone}>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs text-muted-foreground">{t("reglagesOs.zones.zone", { zone: z.zone })}</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      className="w-24"
                      value={v}
                      disabled={!admin}
                      aria-label={t("reglagesOs.zones.zone", { zone: z.zone })}
                      onChange={(e) => setTarifs({ ...tarifs, [z.zone]: e.target.value })}
                    />
                  </label>
                  {admin && change && (
                    <Button
                      size="sm"
                      disabled={tarif.isPending || !Number.isFinite(n) || n < 0 || v === ""}
                      onClick={() => {
                        if (window.confirm(t("reglagesOs.zones.confirmer", { zone: z.zone, avant: z.tarif, apres: n }))) {
                          tarif.mutate({ zone: z.zone, valeur: n });
                        }
                      }}
                    >
                      {t("common.save")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            {t("reglagesOs.zones.pays")}{" "}
            {sansZone.length > 0 && <span className="text-destructive">· {t("reglagesOs.zones.sansZone", { n: sansZone.length })}</span>}
          </h3>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {lignes.map((l) => (
              <div
                key={l.pays}
                data-pays={l.pays}
                data-sans-zone={l.zone ? undefined : "true"}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm",
                  !l.zone && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
              >
                <span className="font-mono">
                  {l.pays}
                  {!l.actif && <span className="ml-1 text-xs text-muted-foreground">{t("reglagesOs.zones.inactif")}</span>}
                </span>
                <select
                  className="h-8 rounded-md border bg-background px-1 text-sm text-foreground"
                  value={l.zone ?? ""}
                  disabled={!admin || pays.isPending}
                  aria-label={t("reglagesOs.zones.zoneDe", { pays: l.pays })}
                  onChange={(e) => e.target.value && pays.mutate({ code: l.pays, zone: e.target.value })}
                >
                  {!l.zone && <option value="">{t("reglagesOs.zones.aucune")}</option>}
                  {zones.map((z) => (
                    <option key={z.zone} value={z.zone}>
                      {z.zone} · {z.tarif}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {admin && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs text-muted-foreground">{t("reglagesOs.zones.ajouter")}</span>
                <Input
                  className="w-24 uppercase"
                  maxLength={2}
                  value={nouveauPays}
                  aria-label={t("reglagesOs.zones.ajouter")}
                  onChange={(e) => setNouveauPays(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                />
              </label>
              {zones.map((z) => (
                <Button
                  key={z.zone}
                  size="sm"
                  variant="outline"
                  disabled={nouveauPays.length !== 2 || pays.isPending}
                  onClick={() => pays.mutate({ code: nouveauPays, zone: z.zone })}
                >
                  {t("reglagesOs.zones.vers", { zone: z.zone })}
                </Button>
              ))}
            </div>
          )}
        </section>
        {erreur ? <p className="text-sm text-destructive">{(erreur as Error).message}</p> : null}
        {!admin && <p className="text-xs text-muted-foreground">{t("reglagesOs.adminSeulement")}</p>}
        <JournalReglages cles={["zones_paie:", "zones_paie_pays:"]} />
      </CardContent>
    </Card>
  );
}
