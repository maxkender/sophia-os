import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

import { DonnerBonus } from "./DonnerBonus";
import { envoyerBonus, lireCarteBonus, retirerBonus, type LigneBonusLundi } from "./api";
import { delaiCm, jourMois, LIBELLE_TYPE, totaux } from "./lundi";

const dollars = (n: number) => `${Number(n).toFixed(2)} $`;

/**
 * 0564 : la carte « Bonus de lundi » (Weekly decisions). Comment Masters,
 * parrainages et bonus donnés en une phrase ; total + 10 % de frais Upwork.
 * Rien ne part sans « Tout envoyer » (bonus Upwork, compte de Max).
 */
export function BonusLundi({ avecDonner = true, lienPage = false }: { avecDonner?: boolean; lienPage?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bonus-lundi"], queryFn: lireCarteBonus });
  const [occupe, setOccupe] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

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
          {lienPage ? (
            <Link to="/admin/auto/bonus" className="self-center text-sm underline" data-testid="lien-page-bonus">
              Ouvrir la page Bonus (historique) →
            </Link>
          ) : null}
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
        {c.parrainages_a_confirmer > 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="bonus-a-confirmer">
            {c.parrainages_a_confirmer} parrainage(s) à confirmer dans « À décider maintenant »
          </p>
        ) : null}
        {avecDonner ? <DonnerBonus annee={Number(c.lundi.slice(0, 4))} /> : null}
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
