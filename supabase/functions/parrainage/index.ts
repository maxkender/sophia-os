/**
 * parrainage — les emails au filleul d'un posteur (0561).
 *
 *   POST { action: "envoyer" }  (cron toutes les 10 min, en-tête x-cron-secret)
 *       Les emails dus (J0, J+2, J+5), dans la langue du pays du filleul, avec
 *       le tarif de sa zone et le lien creators ?ref=code. Envoyés par le site
 *       vik-studios-creators.com (expéditeur « Sophia », noreply@sophia-culture.com) : POST
 *       HUB_EMAIL_URL, en-tête x-hub-secret (OS_HUB_SECRET). Rien ne part tant
 *       que le réglage parrainage_email_actif est off ou que HUB_EMAIL_URL
 *       n'est pas configuré.
 *   POST { action: "evenement", message_id, type: ouvert|clique|rebond }
 *       (en-tête x-hub-secret) : les retours du service d'envoi.
 *   POST { action: "demander_emails", envoyer?: boolean }  (x-cron-secret)
 *       0584 : aux parrains dont des amis sont déclarés sans email, un message
 *       (Slack, sinon Upwork) qui demande l'email. Sans « envoyer » : l'aperçu.
 *       L'email trouvé dans la réponse est enregistré (parrainage_email_recu_tg).
 *   GET ?desinscrire=<token>
 *       Le lien de l'email : plus jamais rien à cette adresse.
 */
import { LANGUE_PAR_PAYS } from "../_shared/hub_posteurs.ts";
import { secretValide } from "../_shared/hub_posteurs.ts";
import { type EtapeEmail, lienCreators, prochaineEtape, rendreEmail } from "../_shared/parrainage_email.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { estSecretCron, json, messageErreur, secretCron, serviceClient } from "../_shared/supabase.ts";
import { urlEmailSite } from "../_shared/site.ts";

const URL_FONCTION = "https://mbikecieskoobeizixig.supabase.co/functions/v1/parrainage";

