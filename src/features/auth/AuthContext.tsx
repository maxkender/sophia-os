import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

export type Role = "admin" | "poster" | "hiring_manager";

export interface Profil {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  langues: string[];
  nationalite: string | null;
  is_active: boolean;
  must_change_password: boolean;
  /** Recruteur UGC AI VIDEO (créateurs marque vidéo, sans labels). */
  hm_ugc_ai_video: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role | null;
  profil: Profil | null;
  loading: boolean;
  refresh: () => void;
}

const AuthContext = React.createContext<AuthState | undefined>(undefined);

/** Le rôle vit dans sa propre table : une colonne sur un profil éditable par
 *  son propriétaire serait une escalade de privilèges en attente. */
async function chargerRole(userId: string): Promise<Role | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as Role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("hiring_manager")) return "hiring_manager";
  if (roles.includes("poster")) return "poster";
  return null;
}

async function chargerProfil(userId: string): Promise<Profil | null> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, prenom, nom, email, langues, nationalite, is_active, must_change_password, hm_ugc_ai_video",
    )
    .eq("id", userId)
    .single();
  if (!data) return null;
  return {
    ...(data as Omit<Profil, "hm_ugc_ai_video">),
    hm_ugc_ai_video: Boolean(
      (data as { hm_ugc_ai_video?: boolean }).hm_ugc_ai_video,
    ),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<Omit<AuthState, "refresh">>({
    session: null,
    user: null,
    role: null,
    profil: null,
    loading: true,
  });
  const [jeton, setJeton] = React.useState(0);

  const refresh = React.useCallback(() => setJeton((n) => n + 1), []);

  React.useEffect(() => {
    let monte = true;

    async function charger(session: Session | null) {
      if (!session?.user) {
        if (monte) {
          setState({ session: null, user: null, role: null, profil: null, loading: false });
        }
        return;
      }

      const [role, profil] = await Promise.all([
        chargerRole(session.user.id),
        chargerProfil(session.user.id),
      ]);

      if (monte) setState({ session, user: session.user, role, profil, loading: false });
    }

    supabase.auth
      .getSession()
      .then(({ data }) => charger(data.session))
      .catch(() => {
        if (monte) {
          setState({ session: null, user: null, role: null, profil: null, loading: false });
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => charger(session));

    return () => {
      monte = false;
      sub.subscription.unsubscribe();
    };
  }, [jeton]);

  const value = React.useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
