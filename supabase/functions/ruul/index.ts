/**
 * ruul — les posteurs payés par Ruul (0574, 0576).
 *
 *   POST { action: "envoyer" }  (cron toutes les 15 min, en-tête x-cron-secret ; ou admin)
 *       1. L'invitation Ruul (après le clic « Ajouté sur Ruul ») et ses
 *          relances J+1, J+3 ; J+5 sans « It's done » → carte Problems.
 *          Sur Slack : message Slack ; sinon email. La relance J+3 part aussi
 *          par email, en secours.
 *       2. Après « Payé sur Ruul » : « You received X $ for the week of … ».
 *       Rien ne part en pause (grand interrupteur), ni après un STOP.
 *   GET ?pret=<jeton>   le bouton « It's done » : le posteur est prêt à être payé.
 *   GET ?stop=<jeton>   « Unsubscribe » : plus aucune relance ; « A demandé STOP » remonte au samedi.
 *
 * Emails envoyés par le site sophia-culture.com (POST HUB_EMAIL_URL, en-tête
 * x-hub-secret OS_HUB_SECRET), comme le parrainage. Mode « manuel » : l'ajout
 * sur Ruul est fait par Max ; en mode « api » (plus tard), l'ajout,
 * l'invitation et l'identité seront lus chez Ruul.
 */
import { bloquer, PAUSE } from "../_shared/pause.ts";
import { prochaineEtapeRuul, remplirRuul, rendreEmailRuul, semaineCourte } from "../_shared/ruul.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const URL_FONCTION = "https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul";

type Supabase = ReturnType<typeof serviceClient>;

const PAGE = (titre: string, texte: string) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f4f5;margin:0;padding:48px 16px">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${titre}</h1><p style="color:#52525b;line-height:1.5;margin:0">${texte}</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

const JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const supabase = serviceClient();

  if (request.method === "GET") {
    const pret = url.searchParams.get("pret");
    const stop = url.searchParams.get("stop");
    if (pret) {
      if (!JETON.test(pret)) return PAGE("Link not valid", "This link is not valid.");
      const { data, error } = await supabase.rpc("ruul_pret_jeton", { p_jeton: pret });
      if (error) return PAGE("Something went wrong", "Please try again later.");
      if (data === null) return PAGE("Link not valid", "This link is not valid.");
      return PAGE("Thank you!", "Your Ruul account is ready. You'll be paid there every week.");
    }
    if (stop) {
      if (!JETON.test(stop)) return PAGE("Link not valid", "This link is not valid.");
      const { data, error } = await supabase.rpc("ruul_stop_jeton", { p_jeton: stop, p_source: "email" });
      if (error) return PAGE("Something went wrong", "Please try again later.");
      if (data !== true) return PAGE("Link not valid", "This link is not valid.");
      return PAGE("You're unsubscribed", "You won't receive any more reminders from Sophia.");
    }
    return json({ ok: false, error: "paramètre manquant" }, 400);
  }

  const refus = await assertAuthorised(request);
  if (refus) return refus;
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }
  try {
    if (body?.action === "envoyer") return json(await envoyer(supabase));
    return json({ ok: false, error: "action inconnue" }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

interface Profil {
  id: string;
  prenom: string | null;
  ruul_email: string | null;
  ruul_statut: string | null;
  ruul_ajoute_at: string | null;
  ruul_relances: number | null;
  relances_stop_at: string | null;
  ruul_jeton: string | null;
  slack_user_id: string | null;
}

async function textes(supabase: Supabase): Promise<Record<string, string>> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_textes").maybeSingle();
  return (data?.valeur ?? {}) as Record<string, string>;
}

/** Un email par le site (domaine sophia-culture.com). */
async function envoyerEmail(to: string, objet: string, html: string, texte: string, stop: string, tags: string[]): Promise<{ ok: boolean; erreur: string | null }> {
  const urlEnvoi = Deno.env.get("HUB_EMAIL_URL");
  const secret = Deno.env.get("OS_HUB_SECRET");
  if (!urlEnvoi || !secret) return { ok: false, erreur: "HUB_EMAIL_URL ou OS_HUB_SECRET manquant" };
  try {
    const r = await fetch(urlEnvoi, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-secret": secret },
      body: JSON.stringify({ action: "envoyer_email", to, from_name: "Sophia", subject: objet, html, text: texte, tags, unsubscribe_url: stop }),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && j?.ok !== false;
    return { ok, erreur: ok ? null : String(j?.error ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, erreur: messageErreur(e) };
  }
}

async function envoyer(supabase: Supabase) {
  if (await bloquer(supabase, { fonction: "ruul", action: "envoyer" })) return { ok: false, error: PAUSE };
  const t = await textes(supabase);
  const bilan: Record<string, unknown>[] = [];

  // 1. L'invitation Ruul et ses relances.
  const { data: invites, error } = await supabase
    .from("profiles")
    .select("id, prenom, ruul_email, ruul_statut, ruul_ajoute_at, ruul_relances, relances_stop_at, ruul_jeton, slack_user_id")
    .eq("canal_paie", "ruul").eq("ruul_statut", "invite").eq("is_active", true).is("relances_stop_at", null);
  if (error) throw error;
  for (const p of (invites ?? []) as Profil[]) {
    const etape = prochaineEtapeRuul({ statut: p.ruul_statut, ajoute_at: p.ruul_ajoute_at, relances: p.ruul_relances ?? 0, stop_at: p.relances_stop_at });
    if (!etape || !p.ruul_jeton) continue;
    const prochain = { relances: (p.ruul_relances ?? 0) + 1, ruul_relance_at: new Date().toISOString() };
    if (etape === "problems") {
      await supabase.rpc("probleme_ajouter", {
        p_type: "ruul_invite", p_ref: `${p.id}:${p.ruul_ajoute_at}`, p_poster: p.id, p_contrat: null, p_categorie: "paie",
        p_resume: "Ruul : compte pas prêt après 5 jours",
        p_texte: `Invité sur Ruul (${p.ruul_email ?? "email ?"}) il y a 5 jours, toujours pas « It's done ». Sans compte Ruul prêt, sa paie est reportée.`,
        p_at: new Date().toISOString(), p_lien: null, p_canal: "os", p_par: null,
      });
      await supabase.from("profiles").update({ ruul_relances: prochain.relances, ruul_relance_at: prochain.ruul_relance_at }).eq("id", p.id);
      bilan.push({ poster: p.id, etape, ok: true });
      continue;
    }
    const v = { prenom: (p.prenom ?? "").trim() || "there", email: p.ruul_email ?? "" };
    const objet = remplirRuul(etape === "invite" ? (t.invite_objet ?? "Your Ruul invitation") : (t.relance_objet ?? "Reminder: your Ruul account"), v);
    const corps = remplirRuul(etape === "invite" ? (t.invite_texte ?? "") : (t.relance_texte ?? ""), v);
    const lienPret = `${URL_FONCTION}?pret=${p.ruul_jeton}`;
    const lienStop = `${URL_FONCTION}?stop=${p.ruul_jeton}`;
    const bouton = { texte: t.invite_bouton ?? "It's done", lien: lienPret };
    let ok = false;
    let erreur: string | null = null;
    const canaux: string[] = [];
    // Sur Slack : message Slack (avec le lien) ; sinon email. J+3 : email aussi, en secours.
    if (p.slack_user_id) {
      const s = await ecrireAuPosteur(supabase, p.id, `${corps}\n\n${bouton.texte}: ${lienPret}`);
      ok = s.statut === "envoye";
      if (ok) canaux.push("slack");
      else erreur = "erreur" in s ? String(s.erreur) : s.statut;
    }
    if ((!ok || etape === "relance3") && p.ruul_email) {
      const e = rendreEmailRuul({ objet, corps, bouton, lienStop });
      const r = await envoyerEmail(p.ruul_email, objet, e.html, e.texte, lienStop, ["ruul", etape]);
      if (r.ok) {
        ok = true;
        canaux.push("email");
      } else erreur = r.erreur;
    }
    if (ok) await supabase.from("profiles").update({ ruul_relances: prochain.relances, ruul_relance_at: prochain.ruul_relance_at }).eq("id", p.id);
    bilan.push({ poster: p.id, etape, ok, canaux, erreur: ok ? null : erreur });
  }

  // 2. « You received X $ » après « Payé sur Ruul » (une fois par posteur et par lot).
  const { data: payes, error: errPayes } = await supabase
    .from("ruul_paiements")
    .select("id, poster_id, semaine, montant, lot_id, profiles!inner(prenom, ruul_email, relances_stop_at, ruul_jeton, slack_user_id)")
    .eq("message_statut", "a_envoyer");
  if (errPayes) throw errPayes;
  // deno-lint-ignore no-explicit-any
  const parPosteur = new Map<string, any[]>();
  for (const l of payes ?? []) parPosteur.set(`${l.poster_id}:${l.lot_id}`, [...(parPosteur.get(`${l.poster_id}:${l.lot_id}`) ?? []), l]);
  for (const lignes of parPosteur.values()) {
    const p = lignes[0].profiles as { prenom: string | null; ruul_email: string | null; relances_stop_at: string | null; ruul_jeton: string | null; slack_user_id: string | null };
    const ids = lignes.map((l) => l.id);
    if (p.relances_stop_at) {
      await supabase.from("ruul_paiements").update({ message_statut: "stop", message_at: new Date().toISOString() }).in("id", ids);
      continue;
    }
    const montant = lignes.reduce((s, l) => s + Number(l.montant), 0);
    const semaines = lignes.map((l) => semaineCourte(String(l.semaine))).join(" and ");
    const v = { prenom: (p.prenom ?? "").trim() || "there", montant: Number.isInteger(montant) ? montant : montant.toFixed(2), semaine: semaines };
    const texte = remplirRuul(t.paye_texte ?? "Hi {prenom}, you received ${montant} for the week of {semaine}. You can withdraw it on Ruul.", v);
    let ok = false;
    let erreur: string | null = null;
    if (p.slack_user_id) {
      const s = await ecrireAuPosteur(supabase, lignes[0].poster_id, texte);
      ok = s.statut === "envoye";
      if (!ok) erreur = "erreur" in s ? String(s.erreur) : s.statut;
    }
    if (!ok && p.ruul_email && p.ruul_jeton) {
      const objet = remplirRuul(t.paye_objet ?? "You received ${montant} on Ruul", v);
      const lienStop = `${URL_FONCTION}?stop=${p.ruul_jeton}`;
      const e = rendreEmailRuul({ objet, corps: texte, bouton: null, lienStop });
      const r = await envoyerEmail(p.ruul_email, objet, e.html, e.texte, lienStop, ["ruul", "paye"]);
      ok = r.ok;
      erreur = r.erreur;
    }
    await supabase.from("ruul_paiements").update({ message_statut: ok ? "envoye" : "erreur", message_at: new Date().toISOString() }).in("id", ids);
    bilan.push({ poster: lignes[0].poster_id, etape: "paye", ok, erreur: ok ? null : erreur });
  }
  return { ok: true, envoyes: bilan.filter((b) => b.ok).length, echecs: bilan.filter((b) => !b.ok).length, bilan };
}
