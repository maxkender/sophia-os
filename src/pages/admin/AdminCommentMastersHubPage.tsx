import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Segments } from "@/components/ui/segments";

import { AdminCommentMastersPage } from "./AdminCommentMastersPage";
import { AdminCommentMastersSuiviPage } from "./AdminCommentMastersSuiviPage";

type Onglet = "suivi" | "reglages";

/**
 * Comment Masters (v3 point 3) : une seule entrée de menu, deux onglets.
 * « Suivi » (par défaut) : les Done par Comment Master (0373). « Réglages » :
 * qui commente, les pays, le prompt, les stats du mois. L'onglet est dans
 * l'URL (`?onglet=reglages`) ; l'ancienne URL `/admin/comment-masters/suivi`
 * redirige ici.
 */
export function AdminCommentMastersHubPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const onglet: Onglet = params.get("onglet") === "reglages" ? "reglages" : "suivi";

  return (
    <div className="space-y-6">
      <Segments<Onglet>
        libelle={t("nav.commentMasters")}
        actif={onglet}
        onChange={(cle) => setParams(cle === "suivi" ? {} : { onglet: cle }, { replace: true })}
        options={[
          { cle: "suivi", contenu: t("commentMasters.onglets.suivi") },
          { cle: "reglages", contenu: t("commentMasters.onglets.reglages") },
        ]}
      />
      {onglet === "suivi" ? <AdminCommentMastersSuiviPage /> : <AdminCommentMastersPage />}
    </div>
  );
}
