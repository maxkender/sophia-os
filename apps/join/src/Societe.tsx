import type { T } from "./i18n";

/** L'identité légale de Vik Studios SAS (jamais de coordonnées bancaires), en tête du contrat. */
export default function Societe({ t }: { t: T }) {
  return (
    <div className="societe" lang="en">
      <strong>{t("legal.notice.company")}</strong>
      <span>{t("legal.notice.office")}</span>
      <span>{t("legal.notice.ids")}</span>
      <span>{t("legal.notice.director")} · {t("legal.notice.contact")}</span>
    </div>
  );
}
