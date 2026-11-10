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
 *       3. 0590 : les emails Ruul saisis sur le dashboard sont envoyés au site
 *          (POST os-candidatures, action « ruul_email ») ; l'email Ruul manquant
 *          est relancé J+1, J+3, puis le vendredi avant la 1re paie, par email
 *          et message privé Slack (réglage ruul_email_relances).
 *   POST { action: "candidatures" }  (cron toutes les 15 min) — 0577
 *       Copie les candidatures du site (GET /api/public/os-candidatures),
 *       décide les nouvelles (acceptation automatique si majeur, pays ouvert,
 *       2 téléphones, réponses complètes ; sinon au HM du pays, referrals
 *       d'abord), envoie au site les décisions (réglage ruul_candidatures_auto)
 *       et les relances de signature J+1, J+3, J+6, J+7 expirée, cohorte ratée
 *       décalée au lundi suivant (réglage ruul_relances_signature).
 *   POST { action: "dimanche", forcer? }  (cron le dimanche, 18 h à Paris) — 0591
 *       Un email à Max : les posteurs Ruul à ajouter dans Ruul (nom, email
 *       Ruul, pays, zone, tarif). Un seul par dimanche, rien si la liste est
 *       vide (réglage ruul_liste_dimanche ; « forcer » : envoi de test).
 *   GET ?pret=<jeton>   le bouton « It's done » : le posteur est prêt à être payé.
 *   GET ?stop=<jeton>   « Unsubscribe » : plus aucune relance ; « A demandé STOP » remonte au samedi.
 *
 * Emails envoyés par le site vik-studios-creators.com (POST os-email, en-tête
 * x-hub-secret OS_HUB_SECRET), comme le parrainage. Mode « manuel » : l'ajout
 * sur Ruul est fait par Max ; en mode « api » (plus tard), l'ajout,
 * l'invitation et l'identité seront lus chez Ruul.
 */
import { bloquer, PAUSE } from "../_shared/pause.ts";
import { codePays, hmDuPays, type Recruteur } from "../_shared/hub_posteurs.ts";
import {
  type CandidatureRuul,
  emailListeDimanche,
  type LigneAAjouter,
  texteSansSlack,
  etapeSignature,
  lundiSuivant,
  manquesCandidature,
  prochaineEtapeRuul,
  remplirRuul,
  rendreEmailRuul,
  semaineCourte,
} from "../_shared/ruul.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { urlEmailSite } from "../_shared/site.ts";
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
    if (body?.action === "candidatures") return json(await candidatures(supabase));
    if (body?.action === "dimanche") return json(await listeDimanche(supabase, body?.forcer === true));
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

/** Un email par le site (vik-studios-creators.com ; expéditeur noreply@sophia-culture.com). */
async function envoyerEmail(to: string, objet: string, html: string, texte: string, stop: string, tags: string[]): Promise<{ ok: boolean; erreur: string | null }> {
  const urlEnvoi = urlEmailSite();
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

  // 1. L'invitation Ruul et ses relances (0591 : interrupteur ruul_invitation_email).
  const inviter = await interrupteur(supabase, "ruul_invitation_email");
  const { data: invites, error } = await supabase
    .from("profiles")
    .select("id, prenom, ruul_email, ruul_statut, ruul_ajoute_at, ruul_relances, relances_stop_at, ruul_jeton, slack_user_id")
    .eq("canal_paie", "ruul").eq("ruul_statut", "invite").eq("is_active", true).is("relances_stop_at", null);
  if (error) throw error;
  for (const p of (inviter ? invites ?? [] : []) as Profil[]) {
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
  // 3. 0579 : les messages de l'OS par email (bloqués faute de canal, ou Slack sans réaction en 48 h).
  if (await interrupteur(supabase, "ruul_relais_email")) {
    const { error: errPrep } = await supabase.rpc("ruul_relais_preparer");
    if (errPrep) throw errPrep;
    const { data: relais } = await supabase.from("ruul_relais")
      .select("id, poster_id, source, texte, profiles!inner(prenom, ruul_email, relances_stop_at, ruul_jeton)")
      .eq("statut", "a_envoyer").order("created_at").limit(50);
    for (const r of relais ?? []) {
      const p = r.profiles as unknown as { prenom: string | null; ruul_email: string | null; relances_stop_at: string | null; ruul_jeton: string | null };
      if (p.relances_stop_at || !p.ruul_email || !p.ruul_jeton) {
        await supabase.from("ruul_relais").update({ statut: "stop" }).eq("id", r.id);
        continue;
      }
      const corps = texteSansSlack(String(r.texte ?? ""));
      const objet = "A message from the Sophia team";
      const lienStop = `${URL_FONCTION}?stop=${p.ruul_jeton}`;
      const e = rendreEmailRuul({ objet, corps, bouton: null, lienStop });
      const envoi = await envoyerEmail(p.ruul_email, objet, e.html, e.texte, lienStop, ["ruul", `relais-${r.source}`]);
      await supabase.from("ruul_relais").update({
        statut: envoi.ok ? "envoye" : "erreur", erreur: envoi.erreur, envoye_at: envoi.ok ? new Date().toISOString() : null,
      }).eq("id", r.id);
      bilan.push({ poster: r.poster_id, etape: `relais_${r.source}`, ok: envoi.ok, erreur: envoi.erreur });
    }
  }
  // 4. 0590 : le site est prévenu des emails Ruul saisis sur le dashboard (5 essais au plus).
  const { data: syncs } = await supabase.from("ruul_site_sync")
    .select("id, poster_id, action, payload, tentatives").eq("statut", "a_envoyer").order("cree_at").limit(50);
  for (const s of syncs ?? []) {
    const r = await appelSite("POST", { action: s.action, ...(s.payload as Record<string, unknown>) });
    const tentatives = (s.tentatives ?? 0) + 1;
    await supabase.from("ruul_site_sync").update({
      statut: r.ok ? "envoye" : tentatives >= SYNC_ESSAIS ? "erreur" : "a_envoyer",
      tentatives, erreur: r.erreur, envoye_at: r.ok ? new Date().toISOString() : null,
    }).eq("id", s.id);
    bilan.push({ poster: s.poster_id, etape: `site_${s.action}`, ok: r.ok, erreur: r.erreur });
  }
  // 5. 0590 : l'email Ruul manquant, J+1, J+3, vendredi avant la 1re paie (interrupteur ruul_email_relances).
  if (await interrupteur(supabase, "ruul_email_relances")) {
    const { data: dues, error: errDues } = await supabase.rpc("ruul_email_relances_dues");
    if (errDues) throw errDues;
    for (const d of (dues ?? []) as RelanceEmailRuul[]) {
      const prenom = (d.prenom ?? "").trim() || "there";
      const canaux: string[] = [];
      let erreur: string | null = null;
      const { data: pr } = await supabase.from("profiles").select("ruul_jeton").eq("id", d.poster_id).maybeSingle();
      if (d.email && pr?.ruul_jeton) {
        const lienStop = `${URL_FONCTION}?stop=${pr.ruul_jeton}`;
        const objet = t.email_ruul_objet ?? EMAIL_RUUL_OBJET;
        const corps = remplirRuul(t.email_ruul_texte ?? EMAIL_RUUL_TEXTE, { prenom });
        const e = rendreEmailRuul({ objet, corps, bouton: { texte: "Open my dashboard", lien: URL_DASHBOARD }, lienStop });
        const r = await envoyerEmail(d.email, objet, e.html, e.texte, lienStop, ["ruul", `email_ruul_${d.etape}`]);
        if (r.ok) canaux.push("email");
        else erreur = r.erreur;
      }
      if (d.slack_user_id) {
        const s = await ecrireAuPosteur(supabase, d.poster_id, remplirRuul(t.email_ruul_slack ?? EMAIL_RUUL_SLACK, { prenom }));
        if (s.statut === "envoye") canaux.push("slack");
        else erreur = erreur ?? ("erreur" in s ? String(s.erreur) : s.statut);
      }
      // Une ligne par étape, même en échec : jamais deux fois la même relance.
      await supabase.from("ruul_email_relances").upsert({ poster_id: d.poster_id, etape: d.etape, canaux, erreur: canaux.length ? null : erreur ?? "aucun canal" });
      bilan.push({ poster: d.poster_id, etape: `email_ruul_${d.etape}`, ok: canaux.length > 0, erreur: canaux.length ? null : erreur });
    }
  }
  return { ok: true, envoyes: bilan.filter((b) => b.ok).length, echecs: bilan.filter((b) => !b.ok).length, bilan };
}

const SYNC_ESSAIS = 5;
const URL_DASHBOARD = "https://sophia-marketing-orga.vercel.app";
const EMAIL_RUUL_OBJET = "Add your Ruul email so we can pay you";
const EMAIL_RUUL_TEXTE = "Hi {prenom},\n\nWe still need your Ruul email to pay you every Monday. Log in to your Sophia dashboard and add it at the top of the page.\n\nNo Ruul account yet? Create a free one on ruul.io, then add the same email on your dashboard.";
const EMAIL_RUUL_SLACK = "Hi {prenom}! We still need your Ruul email to pay you every Monday. Please add it at the top of your Sophia dashboard: https://sophia-marketing-orga.vercel.app 🙏";

interface RelanceEmailRuul {
  poster_id: string;
  prenom: string | null;
  email: string | null;
  slack_user_id: string | null;
  etape: string;
}

// ---------------------------------------------------------------------------
// 0577 : les candidatures du site
// ---------------------------------------------------------------------------

function urlCandidatures(): string | null {
  const envoi = urlEmailSite();
  try {
    return new URL("/api/public/os-candidatures", envoi).toString();
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function appelSite(methode: "GET" | "POST", corps?: Record<string, unknown>): Promise<{ ok: boolean; data: any; erreur: string | null }> {
  const url = urlCandidatures();
  const secret = Deno.env.get("OS_HUB_SECRET");
  if (!url || !secret) return { ok: false, data: null, erreur: "HUB_EMAIL_URL ou OS_HUB_SECRET manquant" };
  try {
    const r = await fetch(url, {
      method: methode,
      headers: { "content-type": "application/json", "x-hub-secret": secret },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    const j = await r.json().catch(() => null);
    const ok = r.ok && j?.ok !== false;
    return { ok, data: j, erreur: ok ? null : String(j?.error ?? `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, data: null, erreur: messageErreur(e) };
  }
}

async function interrupteur(supabase: Supabase, cle: string): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", cle).maybeSingle();
  return data?.valeur === true;
}

async function recruteurs(supabase: Supabase): Promise<Recruteur[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["hiring_manager", "head_of_ops"]);
  const ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!ids.length) return [];
  const { data: profils } = await supabase.from("profiles").select("id, prenom, nom, email, zone_recrutement, langues")
    .in("id", ids).eq("is_active", true).not("zone_recrutement", "is", null);
  return Promise.all((profils ?? []).map(async (p) => {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("manager_id", p.id).eq("is_active", true);
    return { ...(p as Omit<Recruteur, "posters_actifs">), posters_actifs: count ?? 0 };
  }));
}

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

async function candidatures(supabase: Supabase) {
  if (await bloquer(supabase, { fonction: "ruul", action: "candidatures" })) return { ok: false, error: PAUSE };
  const bilan = { copiees: 0, auto: 0, a_traiter: 0, envoyees: 0, relances: 0, expirees: 0, decalees: 0, erreurs: [] as string[] };

  // 1. La copie.
  const lu = await appelSite("GET");
  if (!lu.ok) return { ok: false, error: `site : ${lu.erreur}` };
  const lignes = ((lu.data?.candidatures ?? []) as Record<string, unknown>[])
    .map((c) => ({ ...c, pays: codePays(c.country, c.country) }));
  const { data: n, error: errCopie } = await supabase.rpc("ruul_candidatures_enregistrer", { p_lignes: lignes });
  if (errCopie) throw errCopie;
  bilan.copiees = Number(n ?? 0);

  // 2. Les nouvelles : automatique ou au HM du pays (referrals d'abord).
  const [{ data: zones }, { data: fermes }] = await Promise.all([
    supabase.from("zones_paie_pays").select("pays").is("retire_at", null),
    supabase.from("parrainage_pays").select("pays").eq("recrutement_ouvert", false),
  ]);
  const fermesSet = new Set((fermes ?? []).map((f) => String(f.pays).toUpperCase()));
  const ouverts = new Set((zones ?? []).map((z) => String(z.pays).toUpperCase()).filter((p) => !fermesSet.has(p)));
  const { data: nouvelles, error: errNouv } = await supabase.from("ruul_candidatures")
    .select("site_id, adulte, pays, deux_telephones, a_telephone, nom, email, reponses, desinscrit_at, referral, cree_at, decision")
    // Les nouvelles, et celles « à traiter » pas encore décidées par un HM : réévaluées à chaque passage
    // (un pays ouvert ou une réponse complétée les fait passer en automatique).
    .eq("statut_site", "pending").or("decision.is.null,decision.eq.a_traiter")
    .order("referral", { ascending: false }).order("cree_at", { ascending: true });
  if (errNouv) throw errNouv;
  const rec = (nouvelles ?? []).length ? await recruteurs(supabase) : [];
  for (const c of nouvelles ?? []) {
    const manques = manquesCandidature(c as CandidatureRuul, ouverts);
    if (manques.length === 0) {
      await supabase.rpc("ruul_candidature_decider", { p_site_id: c.site_id, p_decision: "auto", p_raison: null });
      bilan.auto++;
    } else {
      const hm = c.pays ? hmDuPays(String(c.pays), rec) : null;
      const deja = c.decision === "a_traiter";
      await supabase.from("ruul_candidatures").update({
        decision: "a_traiter", manques, hm_id: hm, ...(deja ? {} : { decide_at: new Date().toISOString() }),
      }).eq("site_id", c.site_id);
      if (!deja) bilan.a_traiter++;
    }
  }

  // 3. Les décisions vers le site (interrupteur : rien ne part sans l'OK de Max).
  if (await interrupteur(supabase, "ruul_candidatures_auto")) {
    const { data: aEnvoyer } = await supabase.from("ruul_candidatures").select("site_id, decision, decision_raison")
      .eq("envoi", "a_envoyer").order("referral", { ascending: false }).limit(60);
    const lundi = lundiSuivant(aujourdhuiParis());
    for (const c of aEnvoyer ?? []) {
      const r = c.decision === "refusee"
        ? await appelSite("POST", { action: "refuse", id: c.site_id, reason: c.decision_raison ?? "Not selected" })
        : await appelSite("POST", { action: "accept", id: c.site_id, start_monday: lundi });
      await supabase.from("ruul_candidatures").update({ envoi: r.ok ? "envoye" : "erreur", envoi_erreur: r.erreur })
        .eq("site_id", c.site_id);
      if (r.ok) bilan.envoyees++;
      else bilan.erreurs.push(`${c.site_id} : ${r.erreur}`);
    }
  }

  // 4. Les signatures en attente : relances, expiration, cohorte décalée.
  if (await interrupteur(supabase, "ruul_relances_signature")) {
    const { data: attente } = await supabase.from("ruul_candidatures")
      .select("site_id, nom, pays, hm_id, accepte_at, relance_base_at, relances_signature, start_monday")
      .eq("statut_site", "accepted").is("signe_at", null).is("desinscrit_at", null).not("accepte_at", "is", null);
    const auj = aujourdhuiParis();
    for (const c of attente ?? []) {
      if (c.start_monday && c.start_monday < auj) {
        const lundi = lundiSuivant(auj);
        const r = await appelSite("POST", { action: "move_start", id: c.site_id, start_monday: lundi });
        if (r.ok) {
          await supabase.from("ruul_candidatures").update({ start_monday: lundi }).eq("site_id", c.site_id);
          bilan.decalees++;
        }
      }
      const etape = etapeSignature(String(c.relance_base_at ?? c.accepte_at), Number(c.relances_signature ?? 0));
      if (!etape) continue;
      if (etape === "expirer") {
        const r = await appelSite("POST", { action: "expire", id: c.site_id });
        if (!r.ok) {
          bilan.erreurs.push(`${c.site_id} : ${r.erreur}`);
          continue;
        }
        await supabase.from("ruul_candidatures").update({ statut_site: "expired", expire_at: new Date().toISOString(), hm_prevenu_at: new Date().toISOString() })
          .eq("site_id", c.site_id);
        if (c.hm_id) await ecrireAuPosteur(supabase, c.hm_id, `Contract not signed after 7 days: ${c.nom ?? "a candidate"} (${c.pays ?? "?"}). The application has expired.`);
        bilan.expirees++;
        continue;
      }
      const r = await appelSite("POST", { action: "remind_signature", id: c.site_id, step: etape });
      if (r.ok) {
        await supabase.from("ruul_candidatures").update({ relances_signature: Number(c.relances_signature ?? 0) + 1, relance_signature_at: new Date().toISOString() })
          .eq("site_id", c.site_id);
        bilan.relances++;
      } else bilan.erreurs.push(`${c.site_id} : ${r.erreur}`);
    }
  }
  return { ok: true, ...bilan };
}

// ---------------------------------------------------------------------------
// 0591 : le dimanche, à Max, les posteurs Ruul à ajouter dans Ruul
// ---------------------------------------------------------------------------

/** L'admin qui ajoute et paie sur Ruul. */
const MAX_ID = "dde5916a-89b8-4fc3-897b-dc7f0d88e20e";

function heureParis(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(d));
}

async function listeDimanche(supabase: Supabase, forcer: boolean) {
  if (!forcer) {
    if (heureParis() !== 18) return { ok: true, ignore: "pas 18 h à Paris" };
    if (!(await interrupteur(supabase, "ruul_liste_dimanche"))) return { ok: true, ignore: "ruul_liste_dimanche éteint" };
    const { data: deja } = await supabase.from("ruul_dimanche_envois").select("dimanche").eq("dimanche", aujourdhuiParis()).maybeSingle();
    if (deja) return { ok: true, ignore: "déjà envoyé aujourd'hui" };
  }
  const { data, error } = await supabase.rpc("ruul_a_ajouter_liste");
  if (error) return { ok: false, error: error.message };
  const lignes = (data ?? []) as LigneAAjouter[];
  if (!lignes.length) {
    if (!forcer) await supabase.from("ruul_dimanche_envois").upsert({ dimanche: aujourdhuiParis(), nb: 0, ok: true });
    return { ok: true, n: 0 };
  }
  const { data: max } = await supabase.from("profiles").select("email").eq("id", MAX_ID).maybeSingle();
  if (!max?.email) return { ok: false, error: "email de Max introuvable" };
  const m = emailListeDimanche(lignes);
  const r = await envoyerEmail(max.email, m.objet, m.html, m.texte, `${URL_DASHBOARD}/admin/auto/ruul`, ["ruul", "liste_dimanche"]);
  if (!forcer) await supabase.from("ruul_dimanche_envois").upsert({ dimanche: aujourdhuiParis(), nb: lignes.length, ok: r.ok, erreur: r.erreur });
  return { ok: r.ok, n: lignes.length, erreur: r.erreur };
}
