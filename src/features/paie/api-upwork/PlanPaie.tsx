/**
 * 23/11 (Max) : la carte « Plan W47 (consignes de Max du 23/11) » (page Paie), le « Récap W47 » et la liste des
 * contrats Upwork ouverts sans posteur actif. Rien ne part sans le clic de Max : un bouton par groupe, qui
 * n'exécute que les lignes cochées ; le serveur relit chaque jalon chez Upwork (par son numéro) avant de libérer,
 * libère toujours avant de fermer ou de killer, et ne refait jamais une ligne déjà tentée.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

import {
  csvContrats, executable, executerPlan, GROUPES, type GroupePlan, type LignePlanPaie, lireContratsOuverts, lirePlan, lireRecap,
} from "./planPaie";

const LIBELLE_STATUT: Record<string, string> = {
  a_faire: "à faire", en_cours: "en cours", libere: "libéré", ferme: "libéré + contrat fermé", erreur: "erreur", bloque: "bloqué",
  deja_paye: "déjà payé", kille: "killé (contrat ouvert)", kille_ferme: "killé + contrat fermé",
};

function EtatLigne({ l }: { l: LignePlanPaie }) {
  if (l.groupe === "kill") {
    const s = l.semaine_payee;
    return <span className={cn(s && !s.payee && "text-amber-700 dark:text-amber-300")}>{s ? (s.payee ? "W47 payée : fermeture possible" : `W47 pas payée (${s.du} $) : fermeture après la paie`) : "—"}</span>;
  }
  if (l.etat === "pret" && l.jalon) return <span className="text-emerald-700 dark:text-emerald-300">#{l.jalon.id} · {l.jalon.nom} · {l.jalon.etat} · {l.jalon.montant} $</span>;
  if (l.etat === "fait") return <span className="text-muted-foreground">fait</span>;
  return <span className={cn(l.etat === "a_voir" && "text-destructive", l.etat === "pas_finance" && "text-muted-foreground")}>{l.raison ?? "—"}</span>;
}

export function PlanPaie({ plan = "W47" }: { plan?: string }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const recap = useQuery({ queryKey: ["paie", "plan", plan, "recap"], queryFn: () => lireRecap(plan), enabled: role === "admin" });
  // La relecture chez Upwork (lente) ne part qu'au clic.
  const relu = useMutation({ mutationFn: () => lirePlan(plan) });
  const [coches, setCoches] = React.useState<Set<string>>(new Set());
  const executer = useMutation({
    mutationFn: (ids: string[]) => executerPlan(ids, plan),
    onSettled: () => {
      setCoches(new Set());
      void qc.invalidateQueries({ queryKey: ["paie"] });
      relu.mutate();
    },
  });
  if (role !== "admin" || !recap.data?.lignes.length) return null;
  const lignes: LignePlanPaie[] = relu.data ?? recap.data.lignes;
  const basculer = (id: string) => setCoches((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const lancer = (groupe: GroupePlan, titre: string) => {
    const ids = lignes.filter((l) => l.groupe === groupe && coches.has(l.id)).map((l) => l.id);
    if (!ids.length) return;
    if (!globalThis.confirm(`${titre} : ${ids.length} ligne(s). Confirmer ? (argent réel / contrats réels sur Upwork)`)) return;
    executer.mutate(ids);
  };
  return (
    <Card data-testid="plan-paie">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Plan {plan} (consignes de Max du 23/11)
          <Button size="sm" variant="outline" disabled={relu.isPending} onClick={() => relu.mutate()} data-testid="plan-relire">
            <RefreshCw className={cn(relu.isPending && "animate-spin")} /> {relu.isPending ? "Relecture chez Upwork…" : "Relire chez Upwork"}
          </Button>
        </CardTitle>
        <CardDescription>
          Chaque jalon est reconnu par son numéro et relu chez Upwork avant d'être libéré ; on libère toujours avant de fermer ;
          une ligne déjà tentée n'est jamais refaite. Coche puis clique : rien ne part sans ton clic. Rien n'est créé ni financé ici (Grok).
          {!relu.data && " Clique « Relire chez Upwork » pour voir l'état réel et pouvoir cocher."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {relu.error && <p className="text-destructive text-sm">{(relu.error as Error).message}</p>}
        {executer.error && <p className="text-destructive text-sm">{(executer.error as Error).message}</p>}
        {executer.data && <p className="text-sm" data-testid="plan-resultat">{executer.data.length} ligne(s) traitée(s) : voir l'état de chaque ligne ci-dessous.</p>}
        {GROUPES.map((g) => {
          const ls = lignes.filter((l) => l.groupe === g.cle);
          if (!ls.length) return null;
          const nCoches = ls.filter((l) => coches.has(l.id)).length;
          return (
            <div key={g.cle} className="space-y-1.5" data-testid={`plan-groupe-${g.cle}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-sm">{g.titre}</h3>
                <Badge variant="secondary">{ls.length}</Badge>
                {g.bouton && relu.data && (
                  <Button size="xs" disabled={!nCoches || executer.isPending} onClick={() => lancer(g.cle, g.bouton!)} data-testid={`plan-executer-${g.cle}`}>
                    {g.bouton} ({nCoches})
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {ls.map((l) => {
                      const peut = !!relu.data && executable(l);
                      return (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="w-6 px-2 py-1">
                            {g.bouton && <input type="checkbox" aria-label={`Cocher ${l.posteur}`} disabled={!peut} checked={coches.has(l.id)} onChange={() => basculer(l.id)} />}
                          </td>
                          <td className="px-2 py-1 font-medium">{l.posteur}</td>
                          <td className="px-2 py-1 text-muted-foreground">{l.contrat_id}{l.jalon_id ? ` · #${l.jalon_id}` : ""}</td>
                          <td className="px-2 py-1"><EtatLigne l={l} /></td>
                          <td className="px-2 py-1"><Badge variant="outline">{LIBELLE_STATUT[l.statut] ?? l.statut}</Badge></td>
                          <td className="px-2 py-1 text-muted-foreground">{l.resultat ?? l.note ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        <RecapW47 plan={plan} />
        <ContratsOuverts />
      </CardContent>
    </Card>
  );
}

/** « Récap W47 » : l'état réel, lu dans la base (aucun bouton). */
function RecapW47({ plan }: { plan: string }) {
  const q = useQuery({ queryKey: ["paie", "plan", plan, "recap"], queryFn: () => lireRecap(plan) });
  if (!q.data) return null;
  const compte = (statuts: string[], groupes?: GroupePlan[]) =>
    q.data.lignes.filter((l) => statuts.includes(l.statut) && (!groupes || groupes.includes(l.groupe))).length;
  const p = q.data.paie;
  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm" data-testid="recap-plan">
      <p className="font-medium">Récap {plan}</p>
      <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        <li>Libérés : <b>{compte(["libere", "ferme"])}</b> (dont contrats fermés : {compte(["ferme"])})</li>
        <li>Killés : <b>{compte(["kille", "kille_ferme"])}</b> (contrats fermés : {compte(["kille_ferme"])})</li>
        <li>Déjà payés (rien à faire) : {compte(["deja_paye"])}</li>
        <li>En erreur : <span className={cn(compte(["erreur"]) && "text-destructive")}>{compte(["erreur"])}</span></li>
        <li>Encore à faire : {compte(["a_faire", "en_cours"])}</li>
        {p && <li>Lignes de paie {plan} : {p.payees}/{p.total} payées · {p.exclues} exclues · {p.a_payer} à payer · {p.a_verifier} « à vérifier »</li>}
      </ul>
      <p className="pt-1 font-medium">À décider (Max)</p>
      <ul className="list-inside list-disc">{q.data.a_decider.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

/** Les contrats Upwork ouverts (VIk Studios) sans posteur actif : liste pour Max, l'OS n'y touche pas. */
function ContratsOuverts() {
  const q = useQuery({ queryKey: ["paie", "contrats-ouverts"], queryFn: lireContratsOuverts });
  const [ouvert, setOuvert] = React.useState(false);
  if (!q.data) return null;
  const total = q.data.reduce((n, c) => n + c.total, 0);
  const avecJalon = q.data.filter((c) => c.total > 0).length;
  const telecharger = () => {
    const url = URL.createObjectURL(new Blob([`\uFEFF${csvContrats(q.data)}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "contrats_ouverts_sans_posteur.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-1.5 rounded-md border p-3 text-sm" data-testid="contrats-ouverts">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Contrats Upwork ouverts sans posteur actif</p>
        <Badge variant="secondary">{q.data.length} contrats · {avecJalon} avec jalon financé · {total.toLocaleString("fr-FR")} $ financés non libérés</Badge>
        <Button size="xs" variant="outline" onClick={telecharger}><Download /> CSV</Button>
        <Button size="xs" variant="ghost" onClick={() => setOuvert((o) => !o)}>{ouvert ? "Masquer" : "Voir la liste"}</Button>
      </div>
      <p className="text-muted-foreground text-xs">Lecture seule, d'après le cache Upwork (date de lecture par contrat) : à relire chez Upwork avant toute action. L'OS n'y touche pas.</p>
      {ouvert && (
        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <tbody>
              {q.data.map((c) => (
                <tr key={c.contrat_id} className="border-b align-top last:border-0">
                  <td className="px-2 py-1">{c.contrat_id}</td>
                  <td className="px-2 py-1">{c.freelancer ?? "?"}</td>
                  <td className="px-2 py-1">{c.jalons.map((j) => `${j.nom} ${j.montant} $ #${j.id}`).join(" · ") || "—"}</td>
                  <td className="px-2 py-1 text-right font-medium">{c.total} $</td>
                  <td className="px-2 py-1 text-muted-foreground">{c.cache_lu_at ? c.cache_lu_at.slice(0, 10) : "jamais lu"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
