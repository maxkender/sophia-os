/**
 * ruul-api — l'API publique de Ruul (17/11, Max). Réglage `ruul_api` : env (prod | sandbox), company_id,
 * devise_facture (EUR), connect_actif.
 *
 *   POST { action: "sync" }   cron toutes les heures (minute 12) ; admin.
 *       GET /companies (une fois, note company_id) puis GET /workmates (UN appel) → ruul_api_appliquer :
 *       statut, KYC, banque, statut d'onboarding de chaque posteur Ruul. Lecture seule chez Ruul.
 *
 *   POST { action: "connect", poster_id?, forcer? }   cron toutes les heures (minute 14) ; admin.
 *       Phase 2 : POST /connect (5 par seconde au plus) pour les posteurs Ruul actifs pas READY sans lien frais
 *       (< 48 h) ; le lien d'onboarding est gardé (ruul_liens). Éteint (ruul_api.connect_actif) : rien, sauf
 *       { poster_id, forcer: true } par l'admin (un essai sur une personne).
 *   POST { action: "mon_lien" }   le posteur connecté (bouton « Open my Ruul setup » du dashboard) : son lien frais.
 *   POST { action: "devis", semaine }   admin : POST /payouts/calculate sur les lignes prêtes du lot (READY, validées).
 *       Ne crée rien chez Ruul ; le total à virer (frais compris, en EUR) est gardé sur le lot.
 *   POST { action: "payer", semaine }   MAX SEUL (réglage ruul_api.payeurs) : POST /payouts avec Idempotency-Key.
 *       Ruul crée les factures et renvoie le virement à faire (montant, comptes, référence) : Max vire depuis Qonto.
 *       Un envoi sans réponse claire est renvoyé à l'identique (même clé) : jamais deux paiements.
 *   POST { action: "relire", semaine }   admin / cron : GET /payouts/{batchId} → statuts des lignes et virement.
 *   POST { action: "transactions" }   admin : GET /transactions (toutes les pages, 50 par page) → ruul_transactions,
 *       l'historique de ce que Ruul a déjà payé (lecture seule chez Ruul).
 *   POST { action: "relire_tous" }   cron horaire (filet des webhooks) : relit les paiements Ruul pas encore soldés.
 *
 * La clé (RUUL_API_KEY / RUUL_SANDBOX_API_KEY) reste dans les secrets ; elle n'apparaît jamais dans une réponse.
 */
