/**
 * slack-retrait — la page « À retirer de Slack » (0563).
 *
 *   { action: "etat" }                         admin, Head of Ops
 *       Ce que l'OS peut faire : retirer des canaux (jeton avec
 *       channels:manage + groups:write), désactiver (jeton SCIM d'un admin,
 *       plan Business+ ou Enterprise).
 *   { action: "verifier", poster_id? }         cron (toutes les heures) ou admin
 *       Ajoute les personnes désactivées manquantes, puis users.info pour
 *       chacune : un compte désactivé dans Slack sort de la liste.
 *   { action: "retirer", poster_id? }          admin
 *       conversations.kick sur tous ses canaux (sauf #general). Sans
 *       poster_id : les 10 suivants jamais tentés ; la page rappelle tant
 *       qu'il en reste.
 *   { action: "desactiver", poster_id }        admin
 *       SCIM DELETE /Users/:id si SLACK_SCIM_TOKEN est configuré ; sinon
 *       { manuel: true } et le lien du profil.
 *
 * Secrets : SLACK_BOT_TOKEN / SLACK_BOT_TOKEN2 / SLACK_HM_BOT_TOKEN (le premier
 * qui a les droits), SLACK_SCIM_TOKEN (facultatif), CRON_SECRET. Jamais affichés.
 */
