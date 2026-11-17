/**
 * ruul-api — l'API publique de Ruul (17/11, Max). Réglage `ruul_api` : env (prod | sandbox), company_id,
 * devise_facture (EUR), connect_actif.
 *
 *   POST { action: "sync" }   cron toutes les heures (minute 12) ; admin.
 *       GET /companies (une fois, note company_id) puis GET /workmates (UN appel) → ruul_api_appliquer :
 *       statut, KYC, banque, statut d'onboarding de chaque posteur Ruul. Lecture seule chez Ruul.
 *
 * La clé (RUUL_API_KEY / RUUL_SANDBOX_API_KEY) reste dans les secrets ; elle n'apparaît jamais dans une réponse.
 */
import { appelRuul, type EnvRuul } from "../_shared/ruul_api.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export interface ReglageRuulApi {
  env: EnvRuul;
  company_id: number | null;
  devise_facture: string;
  connect_actif: boolean;
}

export async function lireReglage(supabase: Supabase): Promise<ReglageRuulApi> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_api").maybeSingle();
  const v = (data?.valeur ?? {}) as Partial<ReglageRuulApi>;
  return {
    env: v.env === "sandbox" ? "sandbox" : "prod",
    company_id: typeof v.company_id === "number" ? v.company_id : null,
    devise_facture: typeof v.devise_facture === "string" && v.devise_facture ? v.devise_facture : "EUR",
    connect_actif: v.connect_actif === true,
  };
}

export async function noterAppel(
  supabase: Supabase,
  env: EnvRuul,
  action: string,
  r: { http: number; code: string | null; erreur: string | null; duree_ms: number },
  detail: Record<string, unknown> | null = null,
) {
  await supabase.from("ruul_api_appels").insert({ env, action, http: r.http, code: r.code, erreur: r.erreur, duree_ms: r.duree_ms, detail });
}

/** La société qui paie : celle du réglage, sinon la première de GET /companies (alors notée dans le réglage). */
async function societe(supabase: Supabase, reglage: ReglageRuulApi): Promise<{ id: number | null; erreur: string | null }> {
  if (reglage.company_id) return { id: reglage.company_id, erreur: null };
  const r = await appelRuul<Array<{ id: number; name: string; status: string }>>(reglage.env, "GET", "/companies");
  const liste = Array.isArray(r.data) ? r.data : [];
  await noterAppel(supabase, reglage.env, "companies", r, { societes: liste.map((c) => ({ id: c.id, name: c.name, status: c.status })) });
  if (!r.ok) return { id: null, erreur: r.erreur };
  if (liste.length !== 1) return { id: null, erreur: `${liste.length} sociétés chez Ruul : choisir company_id dans le réglage ruul_api` };
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_api").maybeSingle();
  await supabase.from("reglages").update({ valeur: { ...(data?.valeur as object ?? {}), company_id: liste[0]!.id } }).eq("cle", "ruul_api");
  return { id: liste[0]!.id, erreur: null };
}

async function sync(supabase: Supabase) {
  const reglage = await lireReglage(supabase);
  const soc = await societe(supabase, reglage);
  if (!soc.id) return { ok: false, env: reglage.env, error: soc.erreur };
  const r = await appelRuul<{ data: unknown[] }>(reglage.env, "GET", "/workmates", { query: { companyId: soc.id } });
  const liste = Array.isArray(r.data?.data) ? r.data!.data : [];
  if (!r.ok) {
    await noterAppel(supabase, reglage.env, "workmates", r);
    return { ok: false, env: reglage.env, error: r.erreur };
  }
  const { data: bilan, error } = await supabase.rpc("ruul_api_appliquer", { p_env: reglage.env, p_company_id: soc.id, p_workmates: liste });
  await noterAppel(supabase, reglage.env, "workmates", r, { lus: liste.length, bilan: bilan ?? null, erreur_base: error?.message ?? null });
  if (error) throw new Error(error.message);
  return { ok: true, env: reglage.env, company_id: soc.id, lus: liste.length, bilan };
}

Deno.serve(async (request) => {
  const refus = await assertAuthorised(request);
  if (refus) return refus;
  let corps: Record<string, unknown> = {};
  try {
    corps = await request.json();
  } catch {
    /* corps vide */
  }
  try {
    const supabase = serviceClient();
    switch (corps.action) {
      case "sync":
        return json(await sync(supabase));
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (e) {
    console.error("[ruul-api]", messageErreur(e));
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});
