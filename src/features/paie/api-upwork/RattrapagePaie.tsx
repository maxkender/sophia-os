/**
 * 19/11 (Max) : page Pay, « Paie bloquée par le nom de la semaine ». Une ligne par paie « à vérifier » : posteur,
 * contrat, posts, montant dû, la milestone d'Upwork (nom, état, montant) et ce que l'OS propose. Un clic de Max
 * exécute tout : approuver (le moteur de paie, jamais deux fois), marquer payée celle déjà payée à la main, garder
 * la milestone (0 post). Puis le message au posteur dans sa langue. Rien n'est financé.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

import { executerRattrapage, LIBELLE_ACTION, type LigneRattrapage, lireRattrapages, recap } from "./rattrapage";

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Statut({ l }: { l: LigneRattrapage }) {
  if (l.statut === "propose") return <span className="text-muted-foreground">en attente</span>;
  if (l.statut === "erreur") return <span className="text-destructive">erreur : {l.resultat}</span>;
  return (
    <span className="text-emerald-700 dark:text-emerald-300">
      {l.resultat}
      {l.message_statut ? ` · message : ${l.message_statut}` : ""}
    </span>
  );
}

export function RattrapagePaie() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["paie", "rattrapages"], queryFn: lireRattrapages, staleTime: 60_000 });
  const [confirme, setConfirme] = React.useState(false);
  const executer = useMutation({
    mutationFn: (semaine: string) => executerRattrapage(semaine),
    onSettled: () => {
      setConfirme(false);
      void qc.invalidateQueries({ queryKey: ["paie"] });
    },
  });
  const lignes = q.data ?? [];
  if (!lignes.length) return null;
  const semaines = [...new Set(lignes.map((l) => l.semaine))].sort();
  return (
    <div className="space-y-3" data-testid="rattrapage-paie">
      {semaines.map((semaine) => {
        const ls = lignes.filter((l) => l.semaine === semaine);
        const r = recap(ls);
        const fini = r.executables === 0 && r.messages_en_attente === 0;
        return (
          <Card key={semaine} className={cn(!fini && "border-amber-300 dark:border-amber-800")}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <CircleAlert className="size-4 text-amber-600" aria-hidden />
                Paie bloquée par le nom de la semaine : semaine du {jjmm(semaine)}
                <Badge variant="secondary">{ls.length} lignes</Badge>
              </CardTitle>
              <CardDescription data-testid="rattrapage-recap">
                À payer : {r.a_payer} ({r.montant} $, milestones déjà financées) · déjà payées à la main sur Upwork : {r.deja_payees} (aucun
                argent, l'OS les marque payées) · 0 post, milestone gardée : {r.gardees} · à faire à la main : {r.a_la_main}. Rien n'est
                financé. Après le paiement, chaque posteur payé reçoit sur Upwork, dans sa langue : « Your week of {jjmm(semaine)} (X $)
                has been paid. Sorry for the delay! »
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-2">Posteur</th>
                      <th className="py-1.5 pr-2">Contrat</th>
                      <th className="py-1.5 pr-2">Posts</th>
                      <th className="py-1.5 pr-2">Dû</th>
                      <th className="py-1.5 pr-2">Milestone sur Upwork</th>
                      <th className="py-1.5 pr-2">Proposition</th>
                      <th className="py-1.5 pr-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ls.map((l) => (
                      <tr key={l.id} className="border-b align-top last:border-0" data-testid="rattrapage-ligne">
                        <td className="py-1.5 pr-2 font-medium">{l.poster_nom ?? "—"}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{l.contrat_id ?? "—"}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{l.faits}/{l.prevus}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{l.du} $</td>
                        <td className="py-1.5 pr-2">
                          {l.jalon_nom ? `« ${l.jalon_nom} » · ${l.jalon_etat ?? "?"}${l.jalon_montant !== null ? ` · ${l.jalon_montant} $` : ""}` : "aucune"}
                        </td>
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{LIBELLE_ACTION[l.action]}</span>
                          <span className="block text-muted-foreground">{l.proposition}</span>
                        </td>
                        <td className="py-1.5 pr-2"><Statut l={l} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {role === "admin" && !fini && (
                <div className="flex flex-wrap items-center gap-2">
                  {!confirme ? (
                    <Button size="sm" onClick={() => setConfirme(true)} data-testid="rattrapage-approuver">
                      {r.executables ? `Approuver la liste (${r.montant} $ à payer)` : "Envoyer les messages restants"}
                    </Button>
                  ) : (
                    <>
                      <span className="text-sm">
                        Payer {r.a_payer} milestone(s) ({r.montant} $), marquer {r.deja_payees} payée(s), garder {r.gardees} milestone(s) ?
                      </span>
                      <Button size="sm" disabled={executer.isPending} onClick={() => executer.mutate(semaine)} data-testid="rattrapage-confirmer">
                        {executer.isPending ? "En cours…" : "Oui, approuver"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={executer.isPending} onClick={() => setConfirme(false)}>Annuler</Button>
                    </>
                  )}
                  {executer.data && (
                    <span className="text-xs text-muted-foreground" data-testid="rattrapage-bilan">
                      {executer.data.faits ?? 0} faite(s), {executer.data.messages ?? 0} message(s) envoyé(s)
                      {executer.data.erreurs?.length ? `, ${executer.data.erreurs.length} erreur(s)` : ""}
                      {executer.data.reste ? `, ${executer.data.reste} à reprendre (cliquer à nouveau)` : ""}
                    </span>
                  )}
                  {executer.error && <span className="text-xs text-destructive">{(executer.error as Error).message}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
