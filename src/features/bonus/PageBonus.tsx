import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lireHistoriqueBonus } from "./api";
import { BonusLundi } from "./BonusLundi";
import { DonnerBonus } from "./DonnerBonus";
import { LIBELLE_TYPE } from "./lundi";

/**
 * Recruitment automation → Bonus : « Donner un bonus » en haut, les bonus de
 * lundi prochain (Retirer, total + 10 % de frais, Tout envoyer), puis
 * l'historique des bonus envoyés.
 */
export function PageBonus() {
  return (
    <div className="space-y-6" data-testid="page-bonus">
      <Card>
        <CardContent className="p-4">
          <DonnerBonus annee={new Date().getFullYear()} />
        </CardContent>
      </Card>
      <BonusLundi avecDonner={false} />
      <HistoriqueBonus />
    </div>
  );
}

function HistoriqueBonus() {
  const q = useQuery({ queryKey: ["bonus-historique"], queryFn: lireHistoriqueBonus });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const paye = q.data.filter((b) => b.statut === "paye").reduce((s, b) => s + Number(b.montant), 0);
  return (
    <Card data-testid="historique-bonus">
      <CardHeader>
        <CardTitle>Historique des bonus envoyés</CardTitle>
        <CardDescription>{q.data.length} envoi(s) · {paye.toFixed(2)} $ payés (hors frais Upwork).</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.data.length === 0 ? <p className="text-sm text-muted-foreground">Aucun bonus envoyé pour l'instant.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {["Date", "Type", "Nom", "Détail", "Montant", "Statut"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.data.map((b) => (
                <tr key={b.id} className="border-b border-border/40 align-top">
                  <td className="py-1.5 pr-3 text-xs">{new Date(b.paye_at ?? b.envoi_at ?? b.lundi).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                  <td className="py-1.5 pr-3 text-xs">{LIBELLE_TYPE[b.type] ?? b.type}</td>
                  <td className="py-1.5 pr-3 font-medium">{b.nom}</td>
                  <td className="py-1.5 pr-3 text-xs">{b.detail}{b.erreur ? <span className="block text-destructive">{b.erreur}</span> : null}</td>
                  <td className="py-1.5 pr-3">{Number(b.montant).toFixed(2)} $</td>
                  <td className="py-1.5 pr-3 text-xs">{b.statut === "paye" ? "Payé" : "Échec"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
