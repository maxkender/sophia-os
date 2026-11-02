import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listerHms } from "@/features/ckd/api";

export const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Le choix de la HM (admin et Head of Ops) : "" = toutes. */
export function ChoixHm({ valeur, onChange }: { valeur: string; onChange: (hm: string) => void }) {
  const { t } = useTranslation();
  const hms = useQuery({ queryKey: ["ckd", "hms"], queryFn: listerHms });
  return (
    <select
      className={selectClass}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("accueilHm.calendrier.filtreHm")}
    >
      <option value="">{t("accueilHm.calendrier.toutesHms")}</option>
      {[...(hms.data ?? [])]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .map((h) => (
          <option key={h.profile_id} value={h.profile_id}>
            {h.nom}
          </option>
        ))}
    </select>
  );
}
