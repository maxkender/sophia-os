import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/PublicOnlyRoute";
import { RoleGate } from "@/features/auth/RoleGate";
import { estRoleManager, useAuth } from "@/features/auth/AuthContext";
import { ACCUEIL_HO } from "@/features/auth/pagesHeadOfOps";
import { HiringDocumentsPage } from "@/pages/hiring/HiringDocumentsPage";
import { HiringRecruteursPage } from "@/pages/hiring/HiringRecruteursPage";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PosterLayout } from "@/components/layout/PosterLayout";
import { HiringLayout } from "@/components/layout/HiringLayout";
import { HiringAccueilPage } from "@/pages/hiring/HiringAccueilPage";
import { HiringPaiementsPage } from "@/pages/hiring/HiringPaiementsPage";
import { HiringCalendrierPage } from "@/pages/hiring/HiringCalendrierPage";
import { HiringPosterPage } from "@/pages/hiring/HiringPosterPage";
import { AdminDocumentsPage } from "@/pages/admin/AdminDocumentsPage";
import { AdminChatbotPage } from "@/pages/admin/AdminChatbotPage";
import { AdminCheckKillDoublePage } from "@/pages/admin/AdminCheckKillDoublePage";
import { AdminCommentMastersHubPage } from "@/pages/admin/AdminCommentMastersHubPage";
import { DocumentView } from "@/features/documents/DocumentView";
import { AdminPilotagePage } from "@/pages/admin/AdminPilotagePage";
import { AdminSourcesPage } from "@/pages/admin/AdminSourcesPage";
import { AdminPostersPage } from "@/pages/admin/AdminPostersPage";
import { AdminSurveillancePage } from "@/pages/admin/AdminSurveillancePage";
import { AdminRecrutementsPage } from "@/pages/admin/AdminRecrutementsPage";
import { AdminRecrutementsPaysPage } from "@/pages/admin/AdminRecrutementsPaysPage";
import { AdminBibliothequePage } from "@/pages/admin/AdminBibliothequePage";
import { AdminReglagesPage } from "@/pages/admin/AdminReglagesPage";
import { AdminRepartitionPage } from "@/pages/admin/AdminRepartitionPage";
import { AdminPromptsPage } from "@/pages/admin/AdminPromptsPage";
import { AdminAnglesPage } from "@/pages/admin/AdminAnglesPage";
import { AdminLabelsPage } from "@/pages/admin/AdminLabelsPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminSuiviRcPage } from "@/pages/admin/AdminSuiviRcPage";
import { AdminReviewsPage } from "@/pages/admin/AdminReviewsPage";
import { AdminFileReviewsPage } from "@/pages/admin/AdminFileReviewsPage";
import { AdminBancRelecturePage } from "@/pages/admin/AdminBancRelecturePage";
import { AdminRetoursContestesPage } from "@/pages/admin/AdminRetoursContestesPage";
import { AdminReferralsPage } from "@/pages/admin/AdminReferralsPage";
import { AdminCalendrierPage } from "@/pages/admin/AdminCalendrierPage";
import { AdminCreateurPage } from "@/pages/admin/AdminCreateurPage";
import { AdminMinuitPage } from "@/pages/admin/AdminMinuitPage";
import { AdminSlideshowsPage } from "@/pages/admin/AdminSlideshowsPage";
import { AdminPostDetailPage } from "@/pages/admin/AdminPostDetailPage";
import { AdminTestsPage } from "@/pages/admin/AdminTestsPage";
import { AdminPaiePage } from "@/pages/admin/AdminPaiePage";
import { SlackARelier } from "@/features/slack/SlackARelier";
import { PageNudges } from "@/features/nudges/PageNudges";
import { PageCohortes } from "@/features/cohortes/PageCohortes";
import { PageInactifs } from "@/features/inactifs/PageInactifs";
import { AdminCreationPage } from "@/pages/admin/AdminCreationPage";
import { AdminPodsPage } from "@/pages/admin/AdminPodsPage";
import { AdminRelectureNativePage } from "@/pages/admin/AdminRelectureNativePage";
import { PosterCalendrierPage } from "@/pages/poster/PosterCalendrierPage";
import { PosterReferralPage } from "@/pages/poster/PosterReferralPage";
import { PosterPaiementsPage } from "@/pages/poster/PosterPaiementsPage";
import { PosterRetoursPage } from "@/pages/poster/PosterRetoursPage";
import { PosterPostPage } from "@/pages/poster/PosterPostPage";
import { PosterRelecturePage } from "@/pages/poster/PosterRelecturePage";
import { NotFoundPage } from "@/pages/NotFoundPage";

