/**
 * 21/11 (Max, point 8) : le suivi Ruul par posteur, avec les alertes en haut (RPC ruul_suivi, 0808).
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { canalNudge, ETAPES, filtrerSuivi, lireSuiviRuul } from "./suivi";

const jjmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

function Alerte({ n, libelle }: { n: number; libelle: string }) {
  return (
    <span
      className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1", n > 0 ? "bg-destructive/10 text-destructive ring-destructive/30" : "bg-muted text-muted-foreground ring-border")}
      data-testid="alerte-ruul"
    >
      {n} {libelle}
    </span>
  );
}

export function SuiviRuul() {
  const q = useQuery({ queryKey: ["ruul-suivi"], queryFn: lireSuiviRuul, staleTime: 5 * 60_000 });
  const [filtre, setFiltre] = useState<"tous" | "pas_ready" | "probleme">("probleme");
  const a = q.data?.alertes;
  const liste = filtrerSuivi(q.data?.posteurs ?? [], filtre);
  return (
    <Card data-testid="suivi-ruul">
      <CardHeader>
        <CardTitle className="text-base">Suivi Ruul par posteur</CardTitle>
        <CardDescription>Étape, dernier email (adresse, livré ?), dernier nudge et canal, STOP, paie prévue au prochain lot et pourquoi.</CardDescription>
        {a && (
          <div className="flex flex-wrap gap-2 pt-2" data-testid="alertes-ruul">
            <Alerte n={a.emails_refuses} libelle="posteur(s) dont le dernier email est revenu" />
            <Alerte n={a.emails_refuses_7j} libelle="email(s) Ruul refusé(s) en 7 jours" />
            <Alerte n={a.aucun_canal} libelle="sans aucun canal qui marche" />
            <Alerte n={a.sans_email} libelle="sans email valide" />
            <Alerte n={a.jamais_trouves} libelle="compte(s) jamais trouvé(s) sur TikTok" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex gap-1 text-xs">
          {(["probleme", "pas_ready", "tous"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltre(f)}
              className={cn("rounded-md px-2 py-1 ring-1 ring-border", filtre === f && "bg-foreground text-background")}
            >
              {f === "probleme" ? "À voir" : f === "pas_ready" ? "Pas READY" : "Tous"}
            </button>
          ))}
        </div>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !liste.length ? (
          <p className="text-sm text-muted-foreground">Personne dans ce filtre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">Posteur</th>
                  <th className="py-2 pr-2">Étape</th>
                  <th className="py-2 pr-2">Dernier email</th>
                  <th className="py-2 pr-2">Dernier nudge</th>
                  <th className="py-2 pr-2">STOP</th>
                  <th className="py-2 pr-2">Paie prévue</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.poster_id} className="border-b align-top last:border-0" data-testid="suivi-ruul-ligne">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{p.nom ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.handle ? `@${p.handle}` : "sans @"}
                        {p.jamais_trouve && <span className="ml-1 font-medium text-destructive">· jamais trouvé sur TikTok</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant={p.etape === "ready" ? "default" : "secondary"}>{ETAPES[p.etape]}</Badge>
                      {p.identite_refusee && <div className="text-xs text-destructive">identité refusée</div>}
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {p.dernier_email ? (
                        <>
                          <div>{p.dernier_email.objet ?? "Email"} · {jjmm(p.dernier_email.at)}</div>
                          <div className="text-muted-foreground">{p.dernier_email.destinataire}</div>
                          <div className={p.dernier_email.livre ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}>
                            {p.dernier_email.livre ? "livré" : `non livré (${p.dernier_email.statut ?? "?"})`}
                          </div>
                        </>
                      ) : "—"}
                      {!p.adresse && <div className="font-medium text-destructive">pas d'email valide</div>}
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {p.dernier_nudge ? (
                        <>
                          <div>{jjmm(p.dernier_nudge.at)} · {canalNudge(p.dernier_nudge)}</div>
                          {p.dernier_nudge.erreur && <div className="text-muted-foreground">{p.dernier_nudge.erreur}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-2 text-xs">{p.stop_at ? <span className="font-medium text-destructive">STOP le {jjmm(p.stop_at)}</span> : "—"}</td>
                    <td className="py-2 pr-2 text-xs">
                      {p.paie ? (
                        <>
                          <div className="font-medium">{p.paie.montant} $ · semaine du {jjmm(p.paie.semaine)} · {p.paie.statut}</div>
                          {p.paie.pourquoi && <div className="text-muted-foreground">{p.paie.pourquoi}</div>}
                        </>
                      ) : "—"}
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
