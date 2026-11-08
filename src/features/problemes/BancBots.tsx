import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lancerBanc, lireBanc, pourcent, SOURCES_EXEMPLES } from "./banc";

/**
 * 0567 : « Agent test bench ». Les bots rejoués sur 30 cas réels (les
 * corrections de Max), avec un score ; relancé après chaque changement de
 * consigne, ou à la main.
 */
export function BancBots() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bots", "banc"], queryFn: lireBanc, refetchInterval: 30_000 });
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const [dernier, ...avant] = q.data.passages;
  const ratés = (dernier?.details ?? []).filter((d) => !d.ok);
  const relancer = async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const r = await lancerBanc();
      setMessage(r.ok ? `Score : ${r.justes}/${r.n}` : r.error ?? "Échec");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
      await qc.invalidateQueries({ queryKey: ["bots", "banc"] });
    }
  };
  return (
    <Card data-testid="banc-bots">
      <CardHeader>
        <CardTitle>Agent test bench</CardTitle>
        <CardDescription>
          Les bots rejoués sur 30 cas réels tranchés par Max, avec leurs consignes et les exemples. Relancé après chaque changement de consigne.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {dernier ? (
            <span className="text-base font-semibold" data-testid="banc-score">
              {dernier.statut === "en_cours" ? "En cours…" : dernier.statut === "erreur" ? "Erreur" : `${dernier.justes}/${dernier.n} · ${pourcent(dernier.score)}`}
            </span>
          ) : <span className="text-muted-foreground">Pas encore lancé.</span>}
          {dernier ? <span className="text-xs text-muted-foreground">le {new Date(dernier.lance_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} ({dernier.declencheur})</span> : null}
          <Button size="sm" variant="outline" disabled={occupe} onClick={relancer}>{occupe ? "Banc en cours…" : "Relancer le banc"}</Button>
        </div>
        {message ? <p role="status">{message}</p> : null}
        {dernier?.erreur ? <p className="text-destructive">{dernier.erreur}</p> : null}
        {avant.length ? (
          <p className="text-xs text-muted-foreground">
            Avant : {avant.slice(0, 5).map((p) => (p.score === null ? "—" : pourcent(p.score))).join(" · ")}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Exemples : {Object.entries(q.data.exemples ?? {}).map(([s, n]) => `${SOURCES_EXEMPLES[s] ?? s} ${n}`).join(" · ")}
        </p>
        {ratés.length ? (
          <div className="space-y-1">
            <p className="font-medium">Cas ratés au dernier passage</p>
            <ul className="space-y-1 text-xs">
              {ratés.map((d) => (
                <li key={d.cle} className="rounded border px-2 py-1">
                  {d.situation} — attendu <b>{d.attendu}</b>, le bot a choisi <b>{d.obtenu ?? "rien"}</b>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
