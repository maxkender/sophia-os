import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  derniereRelance,
  FILTRES,
  filtrer,
  jourCourt,
  LIBELLES_ENVOI,
  lireParcoursRuul,
  PASTILLES,
  pastilles,
  prochaineRelance,
  type EtatParcoursRuul,
  type FiltreParcours,
} from "./parcours";

function Pastille({ ok, libelle }: { ok: boolean; libelle: string }) {
  return (
    <span
      title={`${libelle} : ${ok ? "oui" : "non"}`}
      aria-label={`${libelle} : ${ok ? "oui" : "non"}`}
      className={`inline-block h-3 w-3 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/25"}`}
    />
  );
}

function Ligne({ e, maintenant }: { e: EtatParcoursRuul; maintenant: Date }) {
  const p = pastilles(e);
  const der = derniereRelance(e);
  const pro = prochaineRelance(e, maintenant);
  return (
    <tr className="border-b border-border/40" data-testid="ligne-parcours">
      <td className="py-1.5 pr-3">
        <div className="text-sm font-medium">{e.prenom ?? "?"}</div>
        <div className="text-xs text-muted-foreground">
          {e.login ?? ""}
          {e.cohorte_lundi ? ` · début ${jourCourt(e.cohorte_lundi)}` : ""}
          {e.relances_stop_at ? " · STOP" : ""}
        </div>
      </td>
      {PASTILLES.map((x) => (
        <td key={x.cle} className="py-1.5 pr-2 text-center">
          <Pastille ok={p[x.cle]} libelle={x.libelle} />
        </td>
      ))}
      <td className="py-1.5 pr-2 text-xs">{der ? `${LIBELLES_ENVOI[der.type] ?? der.type} · ${jourCourt(der.at)}` : "—"}</td>
      <td className="py-1.5 pr-2 text-xs">
        {pro ? `${LIBELLES_ENVOI[pro.type] ?? pro.type}${pro.le ? ` · ${jourCourt(pro.le)}` : ""}` : "—"}
      </td>
    </tr>
  );
}

/** Parcours Ruul, point 11 : une ligne de pastilles par posteur Ruul actif, relances, filtres. */
export function VueParcoursRuul() {
  const q = useQuery({ queryKey: ["ruul-parcours-etat"], queryFn: lireParcoursRuul });
  const [filtre, setFiltre] = React.useState<FiltreParcours>("tous");
  const maintenant = React.useMemo(() => new Date(q.dataUpdatedAt || Date.now()), [q.dataUpdatedAt]);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const liste = filtrer(q.data, filtre, maintenant);
  return (
    <Card data-testid="vue-parcours-ruul">
      <CardHeader>
        <CardTitle>Parcours des posteurs Ruul</CardTitle>
        <CardDescription>
          {q.data.length} posteur(s) Ruul actif(s). Vert : fait. Gris : pas encore.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {FILTRES.map((f) => (
            <Button
              key={f.cle}
              size="sm"
              variant={filtre === f.cle ? "default" : "outline"}
              onClick={() => setFiltre(f.cle)}
            >
              {f.libelle} ({filtrer(q.data, f.cle, maintenant).length})
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Posteur</th>
              {PASTILLES.map((x) => (
                <th key={x.cle} className="py-2 pr-2 text-center font-normal">{x.libelle}</th>
              ))}
              <th className="py-2 pr-2">Dernière relance</th>
              <th className="py-2 pr-2">Prochaine relance</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((e) => <Ligne key={e.poster_id} e={e} maintenant={maintenant} />)}
          </tbody>
        </table>
        {liste.length === 0 ? <p className="pt-3 text-sm text-muted-foreground">Personne dans ce filtre.</p> : null}
      </CardContent>
    </Card>
  );
}
