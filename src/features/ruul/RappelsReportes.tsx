/**
 * 23/11 (Max) : dans Paie > Ruul, les rappels envoyés aux posteurs « reportés » d'une semaine (pas encore READY chez
 * Ruul) : qui, son statut Ruul, les canaux, la date, l'état de l'email. Lecture seule.
 */
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { supabase } from "@/lib/supabase/client";

export interface RappelReporte {
  poster_id: string;
  nom: string;
  statut_ruul: string;
  pret: boolean;
  envoye_at: string | null;
  canaux: string[] | null;
  erreur: string | null;
  email: string | null;
  montant: number | null;
}

export async function lireRappelsReportes(semaine: string): Promise<RappelReporte[]> {
  const { data, error } = await supabase.rpc("ruul_rappels_reportes", { p_semaine: semaine });
  if (error) throw new Error(error.message);
  return ((data as { lignes?: RappelReporte[] } | null)?.lignes ?? []) as RappelReporte[];
}

const LIBELLE_CANAL: Record<string, string> = { email: "Email", slack: "Slack", slack_en_pause: "Slack (en pause)" };

const quand = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "—";

export function RappelsReportes({ semaine }: { semaine: string }) {
  const q = useQuery({ queryKey: ["ruul", "rappels-reportes", semaine], queryFn: () => lireRappelsReportes(semaine) });
  if (q.isLoading || q.error || !q.data?.length) return null;
  return (
    <section className="space-y-2" data-testid="rappels-reportes">
      <p className={MICRO_LABEL}>Rappels aux reportés · {q.data.length}</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Posteur</th>
              <th className="px-3 py-2 font-medium">Statut Ruul</th>
              <th className="px-3 py-2 font-medium">Montant</th>
              <th className="px-3 py-2 font-medium">Canaux</th>
              <th className="px-3 py-2 font-medium">Envoyé</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((r, i) => (
              <tr key={`${r.poster_id}-${i}`} className="border-b last:border-0">
                <td className="px-3 py-2">{r.nom || "?"}</td>
                <td className="px-3 py-2">{r.pret ? "READY ✅" : r.statut_ruul}</td>
                <td className="px-3 py-2 tabular-nums">{r.montant != null ? `${r.montant} $` : "—"}</td>
                <td className="px-3 py-2">
                  {(r.canaux ?? []).map((c) => LIBELLE_CANAL[c] ?? c).join(" · ") || "—"}
                  {r.email && <span className="ml-1 text-xs text-muted-foreground">({r.email})</span>}
                  {r.erreur && <span className="block text-xs text-destructive">{r.erreur}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{quand(r.envoye_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
