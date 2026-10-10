import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { messageErreur } from "@/lib/utils";
import { nomApplication } from "../applications";
import { nomLangue } from "../langues";
import { SLUG_SOPHIA } from "../multiApp";
import {
  applicationsProposees,
  labelsDeLApplication,
  type ErreurChoixCreation,
  type InfoChoixCreation,
} from "./choixCreation";
import type { EtatChoixApplicationsCreation } from "./useChoixApplicationsCreation";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * « Application du compte » à sa création, par celui qui crée le compte du
 * créateur (admin, Head of Ops, DM, HM — c'est le créateur qui est associé à
 * une application, pas son recruteur). Un seul choix : l'application (Sophia
 * par défaut). Le label n'est PAS choisi ici : manage-users le tire de la File
 * des créateurs de cette application (langue du compte, puis file générale),
 * sinon parmi les labels qui la servent.
 *
 * Invisible tant qu'il n'y a pas au moins deux applications actives, ou quand
 * le choix n'est pas permis. Sophia = corps manage-users identique à celui
 * d'avant.
 */
export function ChoixApplicationsCreation({
  etat,
  idPrefixe,
}: {
  etat: EtatChoixApplicationsCreation;
  idPrefixe: string;
}) {
  const { t } = useTranslation();
  if (!etat.visible) return null;

  const { choix, setChoix, validation } = etat;
  const applications = etat.applications.data ?? [];
  const apps = applicationsProposees(applications);
  const erreurLecture = etat.applications.error ?? etat.liens.error ?? etat.labels.error;
  const choisie = applications.find((a) => a.slug === choix.application) ?? null;
  const nomChoisie = choisie ? nomApplication(choisie) : nomApplication({ slug: choix.application });
  const labelsPossibles =
    choisie && etat.liens.data && etat.labels.data
      ? labelsDeLApplication(choisie.id, etat.labels.data, etat.liens.data)
      : null;
  // Application choisie éteinte entre-temps : gardée dans la liste pour que
  // le select reflète l'état (l'erreur dit pourquoi l'envoi est bloqué).
  const options =
    choisie && !apps.some((a) => a.slug === choisie.slug) ? [...apps, choisie] : apps;

  const texteErreur = (e: ErreurChoixCreation): string => {
    switch (e.type) {
      case "aucunLabel":
        return t("choixCompteCreation.erreurAucunLabel", { app: e.app });
      case "applicationInactive":
        return t("choixCompteCreation.erreurApplicationInactive", { app: e.app });
    }
  };
  const texteInfo = (i: InfoChoixCreation): string =>
    t("choixCompteCreation.infoLangue", { app: i.app, langue: nomLangue(i.langue) });

  const id = `${idPrefixe}-application`;

  return (
    <div className="space-y-2 rounded-md border p-3 sm:col-span-2" data-testid="choix-applications-creation">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t("choixCompteCreation.application")}</Label>
        <select
          id={id}
          className={selectClass}
          value={choix.application}
          onChange={(e) => setChoix({ application: e.target.value })}
        >
          {options.map((a) => (
            <option key={a.id} value={a.slug}>
              {a.slug === SLUG_SOPHIA
                ? t("choixCompteCreation.applicationDefaut", { app: nomApplication(a) })
                : nomApplication(a)}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          {t("choixCompteCreation.aideLabel", { app: nomChoisie })}
        </p>
        {choix.application !== SLUG_SOPHIA && (
          <p className="text-[11px] text-muted-foreground">
            {t("choixCompteCreation.aideAutreApplication", { app: nomChoisie })}
          </p>
        )}
        {labelsPossibles && labelsPossibles.length > 0 && (
          <p className="text-[11px] text-muted-foreground" data-testid="labels-application">
            {t("choixCompteCreation.labelsPossibles", {
              app: nomChoisie,
              labels: labelsPossibles.map((l) => String(l.nom ?? "").trim() || l.id.slice(0, 8)).join(", "),
            })}
          </p>
        )}
      </div>

      {erreurLecture && (
        <p className="text-xs text-destructive">
          {t("choixCompteCreation.erreurLecture", { message: messageErreur(erreurLecture) })}
        </p>
      )}

      {validation.erreurs.length > 0 && (
        <ul className="space-y-0.5">
          {validation.erreurs.map((e, i) => (
            <li key={`${e.type}-${i}`} className="text-xs font-medium text-destructive">
              {texteErreur(e)}
            </li>
          ))}
        </ul>
      )}
      {validation.infos.length > 0 && (
        <ul className="space-y-0.5">
          {validation.infos.map((info, i) => (
            <li key={`${info.type}-${i}`} className="text-[11px] text-warning">
              {texteInfo(info)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
