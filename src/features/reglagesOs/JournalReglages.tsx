import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { lireJournal, valeurCourte } from "./api";

const quand = (iso: string, langue: string) =>
  new Intl.DateTimeFormat(langue, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

/**
 * Qui a changé ces réglages et quand (0411) : la dernière modification, et
 * l'historique à la demande.
 */
export function JournalReglages({ cles }: { cles: readonly string[] }) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const lu = useQuery({ queryKey: ["reglages-journal", ...cles], queryFn: () => lireJournal(cles, 20) });
  const entrees = lu.data ?? [];
  const derniere = entrees[0];
  return (
    <div className="space-y-1 text-xs text-muted-foreground" data-testid="journal-reglages">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {derniere
            ? t("reglagesOs.journal.derniere", { par: derniere.par_nom, quand: quand(derniere.at, i18n.language) })
            : t("reglagesOs.journal.aucune")}
        </span>
        {entrees.length > 0 && (
          <button type="button" className="underline underline-offset-2" onClick={() => setOuvert((o) => !o)}>
            {ouvert ? t("reglagesOs.journal.masquer") : t("reglagesOs.journal.historique", { n: entrees.length })}
          </button>
        )}
      </div>
      {ouvert && (
        <ul className="space-y-1 rounded-md border p-2">
          {entrees.map((e, i) => (
            <li key={`${e.cle}-${e.at}-${i}`}>
              <span className="font-medium text-foreground">{quand(e.at, i18n.language)}</span> · {e.par_nom} · <code>{e.cle}</code> :{" "}
              {valeurCourte(e.ancienne)} → {valeurCourte(e.nouvelle)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