import { appelSlack, retirerDesCanaux } from "../_shared/slack_retrait.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const NOMS_JETONS = ["SLACK_BOT_TOKEN", "SLACK_BOT_TOKEN2", "SLACK_HM_BOT_TOKEN"];
const DROITS_RETRAIT = ["channels:manage", "groups:write", "channels:read", "groups:read"];
const LOT = 10;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as { action?: string; poster_id?: string };
    const supabase = serviceClient();
    const posterId = body.poster_id ? String(body.poster_id) : null;
    switch (body.action) {
      case "etat":
        return json({ ok: true, ...(await etat()) });
      case "verifier":
        return json(await verifier(supabase, posterId));
      case "retirer":
        if (acces.userId === "cron") return json({ ok: false, error: "réservé à l'admin" }, 403);
        return json(await retirer(supabase, posterId));
      case "desactiver":
        if (acces.userId === "cron" || !posterId) return json({ ok: false, error: "poster_id requis (admin)" }, 400);
        return json(await desactiver(supabase, posterId));
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (e) {
    console.error("[slack-retrait]", messageErreur(e));
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

/** Les droits d'un jeton (en-tête x-oauth-scopes d'auth.test). */
async function droits(jeton: string): Promise<string[]> {
  const r = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${jeton}` } });
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) return [];
  return (r.headers.get("x-oauth-scopes") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

/** Le premier jeton qui peut retirer des canaux, et ce qui manque sinon. */
async function jetonRetrait(): Promise<{ jeton: string | null; nom: string | null; manquent: string[] }> {
  let manquent = DROITS_RETRAIT;
  for (const nom of NOMS_JETONS) {
    const jeton = Deno.env.get(nom);
    if (!jeton) continue;
    const s = await droits(jeton);
    const m = DROITS_RETRAIT.filter((d) => !s.includes(d));
    if (m.length === 0) return { jeton, nom, manquent: [] };
    if (m.length < manquent.length) manquent = m;
  }
  return { jeton: null, nom: null, manquent };
}

function jetonLecture(): string | null {
  for (const nom of ["SLACK_HM_BOT_TOKEN", "SLACK_BOT_TOKEN2", "SLACK_BOT_TOKEN"]) {
    const j = Deno.env.get(nom);
    if (j) return j;
  }
  return null;
}

/** SCIM : un jeton d'admin configuré et accepté (plan Business+ ou Enterprise). */
async function scim(): Promise<{ configure: boolean; possible: boolean; detail: string | null }> {
  const jeton = Deno.env.get("SLACK_SCIM_TOKEN");
  if (!jeton) return { configure: false, possible: false, detail: null };
  const r = await fetch("https://api.slack.com/scim/v2/Users?count=1", { headers: { authorization: `Bearer ${jeton}` } }).catch(() => null);
  if (!r) return { configure: true, possible: false, detail: "SCIM injoignable" };
  const texte = await r.text().catch(() => "");
  return { configure: true, possible: r.ok, detail: r.ok ? null : `HTTP ${r.status} ${texte.slice(0, 120)}` };
}

async function etat() {
  const k = await jetonRetrait();
  return { retrait: { possible: Boolean(k.jeton), manquent: k.manquent }, desactivation: await scim() };
}

async function lignes(supabase: Supabase, posterId: string | null) {
  let q = supabase.from("slack_retraits").select("poster_id, slack_user_id, profiles!inner(is_active)").is("desactive_at", null).eq("profiles.is_active", false);
  if (posterId) q = q.eq("poster_id", posterId);
  const { data, error } = await q;
  if (error) throw new Error(`slack_retraits : ${error.message}`);
  return (data ?? []) as { poster_id: string; slack_user_id: string }[];
}

/** users.info : deleted = désactivé dans Slack (la ligne sort de la liste). */
async function verifier(supabase: Supabase, posterId: string | null) {
  if (!posterId) {
    const { error } = await supabase.rpc("slack_retraits_remplir");
    if (error) throw new Error(`slack_retraits_remplir : ${error.message}`);
  }
  const jeton = jetonLecture();
  if (!jeton) return { ok: false, error: "aucun jeton Slack configuré" };
  const appel = appelSlack(jeton);
  let actifs = 0;
  let desactives = 0;
  const erreurs: string[] = [];
  for (const l of await lignes(supabase, posterId)) {
    const r = await appel("users.info", { user: l.slack_user_id });
    const u = r.user as { deleted?: boolean } | undefined;
    const parti = r.ok ? Boolean(u?.deleted) : r.error === "user_not_found";
    if (!r.ok && !parti) {
      erreurs.push(`${l.slack_user_id} : ${r.error}`);
      await supabase.from("slack_retraits").update({ erreur: `users.info : ${r.error}`, maj_at: new Date().toISOString() }).eq("poster_id", l.poster_id);
      continue;
    }
    const maintenant = new Date().toISOString();
    await supabase.from("slack_retraits").update({
      actif_slack: !parti, verifie_at: maintenant, maj_at: maintenant,
      ...(parti ? { desactive_at: maintenant, desactive_par: "slack" } : {}),
    }).eq("poster_id", l.poster_id);
    await supabase.from("slack_membres").update({ supprime: parti }).eq("slack_user_id", l.slack_user_id);
    if (parti) desactives++;
    else actifs++;
  }
  return { ok: true, encore_actifs: actifs, desactives, erreurs };
}

/** Retire des canaux : une personne, ou les 10 suivantes de la liste. */
async function retirer(supabase: Supabase, posterId: string | null) {
  const k = await jetonRetrait();
  if (!k.jeton) return { ok: false, error: `Droits Slack manquants : ${k.manquent.join(", ")}`, manquent: k.manquent };
  const appel = appelSlack(k.jeton);
  let cibles = await lignes(supabase, posterId);
  if (!posterId) {
    const { data } = await supabase.from("slack_retraits").select("poster_id").is("canaux_bilan", null);
    const restants = new Set(((data ?? []) as { poster_id: string }[]).map((x) => x.poster_id));
    cibles = cibles.filter((c) => restants.has(c.poster_id));
  }
  const total = cibles.length;
  const bilan: { poster_id: string; retires: number; echecs: string[] }[] = [];
  for (const c of cibles.slice(0, posterId ? 1 : LOT)) {
    const b = await retirerDesCanaux(appel, c.slack_user_id, true);
    const maintenant = new Date().toISOString();
    const reussi = !b.erreur && b.echecs.length === 0;
    await supabase.from("slack_retraits").update({
      canaux_bilan: { retires: b.retires, echecs: b.echecs, le: maintenant },
      erreur: b.erreur ?? (b.echecs.length ? b.echecs.join(" ; ") : null),
      maj_at: maintenant,
      ...(reussi ? { canaux_retires_at: maintenant } : {}),
    }).eq("poster_id", c.poster_id);
    bilan.push({ poster_id: c.poster_id, retires: b.retires.length, echecs: b.erreur ? [b.erreur] : b.echecs });
  }
  return { ok: true, faits: bilan.length, restants: Math.max(0, total - bilan.length), bilan };
}

/** SCIM DELETE /Users/:id (désactive le compte) ; sinon à la main. */
async function desactiver(supabase: Supabase, posterId: string) {
  const [l] = await lignes(supabase, posterId);
  if (!l) return { ok: false, error: "personne introuvable dans la liste" };
  const lien = `https://sophia-system.slack.com/team/${l.slack_user_id}`;
  const s = await scim();
  if (!s.possible) return { ok: false, manuel: true, lien, detail: s.detail };
  const r = await fetch(`https://api.slack.com/scim/v2/Users/${encodeURIComponent(l.slack_user_id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${Deno.env.get("SLACK_SCIM_TOKEN")}` },
  });
  if (!r.ok) {
    const erreur = `SCIM HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`;
    await supabase.from("slack_retraits").update({ erreur, maj_at: new Date().toISOString() }).eq("poster_id", posterId);
    return { ok: false, manuel: true, lien, error: erreur };
  }
  const maintenant = new Date().toISOString();
  await supabase.from("slack_retraits").update({ desactive_at: maintenant, desactive_par: "scim", actif_slack: false, maj_at: maintenant }).eq("poster_id", posterId);
  await supabase.from("slack_membres").update({ supprime: true }).eq("slack_user_id", l.slack_user_id);
  return { ok: true };
}