import { connecter, lienRuul } from "../_shared/ruul_connect.ts";
import { appelRuul, BASES, descriptionLigne, descriptionLot, type EnvRuul } from "../_shared/ruul_api.ts";
import { assertAuthorised, assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * 21/11 (Max) : la liste des pays de Ruul (GET /api/countries, publique, sans clé) : un pays où un talent ne peut pas
 * s'inscrire (talentRegisterEnabled) ou ajouter sa banque (addBankAccountEnabled) n'est pas accepté → passage sur Upwork.
 */
async function paysRuul(supabase: Supabase) {
  const r = await fetch(`${BASES.prod}/api/countries`, { headers: { accept: "application/json" } }).catch(() => null);
  if (!r?.ok) return { ok: false, error: `pays Ruul illisibles (HTTP ${r?.status ?? "réseau"})` };
  const liste = (await r.json().catch(() => [])) as { code?: string; name?: string; talentRegisterEnabled?: boolean; addBankAccountEnabled?: boolean }[];
  const lignes = liste.filter((c) => typeof c.code === "string" && c.code.length <= 4).map((c) => ({
    code: String(c.code).toUpperCase(), nom: c.name ?? null,
    inscription: c.talentRegisterEnabled === true, banque: c.addBankAccountEnabled === true, maj_at: new Date().toISOString(),
  }));
  if (lignes.length < 100) return { ok: false, error: `liste de pays incomplète (${lignes.length})` };
  const { error } = await supabase.from("ruul_pays").upsert(lignes, { onConflict: "code" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, pays: lignes.length, refuses: lignes.filter((l) => !l.inscription || !l.banque).map((l) => l.code) };
}

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
  // La réponse est { data: [...] } (RuulApiListCompaniesResponseDto).
  const r = await appelRuul<{ data: Array<{ id: number; name: string; status: string }> }>(reglage.env, "GET", "/companies");
  const liste = Array.isArray(r.data?.data) ? r.data!.data : [];
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

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(supabase: Supabase, corps: Record<string, unknown>) {
  const reglage = await lireReglage(supabase);
  const un = typeof corps.poster_id === "string" ? corps.poster_id : null;
  if (!reglage.connect_actif && !(un && corps.forcer === true)) return { ok: true, env: reglage.env, ignore: "invitation automatique éteinte (ruul_api.connect_actif)" };
  let liste: { poster_id: string; email: string; prenom: string; nom: string }[];
  if (un) {
    const { data: p } = await supabase.from("profiles").select("id, ruul_email, prenom, nom, canal_paie").eq("id", un).maybeSingle();
    if (!p || p.canal_paie !== "ruul" || !p.ruul_email) return { ok: false, error: "pas un posteur Ruul avec un email Ruul" };
    const email = String(p.ruul_email).trim().toLowerCase();
    liste = [{ poster_id: un, email, prenom: (p.prenom as string | null)?.trim() || email.split("@")[0]!, nom: (p.nom as string | null)?.trim() || "-" }];
  } else {
    const { data, error } = await supabase.rpc("ruul_connect_a_faire", { p_limite: 40 });
    if (error) throw new Error(error.message);
    liste = (data ?? []) as typeof liste;
  }
  const bilan = { ok: 0, erreurs: [] as string[], par_statut: {} as Record<string, number> };
  for (const p of liste) {
    const r = await connecter(supabase, reglage.env, p);
    if (r.url) {
      bilan.ok++;
      bilan.par_statut[r.statut ?? "?"] = (bilan.par_statut[r.statut ?? "?"] ?? 0) + 1;
    }
    if (r.erreur) bilan.erreurs.push(`${p.email} : ${r.erreur}`);
    // Ruul limite aussi à la minute : au premier refus, on s'arrête (le passage suivant reprend).
    if (r.erreur && /throttl|too many|rate.?limit|429/i.test(r.erreur)) break;
    await pause(220); // Ruul : 5 connect par seconde au plus.
  }
  // Le journal : des compteurs, jamais les liens.
  await noterAppel(supabase, reglage.env, "connect", { http: 200, code: null, erreur: bilan.erreurs[0] ?? null, duree_ms: 0 },
    { a_faire: liste.length, ok: bilan.ok, erreurs: bilan.erreurs.length, par_statut: bilan.par_statut });
  return { ok: bilan.erreurs.length === 0, env: reglage.env, a_faire: liste.length, liens: bilan.ok, par_statut: bilan.par_statut, erreurs: bilan.erreurs.slice(0, 10) };
}

export interface LigneEnvoi {
  poster_id: string;
  email: string;
  prenom: string;
  nom: string;
  montant: number;
  posts: number;
  bonus: number;
  semaines: string[];
}

/** Le corps de POST /payouts (et /payouts/calculate) : montants nets en USD, facture en EUR (réglage). */
export function corpsPayout(devise: string, companyId: number, semaine: string, lignes: LigneEnvoi[]) {
  return {
    companyId,
    currencyCode: devise,
    description: descriptionLot(semaine),
    serviceFeePayer: "business",
    items: lignes.map((l) => ({
      email: l.email,
      amount: Math.round(Number(l.montant) * 100) / 100,
      payoutCurrency: "USD",
      firstName: l.prenom,
      lastName: l.nom,
      description: descriptionLigne(semaine, Number(l.posts), Number(l.bonus)),
    })),
  };
}

export async function lignesAEnvoyer(supabase: Supabase, semaine: string): Promise<LigneEnvoi[]> {
  const { data, error } = await supabase.rpc("ruul_lot_a_envoyer", { p_semaine: semaine });
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneEnvoi[];
}

async function devis(supabase: Supabase, corps: Record<string, unknown>) {
  const semaine = typeof corps.semaine === "string" ? corps.semaine : null;
  if (!semaine || !/^\d{4}-\d{2}-\d{2}$/.test(semaine)) return { ok: false, error: "semaine manquante" };
  const reglage = await lireReglage(supabase);
  const soc = await societe(supabase, reglage);
  if (!soc.id) return { ok: false, error: soc.erreur };
  const lignes = await lignesAEnvoyer(supabase, semaine);
  if (lignes.length === 0) return { ok: false, error: "aucune ligne prête (READY et validée)" };
  if (lignes.length > 200) return { ok: false, error: `${lignes.length} lignes : 200 au plus par paiement Ruul` };
  const r = await appelRuul<{ currency: string; payment: Record<string, number | string | null>; rows: unknown[] }>(
    reglage.env, "POST", "/payouts/calculate", { corps: corpsPayout(reglage.devise_facture, soc.id, semaine, lignes) });
  await noterAppel(supabase, reglage.env, "calculate", r, { semaine, lignes: lignes.length });
  if (!r.ok || !r.data) return { ok: false, env: reglage.env, error: r.erreur ?? "réponse vide" };
  const d = {
    env: reglage.env,
    currency: r.data.currency,
    payment: r.data.payment,
    lignes: lignes.length,
    net_usd: Math.round(lignes.reduce((t, l) => t + Number(l.montant), 0) * 100) / 100,
  };
  await supabase.rpc("ruul_lot_noter_devis", { p_semaine: semaine, p_devis: d });
  return { ok: true, devis: d };
}

/** Créer le paiement Ruul du lot (Max seul). Rien ne part sans ce clic ; l'argent part quand Max vire. */
async function payer(supabase: Supabase, userId: string, corps: Record<string, unknown>) {
  const semaine = typeof corps.semaine === "string" ? corps.semaine : null;
  if (!semaine || !/^\d{4}-\d{2}-\d{2}$/.test(semaine)) return { ok: false, error: "semaine manquante" };
  const { data: rg } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_api").maybeSingle();
  const payeurs = ((rg?.valeur as { payeurs?: string[] } | null)?.payeurs ?? []);
  if (!payeurs.includes(userId)) return { ok: false, error: "réservé à Max" };
  const reglage = await lireReglage(supabase);
  const soc = await societe(supabase, reglage);
  if (!soc.id) return { ok: false, error: soc.erreur };
  const lignes = await lignesAEnvoyer(supabase, semaine);
  if (lignes.length === 0) return { ok: false, error: "aucune ligne prête (READY et validée)" };
  if (lignes.length > 200) return { ok: false, error: `${lignes.length} lignes : 200 au plus par paiement Ruul` };
  const { data: env, error: e1 } = await supabase.rpc("ruul_lot_envoi_preparer", {
    p_semaine: semaine, p_user: userId, p_env: reglage.env, p_corps: corpsPayout(reglage.devise_facture, soc.id, semaine, lignes),
  });
  if (e1) throw new Error(e1.message);
  const e = env as { ok: boolean; erreur?: string; deja?: number; cle?: string; corps?: unknown; env?: EnvRuul; renvoi?: boolean };
  if (!e.ok) return { ok: false, error: e.erreur };
  if (e.deja) return { ok: true, deja: true, batch: e.deja };
  // Le renvoi après une coupure garde l'environnement du premier envoi (la clé n'existe que là-bas).
  const envEnvoi: EnvRuul = e.env === "sandbox" ? "sandbox" : "prod";
  const r = await appelRuul<Record<string, unknown>>(envEnvoi, "POST", "/payouts", { corps: e.corps, idempotence: e.cle });
  await noterAppel(supabase, envEnvoi, "payouts", r, { semaine, lignes: lignes.length, renvoi: e.renvoi === true, batch: r.data?.batchId ?? null });
  if (r.ok && r.data?.batchId) {
    const { data: n, error: e2 } = await supabase.rpc("ruul_lot_batch_noter", { p_semaine: semaine, p_batch: r.data, p_user: userId });
    if (e2) throw new Error(e2.message);
    return { ok: true, env: envEnvoi, batch: r.data.batchId, funding: r.data.funding ?? null, noter: n };
  }
  // Refus net (validation, clé, droits, devise, débit) : le prochain clic repartira d'une clé neuve.
  // Pas de réponse (réseau, 5xx) ou requête encore en cours : on garde la même clé pour le prochain clic.
  const net = r.http >= 400 && r.http < 500 && r.code !== "request_in_flight";
  if (net) await supabase.rpc("ruul_lot_envoi_refuse", { p_semaine: semaine, p_http: r.http, p_erreur: `${r.code ?? ""} ${r.erreur ?? ""}`.trim() });
  return {
    ok: false,
    env: envEnvoi,
    error: net
      ? `Ruul a refusé (HTTP ${r.http}${r.code ? `, ${r.code}` : ""}) : ${r.erreur}`
      : `pas de réponse claire de Ruul (${r.erreur ?? `HTTP ${r.http}`}) : reclique plus tard, le même envoi repartira sans doublon`,
  };
}

/** L'historique Ruul : toutes les transactions de la société, page par page (lecture seule). */
async function transactions(supabase: Supabase) {
  const reglage = await lireReglage(supabase);
  const soc = await societe(supabase, reglage);
  if (!soc.id) return { ok: false, error: soc.erreur };
  let page = 1;
  let lues = 0;
  let lignes = 0;
  let total = 0;
  for (; page <= 20; page++) {
    const r = await appelRuul<{ data: unknown[]; total: number }>(reglage.env, "GET", "/transactions", { query: { page, limit: 50, companyId: soc.id } });
    if (!r.ok || !r.data) {
      await noterAppel(supabase, reglage.env, "transactions", r, { page });
      return { ok: false, error: r.erreur, lues, lignes };
    }
    const data = Array.isArray(r.data.data) ? r.data.data : [];
    total = Number(r.data.total ?? 0);
    const { data: n, error } = await supabase.rpc("ruul_transactions_importer", { p_data: data });
    if (error) throw new Error(error.message);
    lues += data.length;
    lignes += Number(n ?? 0);
    if (data.length < 50 || lues >= total) break;
    await pause(1500); // lectures : 50 par minute au plus.
  }
  await noterAppel(supabase, reglage.env, "transactions", { http: 200, code: null, erreur: null, duree_ms: 0 }, { lues, lignes, total, pages: page });
  return { ok: true, env: reglage.env, lues, lignes, total };
}

/** Relire le paiement Ruul d'un lot : statuts des lignes, virement encore dû. */
async function relire(supabase: Supabase, corps: Record<string, unknown>) {
  const semaine = typeof corps.semaine === "string" ? corps.semaine : null;
  if (!semaine) return { ok: false, error: "semaine manquante" };
  const { data: lot } = await supabase.from("ruul_lots").select("ruul_batch_id, ruul_env").eq("semaine", semaine).maybeSingle();
  if (!lot?.ruul_batch_id) return { ok: false, error: "pas de paiement Ruul sur ce lot" };
  const env: EnvRuul = lot.ruul_env === "sandbox" ? "sandbox" : "prod";
  const r = await appelRuul<Record<string, unknown>>(env, "GET", `/payouts/${lot.ruul_batch_id}`);
  await noterAppel(supabase, env, "payout_lire", r, { semaine, batch: lot.ruul_batch_id });
  if (!r.ok || !r.data) return { ok: false, error: r.erreur };
  const { data: n, error } = await supabase.rpc("ruul_lot_batch_noter", { p_semaine: semaine, p_batch: r.data });
  if (error) throw new Error(error.message);
  return { ok: true, statut: r.data.status ?? null, noter: n };
}

Deno.serve(async (request) => {
  let corps: Record<string, unknown> = {};
  const brut = request.method === "POST" ? await request.text() : "";
  try {
    corps = brut ? JSON.parse(brut) : {};
  } catch {
    /* corps vide */
  }
  // Le posteur connecté : son propre lien (rien d'autre).
  if (corps.action === "mon_lien") {
    const acces = await assertRole(request, ["poster", "admin"]);
    if (acces instanceof Response) return acces;
    try {
      const supabase = serviceClient();
      const { data: p } = await supabase.from("profiles").select("canal_paie, ruul_onboarding").eq("id", acces.userId).maybeSingle();
      if (!p || p.canal_paie !== "ruul") return json({ ok: false, error: "not a Ruul account" }, 400);
      if (p.ruul_onboarding === "READY") return json({ ok: true, ready: true, url: null });
      return json({ ok: true, ready: false, url: await lienRuul(supabase, acces.userId) });
    } catch (e) {
      console.error("[ruul-api] mon_lien", messageErreur(e));
      return json({ ok: false, error: "Something went wrong, please try again." }, 500);
    }
  }
  // Créer le paiement Ruul : un admin connecté, et seulement ceux du réglage ruul_api.payeurs (Max).
  if (corps.action === "payer") {
    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    try {
      return json(await payer(serviceClient(), acces.userId, corps));
    } catch (e) {
      console.error("[ruul-api] payer", messageErreur(e));
      return json({ ok: false, error: messageErreur(e) }, 500);
    }
  }
  const refus = await assertAuthorised(request);
  if (refus) return refus;
  try {
    const supabase = serviceClient();
    switch (corps.action) {
      case "sync":
        return json(await sync(supabase));
      case "pays":
        // 21/11 (Max) : les pays où Ruul accepte un posteur (inscription et banque), relus chaque jour.
        return json(await paysRuul(supabase));
      case "connect":
        return json(await connect(supabase, corps));
      case "devis":
        return json(await devis(supabase, corps));
      case "relire":
        return json(await relire(supabase, corps));
      case "transactions":
        return json(await transactions(supabase));
      case "relire_tous": {
        const { data: lots } = await supabase.from("ruul_lots").select("semaine").not("ruul_batch_id", "is", null).eq("statut", "saisi").limit(10);
        const res = [];
        for (const l of lots ?? []) res.push({ semaine: l.semaine, ...(await relire(supabase, { semaine: l.semaine })) });
        return json({ ok: true, lots: res });
      }
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (e) {
    console.error("[ruul-api]", messageErreur(e));
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});
