import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { lireQualite, type QualiteSemaine } from "./api";

/** « 42 s », « 12 min », « 3,5 h ». */
export function dureeCourte(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return "—";
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 90) return `${Math.round(min)} min`;
  return `${(Math.round(min / 6) / 10).toString().replace(".", ",")} h`;
}

/** Le lundi de la semaine qui vient de finir, ou d'une semaine avant (décalage en semaines). */
export function lundiPrecedent(decalage: number, maintenant = new Date()): string {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour - 7 * (1 + decalage));
  return d.toISOString().slice(0, 10);
}

/**
 * 21/11 (Max, point 10) : le rapport qualité du support, semaine par semaine (le DM du lundi en est le résumé) :
 * % réglé sans humain (objectif 70 %), délai de 1re réponse, rouverts, cas pour Max par sujet, emails, emails reçus
 * sans posteur relié, et 10 réponses du bot tirées au hasard à relire.
 */
export function PageQualite() {
  const [decalage, setDecalage] = React.useState(0);
  const lundi = lundiPrecedent(decalage);
  const q = useQuery({ queryKey: ["aujourdhui", "qualite", lundi], queryFn: () => lireQualite(lundi) });
  return (
    <div className="mx-auto max-w-3xl space-y-3" data-testid="page-qualite">
      <div className="flex items-center gap-2 text-sm">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setDecalage(decalage + 1)}>←</button>
        <span className="font-medium">Semaine du {lundi.split("-").reverse().join("/")}</span>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={decalage === 0} onClick={() => setDecalage(decalage - 1)}>→</button>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && <VueQualite q={q.data} />}
    </div>
  );
}

export function VueQualite({ q }: { q: QualiteSemaine }) {
  const atteint = q.pct_sans_humain !== null && q.pct_sans_humain >= q.objectif;
  const sujets = Object.entries(q.niveau2_par_sujet ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Case titre="Réglé sans humain" valeur={q.pct_sans_humain === null ? "—" : `${q.pct_sans_humain} %`}
          sous={`objectif ${q.objectif} % · ${q.sans_humain} sur ${q.demandes}`} ton={atteint ? "ok" : "ko"} />
        <Case titre="1re réponse (médiane)" valeur={dureeCourte(q.delai_premiere_reponse_min)} sous={`humain : ${dureeCourte(q.delai_reponse_humaine_min)}`} />
        <Case titre="Rouverts" valeur={q.rouverts} />
        <Case titre="Emails délivrés" valeur={q.emails.delivres} sous={`${q.emails.refuses} refusés sur ${q.emails.envoyes}`} ton={q.emails.refuses > 0 ? "ko" : undefined} />
        <Case titre="Emails reçus sans posteur" valeur={q.emails_entrants_non_relies} ton={q.emails_entrants_non_relies > 0 ? "ko" : undefined} />
        <Case titre="Demandes" valeur={q.demandes} />
      </div>
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Cas pour toi (niveau 2) par sujet</h3>
          {sujets.length === 0 && <p className="text-sm text-muted-foreground">Aucun.</p>}
          {sujets.map(([s, n]) => (
            <div key={s} className="flex items-center gap-2 text-sm">
              <span className="w-36 shrink-0 truncate">{s}</span>
              <div className="h-2 flex-1 rounded bg-muted">
                <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.round((100 * n) / Math.max(...sujets.map((x) => x[1])))}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums">{n}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">10 réponses du bot à relire (au hasard)</h3>
          {q.a_relire.length === 0 && <p className="text-sm text-muted-foreground">Aucune réponse cette semaine.</p>}
          {q.a_relire.map((r) => (
            <div key={r.id} className="space-y-1 border-t pt-2 text-sm first:border-t-0 first:pt-0" data-testid="a-relire">
              <div className="text-xs text-muted-foreground">{r.categorie ?? "—"}{r.langue ? ` · ${r.langue}` : ""}</div>
              <p className="whitespace-pre-wrap rounded bg-muted/40 px-2 py-1">{r.demande}</p>
              <p className="whitespace-pre-wrap rounded bg-primary/10 px-2 py-1">{r.reponse}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Case({ titre, valeur, sous, ton }: { titre: string; valeur: React.ReactNode; sous?: string; ton?: "ok" | "ko" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{titre}</div>
        <div className={cn("text-2xl font-semibold tabular-nums", ton === "ok" && "text-emerald-600", ton === "ko" && "text-amber-700 dark:text-amber-400")}>{valeur}</div>
        {sous && <div className="text-xs text-muted-foreground">{sous}</div>}
      </CardContent>
    </Card>
  );
}
