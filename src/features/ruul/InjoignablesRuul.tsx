/**
 * 19/11 (Max) : « Injoignable par email ». Les posteurs Ruul actifs sans aucune vraie adresse qui marche (hors login
 * @sophia.com, et hors adresses revenues : hard bounce, bloquée, plainte). Leur relance part en bandeau sur leur
 * dashboard ; leur HM les contacte autrement (WhatsApp, Slack, Upwork).
 */
import { useQuery } from "@tanstack/react-query";
import { MailX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lireInjoignables, raisonLisible } from "./injoignables";

const jjmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

export function InjoignablesRuul() {
  const q = useQuery({ queryKey: ["ruul-injoignables"], queryFn: lireInjoignables, staleTime: 5 * 60_000 });
  const liste = q.data ?? [];
  return (
    <Card data-testid="injoignables-ruul">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailX className="size-4" aria-hidden /> Pas d'email valide
          {!!liste.length && <Badge variant="destructive">{liste.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Posteurs Ruul sans vraie adresse qui marche. Leur relance est sur leur dashboard (bandeau en haut) ; leur HM les
          contacte autrement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !liste.length ? (
          <p className="text-sm text-muted-foreground" data-testid="injoignables-vide">
            Personne : chaque posteur Ruul a une vraie adresse qui marche.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">Posteur</th>
                  <th className="py-2 pr-2">HM</th>
                  <th className="py-2 pr-2">Adresses essayées</th>
                  <th className="py-2 pr-2">Bandeau</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.poster_id} className="border-b align-top last:border-0" data-testid="injoignable">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{p.nom ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.handle ? `@${p.handle}` : "sans @"}{p.pays ? ` · ${p.pays}` : ""}{p.onboarding ? ` · ${p.onboarding}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-2" data-testid="injoignable-hm">{p.hm_nom ?? "sans HM"}</td>
                    <td className="py-2 pr-2 text-xs">
                      {p.adresses.length ? (
                        p.adresses.map((a) => (
                          <div key={a.adresse}>
                            {a.adresse} · <span className="text-destructive">{raisonLisible(a)}</span>{a.at ? ` (${jjmm(a.at)})` : ""}
                          </div>
                        ))
                      ) : (
                        <span className="text-muted-foreground">aucune adresse perso</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {p.bandeau_at ? `posé le ${jjmm(p.bandeau_at)}${p.bandeau_vu_at ? ", vu" : ", pas encore vu"}` : "pas encore"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
