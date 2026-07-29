import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/PublicOnlyRoute";
import { RoleGate } from "@/features/auth/RoleGate";
import { useAuth } from "@/features/auth/AuthContext";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PosterLayout } from "@/components/layout/PosterLayout";
import { HiringLayout } from "@/components/layout/HiringLayout";
import { HiringCalendrierPage } from "@/pages/hiring/HiringCalendrierPage";
import { HiringPosterPage } from "@/pages/hiring/HiringPosterPage";
import { AdminDocumentsPage } from "@/pages/admin/AdminDocumentsPage";
import { DocumentView } from "@/features/documents/DocumentView";
import { AdminPilotagePage } from "@/pages/admin/AdminPilotagePage";
import { AdminSourcesPage } from "@/pages/admin/AdminSourcesPage";
import { AdminPostersPage } from "@/pages/admin/AdminPostersPage";
import { AdminBibliothequePage } from "@/pages/admin/AdminBibliothequePage";
import { AdminReglagesPage } from "@/pages/admin/AdminReglagesPage";
import { AdminPromptsPage } from "@/pages/admin/AdminPromptsPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminReviewsPage } from "@/pages/admin/AdminReviewsPage";
import { AdminCalendrierPage } from "@/pages/admin/AdminCalendrierPage";
import { AdminMinuitPage } from "@/pages/admin/AdminMinuitPage";
import { AdminContenusPage } from "@/pages/admin/AdminContenusPage";
import { AdminSlideshowsPage } from "@/pages/admin/AdminSlideshowsPage";
import { AdminPostDetailPage } from "@/pages/admin/AdminPostDetailPage";
import { AdminTestNettoyagePage } from "@/pages/admin/AdminTestNettoyagePage";
import { AdminTestsPage } from "@/pages/admin/AdminTestsPage";
import { PosterCalendrierPage } from "@/pages/poster/PosterCalendrierPage";
import { PosterPostPage } from "@/pages/poster/PosterPostPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

function Accueil() {
  const { role } = useAuth();
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "hiring_manager") return <Navigate to="/embauche" replace />;
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

        <Route element={<RoleGate allow={["admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminPilotagePage />} />
            <Route path="/admin/calendrier" element={<AdminCalendrierPage />} />
            <Route path="/admin/minuit" element={<AdminMinuitPage />} />
            <Route path="/admin/posts/:id" element={<AdminPostDetailPage />} />
            <Route path="/admin/posts" element={<Navigate to="/admin/calendrier" replace />} />
            <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
            <Route path="/admin/sources" element={<AdminSourcesPage />} />
            <Route path="/admin/contenus" element={<AdminContenusPage />} />
            <Route path="/admin/slideshows" element={<AdminSlideshowsPage />} />
            <Route path="/admin/assignation-sources" element={<Navigate to="/admin/sources" replace />} />
            <Route path="/admin/reproduisibles" element={<Navigate to="/admin/slideshows" replace />} />
            <Route path="/admin/posters" element={<AdminPostersPage />} />
            <Route path="/admin/reviews" element={<AdminReviewsPage />} />
            <Route path="/admin/bibliotheque" element={<AdminBibliothequePage />} />
            <Route path="/admin/tests" element={<AdminTestsPage />} />
            <Route path="/admin/test-nettoyage" element={<AdminTestNettoyagePage />} />
            <Route path="/admin/reglages" element={<AdminReglagesPage />} />
            <Route path="/admin/prompts" element={<AdminPromptsPage />} />
            <Route path="/admin/documents" element={<AdminDocumentsPage />} />
          </Route>
        </Route>

        <Route element={<RoleGate allow={["poster"]} />}>
          <Route element={<PosterLayout />}>
            <Route path="/calendrier" element={<PosterCalendrierPage />} />
            <Route path="/createur/guide" element={<DocumentView cle="guide_poster" />} />
            <Route path="/createur/faq" element={<DocumentView cle="faq_poster" />} />
          </Route>
        </Route>

        <Route element={<RoleGate allow={["hiring_manager"]} />}>
          <Route element={<HiringLayout />}>
            <Route path="/embauche" element={<HiringPosterPage />} />
            <Route path="/manager/calendrier" element={<HiringCalendrierPage />} />
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
