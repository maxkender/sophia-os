import { LIGNES_RESUME } from "./contrat";
import type { T } from "./i18n";

/**
 * 25/11 (test persona) : le résumé « En bref » dans la langue du candidat ; hors anglais, la mention que la version
 * anglaise est celle qu'on signe.
 */
export function ResumeTraduit({ t, langue }: { t: T; langue: string }) {
  return (
    <section className="carte" style={{ display: "grid", gap: 10 }}>
      <h2 className="h3">{t("ctr.summary")}</h2>
      <ul className="resume">{LIGNES_RESUME.map((n) => <li key={n}>{t(`ctr.short.${n}`)}</li>)}</ul>
      {langue !== "en" && <p className="discret">{t("ctr.shortNote")}</p>}
    </section>
  );
}

/**
 * L'identité légale de Vik Studios SAS (jamais de coordonnées bancaires). 25/11 : en bas de la page du contrat, en
 * poids normal et sans le capital ; l'identité complète reste en tête du texte signé.
 */
export default function Societe({ t }: { t: T }) {
  return (
    <div className="societe">
      <span>Vik Studios SAS · {t("legal.notice.office")}</span>
      <span>{t("legal.notice.ids")}</span>
      <span>{t("legal.notice.contact")}</span>
    </div>
  );
}
