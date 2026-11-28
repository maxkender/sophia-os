/**
 * 17/11 (Max) : API Ruul, phase 2 — le lien d'onboarding d'un posteur (POST /ruul-api/connect).
 * Valable 72 h chez Ruul : on le garde (ruul_liens) et on le régénère au-delà de 48 h, pour qu'un
 * email ou un clic sur le dashboard n'envoie jamais un lien périmé.
 * Interrupteur `ruul_api.connect_actif` : éteint, aucun appel (les emails gardent l'ancien guide).
 */
import { appelRuul, type EnvRuul } from "./ruul_api.ts";
import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export const FRAIS_MS = 48 * 3_600_000;

export interface ReponseConnect {
  onboardUrl: string;
  talentId: number;
  status: string;
  kycStatus: string | null;
  hasBankAccount: boolean;
}

export interface ReglageConnect {
  env: EnvRuul;
  connect_actif: boolean;
}

export async function lireReglageConnect(supabase: Supabase): Promise<ReglageConnect> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_api").maybeSingle();
  const v = (data?.valeur ?? {}) as { env?: string; connect_actif?: boolean };
  return { env: v.env === "sandbox" ? "sandbox" : "prod", connect_actif: v.connect_actif === true };
}

/** Un lien gardé est-il encore bon (moins de 48 h, même environnement) ? */
export function lienFrais(l: { url: string; cree_at: string; env: string } | null | undefined, env: EnvRuul, maintenant = Date.now()): boolean {
  return !!l?.url && l.env === env && maintenant - Date.parse(l.cree_at) < FRAIS_MS;
}

/** Ruul refuse l'email : il appartient déjà à un compte business (409 `email_not_a_contractor`, 27/11). Pure. */
export function estEmailRefuse(r: { http: number; code: string | null }): boolean {
  return r.http === 409 && r.code === "email_not_a_contractor";
}

/** Appelle POST /connect pour ce posteur et garde le lien. Ne lève jamais. */
export async function connecter(
  supabase: Supabase,
  env: EnvRuul,
  p: { poster_id: string; email: string; prenom: string; nom: string },
): Promise<{ url: string | null; statut: string | null; erreur: string | null; emailRefuse?: boolean }> {
  const r = await appelRuul<ReponseConnect>(env, "POST", "/connect", { corps: { email: p.email, firstName: p.prenom, lastName: p.nom } });
  // 27/11 (Ruul) : l'email a déjà un compte BUSINESS chez Ruul, il ne peut pas être un contractor. Le noter
  // (plus aucun essai sur cet email ; un nouvel email Ruul relance l'invitation), et le dire à l'appelant.
  if (estEmailRefuse(r)) {
    if (env === "prod") {
      const { error } = await supabase.rpc("ruul_email_refuse", { p_poster: p.poster_id, p_email: p.email });
      if (error) return { url: null, statut: null, erreur: `email refusé par Ruul, non noté : ${error.message}`, emailRefuse: true };
    }
    return { url: null, statut: null, erreur: "email déjà lié à un compte business Ruul (email_not_a_contractor)", emailRefuse: true };
  }
  if (!r.ok || !r.data?.onboardUrl) return { url: null, statut: null, erreur: r.erreur ?? "lien absent de la réponse" };
  const d = r.data;
  const { error } = await supabase.rpc("ruul_lien_noter", {
    p_poster: p.poster_id, p_env: env, p_talent_id: d.talentId ?? null, p_url: d.onboardUrl,
    p_statut: d.status ?? null, p_kyc: d.kycStatus ?? null, p_banque: d.hasBankAccount === true,
  });
  if (error) return { url: d.onboardUrl, statut: d.status, erreur: `lien non gardé : ${error.message}` };
  return { url: d.onboardUrl, statut: d.status, erreur: null };
}

/**
 * Le lien d'onboarding à mettre dans un email ou derrière le bouton du dashboard : le lien gardé s'il a moins
 * de 48 h, sinon un neuf (si l'invitation automatique est allumée). null : pas de lien (ancien guide).
 */
export async function lienRuul(supabase: Supabase, posterId: string, reglage?: ReglageConnect): Promise<string | null> {
  const r = reglage ?? await lireReglageConnect(supabase);
  if (!r.connect_actif) return null;
  const { data: l } = await supabase.from("ruul_liens").select("url, cree_at, env").eq("poster_id", posterId).maybeSingle();
  if (lienFrais(l as { url: string; cree_at: string; env: string } | null, r.env)) return (l as { url: string }).url;
  const { data: p } = await supabase.from("profiles").select("id, ruul_email, prenom, nom, ruul_onboarding").eq("id", posterId).maybeSingle();
  const email = (p?.ruul_email as string | null)?.trim().toLowerCase();
  if (!p || !email || p.ruul_onboarding === "READY") return null;
  const c = await connecter(supabase, r.env, {
    poster_id: posterId, email, prenom: (p.prenom as string | null)?.trim() || email.split("@")[0]!, nom: (p.nom as string | null)?.trim() || "-",
  });
  return c.url;
}
