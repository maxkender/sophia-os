import { useTranslation } from "react-i18next";

import { CheckWarmup } from "@/features/ckd/decisions/CheckWarmup";
import { ListeJeudi } from "@/features/ckd/decisions/ListeJeudi";
import { ListeSamedi } from "@/features/ckd/decisions/ListeSamedi";

const P = "problemes.rituels";

/** Le jour de la semaine à Paris (1 = lundi … 7 = dimanche). */
export function jourParis(maintenant = new Date()): number {
  const j = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Paris" }).format(maintenant);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(j) + 1;
}

/**
 * 4/11 : les décisions de la semaine se prennent dans Problèmes → 📅 Samedi.
 * Les anciens écrans (jeudi, samedi, dimanche) servent ici d'outils
 * d'exécution, avec leurs chiffres ; celui du jour est ouvert.
 */
export function RituelsSemaine({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t } = useTranslation();
  const j = jourParis(maintenant);
  const blocs = [
    { cle: "samedi", ouvert: j === 6 || j === 5, contenu: <ListeSamedi maintenant={maintenant} /> },
    { cle: "dimanche", ouvert: j === 7, contenu: <CheckWarmup /> },
    { cle: "jeudi", ouvert: j === 4, contenu: <ListeJeudi maintenant={maintenant} /> },
  ];
  return (
    <div className="space-y-2" data-testid="rituels-semaine">
      {blocs.map((b) => (
        <details key={b.cle} open={b.ouvert} className="rounded-md border p-2" data-testid={`rituel-${b.cle}`}>
          <summary className="cursor-pointer text-sm font-semibold">{t(`${P}.${b.cle}`)}</summary>
          <div className="pt-2">{b.contenu}</div>
        </details>
      ))}
    </div>
  );
}
