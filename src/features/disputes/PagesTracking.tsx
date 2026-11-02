import { useTranslation } from "react-i18next";

import { AdminRetoursContestesPage } from "@/pages/admin/AdminRetoursContestesPage";

import { ONGLETS_POSTS } from "./logique";
import { PageDisputes } from "./PageDisputes";

function Entete({ cle }: { cle: "postsLiens" | "qualityFeedback" }) {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">{t(`nav.${cle}`)}</h1>
      <p className="text-sm text-muted-foreground">{t(`navDesc.${cle}`)}</p>
    </div>
  );
}

/** 31/10 — Tracking → Posts & links : les contestations de posts et de liens, sorties de Disputes. */
export function PagePostsLiens() {
  return (
    <div className="space-y-4" data-testid="page-posts-liens">
      <Entete cle="postsLiens" />
      <PageDisputes onglets={ONGLETS_POSTS} />
    </div>
  );
}

/** 31/10 — Tracking → Quality feedback : les retours sur la qualité des posts contestés, sortis de Disputes. */
export function PageQualityFeedback() {
  return (
    <div className="space-y-4" data-testid="page-quality-feedback">
      <Entete cle="qualityFeedback" />
      <AdminRetoursContestesPage />
    </div>
  );
}
