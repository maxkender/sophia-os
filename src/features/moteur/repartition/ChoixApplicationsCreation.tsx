import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messageErreur } from "@/lib/utils";
import { nomLangue } from "../langues";
import { ApplicationsDuLabel } from "./ApplicationsDuLabel";
import {
  applicationsProposees,
  defautDuLabel,
  labelsProposes,
  persoInitial,
  type ErreurChoixCreation,
  type InfoChoixCreation,
} from "./choixCreation";
import { PAS_PARTS } from "./logique";
import type { EtatChoixApplicationsCreation } from "./useChoixApplicationsCreation";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const pastille = (actif: boolean) =>
  actif
    ? "flex flex-col items-start rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-left text-xs font-medium"
    : "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted";

/**
 * Choix des applications d'un compte à sa création, en DEUX NIVEAUX, par
 * celui qui crée le compte du créateur (admin, Head of Ops, DM, HM — c'est le
 * créateur qui est associé à des applications, pas son recruteur). Inactif,
 * ce bloc ne s'affiche pas :
 *
 * 1. « Label du compte » : Automatique (la File des créateurs, comme
 *    aujourd'hui) ou un label slideshow imposé, chacun avec les applications
 *    qu'il sert. Le label dit ce que le compte PEUT promouvoir.
 * 2. « Répartition des posts » : Par défaut (rien n'est envoyé), « 100 % X »
 *    par application active, ou Personnalisée (entiers, somme 100). Une
 *    répartition explicite est exclusive : seules ses applications seront
 *    publiées, jamais de repli Sophia.
 *
 * Rien choisi = corps manage-users identique à celui d'avant.
 */
export function ChoixApplicationsCreation({
  etat,
  idPrefixe,
}: {
  etat: EtatChoixApplicationsCreation;
  idPrefixe: string;
}) {
  const { t } = useTranslation();
  if (!etat.actif) return null;

  const { choix, setChoix, validation } = etat;
  const applications = etat.applications.data ?? null;
  const liens = etat.liens.data ?? null;
  const apps = applications ? applicationsProposees(applications) : [];
  const labels = labelsProposes(etat.labels.data ?? []);
  const erreurLecture = etat.applications.error ?? etat.liens.error ?? etat.labels.error;

  const defaut = defautDuLabel(choix.labelId, liens, applications);
  const texteDefaut = !defaut
    ? t("choixCompteCreation.defautAuto")
    : defaut.type === "sophia"
      ? t("choixCompteCreation.defautSophia")
      : defaut.type === "unique"
        ? t("choixCompteCreation.defautUnique", { app: defaut.app })
        : t("choixCompteCreation.defautEgales", { apps: defaut.apps.join(", ") });

  const valeurRepartition =
    choix.repartition === "unique" && choix.appUnique
      ? `app:${choix.appUnique}`
      : choix.repartition === "perso"
        ? "perso"
        : "defaut";

  const changerRepartition = (v: string) => {
    if (v === "perso") {
      setChoix({ ...choix, repartition: "perso", appUnique: null, perso: persoInitial(choix, apps) });
    } else if (v.startsWith("app:")) {
      setChoix({ ...choix, repartition: "unique", appUnique: v.slice(4), perso: {} });
    } else {
      setChoix({ ...choix, repartition: "defaut", appUnique: null, perso: {} });
    }
  };

  const totalPerso = Object.values(choix.perso).reduce(
    (s, v) => s + (Number.isFinite(v) ? v : 0),
    0,
  );

  const texteErreur = (e: ErreurChoixCreation): string => {
    switch (e.type) {
      case "saisie":
        return t("choixCompteCreation.erreurSaisie");
      case "somme":
        return t("choixCompteCreation.erreurSomme", { total: e.total });
      case "labelIncompatible":
        return t("choixCompteCreation.erreurLabelIncompatible", {
          label: e.label,
          apps: e.apps.join(", "),
        });
      case "aucunLabel":
        return t("choixCompteCreation.erreurAucunLabel", { apps: e.apps.join(", ") });
    }
  };
  const texteInfo = (i: InfoChoixCreation): string => {
    switch (i.type) {
      case "labelAuto":
        return t("choixCompteCreation.infoLabelAuto", { apps: i.apps.join(", ") });
      case "exclusif":
        return t("choixCompteCreation.infoExclusif", { apps: i.apps.join(", ") });
      case "langue":
        return t("choixCompteCreation.infoLangue", { app: i.app, langue: nomLangue(i.langue) });
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3 sm:col-span-2" data-testid="choix-applications-creation">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{t("choixCompteCreation.titre")}</p>
        <p className="text-xs text-muted-foreground">{t("choixCompteCreation.aide")}</p>
      </div>

      {erreurLecture && (
        <p className="text-xs text-destructive">
          {t("choixCompteCreation.erreurLecture", { message: messageErreur(erreurLecture) })}
        </p>
      )}

      <div className="space-y-1.5">
        <Label>{t("choixCompteCreation.label")}</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("choixCompteCreation.label")}>
          <button
            type="button"
            aria-pressed={choix.labelId === null}
            className={pastille(choix.labelId === null)}
            onClick={() => setChoix({ ...choix, labelId: null })}
          >
            {t("choixCompteCreation.labelAuto")}
          </button>
          {labels.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={choix.labelId === l.id}
              className={pastille(choix.labelId === l.id)}
              onClick={() => setChoix({ ...choix, labelId: l.id })}
            >
              <span>{l.nom}</span>
              <ApplicationsDuLabel labelId={l.id} />
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {choix.labelId === null
            ? t("choixCompteCreation.labelAutoAide")
            : t("choixCompteCreation.labelImposeAide")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefixe}-repartition`}>{t("choixCompteCreation.repartition")}</Label>
        <select
          id={`${idPrefixe}-repartition`}
          className={selectClass}
          value={valeurRepartition}
          onChange={(e) => changerRepartition(e.target.value)}
        >
          <option value="defaut">{texteDefaut}</option>
          {apps.map((a) => (
            <option key={a.id} value={`app:${a.slug}`}>
              {t("choixCompteCreation.preReglage", { app: a.nom })}
            </option>
          ))}
          {apps.length > 0 && <option value="perso">{t("choixCompteCreation.perso")}</option>}
        </select>

        {choix.repartition === "perso" && (
          <div className="space-y-1.5">
            {apps.map((a) => {
              const id = `${idPrefixe}-part-${a.slug}`;
              const v = choix.perso[a.slug] ?? 0;
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <label htmlFor={id} className="w-24 shrink-0 truncate text-xs">
                    {a.nom}
                  </label>
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={PAS_PARTS}
                    className="h-8 w-24"
                    value={Number.isFinite(v) ? v : ""}
                    onChange={(e) => {
                      const brut = e.target.value;
                      const n = brut === "" ? Number.NaN : Number(brut);
                      setChoix({ ...choix, perso: { ...choix.perso, [a.slug]: n } });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              );
            })}
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("choixCompteCreation.total", { total: totalPerso })}
            </p>
          </div>
        )}
      </div>

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
            <li
              key={`${info.type}-${i}`}
              className={info.type === "langue" ? "text-[11px] text-warning" : "text-[11px] text-muted-foreground"}
            >
              {texteInfo(info)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
