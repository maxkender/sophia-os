import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/AuthContext";
import type { ApplicationMulti } from "./apiMultiApp";
import { SLUG_SOPHIA } from "./applications";
import { ID_SOPHIA } from "./multiApp";
import { optionsRequeteApplications } from "./multiapp/requetesApplications";

const STORAGE_KEY = "os-application-slug";

function lireSlugSauve(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SLUG_SOPHIA;
  } catch {
    return SLUG_SOPHIA;
  }
}

function sauverSlug(slug: string) {
  try {
    localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    /* private mode */
  }
}

/**
 * Application choisie dans le sélecteur de l'admin. Depuis le multi-app par
 * labels, elle ne cloisonne plus les labels, sources, contenus ni comptes :
 * elle choisit seulement les prompts, les stats et la réserve affichés.
 */
interface ApplicationContextValue {
  applications: ApplicationMulti[];
  application: ApplicationMulti | null;
  applicationId: string | null;
  slug: string;
  setSlug: (slug: string) => void;
  isPending: boolean;
}

const ApplicationContext = React.createContext<ApplicationContextValue | null>(null);

const AUCUNE: ApplicationMulti[] = [];

export function ApplicationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // react-query plutôt qu'un chargement unique au montage : activer Unswipe ou
  // changer ses langues dans Pilotage invalide cette requête, et le sélecteur
  // suit sans recharger la page.
  const requete = useQuery(optionsRequeteApplications(userId));
  const applications = requete.data ?? AUCUNE;
  const [slug, setSlugState] = React.useState(lireSlugSauve);

  const setSlug = React.useCallback((suivant: string) => {
    setSlugState(suivant);
    sauverSlug(suivant);
  }, []);

  // Slug inconnu (application supprimée — micabo —, ou stockage d'un autre
  // poste) : retour sur Sophia, l'application toujours présente.
  const application =
    applications.find((a) => a.slug === slug) ??
    applications.find((a) => a.id === ID_SOPHIA) ??
    applications[0] ??
    null;

  React.useEffect(() => {
    if (application && application.slug !== slug) setSlug(application.slug);
  }, [application, slug, setSlug]);

  const isPending = Boolean(userId) && requete.isPending;

  const value = React.useMemo<ApplicationContextValue>(
    () => ({
      applications,
      application,
      applicationId: application?.id ?? null,
      slug: application?.slug ?? slug,
      setSlug,
      isPending,
    }),
    [applications, application, slug, setSlug, isPending],
  );

  return <ApplicationContext.Provider value={value}>{children}</ApplicationContext.Provider>;
}

export function useApplication(): ApplicationContextValue {
  const ctx = React.useContext(ApplicationContext);
  if (!ctx) {
    return {
      applications: [],
      application: null,
      applicationId: null,
      slug: SLUG_SOPHIA,
      setSlug: () => undefined,
      isPending: false,
    };
  }
  return ctx;
}
