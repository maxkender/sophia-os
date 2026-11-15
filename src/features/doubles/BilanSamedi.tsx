import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";

import { jj, lireBilanSamedi } from "./memoire";

const ICONE = { bonne: "✅", a_revoir: "⚠️", erreur: "❌" } as const;
const DECISION: Record<string, string> = { doubler: "Doubler", garder: "Garder", pas_maintenant: "Pas maintenant", ne_pas_renouveler: "Kill" };

/** 0559 (C3) : en haut du samedi, ce qu'ont donné les décisions du samedi dernier. */
export function BilanSamedi() {
  const q = useQuery({ queryKey: ["samedi-bilan"], queryFn: () => lireBilanSamedi(), staleTime: 600_000 });
  const [ouvert, setOuvert] = React.useState(false);
  const b = q.data;
  if (q.isLoading || !b?.jour) return null;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const aVoir = b.lignes.filter((l) => l.verdict !== "bonne");
  return (
    <Card data-testid="bilan-samedi">
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">Ce qu'a donné samedi dernier ({jj(b.jour)})</h3>
          <span>✅ {b.verdicts.bonne} · ⚠️ {b.verdicts.a_revoir} · ❌ {b.verdicts.erreur}</span>
        </div>
        <p className="text-muted-foreground">
          {b.kills} kill(s) · {b.doubles} doublé(s), dont {b.doubles_acceptes} accepté(s) · {b.gardes} gardé(s) · coût ajouté {b.cout_ajoute} $ / semaine
        </p>
        {aVoir.length > 0 && (
          <button type="button" className="text-xs underline underline-offset-2" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "Masquer" : `Voir les ${aVoir.length} à revoir`}
          </button>
        )}
        {ouvert && (
          <ul className="space-y-0.5">
            {aVoir.map((l) => (
              <li key={`${l.poster_id}-${l.decision}`}>
                {ICONE[l.verdict]} <b>{l.nom}</b> — {DECISION[l.decision] ?? l.decision} : {l.detail}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
