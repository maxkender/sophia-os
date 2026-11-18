import { useTranslation } from "react-i18next";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { cn } from "@/lib/utils";

import { useApplication } from "./ApplicationContext";
import { SelectApplication } from "./SelectApplication";

/**
 * Le filtre « Application » d'une page. Il remplace le sélecteur du menu
 * latéral (retiré le 17/11) : l'OS n'est pas cloisonné par application, seules
 * quelques pages (prompts, stats, réserve) affichent une application à la fois.
 * Le choix reste partagé entre ces pages (`ApplicationContext`).
 * Rien à choisir avec une seule application : le filtre ne s'affiche pas.
 */
export function FiltreApplication({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { applications, application, slug, setSlug } = useApplication();
  if (applications.length < 2) return null;
  return (
    <label className={cn("inline-flex items-center gap-2", className)} data-testid="filtre-application">
      <span className="text-xs font-medium text-muted-foreground">{t("applications.filtre")}</span>
      {application && <LogoApplication slug={application.slug} taille="xs" decoratif />}
      <span className="w-36">
        <SelectApplication applications={applications} value={slug} onChange={setSlug} />
      </span>
    </label>
  );
}
