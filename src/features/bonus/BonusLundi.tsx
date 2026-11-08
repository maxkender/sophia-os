import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { lirePhraseBonus } from "../../../supabase/functions/_shared/bonus";
import { donnerBonus, envoyerBonus, lireCarteBonus, retirerBonus, type LigneBonusLundi } from "./api";
import { delaiCm, jourMois, LIBELLE_TYPE, totaux } from "./lundi";

const dollars = (n: number) => `${Number(n).toFixed(2)} $`;

/**
 * 0564 : la carte « Bonus de lundi » (Weekly decisions). Comment Masters,
 * parrainages et bonus donnés en une phrase ; total + 10 % de frais Upwork.
 * Rien ne part sans « Tout envoyer » (bonus Upwork, compte de Max).
 */
export function BonusLundi() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bonus-lundi"], queryFn: lireCarteBonus });
  const [occupe, setOccupe] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [phrase, setPhrase] = React.useState("");

  const agir = async (cle: string, f: () => Promise<string | null>) => {
    setOccupe(cle);
    setMessage(null);
    try {
      setMessage(await f());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(null);
      await qc.invalidateQueries({ queryKey: ["bonus-lundi"] });
    }
  };

  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const c = q.data;
  const t = totaux(c.lignes);
  const aVerifier = c.lignes.filter((l) => (l.a_verifier ?? 0) > 0);

  const donner = () =>
    agir("donner", async () => {
      const lu = lirePhraseBonus(phrase, Number(c.lundi.slice(0, 4)));
      if ("erreur" in lu) return `Pas compris : ${lu.erreur}.`;
      const r = await donnerBonus(lu);
      if (!r.ok) return `Pas ajouté : ${r.erreur}.`;
      setPhrase("");
      return `Ajouté : ${r.montant} $ à ${r.nom} (lundi ${jourMois(String(r.lundi))}, raison : ${lu.raison}).`;
    });

  const toutEnvoyer = () => {
    if (!window.confirm(`Envoyer ${t.n} bonus sur Upwork : ${dollars(t.total)} + 10 % de frais = ${dollars(t.totalFrais)} ?`)) return;
    void agir("envoyer", async () => {
      const r = await envoyerBonus(c.lundi);
      if (!r.ok) return r.error ?? "Envoi impossible.";
      return `${r.payes ?? 0} bonus payé(s), ${r.echecs ?? 0} échec(s) (détail sur chaque ligne).`;
    });
  };

  return (
    <Card data-testid="bonus-lundi">
      <CardHeader>
        <CardTitle>Bonus de lundi {jourMois(c.lundi)}</CardTitle>
        <CardDescription>
          {t.n} ligne{t.n > 1 ? "s" : ""} à envoyer · {dollars(t.total)} + 10 % de frais Upwork ({dollars(t.frais)}) ={" "}
          <b>{dollars(t.totalFrais)}</b>
          {c.paye > 0 ? ` · déjà payé ${dollars(c.paye)}` : ""}. Rien ne part sans « Tout envoyer ».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!c.test_valide ? <p className="text-sm text-destructive">Le test du bonus Upwork n'est pas validé : l'envoi est bloqué.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={occupe !== null || t.n === 0 || !c.test_valide} onClick={toutEnvoyer}>
            {occupe === "envoyer" ? "Envoi…" : `Tout envoyer (${dollars(t.totalFrais)})`}
          </Button>
        </div>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {c.lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun bonus pour ce lundi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Type", "Nom", "Détail", "Tarif", "Montant", "", ""].map((h, i) => <th key={i} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {c.lignes.map((l) => (
                  <Ligne key={l.id} l={l} occupe={occupe} retirer={(r) => agir(`r:${l.id}`, async () => {
                    await retirerBonus(l.id, r);
                    return r ? `${l.nom} : ligne retirée.` : `${l.nom} : ligne remise.`;
                  })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aVerifier.length > 0 || c.parrainages_a_confirmer > 0 ? (
          <div className="space-y-1 rounded-lg border px-3 py-2 text-sm" data-testid="bonus-a-verifier">
            <p className="font-medium">À vérifier (non payé)</p>
            {aVerifier.map((l) => (
              <p key={l.id} className="text-muted-foreground">{l.nom} : {l.a_verifier} commentaire{(l.a_verifier ?? 0) > 1 ? "s" : ""} fait{(l.a_verifier ?? 0) > 1 ? "s" : ""} mais pas retrouvé{(l.a_verifier ?? 0) > 1 ? "s" : ""} publié{(l.a_verifier ?? 0) > 1 ? "s" : ""}</p>
            ))}
            {c.parrainages_a_confirmer > 0 ? <p className="text-muted-foreground">{c.parrainages_a_confirmer} parrainage(s) à confirmer dans « À décider maintenant »</p> : null}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Donner un bonus</p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-0 flex-1"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="donne 2 $ de bonus à Martin Befeld lundi, raison …"
              aria-label="Donner un bonus"
            />
            <Button size="sm" variant="outline" disabled={occupe !== null || !phrase.trim()} onClick={donner}>Ajouter</Button>
          </div>
          <p className="text-xs text-muted-foreground">La ligne arrive ici, à valider. Aussi sur Slack : /bonus …</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Ligne({ l, occupe, retirer }: { l: LigneBonusLundi; occupe: string | null; retirer: (r: boolean) => void }) {
  const delai = delaiCm(l);
  const retiree = l.statut === "retire";
  const envoyee = Boolean(l.envoi_at) || l.statut === "paye";
  return (
    <tr className={`border-b border-border/40 align-top ${retiree ? "opacity-50" : ""}`} data-testid="bonus-ligne">
      <td className="py-1.5 pr-3 text-xs">{LIBELLE_TYPE[l.type]}</td>
      <td className="py-1.5 pr-3 font-medium">{l.nom}{!l.contrat_ok ? <span className="block text-xs text-destructive">pas de contrat VIk relié</span> : null}</td>
      <td className="py-1.5 pr-3 text-xs">
        {l.detail}
        {delai ? <span className="block text-muted-foreground">{delai}</span> : null}
        {l.erreur ? <span className="block text-destructive">{l.erreur}</span> : null}
      </td>
      <td className="py-1.5 pr-3 text-xs">{l.tarif !== null ? `${l.tarif} $${l.zone ? ` (zone ${l.zone})` : ""}` : "—"}</td>
      <td className="py-1.5 pr-3">{dollars(l.montant)}</td>
      <td className="py-1.5 pr-3 text-xs">{l.statut === "paye" ? "Payé" : retiree ? "Retirée" : envoyee ? "Envoi en cours / échec" : "À valider"}</td>
      <td className="py-1.5 pr-0 text-right">
        {!envoyee ? (
          <Button size="xs" variant="ghost" disabled={occupe !== null} onClick={() => retirer(!retiree)}>{retiree ? "Remettre" : "Retirer"}</Button>
        ) : null}
      </td>
    </tr>
  );
}
