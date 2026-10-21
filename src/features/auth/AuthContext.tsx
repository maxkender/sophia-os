import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import { roleAffiche, type Role } from "./roles";

export type { Role };
export { badgeManager, estRoleManager } from "./roles";

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
  /** Rôle sous lequel l'appli s'affiche (voir `roleAffiche`). */
  role: Role | null;
  /** Rôle réel en base : admin même en aperçu Head of Ops. */
  roleReel: Role | null;
  profil: Profil | null;
  loading: boolean;
  refresh: () => void;
  /** Admin seulement : l'appli s'affiche comme pour un Head of Ops. */
  apercuHo: boolean;
  basculerApercuHo: (actif: boolean) => void;
}

/** Clé de l'aperçu Head of Ops : par onglet, il ne survit pas à sa fermeture. */
const CLE_APERCU_HO = "apercu-head-of-ops";

function lireApercuHo(): boolean {
  try {
    return sessionStorage.getItem(CLE_APERCU_HO) === "1";
  } catch {
    return false;
  }
}

function ecrireApercuHo(actif: boolean) {
  try {
    if (actif) sessionStorage.setItem(CLE_APERCU_HO, "1");
    else sessionStorage.removeItem(CLE_APERCU_HO);
  } catch {
    // Stockage indisponible : l'aperçu tient jusqu'au rechargement.
  }
}

const AuthContext = React.createContext<AuthState | undefined>(undefined);

/** Le rôle vit dans sa propre table : une colonne sur un profil éditable par
 *  son propriétaire serait une escalade de privilèges en attente. */
async function chargerRole(userId: string): Promise<Role | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as Role);
  if (roles.includes("admin")) return "admin";
  // Avant le DM et le HM : le Head of Ops cumule les deux espaces, c'est le rôle le
  // plus large, il doit gagner si plusieurs lignes existent.
  if (roles.includes("head_of_ops")) return "head_of_ops";
  if (roles.includes("directing_manager")) return "directing_manager";
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
  const [state, setState] = React.useState<
    Omit<AuthState, "refresh" | "roleReel" | "apercuHo" | "basculerApercuHo">
  >({
    session: null,
    user: null,
    role: null,
    profil: null,
    loading: true,
  });
  const [jeton, setJeton] = React.useState(0);

  const refresh = React.useCallback(() => setJeton((n) => n + 1), []);

  // Changement de compte dans le même onglet (déconnexion puis autre
  // connexion) : rien du compte précédent ne doit rester en cache. Sans ça, une
  // lecture gardée indéfiniment (`accueil-cohorte`, staleTime: Infinity)
  // montrait la frise et la page Payments de la cohorte Ruul à un poster hors
  // cohorte. `undefined` = aucun compte encore chargé.
  const queryClient = useQueryClient();
  const compteCharge = React.useRef<string | null | undefined>(undefined);
  const oublierCompteChange = React.useCallback(
    (id: string | null) => {
      if (compteCharge.current !== undefined && compteCharge.current !== id) queryClient.clear();
      compteCharge.current = id;
    },
    [queryClient],
  );

  React.useEffect(() => {
    let monte = true;

    async function charger(session: Session | null) {
      if (!session?.user) {
        if (monte) {
          oublierCompteChange(null);
          setState({ session: null, user: null, role: null, profil: null, loading: false });
        }
        return;
      }

      const [role, profil] = await Promise.all([
        chargerRole(session.user.id),
        chargerProfil(session.user.id),
      ]);

      if (monte) {
        oublierCompteChange(session.user.id);
        setState({ session, user: session.user, role, profil, loading: false });
      }
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
  }, [jeton, oublierCompteChange]);

  const [apercuHo, setApercuHo] = React.useState(lireApercuHo);
  const basculerApercuHo = React.useCallback((actif: boolean) => {
    ecrireApercuHo(actif);
    setApercuHo(actif);
  }, []);

  const value = React.useMemo(
    () => ({
      ...state,
      role: roleAffiche(state.role, apercuHo),
      roleReel: state.role,
      apercuHo: state.role === "admin" && apercuHo,
      basculerApercuHo,
      refresh,
    }),
    [state, apercuHo, basculerApercuHo, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
