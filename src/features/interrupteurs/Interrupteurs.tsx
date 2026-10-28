import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

import {
  enregistrerInterrupteur,
  enregistrerRepriseRappels,
  INTERRUPTEURS,
  lireInterrupteurs,
  lireRepriseRappels,
  type CleInterrupteur,
  type ModeInterrupteur,
} from "./api";

const MODES: ModeInterrupteur[] = ["off", "test", "on"];
const VARIANTE: Record<ModeInterrupteur, "secondary" | "warning" | "success"> = { off: "secondary", test: "warning", on: "success" };

/**
 * Réglages → Interrupteurs (système du 2 nov.) : chaque fonction automatique,
 * off / test / on, avec ce qu'elle fait une fois sur « on ». Admin seulement
 * pour changer ; le Head of Ops les lit.
 */
export function Interrupteurs() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const changer = useMutation({
    mutationFn: ({ cle, mode }: { cle: CleInterrupteur; mode: ModeInterrupteur }) => enregistrerInterrupteur(cle, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interrupteurs"] }),
  });
  return (
    <Card id="interrupteurs" data-testid="interrupteurs">
      <CardHeader>
        <CardTitle>{t("interrupteurs.titre")}</CardTitle>
        <CardDescription>{t("interrupteurs.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {INTERRUPTEURS.map((cle) => {
          const mode = lu.data?.[cle] ?? "test";
          return (
            <div key={cle} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3" data-interrupteur={cle}>
              <div className="min-w-0 max-w-xl space-y-0.5">
                <p className="text-sm font-medium">
                  {t(`interrupteurs.${cle}.titre`)} <Badge variant={VARIANTE[mode]}>{t(`interrupteurs.modes.${mode}`)}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{t(`interrupteurs.${cle}.on`)}</p>
              </div>
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label={t(`interrupteurs.${cle}.titre`)}>
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!admin || changer.isPending}
                    aria-pressed={mode === m}
                    className={cn(
                      "rounded px-2.5 py-1",
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => {
                      if (m === "on" && !window.confirm(t("interrupteurs.confirmerOn", { nom: t(`interrupteurs.${cle}.titre`) }))) return;
                      changer.mutate({ cle, mode: m });
                    }}
                  >
                    {t(`interrupteurs.modes.${m}`)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {changer.isError && <p className="text-sm text-destructive">{(changer.error as Error).message}</p>}
        <PauseRappels admin={admin} />
      </CardContent>
    </Card>
  );
}

/** Rappels en pause pour tous jusqu'à une date (les HM suivent encore la cohorte). */
function PauseRappels({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["rappels-reprise"], queryFn: lireRepriseRappels });
  const [jour, setJour] = useState("");
  useEffect(() => setJour(lu.data ?? ""), [lu.data]);
  const enregistrer = useMutation({
    mutationFn: (j: string) => enregistrerRepriseRappels(j),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rappels-reprise"] }),
  });
  return (
    <div className="space-y-1.5 rounded-lg border p-3" data-testid="pause-rappels">
      <p className="text-sm font-medium">{t("interrupteurs.pause.titre")}</p>
      <p className="text-xs text-muted-foreground">{t("interrupteurs.pause.aide")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="w-44"
          value={jour}
          disabled={!admin}
          aria-label={t("interrupteurs.pause.titre")}
          onChange={(e) => setJour(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={!admin || enregistrer.isPending || jour === (lu.data ?? "")} onClick={() => enregistrer.mutate(jour)}>
          {t("interrupteurs.pause.enregistrer")}
        </Button>
        {admin && jour && (
          <Button size="sm" variant="ghost" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate("")}>
            {t("interrupteurs.pause.retirer")}
          </Button>
        )}
      </div>
      {enregistrer.isError && <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>}
    </div>
  );
}
