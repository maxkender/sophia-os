import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

import { entrerVueHm, sortirVueHm } from "./session";

/** Rôles qu'on peut ouvrir en vue HM (jumeau : _shared/vue_hm.ts). Lucia est Head of Ops. */
export const ROLES_VUE_HM = ["hiring_manager", "head_of_ops"] as const;

export interface HmVue {
  id: string;
  nom: string;
}

/** HMs actives, par nom (lecture admin). */
export async function listerHmsVue(): Promise<HmVue[]> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", [...ROLES_VUE_HM, "admin"]);
  if (error) throw error;
  const admins = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id as string));
  const ids = [
    ...new Set(
      (roles ?? []).filter((r) => r.role !== "admin" && !admins.has(r.user_id)).map((r) => r.user_id as string),
    ),
  ];
  if (ids.length === 0) return [];

  const { data: profils, error: errProfils } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email, is_active")
    .in("id", ids);
  if (errProfils) throw errProfils;
  return (profils ?? [])
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id as string, nom: [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string) }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Ouvre la vue dans cet onglet (rechargement : le client se recrée sur la session de la HM). */
export async function ouvrirVueHm(hmId: string): Promise<void> {
  const r = await invoke<{ session: unknown; expire_at: string; prenom: string }>("vue-hm", {
    action: "ouvrir",
    hm_id: hmId,
  });
  entrerVueHm({ prenom: r.prenom, expireAt: r.expire_at }, r.session);
  window.location.assign("/");
}

/** « Quitter » : ferme la vue en base, révoque la session, retour à l'admin. */
export async function quitterVueHm(): Promise<void> {
  // Même si la fermeture échoue (vue déjà expirée), on rend l'onglet à l'admin :
  // la base refuse de toute façon une vue expirée.
  await supabase.functions.invoke("vue-hm", { body: { action: "fermer" } }).catch(() => undefined);
  sortirVueHm();
  window.location.assign("/admin/tests");
}
