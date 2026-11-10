import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { deciderCandidatureRuul, lireCandidaturesRuul, lireCohortesRuul, type CandidatureRuul } from "./api";
import { ETAPES_RUUL, etapeBloquee, jourMois } from "./logique";

const LIBELLE_DECISION: Record<string, string> = {
  auto: "Acceptée automatiquement",
  acceptee: "Acceptée par le HM",
  refusee: "Refusée",
  a_traiter: "À traiter",
};

/**
 * Candidats Ruul (0577) : les candidatures du site, copiées toutes les 15 min.
 * « À traiter » : ce qui manque pour l'acceptation automatique, et le HM du
 * pays qui décide. Referrals d'abord. La décision part vers le site, qui
 * envoie le lien de signature (lundi de cohorte = lundi suivant).
 */
export function PageCandidatsRuul() {
  const q = useQuery({ queryKey: ["ruul-candidatures"], queryFn: lireCandidaturesRuul });
  const qc = useQueryClient();
  const [onglet, setOnglet] = React.useState<"a_traiter" | "acceptees" | "signees" | "autres">("a_traiter");
  const [message, setMessage] = React.useState<string | null>(null);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const groupes = {
    a_traiter: q.data.filter((c) => c.decision === "a_traiter" && c.statut_site === "pending"),
    acceptees: q.data.filter((c) => (c.decision === "auto" || c.decision === "acceptee" || c.statut_site === "accepted") && !c.signe_at),
    signees: q.data.filter((c) => c.signe_at),
    autres: q.data.filter((c) => c.decision === "refusee" || ["rejected", "expired", "dropped"].includes(c.statut_site ?? "")),
  };
  const libelles = { a_traiter: "À traiter", acceptees: "Acceptées, pas signées", signees: "Signées", autres: "Refusées / expirées" };

  const decider = async (c: CandidatureRuul, d: "acceptee" | "refusee") => {
    setMessage(null);
    const raison = d === "refusee" ? (window.prompt("Raison du refus (gardée dans l'OS) :") ?? "") : undefined;
    try {
      const r = await deciderCandidatureRuul(c.site_id, d, raison);
      setMessage(r.ok ? `${c.nom ?? "Candidature"} : ${LIBELLE_DECISION[d]}.` : `Impossible : ${r.erreur}`);
      await qc.invalidateQueries({ queryKey: ["ruul-candidatures"] });
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const liste = groupes[onglet];
  return (
    <Card data-testid="candidats-ruul">
      <CardHeader>
        <CardTitle>Candidats Ruul</CardTitle>
        <CardDescription>
          {groupes.a_traiter.length} à traiter · {groupes.acceptees.length} acceptées pas signées · {groupes.signees.length} signées. Referrals d'abord.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(libelles) as (keyof typeof libelles)[]).map((k) => (
            <Button key={k} size="sm" variant={onglet === k ? "default" : "outline"} onClick={() => setOnglet(k)}>
              {libelles[k]} ({groupes[k].length})
            </Button>
          ))}
        </div>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {liste.length === 0 ? <p className="text-sm text-muted-foreground">Rien ici.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Pays", "Reçue", "Statut", "Ce qui manque", "HM", ""].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {liste.map((c) => (
                  <tr key={c.site_id} className="border-b border-border/40 align-top">
                    <td className="py-1.5 pr-3 font-medium">
                      {c.nom ?? "?"}{c.referral ? <span className="ml-1 text-xs text-emerald-600">referral{c.parrain_nom ? ` (${c.parrain_nom})` : ""}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3">{c.pays ?? c.pays_brut ?? "?"}</td>
                    <td className="py-1.5 pr-3 text-xs">{c.cree_at ? new Date(c.cree_at).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      {c.decision ? LIBELLE_DECISION[c.decision] : c.statut_site}
                      {c.envoi === "a_envoyer" ? " · en attente d'envoi" : c.envoi === "erreur" ? ` · erreur : ${c.envoi_erreur ?? "?"}` : ""}
                      {c.start_monday ? ` · cohorte ${jourMois(c.start_monday)}` : ""}
                      {c.relances_signature ? ` · ${c.relances_signature} relance(s)` : ""}
                      {c.desinscrit_at ? " · désinscrit" : ""}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{(c.manques ?? []).join(" · ") || "—"}</td>
                    <td className="py-1.5 pr-3 text-xs">{c.hm_nom ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {c.decision === "a_traiter" && c.statut_site === "pending" ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => void decider(c, "acceptee")}>Accepter</Button>
                          <Button size="sm" variant="outline" onClick={() => void decider(c, "refusee")}>Refuser</Button>
                        </div>
                      ) : null}
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

/** Cohortes Ruul (0577) : par lundi de cohorte, chaque posteur et ses étapes ; en rouge, bloqué depuis plus de 48 h. */
export function PageCohortesRuul() {
  const q = useQuery({ queryKey: ["ruul-cohortes"], queryFn: lireCohortesRuul });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const parCohorte = new Map<string, typeof q.data>();
  for (const l of q.data) parCohorte.set(l.cohorte ?? "sans cohorte", [...(parCohorte.get(l.cohorte ?? "sans cohorte") ?? []), l]);
  return (
    <div className="space-y-4" data-testid="cohortes-ruul">
      {parCohorte.size === 0 ? <p className="text-sm text-muted-foreground">Aucune cohorte Ruul pour l'instant.</p> : null}
      {[...parCohorte.entries()].map(([cohorte, lignes]) => (
        <Card key={cohorte}>
          <CardHeader>
            <CardTitle>Cohorte du {cohorte === "sans cohorte" ? cohorte : jourMois(cohorte)}</CardTitle>
            <CardDescription>{lignes.length} posteur(s)</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Nom</th>
                  {ETAPES_RUUL.map((e) => <th key={e.cle} className="py-2 pr-2">{e.libelle}</th>)}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const bloquee = etapeBloquee(l.etapes);
                  return (
                    <tr key={l.site_id} className="border-b border-border/40">
                      <td className="py-1.5 pr-3 text-sm font-medium">
                        {l.nom ?? "?"} <span className="text-xs text-muted-foreground">{l.pays ?? ""}{l.stop ? " · STOP" : ""}</span>
                      </td>
                      {ETAPES_RUUL.map((e) => (
                        <td key={e.cle} className={`py-1.5 pr-2 ${bloquee === e.cle ? "font-semibold text-destructive" : ""}`}>
                          {l.etapes[e.cle] ? `✓ ${new Date(String(l.etapes[e.cle])).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" })}` : bloquee === e.cle ? "bloqué" : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
