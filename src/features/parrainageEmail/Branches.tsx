import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { changerPaysParrainage, inviterAmi, lireMonParrainage, lirePaysParrainage, lireSuiviParrainage, nomPays } from "./api";
import { BlocParrainer } from "./BlocParrainer";
import { PaysParrainage } from "./PaysParrainage";
import { LANGUE_PAR_PAYS } from "../../../supabase/functions/_shared/hub_posteurs";

/** Le bloc « Refer a friend » du dashboard (seulement quand le parrainage par email est ouvert). */
export function ParrainerDashboard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mon-parrainage"], queryFn: lireMonParrainage, staleTime: 60_000 });
  if (!q.data?.actif) return null;
  const pays = q.data.pays
    .map((p) => ({ code: p.code, nom: nomPays(p.code), ouvert: p.ouvert }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const filleuls = q.data.filleuls.map((f) => ({ ...f, pays: nomPays(f.pays) }));
  return (
    <BlocParrainer
      pays={pays}
      filleuls={filleuls}
      ceMois={q.data.ce_mois}
      envoyer={async (f) => {
        const r = await inviterAmi(f);
        await qc.invalidateQueries({ queryKey: ["mon-parrainage"] });
        return r;
      }}
    />
  );
}

/** Settings → « Parrainage par pays ». */
export function ReglagesPaysParrainage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["parrainage-pays"], queryFn: lirePaysParrainage });
  const changer = useMutation({
    mutationFn: (v: { pays: string; champ: "envoi_auto" | "recrutement_ouvert"; valeur: boolean }) => changerPaysParrainage(v.pays, v.champ, v.valeur),
    onSettled: () => qc.invalidateQueries({ queryKey: ["parrainage-pays"] }),
  });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const lignes = q.data.map((l) => ({ ...l, tarif: l.tarif === null ? null : Number(l.tarif), nom: nomPays(l.pays, "fr"), langue: LANGUE_PAR_PAYS[l.pays] ?? "en" }));
  return <PaysParrainage lignes={lignes} changer={(pays, champ, valeur) => changer.mutate({ pays, champ, valeur })} />;
}

/** La page « Parrainage » (Recruitment automation) : par pays et par semaine, et le top des parrains. */
export function SuiviParrainage() {
  const q = useQuery({ queryKey: ["parrainage-suivi"], queryFn: lireSuiviParrainage, refetchInterval: 600_000 });
  const [pays, setPays] = React.useState("tous");
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (q.isLoading || !q.data) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const tousPays = [...new Set(q.data.lignes.map((l) => l.pays))].sort();
  const lignes = q.data.lignes.filter((l) => pays === "tous" || l.pays === pays);
  const total = lignes.reduce(
    (t, l) => ({ invites: t.invites + l.invites, emails: t.emails + l.emails, candidatures: t.candidatures + l.candidatures, actifs: t.actifs + l.actifs, cout: t.cout + Number(l.cout) }),
    { invites: 0, emails: 0, candidatures: 0, actifs: 0, cout: 0 },
  );
  return (
    <div className="space-y-4" data-testid="suivi-parrainage">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select className="h-8 rounded-md border bg-background px-2" value={pays} onChange={(e) => setPays(e.target.value)} aria-label="Pays">
          <option value="tous">Tous les pays</option>
          {tousPays.map((p) => <option key={p} value={p}>{nomPays(p, "fr")}</option>)}
        </select>
        <span>{total.invites} amis · {total.emails} emails · {total.candidatures} candidatures · {total.actifs} actifs · coût {total.cout} $
          {total.actifs > 0 ? ` (${(total.cout / total.actifs).toFixed(2)} $ par recrue)` : ""}</span>
      </div>
      <Card>
        <CardHeader><CardTitle>Par pays et par semaine</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {lignes.length === 0 ? <p className="text-sm text-muted-foreground">Aucun ami invité pour l'instant.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Semaine", "Pays", "Amis", "Emails envoyés", "Ouverts", "Cliqués", "Candidatures", "Actifs", "Bonus payés", "Coût / recrue"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={`${l.semaine}-${l.pays}`} className="border-b border-border/40">
                    <td className="py-1.5 pr-3">{l.semaine.slice(8, 10)}/{l.semaine.slice(5, 7)}</td>
                    <td className="py-1.5 pr-3">{nomPays(l.pays, "fr")}</td>
                    <td className="py-1.5 pr-3">{l.invites}</td>
                    <td className="py-1.5 pr-3">{l.emails}</td>
                    <td className="py-1.5 pr-3">{l.ouverts}</td>
                    <td className="py-1.5 pr-3">{l.cliques}</td>
                    <td className="py-1.5 pr-3">{l.candidatures}</td>
                    <td className="py-1.5 pr-3">{l.actifs}</td>
                    <td className="py-1.5 pr-3">{l.bonus_payes}</td>
                    <td className="py-1.5 pr-3">{l.cout_par_recrue !== null ? `${l.cout_par_recrue} $` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Top des parrains</CardTitle>
          <CardDescription>Amis invités et amis devenus actifs, 8 dernières semaines.</CardDescription>
        </CardHeader>
        <CardContent>
          {q.data.top.length === 0 ? <p className="text-sm text-muted-foreground">Personne pour l'instant.</p> : (
            <ol className="list-decimal space-y-0.5 pl-5 text-sm">
              {q.data.top.map((t) => <li key={t.parrain}><b>{t.parrain}</b> : {t.invites} ami(s), {t.actifs} actif(s)</li>)}
            </ol>
          )}
        </CardContent>
      </Card>
      <ReglagesPaysParrainage />
    </div>
  );
}
