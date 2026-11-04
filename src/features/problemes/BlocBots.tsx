import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { annulerActionBot, lireActionsBots, lireAutonomie, reglerAutonomie } from "./api";

const P = "problemes.bots";

/**
 * 4/11 : 🤖 Fait par les bots. L'interrupteur « autonomie_bots » (off par
 * défaut : les bots proposent, Max fait) et ce que les bots ont fait seuls ces
 * 24 dernières heures, avec le message envoyé et [Annuler / corriger].
 */
export function BlocBots() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [message, setMessage] = React.useState<string | null>(null);
  const autonomie = useQuery({ queryKey: ["bots", "autonomie"], queryFn: lireAutonomie });
  const actions = useQuery({ queryKey: ["bots", "actions"], queryFn: () => lireActionsBots(24), refetchInterval: 60_000 });
  const regler = useMutation({
    mutationFn: (on: boolean) => reglerAutonomie(on),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bots", "autonomie"] }),
    onError: (e) => setMessage((e as Error).message),
  });
  const annuler = useMutation({
    mutationFn: (id: string) => annulerActionBot(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bots", "actions"] });
      void qc.invalidateQueries({ queryKey: ["problemes"] });
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const on = autonomie.data === "on";
  const liste = actions.data ?? [];
  return (
    <div className="space-y-2" data-testid="bloc-bots">
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
        <span className="font-medium">{t(`${P}.autonomie`)}</span>
        <Badge variant={on ? "success" : "secondary"} data-testid="autonomie">{on ? "on" : "off"}</Badge>
        <Button size="sm" variant="outline" onClick={() => {
          if (on || window.confirm(t(`${P}.confirmerOn`))) regler.mutate(!on);
        }} disabled={regler.isPending || autonomie.isLoading}>
          {on ? t(`${P}.couper`) : t(`${P}.activer`)}
        </Button>
        <span className="text-xs text-muted-foreground">{t(`${P}.garde`)}</span>
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`${P}.faits`, { count: liste.length })}</p>
      {liste.map((a) => (
        <Card key={a.id} data-testid="action-bot">
          <CardContent className="space-y-1 p-3 text-sm">
            <p>
              <span className="font-medium">{a.nom ?? "—"}</span>
              <span className="text-muted-foreground"> · {t(`problemes.proprietaires.${a.bot}`, { defaultValue: a.bot })} · {new Date(a.at).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" })}</span>
              {" "}<Badge variant={a.statut === "fait" ? "success" : a.statut === "annule" ? "secondary" : "warning"}>{t(`${P}.statuts.${a.statut}`, { defaultValue: a.statut })}</Badge>
            </p>
            <p>🤖 {t(`problemes.carte.actions.${a.action}`, { defaultValue: a.action })}{a.canal ? ` · ${a.canal}` : ""}</p>
            {a.message && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{a.message}</p>}
            {a.raison && <p className="text-xs text-muted-foreground">{a.raison}</p>}
            {a.statut === "fait" && (
              <Button size="sm" variant="outline" onClick={() => annuler.mutate(a.id)} disabled={annuler.isPending}>{t(`${P}.annuler`)}</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
