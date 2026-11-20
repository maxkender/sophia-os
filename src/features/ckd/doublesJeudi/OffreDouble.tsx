/**
 * 21/11 (Max) : sur le dashboard du posteur, la proposition de 2e compte (OUI du jeudi) : le texte dans sa langue,
 * « Accept » / « No thanks ». Visible jusqu'au dimanche 23:59 (Paris). Accepter crée le 2e compte et la paie passe
 * au tarif 2 comptes à partir du lundi qui suit.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

export interface MonDouble {
  id: string;
  handle: string | null;
  lundi: string;
  limite: string;
  tarif: number | null;
  texte: string | null;
}

async function lireMonDouble(): Promise<MonDouble | null> {
  const { data, error } = await supabase.rpc("mon_double_jeudi");
  if (error) throw new Error(error.message);
  return (data ?? null) as MonDouble | null;
}

async function repondre(id: string, oui: boolean): Promise<{ ok: boolean; reponse?: string; raison?: string }> {
  const { data, error } = await supabase.rpc("double_jeudi_repondre", { p_id: id, p_oui: oui });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reponse?: string; raison?: string };
}

export function OffreDouble() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mon-double-jeudi"], queryFn: lireMonDouble, refetchInterval: 15 * 60_000 });
  const m = useMutation({
    mutationFn: ({ id, oui }: { id: string; oui: boolean }) => repondre(id, oui),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["mon-double-jeudi"] }),
  });
  if (m.data?.ok && m.data.reponse === "oui") {
    return (
      <section className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium" data-testid="offre-double-acceptee">
        ✅ Great! Your 2nd account is on your dashboard: do its warm-up until Sunday.
      </section>
    );
  }
  if (!q.data) return null;
  return <VueOffreDouble d={q.data} enCours={m.isPending} erreur={m.data?.ok === false ? m.data.raison ?? null : (m.error as Error | null)?.message ?? null}
    repondre={(oui) => m.mutate({ id: q.data!.id, oui })} />;
}

/** La vue seule (tests, aperçu). */
export function VueOffreDouble({ d, enCours, erreur, repondre }: { d: MonDouble; enCours: boolean; erreur: string | null; repondre: (oui: boolean) => void }) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30" data-testid="offre-double">
      <p className="text-sm leading-relaxed">{d.texte ?? `Would you like to manage a 2nd TikTok account? It starts posting on Monday ${d.lundi}.`}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" loading={enCours} onClick={() => repondre(true)} data-testid="offre-double-oui">
          <Check className="size-4" /> Accept
        </Button>
        <Button size="sm" variant="outline" disabled={enCours} onClick={() => repondre(false)} data-testid="offre-double-non">
          No thanks
        </Button>
      </div>
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </section>
  );
}
