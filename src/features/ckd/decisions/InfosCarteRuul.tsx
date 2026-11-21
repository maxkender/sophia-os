/**
 * 21/11 (Max, point 5) : sur une carte Décisions d'un posteur Ruul : « Away du X au Y (raison) », la panne de notre
 * côté, « attend une réponse de notre part », « compte jamais trouvé » (vérifier le handle d'abord). La proposition
 * est recalculée : ces jours ne comptent pas comme manqués.
 */
import { absenceLongue, type CarteRuul, jjmm, texteAway } from "./ruulDecisions";

export function InfosCarteRuul({ c, lundi }: { c: CarteRuul | undefined; lundi: string }) {
  if (!c) return null;
  const longue = absenceLongue(c, lundi);
  if (!c.absences.length && !c.attend_reponse && !c.jamais_trouve) return null;
  return (
    <div className="mt-1 max-w-64 space-y-0.5 text-[11px]" data-testid="infos-carte-ruul">
      {c.absences.map((a) => (
        <p key={`${a.source}-${a.debut}`} className="font-medium text-sky-700 dark:text-sky-300">{texteAway(a)}</p>
      ))}
      {longue && <p className="font-medium text-warning-foreground">Keep : absent jusqu'au {jjmm(longue.fin)}</p>}
      {c.attend_reponse && <p className="font-medium text-warning-foreground">Attend une réponse de notre part : pas de Kill</p>}
      {c.jamais_trouve && <p className="font-medium text-destructive">Compte jamais trouvé : vérifier le handle d'abord (pas de Kill & pay)</p>}
    </div>
  );
}
