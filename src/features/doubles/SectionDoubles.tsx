import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { lireDoubles } from "./api";
import {
  compterStatuts,
  etapesAccepte,
  jourCourt,
  LIBELLE_STATUT,
  type LigneDouble,
  ORDRE_STATUT,
  resteAvant,
  type StatutDouble,
} from "./logique";

const COULEUR: Record<StatutDouble, string> = {
  propose: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  vu: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
  retenu: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  accepte: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  refuse: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  expire: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const ICONE = { ok: "✅", attente: "⏳", non: "—" } as const;

/**
 * 7/11 : Weekly decisions → « 2e comptes proposés ». Chaque Doubler est une
 * proposition : proposé → vu → accepté / refusé / expiré. Pour les acceptés,
 * le suivi : compte créé, warm-up, 1er post, milestone du 2e compte.
 */
export function SectionDoubles({ lignes: fournies }: { lignes?: LigneDouble[] }) {
  const q = useQuery({ queryKey: ["doubles-suivi"], queryFn: () => lireDoubles(), enabled: !fournies, refetchInterval: 300_000 });
  const lignes = fournies ?? q.data ?? [];
  const [filtre, setFiltre] = React.useState<StatutDouble | "tous">("tous");
  const n = compterStatuts(lignes);
  const vues = (filtre === "tous" ? lignes : lignes.filter((l) => l.statut === filtre))
    .slice()
    .sort((a, b) => ORDRE_STATUT.indexOf(a.statut) - ORDRE_STATUT.indexOf(b.statut) || b.propose_at.localeCompare(a.propose_at));

  return (
    <section className="space-y-3" data-testid="section-doubles">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">2e comptes proposés</h2>
        <p className="text-sm text-muted-foreground">Doubler = une proposition au posteur (72 h pour répondre). Rien n'est créé tant qu'il n'a pas accepté.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        <Filtre actif={filtre === "tous"} onClick={() => setFiltre("tous")}>Tous ({lignes.length})</Filtre>
        {ORDRE_STATUT.filter((s) => n[s] > 0).map((s) => (
          <Filtre key={s} actif={filtre === s} onClick={() => setFiltre(s)}>
            {LIBELLE_STATUT[s]} ({n[s]})
          </Filtre>
        ))}
      </div>
      {q.isLoading && !fournies && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && vues.length === 0 && <p className="text-sm text-muted-foreground">Aucune proposition.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {vues.map((l) => (
          <Card key={l.id} data-testid="ligne-double">
            <CardContent className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.nom}</span>
                {l.pays && <span className="text-xs text-muted-foreground">{l.pays}</span>}
                {l.compte1 && <span className="text-xs text-muted-foreground">@{l.compte1}</span>}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${COULEUR[l.statut]}`}>{LIBELLE_STATUT[l.statut]}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Doublé le {jourCourt(l.samedi)}
                {l.tarif ? ` · ${l.tarif} $ → ${l.tarif * 2} $ / semaine` : ""}
                {l.vu_at ? ` · vu le ${jourCourt(l.vu_at)}` : ""}
                {l.repondu_at ? ` · réponse le ${jourCourt(l.repondu_at)}` : ""}
                {(l.statut === "propose" || l.statut === "vu") && resteAvant(l.expire_at) ? ` · ${resteAvant(l.expire_at)}` : ""}
              </p>
              {l.statut === "accepte" && (
                <ul className="grid gap-0.5 sm:grid-cols-2">
                  {etapesAccepte(l).map((e) => (
                    <li key={e.cle} className={e.etat === "non" ? "text-muted-foreground" : ""}>
                      {ICONE[e.etat]} {e.libelle}
                    </li>
                  ))}
                </ul>
              )}
              {l.erreur && <Badge variant="outline" className="text-xs">{l.erreur.slice(0, 120)}</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Filtre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${actif ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