function Accueil() {
  const { role } = useAuth();
  if (role === "admin") return <Navigate to="/admin" replace />;
  // Avant estRoleManager : le Head of Ops est un manager, mais il atterrit dans sa
  // coquille admin, pas dans l'espace recrutement qu'il garde par ailleurs.
  if (role === "head_of_ops") return <Navigate to={ACCUEIL_HO} replace />;
  if (estRoleManager(role)) return <Navigate to="/manager/accueil" replace />;
  if (role === "poster") return <Navigate to="/calendrier" replace />;
  return <Navigate to="/login" replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Accueil />} />

        {/* Porte extérieure : l'admin ET le Head of Ops entrent dans la
            coquille. La porte intérieure referme ensuite tout ce qui reste
            réservé à l'admin. La liste des routes ouvertes au Head of Ops vit dans
            `ROUTES_HO`, que la barre de navigation lit aussi — un test
            vérifie que les deux ne peuvent pas diverger. */}
        <Route element={<RoleGate allow={["admin", "head_of_ops"]} />}>
          <Route element={<AdminLayout />}>
            {/* L'espace du Head of Ops. */}
            <Route path="/admin/calendrier" element={<AdminCalendrierPage />} />
            <Route path="/admin/posters" element={<AdminPostersPage />} />
            <Route path="/admin/surveillance" element={<AdminSurveillancePage />} />
            <Route path="/admin/reviews" element={<AdminReviewsPage />} />
            <Route path="/admin/retours-contestes" element={<AdminRetoursContestesPage />} />
            <Route path="/admin/file-reviews" element={<AdminFileReviewsPage />} />
            <Route path="/admin/parrainages" element={<AdminReferralsPage />} />
            <Route path="/admin/documents" element={<AdminDocumentsPage />} />
            <Route path="/admin/assistant" element={<AdminChatbotPage />} />
            <Route path="/admin/comment-masters" element={<AdminCommentMastersHubPage />} />
            <Route path="/admin/comment-masters/suivi" element={<Navigate to="/admin/comment-masters" replace />} />
            <Route path="/admin/paie" element={<AdminPaiePage />} />
            <Route path="/admin/slack" element={<SlackARelier />} />
            <Route path="/admin/nudges" element={<PageNudges />} />
            <Route path="/admin/inactifs" element={<PageInactifs />} />
            <Route path="/admin/check-kill-double" element={<AdminCheckKillDoublePage />} />
            <Route path="/admin/cohortes" element={<PageCohortes />} />
            {/* Sans ces deux-là, Schedule et Account watch sont des culs-de-sac. */}
            <Route path="/admin/createurs/:compteId" element={<AdminCreateurPage />} />
            <Route path="/admin/posts/:id" element={<AdminPostDetailPage />} />

            <Route element={<RoleGate allow={["admin"]} />}>
                <Route path="/admin" element={<AdminPilotagePage />} />
              <Route path="/admin/minuit" element={<AdminMinuitPage />} />
              <Route path="/admin/posts" element={<Navigate to="/admin/calendrier" replace />} />
              <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="/admin/suivi-rc" element={<AdminSuiviRcPage />} />
              <Route path="/admin/sources" element={<AdminSourcesPage />} />
              <Route path="/admin/contenus" element={<Navigate to="/admin/slideshows" replace />} />
              <Route path="/admin/slideshows" element={<AdminSlideshowsPage />} />
              <Route path="/admin/creation" element={<AdminCreationPage />} />
              <Route path="/admin/pods" element={<AdminPodsPage />} />
              <Route path="/admin/assignation-sources" element={<Navigate to="/admin/sources" replace />} />
              <Route path="/admin/reproduisibles" element={<Navigate to="/admin/slideshows" replace />} />
              <Route path="/admin/recrutements/:pays" element={<AdminRecrutementsPaysPage />} />
              <Route path="/admin/recrutements" element={<AdminRecrutementsPage />} />
              <Route path="/admin/bibliotheque" element={<AdminBibliothequePage />} />
              <Route path="/admin/tests" element={<AdminTestsPage />} />
              <Route path="/admin/banc-relecture" element={<AdminBancRelecturePage />} />
              <Route path="/admin/test-nettoyage" element={<Navigate to="/admin/tests" replace />} />
              <Route path="/admin/reglages" element={<AdminReglagesPage />} />
              <Route path="/admin/repartition" element={<AdminRepartitionPage />} />
              <Route path="/admin/prompts" element={<AdminPromptsPage />} />
              <Route path="/admin/angles" element={<AdminAnglesPage />} />
              <Route path="/admin/relecture-native" element={<AdminRelectureNativePage />} />
              <Route path="/admin/labels" element={<AdminLabelsPage />} />
              {/* Papier CM et UGC AI retirés — les anciens liens retombent sur le pilotage. */}
              <Route path="/admin/papier" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/ugc/*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
        </Route>

        <Route element={<RoleGate allow={["poster"]} />}>
          <Route element={<PosterLayout />}>
            <Route path="/calendrier" element={<PosterCalendrierPage />} />
            <Route path="/createur/parrainage" element={<PosterReferralPage />} />
            <Route path="/createur/paiements" element={<PosterPaiementsPage />} />
            <Route path="/createur/retours" element={<PosterRetoursPage />} />
            <Route path="/createur/relecture" element={<PosterRelecturePage />} />
            <Route path="/createur/contrat-papier" element={<Navigate to="/calendrier" replace />} />
            <Route path="/createur/guide" element={<DocumentView cle="guide_poster" />} />
            <Route path="/createur/faq" element={<DocumentView cle="faq_poster" />} />
          </Route>
        </Route>

        <Route element={<RoleGate allow={["hiring_manager", "directing_manager", "head_of_ops"]} />}>
          <Route element={<HiringLayout />}>
            <Route path="/manager/accueil" element={<HiringAccueilPage />} />
            {/* Paiements : Head of Ops seulement pour l'instant, les HM sont renvoyées à l'accueil. */}
            <Route element={<RoleGate allow={["head_of_ops"]} />}>
              <Route path="/manager/paiements" element={<HiringPaiementsPage />} />
            </Route>
            <Route path="/embauche" element={<HiringPosterPage />} />
            <Route path="/manager/calendrier" element={<HiringCalendrierPage />} />
            <Route path="/manager/slack" element={<SlackARelier />} />
            <Route path="/manager/recruteurs" element={<HiringRecruteursPage />} />
            <Route path="/manager/documents" element={<HiringDocumentsPage />} />
            <Route path="/manager/guide" element={<DocumentView cle="guide_manager" />} />
            <Route path="/manager/onboarding" element={<DocumentView cle="onboarding" />} />
            <Route path="/manager/faq" element={<DocumentView cle="faq_manager" />} />
          </Route>
        </Route>

        {/* L'admin doit pouvoir relire un post qu'il vient de tester. */}
        <Route element={<RoleGate allow={["poster", "admin"]} />}>
          <Route element={<PosterLayout />}>
            <Route path="/posts/:id" element={<PosterPostPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
