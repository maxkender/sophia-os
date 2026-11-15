import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEBUT_DELAIS_CM, dureeLisible, lireDelaisCm } from "./delais";

export function CmDelais({ debut, fin }: { debut: string; fin: string }) {
  const q = useQuery({ queryKey: ["cm-delais", debut, fin], queryFn: () => lireDelaisCm(debut, fin) });
  const avecDelais = fin >= DEBUT_DELAIS_CM;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const total = q.data.reduce((s, l) => s + Number(l.montant), 0);
  return (
    <Card data-testid="cm-delais">
      <CardHeader>
        <CardTitle>Commentaires retrouvés, bonus et délais</CardTitle>
        <CardDescription>
          Seuls les commentaires retrouvés publiés comptent (tarif de la zone du Comment Master). Bonus de la période : {total.toFixed(2)} $.
          {avecDelais ? " Délai : de l'alerte Slack au commentaire posté (depuis le 9/11)." : " Le délai est mesuré à partir du 9/11."}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.data.length === 0 ? <p className="text-sm text-muted-foreground">Aucun commentaire retrouvé sur la période.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {["Comment Master", "Retrouvés", "Tarif", "Bonus", ...(avecDelais ? ["Délai médian", "< 2 h"] : [])].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.data.map((l) => (
                <tr key={l.cm_profile_id} className="border-b border-border/40">
                  <td className="py-1.5 pr-3 font-medium">{l.nom}</td>
                  <td className="py-1.5 pr-3">{l.retrouves}</td>
                  <td className="py-1.5 pr-3">{l.tarif !== null ? `${l.tarif} $${l.zone ? ` (zone ${l.zone})` : ""}` : "—"}</td>
                  <td className="py-1.5 pr-3">{Number(l.montant).toFixed(2)} $</td>
                  {avecDelais ? (
                    <>
                      <td className="py-1.5 pr-3">{dureeLisible(l.delai_median_min)}</td>
                      <td className="py-1.5 pr-3">{l.part_moins_2h !== null ? `${Math.round(Number(l.part_moins_2h) * 100)} %` : "—"}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
