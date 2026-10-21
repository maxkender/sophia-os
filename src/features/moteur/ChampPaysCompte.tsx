import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { drapeauPays, nomPaysIso, paysParDefaut, paysProposes, paysTries } from "@/features/moteur/pays";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Champ « pays du compte » à la création.
 *
 * Deux affichages volontairement différents, parce que les deux situations le
 * sont : quand la langue tranche, on l'ANNONCE (le HM voit ce qui sera écrit,
 * sans rien avoir à faire) ; quand elle ne tranche pas, on BLOQUE sur une
 * liste obligatoire.
 */
export function ChampPaysCompte({
  id,
  langue,
  pays,
  onPays,
}: {
  id: string;
  langue: string;
  pays: string;
  onPays: (pays: string) => void;
}) {
  const { t } = useTranslation();
  const defaut = paysParDefaut(langue);
  const proposes = paysProposes(langue);

  if (!langue) return null;

  // Allemand : Allemagne pré-remplie, Autriche et Suisse au choix.
  if (defaut && proposes) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{t("posters.pays")}</Label>
        <select
          id={id}
          className={selectClass}
          value={pays || defaut}
          onChange={(e) => onPays(e.target.value)}
        >
          {proposes.map((code) => (
            <option key={code} value={code}>
              {drapeauPays(code)} {nomPaysIso(code)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("posters.paysProposesAide")}</p>
      </div>
    );
  }

  if (defaut) {
    return (
      <div className="space-y-1">
        <Label>{t("posters.pays")}</Label>
        <p className="flex h-9 items-center gap-2 text-sm">
          <span aria-hidden>{drapeauPays(defaut)}</span>
          <span>{nomPaysIso(defaut)}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t("posters.paysDeduit")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t("posters.pays")}</Label>
      <select
        id={id}
        className={selectClass}
        value={pays}
        onChange={(e) => onPays(e.target.value)}
        required
      >
        <option value="">{t("posters.paysAChoisir")}</option>
        {paysTries().map((p) => (
          <option key={p.code} value={p.code}>
            {drapeauPays(p.code)} {p.nom}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{t("posters.paysObligatoireAide")}</p>
    </div>
  );
}