const PAGE = (titre: string, texte: string) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f4f5;margin:0;padding:48px 16px">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${titre}</h1><p style="color:#52525b;line-height:1.5;margin:0">${texte}</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const supabase = serviceClient();

  // Le lien de désinscription (public, un jeton par invitation).
  const jeton = url.searchParams.get("desinscrire");
  if (request.method === "GET" && jeton) {
    if (!/^[0-9a-f-]{36}$/i.test(jeton)) return PAGE("Link not valid", "This unsubscribe link is not valid.");
    const { error } = await supabase.rpc("parrainage_desinscrire", { p_token: jeton });
    if (error) return PAGE("Something went wrong", "Please try again later.");
    return PAGE("You're unsubscribed", "You won't receive any more emails from Sophia about this invitation.");
  }
  if (request.method !== "POST") return json({ ok: false, error: "méthode non autorisée" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }

  try {
    if (body?.action === "evenement") {
      const attendu = Deno.env.get("OS_HUB_SECRET") ?? "";
      if (!attendu || !(await secretValide(request.headers.get("x-hub-secret"), attendu))) return json({ ok: false, error: "unauthorized" }, 401);
      const type = String(body.type ?? "");
      if (!["ouvert", "clique", "rebond"].includes(type) || !body.message_id) return json({ ok: false, error: "message_id et type requis" }, 400);
      const { error } = await supabase.rpc("parrainage_evenement", { p_message_id: String(body.message_id), p_type: type });
      return json(error ? { ok: false, error: error.message } : { ok: true });
    }

    if (!(await estSecretCron(request.headers.get("x-cron-secret")))) return json({ ok: false, error: "unauthorized" }, 401);
    if (body?.action === "test") return json(await envoyerTest(supabase, String(body.to ?? ""), String(body.langue ?? "en")));
    if (body?.action === "demander_emails") return json(await demanderEmails(supabase, body?.envoyer === true));
    if (body?.action !== "envoyer") return json({ ok: false, error: "action inconnue" }, 400);
    return json(await envoyer(supabase));
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type Supabase = any;

async function envoyer(supabase: Supabase) {
  const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", "parrainage_email_actif").maybeSingle();
  if (reglage?.valeur !== true) return { ok: true, ignore: "parrainage_email_actif off" };
  const urlEnvoi = urlEmailSite();
  const secret = Deno.env.get("OS_HUB_SECRET") ?? "";
  if (!urlEnvoi || !secret) return { ok: true, ignore: "HUB_EMAIL_URL non configuré" };

  const { data: dus, error } = await supabase.rpc("parrainage_a_envoyer", { p_limite: 50 });
  if (error) return { ok: false, error: error.message };
  const bilan: Record<string, unknown>[] = [];
  for (const d of (dus ?? []) as Record<string, unknown>[]) {
    const etape = prochaineEtape(Number(d.envois ?? 0));
    if (etape === null) continue;
    const pays = String(d.pays ?? "");
    const langue = LANGUE_PAR_PAYS[pays] ?? "en";
    const email = rendreEmail({
      etape: etape as EtapeEmail,
      langue,
      prenom: String(d.prenom ?? ""),
      referrer: String(d.referrer ?? "A friend"),
      tarif: Number(d.tarif ?? 10),
      lien: lienCreators(langue, String(d.code ?? "")),
      lienDesinscription: `${URL_FONCTION}?desinscrire=${d.token}`,
    });
    let ok = false;
    let messageId: string | null = null;
    let erreur: string | null = null;
    let rebond = false;
    try {
      const r = await fetch(urlEnvoi, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-secret": secret },
        body: JSON.stringify({
          action: "envoyer_email", to: d.email, from_name: "Sophia", subject: email.objet, html: email.html, text: email.texte,
          // Le site attend une liste de chaînes (tags Brevo).
          tags: ["parrainage", `etape-${etape}`, ...(pays ? [`pays-${pays}`] : [])], unsubscribe_url: `${URL_FONCTION}?desinscrire=${d.token}`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      ok = r.ok && j?.ok !== false;
      messageId = j?.message_id ? String(j.message_id) : null;
      erreur = ok ? null : String(j?.error ?? `HTTP ${r.status}`);
      rebond = !ok && /bounce|invalid|does not exist|rejected/i.test(erreur ?? "");
    } catch (e) {
      erreur = messageErreur(e);
    }
    await supabase.rpc("parrainage_envoi_noter", { p_id: d.id, p_etape: etape, p_ok: ok, p_message_id: messageId, p_erreur: erreur, p_rebond: rebond });
    bilan.push({ id: d.id, etape, ok, erreur });
  }
  return { ok: true, envoyes: bilan.filter((b) => b.ok).length, echecs: bilan.filter((b) => !b.ok).length, bilan };
}

/**
 * Envoi test (cron secret) : l'email J0 rendu avec des prénoms fictifs, à une
 * adresse admin seulement (profil admin ou Head of Ops). Ne touche ni aux
 * invitations ni à parrainage_email_actif.
 */
async function envoyerTest(supabase: Supabase, to: string, langue: string) {
  const urlEnvoi = urlEmailSite();
  const secret = Deno.env.get("OS_HUB_SECRET") ?? "";
  if (!urlEnvoi || !secret) return { ok: false, error: "HUB_EMAIL_URL ou OS_HUB_SECRET non configuré" };
  const adresse = to.trim().toLowerCase();
  const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "head_of_ops"]);
  const ids = ((admins ?? []) as { user_id: string }[]).map((a) => a.user_id);
  const { data: profils } = await supabase.from("profiles").select("email, email_perso").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const permises = new Set(((profils ?? []) as { email: string | null; email_perso: string | null }[])
    .flatMap((p) => [p.email, p.email_perso]).filter(Boolean).map((e) => String(e).toLowerCase()));
  if (!permises.has(adresse)) return { ok: false, error: "envoi test : adresse d'un admin seulement" };
  const email = rendreEmail({
    etape: 0, langue, prenom: "Max", referrer: "Sarah", tarif: 14,
    lien: lienCreators(langue, "TEST"), lienDesinscription: `${URL_FONCTION}?desinscrire=00000000-0000-0000-0000-000000000000`,
  });
  const r = await fetch(urlEnvoi, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-secret": secret },
    body: JSON.stringify({
      action: "envoyer_email", to: adresse, from_name: "Sophia", subject: `[TEST] ${email.objet}`, html: email.html, text: email.texte,
      tags: ["parrainage", "test"], unsubscribe_url: `${URL_FONCTION}?desinscrire=00000000-0000-0000-0000-000000000000`,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, http: r.status, message_id: j?.message_id ?? null, error: j?.error ?? null, langue: email.langue };
}

interface DemandeParrain {
  parrain_id: string;
  parrain: string;
  canal: "slack" | "upwork";
  filleuls: string[];
  texte: string;
}

/** 0584 : un message par parrain, Slack d'abord, sinon Upwork (dans son contrat). */
async function demanderEmails(supabase: Supabase, envoyer: boolean) {
  const { data, error } = await supabase.rpc("parrainage_demandes_preparer", { p_noter: envoyer });
  if (error) return { ok: false, error: error.message };
  const demandes = (data ?? []) as DemandeParrain[];
  if (!envoyer) return { ok: true, apercu: demandes };
  const bilan: Record<string, unknown>[] = [];
  for (const d of demandes) {
    let ok = false;
    let erreur: string | null = null;
    let canal: string = d.canal;
    if (d.canal === "slack") {
      const issue = await ecrireAuPosteur(supabase, d.parrain_id, d.texte);
      ok = issue.statut === "envoye";
      if (!ok) erreur = "erreur" in issue ? issue.erreur : issue.statut;
    }
    if (!ok) {
      // Pas de Slack (ou échec) : dans le contrat Upwork.
      canal = "upwork";
      const secret = await secretCron();
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/upwork`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) },
        body: JSON.stringify({ action: "message_posteur", poster_id: d.parrain_id, texte: d.texte, type: "parrainage_email" }),
      }).catch((e) => e as Error);
      if (r instanceof Error) erreur = r.message;
      else {
        const j = await r.json().catch(() => ({}));
        ok = r.ok && j?.ok !== false;
        erreur = ok ? null : String(j?.error ?? `HTTP ${r.status}`);
      }
    }
    await supabase.rpc("parrainage_demandes_noter", { p_parrain: d.parrain_id, p_canal: canal, p_ok: ok, p_erreur: erreur });
    bilan.push({ parrain: d.parrain, canal, ok, erreur, filleuls: d.filleuls.length });
  }
  return { ok: true, envoyes: bilan.filter((b) => b.ok).length, bilan };
}
