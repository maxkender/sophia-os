import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/features/auth/AuthContext";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CiblesRecrutementHm } from "@/features/recrutementCibles/CiblesHm";

/**
 * Prompt 21, D : « Recruit », dans le menu HM. Ses cibles par pays (cible,
 * recrutés, écart) pour les cohortes à venir et les 3 dernières semaines.
 */
export function HiringRecruterPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{t("recrutementCibles.nav")}</h1>
        {/* 1/11 : seul le Head of Ops crée encore un posteur à la main. */}
        {role === "head_of_ops" && (
          <Button size="sm" variant="outline" render={<Link to="/embauche" />}>
            <UserPlus />
            {t("recrutementCibles.creerPoster")}
          </Button>
        )}
      </div>
      <CiblesRecrutementHm />
    </div>
  );
}
