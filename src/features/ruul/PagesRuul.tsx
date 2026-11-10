import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  deciderCandidatureRuul,
  lireCandidaturesRuul,
  lireCohortesRuul,
  lireSuiviRuul,
  marquerAjoutesRuul,
  type CandidatureRuul,
  type LigneSuiviRuul,
} from "./api";
import { colonneBloquee, COLONNES_SUIVI_RUUL, ETAPES_RUUL, etapeBloquee, jourMois, joursDepuis } from "./logique";

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

const peutMarquer = (l: LigneSuiviRuul) => Boolean(l.ruul_email) && !l.ruul_ajoute_at;

/**
 * Ruul (10/11) : une ligne par posteur Ruul, de la signature à la dernière
 * paie. En rouge, l'étape bloquée (« bloqué : … depuis X j »). Les posteurs
 * qui ont donné leur email Ruul mais pas encore ajoutés dans Ruul se cochent
 * et se marquent « ajouté » d'un clic, un par un ou tous ensemble.
 */
export function PageSuiviRuul() {
  const q = useQuery({ queryKey: ["ruul-suivi"], queryFn: lireSuiviRuul });
  const qc = useQueryClient();
  const [bloquesSeuls, setBloquesSeuls] = React.useState(false);
  const [actifsSeuls, setActifsSeuls] = React.useState(true);
  const [coches, setCoches] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;

  const lignes = q.data.filter((l) => (!actifsSeuls || l.actif) && (!bloquesSeuls || l.bloque));
  const marquables = lignes.filter(peutMarquer);
  const choisis = marquables.filter((l) => coches.has(l.poster_id)).map((l) => l.poster_id);
  const toutCoche = marquables.length > 0 && choisis.length === marquables.length;

  const cocher = (id: string, oui: boolean) =>
    setCoches((c) => {
      const n = new Set(c);
      if (oui) n.add(id);
      else n.delete(id);
      return n;
    });

  const marquer = async (ids: string[]) => {
    if (ids.length === 0) return;
    setOccupe(true);
    setMessage(null);
    try {
      const n = await marquerAjoutesRuul(ids);
      setMessage(`${n} posteur(s) marqué(s) ajouté(s) dans Ruul.`);
      setCoches((c) => new Set([...c].filter((id) => !ids.includes(id))));
      await qc.invalidateQueries({ queryKey: ["ruul-suivi"] });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const nbBloques = q.data.filter((l) => (!actifsSeuls || l.actif) && l.bloque).length;
  return (
    <Card data-testid="suivi-ruul">
      <CardHeader>
        <CardTitle>Posteurs Ruul</CardTitle>
        <CardDescription>
          {lignes.length} posteur(s) affiché(s) · {nbBloques} bloqué(s) · {marquables.length} à ajouter dans Ruul.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={bloquesSeuls} onChange={(e) => setBloquesSeuls(e.target.checked)} />
            Bloqué &gt; 2 jours
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={actifsSeuls} onChange={(e) => setActifsSeuls(e.target.checked)} />
            Actifs seulement
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={toutCoche}
              disabled={marquables.length === 0}
              onChange={(e) => setCoches(e.target.checked ? new Set(marquables.map((l) => l.poster_id)) : new Set())}
            />
            Tout cocher
          </label>
          <Button size="sm" disabled={occupe || choisis.length === 0} onClick={() => void marquer(choisis)}>
            Marquer ajouté dans Ruul ({choisis.length})
          </Button>
        </div>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {lignes.length === 0 ? <p className="text-sm text-muted-foreground">Personne ici.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2" aria-label="Cocher" />
                  <th className="py-2 pr-3">Posteur</th>
                  {COLONNES_SUIVI_RUUL.map((c) => <th key={c.cle} className="py-2 pr-3">{c.libelle}</th>)}
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const rouge = l.bloque ? colonneBloquee(l) : null;
                  return (
                    <tr key={l.poster_id} className="border-b border-border/40 align-top" data-testid={`suivi-ruul-${l.poster_id}`}>
                      <td className="py-1.5 pr-2">
                        {peutMarquer(l) ? (
                          <input
                            type="checkbox"
                            aria-label={`Cocher ${l.nom}`}
                            checked={coches.has(l.poster_id)}
                            onChange={(e) => cocher(l.poster_id, e.target.checked)}
                          />
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="font-medium">{l.nom}{l.actif ? "" : <span className="ml-1 text-xs text-muted-foreground">(inactif)</span>}</div>
                        <div className="text-xs text-muted-foreground">
                          {[l.pays, l.zone, l.tarif != null ? `${l.tarif} $` : null].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      {COLONNES_SUIVI_RUUL.map((c) => (
                        <td key={c.cle} className={`py-1.5 pr-3 text-xs ${rouge === c.cle ? "font-semibold text-destructive" : ""}`}>
                          {c.valeur(l)}
                          {rouge === c.cle ? (
                            <div>bloqué : {l.bloque_etape ?? c.libelle}{l.bloque_depuis ? ` depuis ${joursDepuis(l.bloque_depuis)} j` : ""}</div>
                          ) : null}
                        </td>
                      ))}
                      <td className="py-1.5 pr-3">
                        {peutMarquer(l) ? (
                          <Button size="sm" variant="outline" disabled={occupe} onClick={() => void marquer([l.poster_id])}>
                            Marquer ajouté
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
