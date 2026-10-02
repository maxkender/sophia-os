import { useTranslation } from "react-i18next";

import { nomApplication, type ApplicationOs } from "./applications";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24";

export function SelectApplication({
  id,
  applications,
  value,
  onChange,
  allowTous,
  required,
  className,
}: {
  id?: string;
  applications: Array<ApplicationOs & { actif?: boolean }>;
  value: string;
  onChange: (slug: string) => void;
  allowTous?: boolean;
  required?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <select
      id={id}
      className={className ?? selectClass}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowTous && <option value="tous">{t("applications.filtreTous")}</option>}
      {applications.map((app) => (
        <option key={app.id} value={app.slug}>
          {nomApplication(app)}
          {/* Une application en préparation (inactive) reste sélectionnable :
              on y relit ses prompts et sa réserve avant de l'activer. */}
          {app.actif === false ? ` (${t("applications.inactive")})` : ""}
        </option>
      ))}
    </select>
  );
}
