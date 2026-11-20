/**
 * 21/11 (Max) : une plateforme par posteur. Combien de posteurs sur Ruul et sur Upwork, où en sont les posteurs Ruul,
 * qui vient d'un pays refusé par Ruul, et la liste des incohérences (montrée, jamais corrigée seule).
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";

import { BadgePlateforme } from "./BadgePlateforme";

interface Chiffres {
  ruul: number;
  upwork: number;
  ruul_prets: number;
  ruul_pas_prets: number;
  ruul_pas_inscrits: number;
  ruul_sans_identite: number;
  ruul_sans_banque: number;
  pays_refuses_ruul: number;
  pays_refuses_upwork: number;
}
interface Incoherence { type: string; libelle: string; poster_id: string; nom: string; detail: string | null }

async function lire(): Promise<{ c: Chiffres; inc: Incoherence[] }> {
  const [c, inc] = await Promise.all([supabase.rpc("plateforme_chiffres"), supabase.rpc("plateforme_incoherences")]);
  if (c.error) throw new Error(c.error.message);
  if (inc.error) throw new Error(inc.error.message);
  return { c: c.data as Chiffres, inc: (inc.data ?? []) as Incoherence[] };
}

export function PlateformesPosteurs() {
  const q = useQuery({ queryKey: ["plateformes-posteurs"], queryFn: lire });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const { c, inc } = q.data;
  const groupes = [...new Set(inc.map((i) => i.libelle))];
  return (
    <section className="space-y-3 rounded-xl border p-4 shadow-sm" data-testid="plateformes-posteurs">
      <h2 className="text-base font-semibold">Plateformes</h2>
      <div className="flex flex-wrap gap-6 text-sm">
        <p><BadgePlateforme ruul /> <b className="tabular-nums">{c.ruul}</b> posteurs · {c.ruul_prets} prêts · {c.ruul_pas_prets} pas prêts
          <span className="block text-xs text-muted-foreground">{c.ruul_pas_inscrits} pas inscrits · {c.ruul_sans_identite} sans identité · {c.ruul_sans_banque} sans banque</span></p>
        <p><BadgePlateforme ruul={false} /> <b className="tabular-nums">{c.upwork}</b> posteurs</p>
        <p>Pays refusé par Ruul : <b>{c.pays_refuses_ruul}</b> sur Ruul · {c.pays_refuses_upwork} sur Upwork</p>
      </div>
      <details className="text-sm" open={inc.length > 0}>
        <summary className="cursor-pointer font-medium">Incohérences : {inc.length} (rien n'est corrigé seul)</summary>
        {groupes.map((g) => (
          <div key={g} className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground">{g} ({inc.filter((i) => i.libelle === g).length})</p>
            <ul className="text-xs">
              {inc.filter((i) => i.libelle === g).map((i) => (
                <li key={i.type + i.poster_id}><a className="underline" href={`/admin/posters?fiche=${i.poster_id}`}>{i.nom || i.poster_id}</a>{i.detail ? ` · ${i.detail}` : ""}</li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </section>
  );
}
