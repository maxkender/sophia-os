import { useTranslation } from "react-i18next";

import { Badge, type BadgeProps } from "@/components/ui/badge";

import type { Classement } from "./classementComptes";

/** INACTIF et MAUVAISES VUES alertent, STAR félicite, PASSABLE ne dit rien. */
const VARIANTE: Record<Classement, BadgeProps["variant"]> = {
  inactif: "destructive",
  mauvaises_vues: "warning",
  passable: "secondary",
  bien: "info",
  star: "success",
};

/** Badge d'une case de classement — même code couleur partout dans l'admin. */
export function BadgeClassement({
  classement,
  size,
  titre,
}: {
  classement: Classement;
  size?: BadgeProps["size"];
  /** Infobulle : la règle qui a produit la case, en général. */
  titre?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={VARIANTE[classement]}
      size={size}
      title={titre ?? t("classement.aide")}
    >
      {t(`classement.${classement}`)}
    </Badge>
  );
}
