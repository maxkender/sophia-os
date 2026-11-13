import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  cohorteParDefaut,
  cohortes,
  compterEtapes,
  dansCohorte,
  derniereRelance,
  FILTRES,
  filtrer,
  jourCourt,
  jourLong,
  LIBELLES_ENVOI,
  lireParcoursRuul,
  membresEtape,
  PASTILLES,
  pastilles,
  prochaineRelance,
  type CleEtape,
  type EtatParcoursRuul,
  type FiltreParcours,
} from "./parcours";

/** La valeur du menu pour les posteurs sans cohorte (cohorte_lundi vide). */
const SANS_COHORTE = "sans";

const nom = (e: EtatParcoursRuul) => e.prenom ?? "?";

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
        <div className="text-sm font-medium">{nom(e)}</div>
        <div className="text-xs text-muted-foreground">
          {e.login ?? ""}
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

/** Les noms d'une étape : ceux qui l'ont faite, ou (« qui manque ») ceux qui ne l'ont pas faite. */
function NomsEtape({
  liste,
  cle,
  libelle,
  manque,
  setManque,
}: {
  liste: EtatParcoursRuul[];
  cle: CleEtape;
  libelle: string;
  manque: boolean;
  setManque: (v: boolean) => void;
}) {
  const noms = membresEtape(liste, cle, !manque);
  return (
    <div className="rounded-lg border bg-muted/30 p-3" data-testid="noms-etape">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <span className="text-sm font-medium">
          {libelle} : {noms.length} {manque ? "qui manque(nt)" : "fait(s)"}
        </span>
        <Button size="sm" variant={manque ? "default" : "outline"} aria-pressed={manque} onClick={() => setManque(!manque)}>
          Qui manque
        </Button>
      </div>
      {noms.length === 0 ? (
        <p className="text-xs text-muted-foreground">Personne.</p>
      ) : (
        <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {noms.map((e) => (
            <li key={e.poster_id}>
              <span className="font-medium">{nom(e)}</span>
              {e.login ? <span className="text-xs text-muted-foreground"> · {e.login}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Parcours Ruul, point 11 : la cohorte choisie étape par étape (compte + barre,
 * un clic pour les noms), puis une ligne de pastilles par posteur de la cohorte,
 * avec la dernière et la prochaine relance, et des filtres.
 */
export function VueParcoursRuul() {
  const q = useQuery({ queryKey: ["ruul-parcours-etat"], queryFn: lireParcoursRuul });
  const [filtre, setFiltre] = React.useState<FiltreParcours>("tous");
  /** `undefined` : la cohorte par défaut ; `null` : les posteurs sans cohorte. */
  const [choix, setChoix] = React.useState<string | null | undefined>(undefined);
  const [etape, setEtape] = React.useState<CleEtape | null>(null);
  const [manque, setManque] = React.useState(false);
  const maintenant = React.useMemo(() => new Date(q.dataUpdatedAt || Date.now()), [q.dataUpdatedAt]);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;

  const lundis = cohortes(q.data);
  const aSansCohorte = q.data.some((e) => !e.cohorte_lundi);
  const cohorte = choix === undefined ? cohorteParDefaut(q.data, maintenant) : choix;
  const membres = dansCohorte(q.data, cohorte);
  const total = membres.length;
  const etapes = compterEtapes(membres);
  const etapeChoisie = etapes.find((x) => x.cle === etape) ?? null;
  const liste = filtrer(membres, filtre, maintenant);

  return (
    <Card data-testid="vue-parcours-ruul">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle data-testid="titre-cohorte">
            {cohorte ? `Cohorte du lundi ${jourLong(cohorte)}` : "Sans cohorte"} — {total} posteur{total > 1 ? "s" : ""}
          </CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Cohorte
            <select
              aria-label="Choisir la cohorte"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
              value={cohorte ?? SANS_COHORTE}
              onChange={(ev) => setChoix(ev.target.value === SANS_COHORTE ? null : ev.target.value)}
            >
              {lundis.map((l) => (
                <option key={l} value={l}>
                  Lundi {jourLong(l)} ({dansCohorte(q.data, l).length})
                </option>
              ))}
              {aSansCohorte || cohorte === null ? (
                <option value={SANS_COHORTE}>Sans cohorte ({dansCohorte(q.data, null).length})</option>
              ) : null}
            </select>
          </label>
        </div>
        <CardDescription>
          Chaque étape : combien l'ont faite sur {total}. Cliquer une étape pour voir les noms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1" data-testid="etapes-cohorte">
          {etapes.map((x) => {
            const pct = total ? Math.round((x.n / total) * 100) : 0;
            const actif = etape === x.cle;
            return (
              <li key={x.cle}>
                <button
                  type="button"
                  data-testid={`etape-${x.cle}`}
                  aria-pressed={actif}
                  onClick={() => setEtape(actif ? null : x.cle)}
                  className={`grid w-full grid-cols-[8rem_1fr_4.5rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-muted/60 ${actif ? "bg-muted" : ""}`}
                >
                  <span className="font-medium">{x.libelle}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted-foreground/15">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {x.n} / {total}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {etapeChoisie ? (
          <NomsEtape
            liste={membres}
            cle={etapeChoisie.cle}
            libelle={etapeChoisie.libelle}
            manque={manque}
            setManque={setManque}
          />
        ) : null}

        <div className="space-y-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">Par posteur de la cohorte. Vert : fait. Gris : pas encore.</p>
          <div className="flex flex-wrap gap-2">
            {FILTRES.map((f) => (
              <Button
                key={f.cle}
                size="sm"
                variant={filtre === f.cle ? "default" : "outline"}
                onClick={() => setFiltre(f.cle)}
              >
                {f.libelle} ({filtrer(membres, f.cle, maintenant).length})
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto">
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
          </div>
          {liste.length === 0 ? <p className="pt-3 text-sm text-muted-foreground">Personne dans ce filtre.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
