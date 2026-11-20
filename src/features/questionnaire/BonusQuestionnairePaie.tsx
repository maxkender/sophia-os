import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lireBonusQuestionnaire } from "./api";

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const STATUT: Record<string, string> = { a_valider: "à valider", a_payer: "à payer", paye: "payé", retire: "retiré" };

/**
 * 20/11 (Max) : page Pay, « Bonus questionnaire » : 5 $ par questionnaire « top posters » terminé (un par posteur),
 * sur la paie du lundi qui suit. Upwork : il part avec les bonus du lundi (« Tout envoyer », au clic de Max) ;
 * Ruul : il est dans le lot Ruul du lundi. Rien ne part sans validation.
 */
export function BonusQuestionnairePaie() {
  const q = useQuery({ queryKey: ["paie", "bonus-questionnaire"], queryFn: lireBonusQuestionnaire, staleTime: 60_000 });
  const lignes = q.data ?? [];
  if (!lignes.length) return null;
  const ouverts = lignes.filter((b) => b.statut === "a_valider" || b.statut === "a_payer");
  const total = ouverts.reduce((s, b) => s + b.montant, 0);
  return (
    <Card data-testid="bonus-questionnaire">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          Bonus questionnaire <Badge variant="secondary">{ouverts.length} à valider · {total} $</Badge>
        </CardTitle>
        <CardDescription>
          5 $ par questionnaire « top posters » terminé, un par posteur, ajouté à la paie du lundi suivant. Upwork : avec les bonus du lundi
          (« Tout envoyer »). Ruul : dans le lot Ruul du lundi.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2">Posteur</th>
              <th className="py-1.5 pr-2">Lundi</th>
              <th className="py-1.5 pr-2">Paie</th>
              <th className="py-1.5 pr-2">Montant</th>
              <th className="py-1.5 pr-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((b) => (
              <tr key={b.id} className="border-b last:border-0" data-testid="bonus-questionnaire-ligne">
                <td className="py-1.5 pr-2 font-medium">{b.nom}</td>
                <td className="py-1.5 pr-2 tabular-nums">{jjmm(b.lundi)}</td>
                <td className="py-1.5 pr-2">{b.canal_paie === "ruul" ? "Ruul" : "Upwork"}</td>
                <td className="py-1.5 pr-2 tabular-nums">{b.montant} $</td>
                <td className="py-1.5 pr-2">{STATUT[b.statut] ?? b.statut}{b.erreur ? <span className="text-destructive"> · {b.erreur}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
