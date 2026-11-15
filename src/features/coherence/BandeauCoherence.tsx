import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { Link } from "react-router-dom";

import { supabase } from "@/lib/supabase/client";

import { controleEnRetard, GROUPES_COHERENCE, reglesEnDefaut, texteBandeau, type ResumeCoherence } from "./logique";

async function lireResume(): Promise<ResumeCoherence> {
  const { data, error } = await supabase.rpc("coherence_resume");
  if (error) throw error;
  return data as ResumeCoherence;
}

/**
 * 6/11 : le même bandeau en tête de Problèmes et de Weekly decisions :
 * « Cohérence : ✅ X/12 », puis par groupe le nombre de problèmes et de
 * décisions ouverts. Un clic déplie les règles en défaut (chacune a sa carte
 * « ⚠️ Incohérence » dans Problèmes).
 */
export function BandeauCoherence() {
  const q = useQuery({ queryKey: ["coherence", "resume"], queryFn: lireResume, refetchInterval: 300_000 });
  const [ouvert, setOuvert] = React.useState(false);
  if (q.isLoading) return null;
  if (q.error) return <p className="text-xs text-destructive" data-testid="bandeau-coherence-erreur">Cohérence : {(q.error as Error).message}</p>;
  const r = q.data;
  const enDefaut = reglesEnDefaut(r);
  const vert = (r?.ok ?? 0) === 12;
  return (
    <div
      className={`rounded-md border p-2 text-sm ${vert ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}`}
      data-testid="bandeau-coherence"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setOuvert(!ouvert)} disabled={vert}>
          {texteBandeau(r)}
        </button>
        {GROUPES_COHERENCE.map((g) => {
          const v = r?.groupes?.[g.cle] ?? { problemes: 0, decisions: 0 };
          return (
            <span key={g.cle} className="text-muted-foreground">
              {g.nom} : <b className="text-foreground">{v.problemes}</b> problèmes · <b className="text-foreground">{v.decisions}</b> décisions
            </span>
          );
        })}
        {controleEnRetard(r?.at) && <span className="text-destructive">dernier contrôle il y a plus de 2 h</span>}
      </div>
      {ouvert && enDefaut.length > 0 && (
        <ul className="mt-2 space-y-0.5" data-testid="bandeau-coherence-regles">
          {enDefaut.map((x) => (
            <li key={x.regle}>
              <Link to="/admin/auto/problemes" className="hover:underline">
                ⚠️ Règle {x.regle} : {x.titre} — <b>{x.n}</b>
              </Link>
            </li>
          ))}
          {(r?.corriges ?? 0) > 0 && <li className="text-muted-foreground">✔︎ {r?.corriges} corrigé(s) automatiquement au dernier contrôle</li>}
        </ul>
      )}
    </div>
  );
}
