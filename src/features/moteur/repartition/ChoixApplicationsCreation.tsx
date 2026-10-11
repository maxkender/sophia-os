import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, messageErreur } from "@/lib/utils";
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

/**
 * « Application du compte » à sa création, par celui qui crée le compte du
 * créateur (admin, Head of Ops, DM, HM — c'est le créateur qui est associé à
 * une application, pas son recruteur). Une carte cliquable par application
 * active, AUCUNE cochée d'avance : il faut en choisir une, sinon l'envoi
 * affiche « choisis l'application ». Le label n'est PAS choisi ici :
 * manage-users le tire de la File des créateurs de cette application (langue
 * du compte, puis file générale), sinon parmi les labels qui la servent.
 *
 * Invisible quand le choix n'est pas permis, ou quand on sait qu'il n'y a
 * qu'une application active. Sophia = corps manage-users identique à celui
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
  const bloc = React.useRef<HTMLDivElement>(null);
  const { signalerManquant } = etat;
  // Envoi tenté sans application : on ramène le bloc sous les yeux.
  React.useEffect(() => {
    if (signalerManquant) bloc.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [signalerManquant]);
  if (!etat.visible) return null;

  const { choix, setChoix, validation } = etat;
  const applications = etat.applications.data ?? [];
  const apps = applicationsProposees(applications);
  const erreurLecture = etat.applications.error ?? etat.liens.error ?? etat.labels.error;
  const chargement = etat.applications.isPending;
  const choisie = choix.application
    ? (applications.find((a) => a.slug === choix.application) ?? null)
    : null;
  const nomChoisie = choisie
    ? nomApplication(choisie)
    : choix.application
      ? nomApplication({ slug: choix.application })
      : "";
  const labelsPossibles =
    choisie && etat.liens.data && etat.labels.data
      ? labelsDeLApplication(choisie.id, etat.labels.data, etat.liens.data)
      : null;
  // Application choisie éteinte entre-temps : gardée dans la liste pour que
  // la sélection reste visible (l'erreur dit pourquoi l'envoi est bloqué).
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

  const idTitre = `${idPrefixe}-application`;
  const relire = () => {
    void etat.applications.refetch();
    void etat.liens.refetch();
    void etat.labels.refetch();
  };

  return (
    <div
      ref={bloc}
      className={cn(
        "space-y-2 rounded-md border p-3 sm:col-span-2",
        signalerManquant && "border-destructive",
      )}
      data-testid="choix-applications-creation"
    >
      <div className="space-y-1.5">
        <p id={idTitre} className="text-sm font-medium leading-none">
          {t("choixCompteCreation.application")} <span className="text-destructive">*</span>
        </p>
        {chargement ? (
          <p className="text-xs text-muted-foreground">{t("choixCompteCreation.chargement")}</p>
        ) : (
          <div role="radiogroup" aria-labelledby={idTitre} className="grid gap-2 sm:grid-cols-3">
            {options.map((a) => {
              const coche = choix.application === a.slug;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={coche}
                  onClick={() => setChoix({ application: a.slug })}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    coche
                      ? "border-primary bg-primary/10 font-medium ring-1 ring-primary"
                      : "hover:bg-muted",
                    signalerManquant && !coche && "border-destructive/60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{nomApplication(a)}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {a.langues === null
                        ? t("choixCompteCreation.toutesLangues")
                        : a.langues.map((l) => nomLangue(l)).join(", ")}
                    </span>
                  </span>
                  {coche && <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
        {signalerManquant ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {t("choixCompteCreation.choisirAvant")}
          </p>
        ) : (
          !choix.application &&
          !chargement && (
            <p className="text-[11px] text-muted-foreground">{t("choixCompteCreation.choisir")}</p>
          )
        )}
        {choix.application && (
          <p className="text-[11px] text-muted-foreground">
            {t("choixCompteCreation.aideLabel", { app: nomChoisie })}
          </p>
        )}
        {choix.application && choix.application !== SLUG_SOPHIA && (
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">
            {t("choixCompteCreation.erreurLecture", { message: messageErreur(erreurLecture) })}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={relire}>
            {t("choixCompteCreation.relire")}
          </Button>
        </div>
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
