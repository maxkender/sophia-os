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
 *   POST { action: "soir" | "dimanche", forcer? }  (cron tous les jours, 18 h à Paris) — 0591, 0592
 *       Un email à support@vikstudios.com : les nouveaux signés depuis la veille
 *       à ajouter dans Ruul (nom, email Ruul, pays, tarif) et le reste des jours
 *       précédents. Un seul par soir, rien si aucun nouveau (réglage
 *       ruul_liste_dimanche ; « forcer » : envoi de test).
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
  emailListeSoir,
  type LigneAAjouter,
  texteSansSlack,
  etapeSignature,
  lundiSuivant,
  manquesCandidature,
  emailAB,
  prochaineEtapeRuul,
  remplirRuul,
  rendreEmailRuul,
  semaineCourte,
} from "../_shared/ruul.ts";
import { avecPiedHelp } from "../_shared/relance_jour.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { dansFenetre, type Decision, emailParcours, type EtatParcours, prochainEnvoi, type TypeParcours } from "../_shared/parcours_ruul.ts";
import { motDePasseRecrue } from "../_shared/mot_de_passe.ts";
import { emailRattrapage, estPret as estPretRattrapage, etapesFaites, type SituationRattrapage } from "../_shared/rattrapage_ruul.ts";
import {
  brevoGet,
  contenuBrevo,
  creditsEmail,
  envoyerSuivi,
  type EtatMessage,
  evenementsBrevo,
  lienStopDansHtml,
  meilleurEtat,
  type MessageBrevo,
  messagesParEmail,
  type ResultatEnvoi,
  texteDepuisHtml,
} from "../_shared/emails.ts";
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

  // 0696 : les liens des emails (/r/done, /r/password, /r/stop sur sophia-marketing-orga.vercel.app) : la page
  // du dashboard appelle ici, en JSON. Jeton à usage unique, 14 jours.
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_LIEN });
  if (request.method === "GET" && url.searchParams.get("lien")) {
    return new Response(JSON.stringify(await utiliserLien(supabase, url.searchParams.get("lien")!, url.searchParams.get("a") ?? "", url.searchParams.get("confirme") === "1")),
      { headers: { ...CORS_LIEN, "content-type": "application/json; charset=utf-8" } });
  }
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
    // 0688 (Max, 12/11) : « I do not wish to continue » → « Are you sure? » → compte désactivé.
    const arreter = url.searchParams.get("arreter");
    if (arreter) {
      if (!JETON.test(arreter)) return PAGE("Link not valid", "This link is not valid.");
      if (url.searchParams.get("confirme") !== "1") {
        const oui = `${URL_FONCTION}?arreter=${arreter}&confirme=1`;
        return PAGE("Are you sure?",
          `If you confirm, your access is closed and you won't receive any more emails from us. If you posted this week, that week is still paid.<br><br><a href="${oui}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Yes, stop</a>`);
      }
      const { data, error } = await supabase.rpc("ruul_arret_jeton", { p_jeton: arreter });
      if (error) return PAGE("Something went wrong", "Please try again later.");
      if (data !== true) return PAGE("Link not valid", "This link is not valid.");
      const { data: qui } = await supabase.from("profiles").select("id").eq("ruul_jeton", arreter).maybeSingle();
      if (qui?.id) await confirmerArret(supabase, qui.id).catch(() => null);
      return PAGE("Done", "Your access is closed. You won't receive any more emails from us. Thank you for your time with Vik Studios.");
    }
    // 13/11 (rattrapage) : « Get a new password » → confirmation → le mot de passe s'affiche.
    const mdp = url.searchParams.get("motdepasse");
    if (mdp) {
      if (!JETON.test(mdp)) return PAGE("Link not valid", "This link is not valid.");
      if (url.searchParams.get("confirme") !== "1") {
        const oui = `${URL_FONCTION}?motdepasse=${mdp}&confirme=1`;
        return PAGE("Get a new password",
          `Your password will be reset and shown on the next page.<br><br><a href="${oui}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Get a new password</a>`);
      }
      const { data: pr } = await supabase.from("profiles").select("id, email, is_active").eq("ruul_jeton", mdp).maybeSingle();
      if (!pr?.id || !pr.is_active) return PAGE("Link not valid", "This link is not valid.");
      // 13/11 : un mot de passe neuf, unique et aléatoire (plus jamais 12345678).
      const nouveau = motDePasseRecrue();
      const { error: errMdp } = await supabase.auth.admin.updateUserById(pr.id, { password: nouveau });
      if (errMdp) return PAGE("Something went wrong", "Please try again later, or click Help on your dashboard.");
      return PAGE("Your new password",
        `Dashboard: <a href="${URL_DASHBOARD_OS}">${URL_DASHBOARD_OS}</a><br>Login: <b>${String(pr.email ?? "")}</b><br>Password: <b>${nouveau}</b>`);
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
    // 0688 : le parcours Ruul (toutes les heures) ; l'aperçu de ses emails pour un posteur (rien n'est envoyé).
    if (body?.action === "parcours") return json(await parcours(supabase, body?.forcer === true, body?.simuler === true));
    if (body?.action === "parcours_apercu") return json(await parcoursApercu(supabase, String(body?.poster_id ?? ""), body?.v2 === true));
    // 13/11 : l'email de rattrapage d'une cohorte (aperçu, puis envoi seulement avec confirmer: true).
    if (body?.action === "rattrapage") return json(await rattrapage(supabase, body));
    // 13/11 : le rattrapage des emails perdus (Brevo) : le plan, puis l'envoi seulement avec confirmer: true.
    if (body?.action === "perdus") return json(await perdus(supabase, body));
    // 0592 : « dimanche » (ancien nom de la tâche) et « soir » : la liste de tous les soirs.
    if (body?.action === "dimanche" || body?.action === "soir") return json(await listeSoir(supabase, body?.forcer === true));
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
  ruul_compte: string | null;
  ruul_email_a_at: string | null;
  ruul_email_b_at: string | null;
}

async function textes(supabase: Supabase): Promise<Record<string, string>> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_textes").maybeSingle();
  return (data?.valeur ?? {}) as Record<string, string>;
}

/** 0681 : les textes des emails A et B (réglage ruul_textes_ab, modifiable). */
async function textesAB(supabase: Supabase): Promise<{ a_objet: string; a_texte: string; b_objet: string; b_texte: string; bouton: string }> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_textes_ab").maybeSingle();
  const v = (data?.valeur ?? {}) as Record<string, string>;
  return {
    a_objet: v.a_objet ?? "Action needed: set up Ruul so we can pay you every Monday",
    a_texte: v.a_texte ?? "",
    b_objet: v.b_objet ?? "You're connected on Ruul: one last check to get paid",
    b_texte: v.b_texte ?? "",
    bouton: v.bouton ?? "It's done",
  };
}

/** Un email par le site (vik-studios-creators.com ; expéditeur noreply@sophia-culture.com). */
// 13/11 : par l'envoi suivi (journal emails_envois, file de réessai si Brevo refuse ou n'a plus de crédit).
function envoyerEmail(to: string, objet: string, html: string, texte: string, stop: string, tags: string[]): Promise<ResultatEnvoi> {
  return envoyerSuivi({ to, objet, html, texte, stop, tags });
}

async function envoyer(supabase: Supabase) {
  if (await bloquer(supabase, { fonction: "ruul", action: "envoyer" })) return { ok: false, error: PAUSE };
  const t = await textes(supabase);
  const bilan: Record<string, unknown>[] = [];

  // 1. L'invitation Ruul et ses relances (0591 : interrupteur ruul_invitation_email).
  const inviter = await interrupteur(supabase, "ruul_invitation_email");
  const { data: invites, error } = await supabase
    .from("profiles")
    .select("id, prenom, ruul_email, ruul_statut, ruul_ajoute_at, ruul_relances, relances_stop_at, ruul_jeton, slack_user_id, ruul_compte, ruul_email_a_at, ruul_email_b_at")
    .eq("canal_paie", "ruul").eq("ruul_statut", "invite").eq("is_active", true).is("relances_stop_at", null);
  if (error) throw error;
  // 0681 (Agent Ruul) : l'email A (« Invited » dans Ruul) ou B (« Active »), une seule fois chacun,
  // seulement quand Max a mis ruul_emails_ab sur on. L'email A remplace l'ancienne invitation.
  // 13/11 (Réparer Ruul) : en v2, A et B partent par le moteur du parcours (un seul système).
  const emailsAB = await interrupteur(supabase, "ruul_emails_ab") && await reglageTexte(supabase, "ruul_emails_v2") !== "on";
  const ab = await textesAB(supabase);
  for (const p of (invites ?? []) as Profil[]) {
    const quel = emailAB({ compte: p.ruul_compte, a_at: p.ruul_email_a_at, b_at: p.ruul_email_b_at, statut: p.ruul_statut, stop_at: p.relances_stop_at });
    if (!quel) continue;
    if (!emailsAB || !p.ruul_email || !p.ruul_jeton) continue;
    const v = { prenom: (p.prenom ?? "").trim() || "there", email: p.ruul_email };
    const objet = remplirRuul(quel === "A" ? ab.a_objet : ab.b_objet, v);
    const corps = remplirRuul(quel === "A" ? ab.a_texte : ab.b_texte, v);
    if (!corps.trim()) continue;
    const lienStop = `${URL_FONCTION}?stop=${p.ruul_jeton}`;
    const e = rendreEmailRuul({ objet, corps, bouton: { texte: ab.bouton, lien: `${URL_FONCTION}?pret=${p.ruul_jeton}` }, lienStop });
    const r = await envoyerEmail(p.ruul_email, objet, e.html, e.texte, lienStop, ["ruul", quel === "A" ? "email_a" : "email_b"]);
    if (r.ok) {
      const maintenant = new Date().toISOString();
      // Après A : les relances J+1, J+3 comptent depuis l'email A. Après B : pas de relance d'invitation.
      await supabase.from("profiles").update(quel === "A"
        ? { ruul_email_a_at: maintenant, ruul_relances: 1, ruul_relance_at: maintenant }
        : { ruul_email_b_at: maintenant, ruul_relances: Math.max(3, p.ruul_relances ?? 0), ruul_relance_at: maintenant }).eq("id", p.id);
    }
    bilan.push({ poster: p.id, etape: quel === "A" ? "email_a" : "email_b", ok: r.ok, canaux: r.ok ? ["email"] : [], erreur: r.erreur });
  }
  // 0688 : le parcours Ruul sur on remplace les anciennes relances d'invitation (rien n'est supprimé).
  const parcoursOn = await reglageTexte(supabase, "ruul_parcours") === "on";
  for (const p of (inviter && !parcoursOn ? invites ?? [] : []) as Profil[]) {
    // 0681 : pas de statut lu dans Ruul → rien ; l'invitation est l'email A ci-dessus.
    if (!p.ruul_compte) continue;
    const depuis = p.ruul_email_b_at ?? p.ruul_email_a_at;
    if (!depuis) continue;
    const etape = prochaineEtapeRuul({ statut: p.ruul_statut, ajoute_at: depuis, relances: p.ruul_relances ?? 0, stop_at: p.relances_stop_at });
    if (!etape || etape === "invite" || !p.ruul_jeton) continue;
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
    const objet = remplirRuul(t.relance_objet ?? "Reminder: your Ruul account", v);
    const corps = remplirRuul(t.relance_texte ?? "", v);
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
    // 0684 (Max) : l'email de paie de sa dernière semaine part même après un STOP.
    const montant = lignes.reduce((s, l) => s + Number(l.montant), 0);
    const semaines = lignes.map((l) => semaineCourte(String(l.semaine))).join(" and ");
    const v = { prenom: (p.prenom ?? "").trim() || "there", montant: Number.isInteger(montant) ? montant : montant.toFixed(2), semaine: semaines };
    const texte = remplirRuul(t.paye_texte ?? "Hi {prenom}, you received ${montant} for the week of {semaine}. You can withdraw it on Ruul.", v);
    let ok = false;
    let erreur: string | null = null;
    if (p.slack_user_id) {
      const s = await ecrireAuPosteur(supabase, lignes[0].poster_id, texte, fetch, undefined, { malgreStop: "paie" });
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
      const objet = "A message from the Vik Studios team";
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
  if (!parcoursOn && await interrupteur(supabase, "ruul_email_relances")) {
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
        const corps = avecPiedHelp(remplirRuul(t.email_ruul_texte ?? EMAIL_RUUL_TEXTE, { prenom }));
        const e = rendreEmailRuul({ objet, corps, bouton: { texte: "Open my dashboard", lien: URL_DASHBOARD }, lienStop });
        const r = await envoyerEmail(d.email, objet, e.html, e.texte, lienStop, ["ruul", `email_ruul_${d.etape}`]);
        if (r.ok) canaux.push("email");
        else erreur = r.erreur;
      }
      if (d.slack_user_id) {
        const s = await ecrireAuPosteur(supabase, d.poster_id, avecPiedHelp(remplirRuul(t.email_ruul_slack ?? EMAIL_RUUL_SLACK, { prenom })));
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
const EMAIL_RUUL_TEXTE = "Hi {prenom},\n\nWe still need your Ruul email to pay you every Monday. Log in to your dashboard (Sophia OS) and add it at the top of the page.\n\nNo Ruul account yet? Within 24 hours you'll receive an invitation email from Ruul: create your account FROM that email, with the address shown on your dashboard.";
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
// 0591 / 0592 : tous les soirs (18 h Paris), à support@, les posteurs Ruul à ajouter dans Ruul
// ---------------------------------------------------------------------------

/** 0592 : le destinataire de la liste du soir (réglage ruul_liste_destinataire). */
const DESTINATAIRE_LISTE = "support@vikstudios.com";

function heureParis(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(d));
}

/**
 * Les nouveaux signés depuis le dernier envoi réussi (ou 24 h), à ajouter dans
 * Ruul ; en bas, combien restent des jours précédents. Un seul email par soir,
 * rien si aucun nouveau.
 */
async function listeSoir(supabase: Supabase, forcer: boolean) {
  if (!forcer) {
    if (heureParis() !== 18) return { ok: true, ignore: "pas 18 h à Paris" };
    if (!(await interrupteur(supabase, "ruul_liste_dimanche"))) return { ok: true, ignore: "ruul_liste_dimanche éteint" };
    const { data: deja } = await supabase.from("ruul_dimanche_envois").select("dimanche").eq("dimanche", aujourdhuiParis()).maybeSingle();
    if (deja) return { ok: true, ignore: "déjà envoyé aujourd'hui" };
  }
  const { data, error } = await supabase.rpc("ruul_a_ajouter_liste");
  if (error) return { ok: false, error: error.message };
  const lignes = (data ?? []) as LigneAAjouter[];
  const { data: dernier } = await supabase.from("ruul_dimanche_envois").select("envoye_at").eq("ok", true)
    .order("envoye_at", { ascending: false }).limit(1).maybeSingle();
  const depuis = Math.max(dernier?.envoye_at ? new Date(dernier.envoye_at).getTime() : 0, Date.now() - 24 * 3_600_000);
  const nouveaux = lignes.filter((l) => !l.signe_at || new Date(l.signe_at).getTime() > depuis);
  const anciens = lignes.length - nouveaux.length;
  if (!nouveaux.length) {
    if (!forcer) await supabase.from("ruul_dimanche_envois").upsert({ dimanche: aujourdhuiParis(), nb: 0, ok: true });
    return { ok: true, n: 0, anciens };
  }
  const { data: regl } = await supabase.from("reglages").select("valeur").eq("cle", "ruul_liste_destinataire").maybeSingle();
  const a = typeof regl?.valeur === "string" && regl.valeur.includes("@") ? regl.valeur : DESTINATAIRE_LISTE;
  const m = emailListeSoir(nouveaux, anciens);
  const r = await envoyerEmail(a, m.objet, m.html, m.texte, `${URL_DASHBOARD}/admin/auto/ruul`, ["ruul", "liste_soir"]);
  if (!forcer) await supabase.from("ruul_dimanche_envois").upsert({ dimanche: aujourdhuiParis(), nb: nouveaux.length, ok: r.ok, erreur: r.erreur });
  return { ok: r.ok, n: nouveaux.length, anciens, erreur: r.erreur };
}

// ---------------------------------------------------------------------------
// 0688 — PARCOURS POSTEUR RUUL (un seul moteur d'emails ; voir _shared/parcours_ruul.ts)
// ---------------------------------------------------------------------------

const URL_DASHBOARD_OS = "https://sophia-marketing-orga.vercel.app";

async function reglageTexte(supabase: Supabase, cle: string): Promise<unknown> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", cle).maybeSingle();
  return data?.valeur ?? null;
}

async function lienSlackInvitation(supabase: Supabase): Promise<string> {
  const v = await reglageTexte(supabase, "slack_lien_invitation");
  return typeof v === "string" && v ? v : "https://join.slack.com/t/sophia-system";
}

/** Les liens à usage unique d'un email v2 (/r/done, /r/password, /r/stop sur le dashboard). */
interface LiensV2 { done: string; password: string; stop: string }
const LIENS_APERCU: LiensV2 = { done: "<jeton>", password: "<jeton>", stop: "<jeton>" };

/** 0696 : 3 jetons neufs (14 jours, usage unique) pour les liens d'un email. */
async function creerLiensV2(supabase: Supabase, posterId: string, source: string): Promise<LiensV2 | null> {
  const j: Record<string, string> = {};
  for (const a of ["done", "password", "stop"] as const) {
    const { data, error } = await supabase.rpc("lien_posteur_creer", { p_poster: posterId, p_action: a, p_source: source });
    if (error || typeof data !== "string") return null;
    j[a] = data;
  }
  return j as unknown as LiensV2;
}

/**
 * L'email d'une étape pour un posteur (objet, corps, bouton) rendu en HTML + texte.
 * `liens` (v2, Réparer Ruul 13/11) : titre « Vik Studios » et liens à usage unique sur le dashboard ;
 * sans : l'ancien format (liens de la fonction).
 */
function rendreEtape(e: EtatParcours, type: Exclude<TypeParcours, "carte_ruul">, slack: string, lundi?: string, numero?: number,
  motDePasse = "(the one in our previous email)", liens: LiensV2 | null = null) {
  const jeton = e.ruul_jeton ?? "";
  const lienPret = liens ? `${URL_DASHBOARD_OS}/r/done?t=${liens.done}` : `${URL_FONCTION}?pret=${jeton}`;
  const lienStop = liens ? `${URL_DASHBOARD_OS}/r/stop?t=${liens.stop}` : `${URL_FONCTION}?stop=${jeton}`;
  const m = emailParcours(type, {
    prenom: e.prenom, login: e.login, motDePasse, dashboard: URL_DASHBOARD_OS, handle: e.handle, slack,
    cohorte_lundi: e.cohorte_lundi, ruul_email: e.email, ruul_compte: e.ruul_compte, abonnements: e.abonnements, lundi, numero,
    faites: {
      connexion: !!e.premiere_connexion_at, tiktok: e.tiktok_existe === true,
      warmup: !!e.warmup_started_at && (e.abonnements ?? 0) >= 5, slack: !!e.slack_user_id,
    },
  }, lienPret);
  const sansPied = type === "desactivation" || type === "arret" || type === "identite_fin";
  const r = rendreEmailRuul({
    objet: m.objet, corps: m.corps, bouton: m.bouton ?? null, lienStop, sansPied,
    ...(liens ? { titre: "Vik Studios", arret: lienStop } : {}),
  });
  return { objet: m.objet, html: r.html, texte: r.texte, lienStop };
}

/** Toutes les heures : pour chaque posteur Ruul actif, l'email dû maintenant (au plus un par jour). */
async function parcours(supabase: Supabase, forcer: boolean, simuler = false) {
  const mode = await reglageTexte(supabase, "ruul_parcours");
  if (mode !== "on" && !forcer && !simuler) return { ok: true, ignore: "parcours Ruul éteint (réglage ruul_parcours)" };
  // ruul_parcours_bienvenue : false, ou { "depuis": "<instant de l'allumage>" } (seuls les comptes créés après).
  const reglageBienvenue = await reglageTexte(supabase, "ruul_parcours_bienvenue") as { depuis?: string } | boolean | null;
  const bienvenueDepuis = reglageBienvenue && typeof reglageBienvenue === "object" ? reglageBienvenue.depuis ?? null : null;
  const bienvenue = !!bienvenueDepuis;
  const { data, error } = await supabase.rpc("ruul_parcours_etat");
  if (error) throw error;
  const slack = await lienSlackInvitation(supabase);
  // 13/11 (Réparer Ruul) : le nouveau format (Vik Studios, liens à usage unique, A/B dans ce moteur).
  const v2 = await reglageTexte(supabase, "ruul_emails_v2") === "on";
  // 0698 : la vérification d'identité Ruul (import de Ruul Bot).
  const { data: idents } = await supabase.rpc("ruul_parcours_identite");
  const identite = new Map(((idents ?? []) as { poster_id: string; identite: string; refus: number }[]).map((x) => [x.poster_id, x]));
  // Les posteurs que Max a mis de côté (« ne pas inviter ») ne reçoivent rien.
  const { data: exclus } = await supabase.from("profiles").select("id").eq("canal_paie", "ruul").eq("ruul_ne_pas_inviter", true);
  const deCote = new Set(((exclus ?? []) as { id: string }[]).map((x) => x.id));
  const maintenant = new Date();
  const bilan: Record<string, unknown>[] = [];
  for (const e of (data ?? []) as EtatParcours[]) {
    if (deCote.has(e.poster_id)) continue;
    const id = identite.get(e.poster_id);
    if (id) { e.identite = id.identite; e.identite_refus = id.refus; }
    const d = prochainEnvoi(e, maintenant, { bienvenue, bienvenueDepuis, v2 });
    if (!d) continue;
    // Simulation : ce qui partirait maintenant, sans rien envoyer ni écrire.
    // 13/11 : hors de 9 h–20 h (Paris), l'email attend le prochain passage dans la fenêtre.
    if (!dansFenetre(maintenant, d.type)) {
      if (simuler) bilan.push({ poster: e.poster_id, type: d.type, cle: d.cle, ok: true, simulation: true, attend: "fenêtre 9 h–20 h" });
      continue;
    }
    if (simuler) { bilan.push({ poster: e.poster_id, type: d.type, cle: d.cle, ok: true, simulation: true }); continue; }
    bilan.push(await executer(supabase, e, d, slack, v2));
  }
  return {
    ok: true, posteurs: (data ?? []).length, envoyes: bilan.filter((b) => b.ok).length, echecs: bilan.filter((b) => !b.ok).length,
    par_type: bilan.reduce((acc: Record<string, number>, b) => ({ ...acc, [String(b.type)]: (acc[String(b.type)] ?? 0) + 1 }), {}), bilan,
  };
}

async function executer(supabase: Supabase, e: EtatParcours, d: Decision & { numero?: number }, slack: string, v2 = false): Promise<Record<string, unknown>> {
  const noter = (ok: boolean, canaux: string[], erreur: string | null) =>
    supabase.from("ruul_parcours_envois").upsert({ poster_id: e.poster_id, cle: d.cle, type: d.type, ok, canaux, erreur, envoye_at: new Date().toISOString() },
      { onConflict: "poster_id,cle" });
  if (d.type === "carte_ruul") {
    const { error } = await supabase.rpc("probleme_ajouter", {
      p_type: "ruul_invite", p_ref: `${e.poster_id}:ruul_jamais_fini`, p_poster: e.poster_id, p_contrat: null, p_categorie: "paie",
      p_resume: "Ruul jamais fini",
      p_texte: `6 relances Ruul envoyées (${e.email ?? "email ?"}), toujours pas « It's done ». Sans compte Ruul prêt, sa paie est reportée.`,
      p_at: new Date().toISOString(), p_lien: null, p_canal: "os", p_par: null,
    });
    await noter(!error, error ? [] : ["carte"], error?.message ?? null);
    return { poster: e.poster_id, type: d.type, ok: !error, erreur: error?.message ?? null };
  }
  if (d.type === "report" && d.lundi) {
    const { error } = await supabase.rpc("ruul_reporter", { p_poster: e.poster_id, p_lundi: d.lundi });
    if (error) return { poster: e.poster_id, type: d.type, ok: false, erreur: error.message };
  }
  const numero = d.type === "ruul" ? (d.numero ?? Number(d.cle.split("_")[1])) : undefined;
  // 13/11 (Max) : plus jamais de mot de passe par défaut dans un email. Jamais connecté (relance J+1,
  // bienvenue) : un mot de passe neuf, unique et aléatoire, posé sur le compte juste avant l'envoi.
  let motDePasse: string | undefined;
  if ((d.type === "jamais_connecte" || d.type === "bienvenue") && !e.premiere_connexion_at) {
    motDePasse = motDePasseRecrue();
    const { error: errMdp } = await supabase.auth.admin.updateUserById(e.poster_id, { password: motDePasse });
    if (errMdp) {
      await noter(false, [], `mot de passe : ${errMdp.message}`);
      return { poster: e.poster_id, type: d.type, cle: d.cle, ok: false, erreur: `mot de passe : ${errMdp.message}` };
    }
  }
  const liens = v2 ? await creerLiensV2(supabase, e.poster_id, `parcours:${d.cle}`) : null;
  if (v2 && !liens) {
    await noter(false, [], "jetons des liens : création impossible");
    return { poster: e.poster_id, type: d.type, cle: d.cle, ok: false, erreur: "jetons des liens" };
  }
  const m = rendreEtape(e, d.type, slack, d.lundi, numero, motDePasse, liens);
  const r = await envoyerEmail(e.email!, m.objet, m.html, m.texte, m.lienStop, ["ruul", "parcours", d.type]);
  // A/B : la date reste sur la fiche (les relances Ruul tous les 2 jours comptent depuis elle).
  if (r.ok && (d.type === "invite_a" || d.type === "invite_b")) {
    const at = new Date().toISOString();
    await supabase.from("profiles").update(d.type === "invite_a" ? { ruul_email_a_at: at } : { ruul_email_b_at: at }).eq("id", e.poster_id);
  }
  if (d.type === "identite_fin" && r.ok) {
    await supabase.rpc("ruul_desactiver", { p_poster: e.poster_id, p_source: "manuel", p_motif: "Fin de collaboration : identité refusée 2 fois par Ruul" });
  }
  if (d.type === "desactivation" && r.ok) {
    await supabase.rpc("ruul_desactiver", { p_poster: e.poster_id, p_source: "manuel", p_motif: "14 jours sans aucune activité" });
  }
  await noter(r.ok, r.ok ? ["email"] : [], r.erreur);
  return { poster: e.poster_id, type: d.type, cle: d.cle, ok: r.ok, erreur: r.erreur };
}

/** L'aperçu de chaque email du parcours pour un vrai posteur : rien n'est envoyé ni écrit. */
async function parcoursApercu(supabase: Supabase, posterId: string, v2 = false) {
  const { data, error } = await supabase.rpc("ruul_parcours_etat", { p_poster: posterId || null });
  if (error) throw error;
  const e = ((data ?? []) as EtatParcours[])[0];
  if (!e) return { ok: false, error: "posteur Ruul actif introuvable" };
  const slack = await lienSlackInvitation(supabase);
  const lundiSuivant = e.cohorte_lundi ? new Date(new Date(`${e.cohorte_lundi}T12:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10) : undefined;
  const types: Exclude<TypeParcours, "carte_ruul">[] = v2
    ? ["bienvenue", "invite_a", "invite_b", "samedi_ruul", "jamais_connecte", "tiktok", "warmup", "slack", "ruul", "demain", "report", "desactivation", "identite_refusee", "identite_fin", "arret"]
    : ["bienvenue", "jamais_connecte", "tiktok", "warmup", "slack", "ruul", "report", "demain", "desactivation"];
  return {
    ok: true, poster: e.poster_id, prochain: prochainEnvoi(e, new Date(), { bienvenue: false }),
    emails: types.map((t) => ({ type: t, ...rendreEtape(e, t, slack, t === "report" ? lundiSuivant : undefined, t === "ruul" ? 1 : undefined, "••••••", v2 ? LIENS_APERCU : null) })),
  };
}

// ---------------------------------------------------------------------------
// 13/11 (Max) : l'email de rattrapage d'une cohorte Ruul (une seule fois par personne)
// ---------------------------------------------------------------------------

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v: unknown): Set<string> => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)) : []);

/**
 * { lundi: "2026-11-16", exclure: [ids], apercu_ids?: [ids] } → la liste et les aperçus.
 * Avec confirmer: true (et max) : l'envoi (déjà envoyés sautés ; journal ruul_parcours_envois, cle rattrapage:<lundi>).
 */
// deno-lint-ignore no-explicit-any
async function rattrapage(supabase: Supabase, body: any) {
  const lundi = String(body?.lundi ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lundi)) return { ok: false, error: "lundi requis (AAAA-MM-JJ)" };
  const exclure = ids(body?.exclure);
  const cle = `rattrapage:${lundi}`;
  const { data, error } = await supabase.rpc("ruul_parcours_etat");
  if (error) throw error;
  const etats = ((data ?? []) as EtatParcours[]).filter((e) => e.cohorte_lundi === lundi && !exclure.has(e.poster_id) && !e.relances_stop_at);
  const { data: profils, error: errP } = await supabase.from("profiles")
    .select("id, ruul_email, ruul_ne_pas_inviter, is_active").in("id", etats.map((e) => e.poster_id));
  if (errP) throw errP;
  const parId = new Map(((profils ?? []) as { id: string; ruul_email: string | null; ruul_ne_pas_inviter: boolean | null; is_active: boolean }[]).map((p) => [p.id, p]));
  const situation = (e: EtatParcours): SituationRattrapage => ({
    prenom: e.prenom, login: e.login, handle: e.handle, ruul_email: parId.get(e.poster_id)?.ruul_email ?? e.email,
    connecte: !!e.premiere_connexion_at, tiktok: e.tiktok_existe === true, warmup_lance: !!e.warmup_started_at,
    abonnements: e.abonnements, slack: !!e.slack_user_id, ruul_fini: e.ruul_statut === "pret" || e.ruul_statut === "paye_1x",
    ruul_active: e.ruul_compte === "active",
  });
  const dest = etats.filter((e) => parId.get(e.poster_id)?.is_active && !parId.get(e.poster_id)?.ruul_ne_pas_inviter && !estPretRattrapage(situation(e)));
  const dejaEnvoye = (e: EtatParcours) => e.envois.some((x) => x.cle === cle && x.ok);
  const slack = await lienSlackInvitation(supabase);
  // Aperçu : des jetons fictifs, aucun mot de passe. Envoi : 3 jetons neufs à usage unique, un mot de passe unique.
  const rendre = (e: EtatParcours, j: { done: string; password: string; stop: string } = { done: "<jeton>", password: "<jeton>", stop: "<jeton>" }, motDePasse: string | null = e.premiere_connexion_at ? null : "••••••") => emailRattrapage(situation(e), {
    dashboard: URL_DASHBOARD_OS, slack, motDePasse: `${URL_DASHBOARD_OS}/r/password?t=${j.password}`,
    pret: `${URL_DASHBOARD_OS}/r/done?t=${j.done}`, stop: `${URL_DASHBOARD_OS}/r/stop?t=${j.stop}`,
  }, {
    motDePasse,
    debut: lundi === "2026-11-16" ? "Monday 16 November" : `Monday ${lundi}`,
    echeance: lundi === "2026-11-16" ? "Sunday 15 November, midnight (Paris time)" : "Sunday at midnight (Paris time)",
  });
  const auj = new Date().toISOString().slice(0, 10);
  const liste = dest.map((e) => ({
    poster_id: e.poster_id, prenom: e.prenom, email: e.email, jeton: !!e.ruul_jeton, deja_envoye: dejaEnvoye(e),
    email_deja_aujourdhui: e.envois.some((x) => x.ok && String(x.at).slice(0, 10) === auj),
    jamais_connecte: !e.premiere_connexion_at, ruul_active: e.ruul_compte === "active",
  }));
  if (body?.confirmer !== true) {
    const apercuIds = ids(body?.apercu_ids);
    const manque = (k: keyof ReturnType<typeof etapesFaites>) => dest.filter((e) => !etapesFaites(situation(e))[k]).length;
    return {
      ok: true, lundi, total: dest.length,
      detail: { jamais_connectes: manque("connexion"), sans_tiktok: manque("tiktok"), sans_warmup: manque("warmup"), sans_slack: manque("slack"), ruul_pas_fini: manque("ruul") },
      a_envoyer: dest.filter((e) => !dejaEnvoye(e) && e.email && e.ruul_jeton).length,
      sans_email_ou_jeton: dest.filter((e) => !e.email || !e.ruul_jeton).map((e) => e.poster_id), liste,
      apercus: dest.filter((e) => apercuIds.has(e.poster_id)).map((e) => ({ poster_id: e.poster_id, a: e.email, ...rendre(e) })),
    };
  }
  const max = Math.min(80, Math.max(1, Number(body?.max ?? 30)));
  let envoyes = 0;
  const erreurs: { poster_id: string; erreur: string }[] = [];
  for (const e of dest.filter((x) => !dejaEnvoye(x) && x.email && x.ruul_jeton).slice(0, max)) {
    // 3 jetons à usage unique (14 jours) pour les liens de CET email.
    const jetons: Record<string, string> = {};
    for (const a of ["done", "password", "stop"] as const) {
      const { data: j, error: errJ } = await supabase.rpc("lien_posteur_creer", { p_poster: e.poster_id, p_action: a, p_source: cle });
      if (errJ || typeof j !== "string") { erreurs.push({ poster_id: e.poster_id, erreur: `jeton : ${errJ?.message ?? "?"}` }); break; }
      jetons[a] = j;
    }
    if (Object.keys(jetons).length < 3) continue;
    // Jamais connecté (Max, 13/11) : un mot de passe UNIQUE et aléatoire, écrit dans l'email.
    let motDePasse: string | null = null;
    if (!e.premiere_connexion_at) {
      motDePasse = motDePasseRecrue();
      const { error: errMdp } = await supabase.auth.admin.updateUserById(e.poster_id, { password: motDePasse });
      if (errMdp) { erreurs.push({ poster_id: e.poster_id, erreur: `mot de passe : ${errMdp.message}` }); continue; }
    }
    const m = rendre(e, jetons as { done: string; password: string; stop: string }, motDePasse);
    const r = await envoyerEmail(e.email!, m.objet, m.html, m.texte, `${URL_DASHBOARD_OS}/r/stop?t=${jetons.stop}`, ["ruul", "rattrapage"]);
    await supabase.from("ruul_parcours_envois").upsert({ poster_id: e.poster_id, cle, type: "rattrapage", ok: r.ok, canaux: r.ok ? ["email"] : [], erreur: r.erreur, envoye_at: new Date().toISOString() },
      { onConflict: "poster_id,cle" });
    if (r.ok) envoyes++;
    else erreurs.push({ poster_id: e.poster_id, erreur: r.erreur ?? "erreur" });
  }
  const restants = dest.filter((x) => !dejaEnvoye(x) && x.email && x.ruul_jeton).length - envoyes - erreurs.length;
  return { ok: true, lundi, total: dest.length, envoyes, erreurs, restants: Math.max(0, restants) };
}

// ---------------------------------------------------------------------------
// 13/11 (Max) : le rattrapage des emails perdus. Brevo était plafonné (~300/jour du 10 au 12/11) puis
// bloqué le 13 à partir de 01:44 UTC. Règle d'or : seulement à ceux qui n'ont RIEN reçu (« delivered »
// dans Brevo), une seule fois, un seul email par personne aujourd'hui. Jamais de doublon.
//   1. le rattrapage de ce matin, pas délivré ni en attente → le MÊME email (contenu gardé par Brevo :
//      même mot de passe, mêmes liens) ;
//   2. les signés sans identifiants (liste de Max) : déjà connecté → rien ; rattrapage délivré ou en
//      attente → rien (couvert) ; sinon (et pas déjà dans 1) → la bienvenue OS, mot de passe neuf ;
//   3. les autres posteurs Ruul avec au moins un email perdu depuis le 10/11 → l'email le plus utile
//      pour leur situation ACTUELLE (pas l'ancien), sauf s'ils ont déjà reçu un email aujourd'hui.
// ---------------------------------------------------------------------------

/** L'email le plus utile maintenant : la première étape qui manque (connexion, TikTok, warm-up, Ruul, Slack). */
function emailUtile(e: EtatParcours): TypeParcours | null {
  if (!e.premiere_connexion_at) return "jamais_connecte";
  if (e.tiktok_existe !== true) return "tiktok";
  if (!e.warmup_started_at || (e.abonnements ?? 0) < 5) return "warmup";
  // Ruul : seulement une fois invité dans Ruul (A : invitation à ouvrir ; B : compte connecté, reste à finir).
  if (e.ruul_statut === "invite") return e.ruul_compte === "active" ? "invite_b" : "invite_a";
  if (!e.slack_user_id) return "slack";
  return null;
}

const jourParis = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

/** Sujet de l'email de rattrapage du 13/11 (« Anna, here's what's left before you start on Monday »). */
const SUJET_RATTRAPAGE = /what's left before you start/i;

async function enParallele<T, R>(liste: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(liste.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (i < liste.length) {
      const k = i++;
      res[k] = await f(liste[k]);
    }
  }));
  return res;
}

// deno-lint-ignore no-explicit-any
async function perdus(supabase: Supabase, body: any) {
  const depuis = String(body?.depuis ?? "2026-11-10");
  const cleRattrapage = String(body?.cle_rattrapage ?? "rattrapage:2026-11-16");
  const bienvenueIds = ids(body?.bienvenue);
  const exclure = ids(body?.exclure);
  const maintenant = new Date();
  const auj = jourParis(maintenant);
  const compte = await brevoGet("/account");
  if (!compte.ok) return { ok: false, error: `Brevo : ${compte.erreur}` };
  const credits = creditsEmail((compte.data as { plan?: unknown } | null)?.plan);

  const { data, error } = await supabase.rpc("ruul_parcours_etat");
  if (error) throw error;
  const etats = (data ?? []) as EtatParcours[];
  const { data: profils, error: errP } = await supabase.from("profiles")
    .select("id, ruul_email, email_perso, ruul_ne_pas_inviter").in("id", etats.map((e) => e.poster_id));
  if (errP) throw errP;
  const profil = new Map(((profils ?? []) as { id: string; ruul_email: string | null; email_perso: string | null; ruul_ne_pas_inviter: boolean | null }[]).map((p) => [p.id, p]));
  const { data: deja } = await supabase.from("ruul_parcours_envois").select("poster_id, cle, ok")
    .or(`cle.eq.${cleRattrapage},cle.like.perdus:*,cle.eq.renvoi:${cleRattrapage}`).limit(900);
  const envoisCle = (id: string, test: (cle: string) => boolean) => ((deja ?? []) as { poster_id: string; cle: string; ok: boolean }[]).some((x) => x.poster_id === id && x.ok && test(x.cle));

  // Brevo : tous les emails de chaque posteur depuis le 10/11 (toutes ses adresses).
  const parPosteur = new Map<string, MessageBrevo[]>();
  const erreursBrevo: string[] = [];
  await enParallele(etats, 6, async (e) => {
    const p = profil.get(e.poster_id);
    const adresses = [...new Set([e.email, p?.ruul_email, p?.email_perso].filter((x): x is string => !!x).map((x) => x.trim().toLowerCase()))];
    const msgs: MessageBrevo[] = [];
    for (const a of adresses) {
      const r = await evenementsBrevo({ email: a, startDate: depuis, endDate: auj });
      if (!r.ok) { erreursBrevo.push(`${e.poster_id} : ${r.erreur}`); continue; }
      msgs.push(...messagesParEmail(r.evenements, maintenant));
    }
    parPosteur.set(e.poster_id, msgs);
  });
  if (erreursBrevo.length > etats.length / 4) return { ok: false, error: `Brevo : ${erreursBrevo.length} lectures en erreur`, exemples: erreursBrevo.slice(0, 5) };

  type Plan = { poster_id: string; prenom: string | null; cat: 1 | 2 | 3; type: string; message_id?: string; email: string };
  const plan: Plan[] = [];
  const ignores: Record<string, number> = {};
  const ignorer = (raison: string) => { ignores[raison] = (ignores[raison] ?? 0) + 1; };
  const adressesRefusees: { prenom: string | null; email: string; raison: string | null }[] = [];
  const etatsVus: Record<string, number> = {};
  let rattrapageSansTrace = 0;
  for (const e of etats) {
    const msgs = parPosteur.get(e.poster_id) ?? [];
    for (const m of msgs) {
      const k = `${m.etat} [${m.evenements.join("+")}]`;
      etatsVus[k] = (etatsVus[k] ?? 0) + 1;
      if (m.etat === "adresse_refusee") adressesRefusees.push({ prenom: e.prenom, email: m.email, raison: m.raison });
    }
    if (exclure.has(e.poster_id)) { if (msgs.some((m) => m.etat === "perdu")) ignorer("exclu par Max"); continue; }
    if (e.relances_stop_at || profil.get(e.poster_id)?.ruul_ne_pas_inviter) { if (msgs.some((m) => m.etat === "perdu")) ignorer("arrêté ou mis de côté"); continue; }
    if (envoisCle(e.poster_id, (c) => c.startsWith("perdus:") || c === `renvoi:${cleRattrapage}`)) { ignorer("déjà rattrapé"); continue; }
    const rattr = msgs.filter((m) => SUJET_RATTRAPAGE.test(m.sujet));
    const etatRattr: EtatMessage | null = meilleurEtat(rattr);
    if (!rattr.length && envoisCle(e.poster_id, (c) => c === cleRattrapage)) rattrapageSansTrace++;
    const recuAujourdhui = msgs.some((m) => m.etat === "recu" && m.date && jourParis(new Date(m.date)) === auj);
    // 1. Le rattrapage de ce matin, perdu.
    if (envoisCle(e.poster_id, (c) => c === cleRattrapage) && rattr.length && etatRattr === "perdu") {
      const m = rattr.find((x) => x.etat === "perdu")!;
      plan.push({ poster_id: e.poster_id, prenom: e.prenom, cat: 1, type: "rattrapage (même email)", message_id: m.message_id, email: m.email });
      continue;
    }
    // 2. Les signés sans identifiants (liste de Max).
    if (bienvenueIds.has(e.poster_id)) {
      if (e.premiere_connexion_at) ignorer("2 : déjà connecté");
      else if (etatRattr === "recu" || etatRattr === "en_attente") ignorer("2 : couvert par le rattrapage");
      else if (recuAujourdhui) ignorer("2 : un email déjà reçu aujourd'hui");
      else if (!e.email) ignorer("2 : sans adresse email");
      else plan.push({ poster_id: e.poster_id, prenom: e.prenom, cat: 2, type: "bienvenue", email: e.email });
      continue;
    }
    // 3. Les autres : au moins un email perdu depuis le 10/11.
    if (!msgs.some((m) => m.etat === "perdu")) continue;
    if (etatRattr === "recu" || etatRattr === "en_attente") { ignorer("3 : le rattrapage (reçu) couvre tout"); continue; }
    if (recuAujourdhui) { ignorer("3 : un email déjà reçu aujourd'hui"); continue; }
    if (!e.email) { ignorer("3 : sans adresse email"); continue; }
    const t = emailUtile(e);
    if (!t) { ignorer("3 : tout est fait"); continue; }
    plan.push({ poster_id: e.poster_id, prenom: e.prenom, cat: 3, type: t, email: e.email });
  }
  const parCat = (c: number) => plan.filter((p) => p.cat === c);
  const parType = (l: Plan[]) => l.reduce<Record<string, number>>((a, p) => ({ ...a, [p.type]: (a[p.type] ?? 0) + 1 }), {});
  const resume = {
    credits_brevo: credits, depuis, posteurs_verifies: etats.length, lectures_brevo_en_erreur: erreursBrevo.length,
    categorie_1: parCat(1).length, categorie_2: parCat(2).length, categorie_3: parCat(3).length, categorie_3_par_email: parType(parCat(3)),
    total_personnes: new Set(plan.map((p) => p.poster_id)).size, ignores, rattrapage_sans_trace_brevo: rattrapageSansTrace, adresses_refusees: adressesRefusees, etats_brevo_vus: etatsVus,
  };
  if (body?.confirmer !== true) {
    return { ok: true, ...resume, liste: plan.map((p) => ({ cat: p.cat, prenom: p.prenom, email: p.email, type: p.type, poster_id: p.poster_id })) };
  }

  // L'envoi, par lots (max par appel) ; relancer l'action jusqu'à restants = 0 (les envoyés sont sautés).
  const max = Math.min(60, Math.max(1, Number(body?.max ?? 30)));
  const slack = await lienSlackInvitation(supabase);
  const parId = new Map(etats.map((e) => [e.poster_id, e]));
  const bilan: Record<string, unknown>[] = [];
  for (const p of plan.slice(0, max)) {
    const e = parId.get(p.poster_id)!;
    if (p.cat === 1) {
      const c = await contenuBrevo(p.message_id!);
      if ("erreur" in c) { bilan.push({ poster: p.poster_id, cat: 1, ok: false, erreur: c.erreur }); continue; }
      const r = await envoyerSuivi({ to: p.email, objet: c.objet, html: c.html, texte: texteDepuisHtml(c.html), stop: lienStopDansHtml(c.html) ?? URL_DASHBOARD_OS, tags: ["ruul", "rattrapage", "renvoi"] });
      await supabase.from("ruul_parcours_envois").upsert({ poster_id: p.poster_id, cle: `renvoi:${cleRattrapage}`, type: "rattrapage", ok: r.ok, canaux: r.ok ? ["email"] : [], erreur: r.erreur, envoye_at: new Date().toISOString() },
        { onConflict: "poster_id,cle" });
      bilan.push({ poster: p.poster_id, cat: 1, ok: r.ok, erreur: r.erreur });
      continue;
    }
    const type = p.type as TypeParcours;
    const numero = type === "ruul" ? 1 : undefined;
    bilan.push({ cat: p.cat, ...(await executer(supabase, e, { type, cle: `perdus:${type}`, numero }, slack, true)) });
  }
  return { ok: true, ...resume, envoyes: bilan.filter((b) => b.ok).length, erreurs: bilan.filter((b) => !b.ok), restants: Math.max(0, plan.length - max) };
}

// ---------------------------------------------------------------------------
// 0696 : les liens à usage unique des emails (pages /r/… du dashboard)
// ---------------------------------------------------------------------------

// Les pages /r/… (GET) et l'admin (POST, functions.invoke) : le preflight doit accepter les deux.
const CORS_LIEN: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, accept, x-cron-secret",
};

/**
 * a = done | password | stop. Sans confirme : vérifie seulement le jeton (la page demande « Are you sure? »).
 * Avec confirme : fait l'action, puis le jeton est consommé. Les textes vont tels quels au posteur (anglais).
 */
async function utiliserLien(supabase: Supabase, jeton: string, a: string, confirme: boolean): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(jeton) || !["done", "password", "stop"].includes(a)) return { ok: false, raison: "introuvable" };
  const { data: v, error } = await supabase.rpc("lien_posteur_utiliser", { p_jeton: jeton, p_action: a, p_lire: true });
  if (error) return { ok: false, raison: "erreur" };
  const lu = v as { ok: boolean; raison?: string; poster_id?: string };
  if (!lu.ok) return { ok: false, raison: lu.raison ?? "introuvable" };
  if (!confirme) return { ok: true, confirmer: true };
  const { data: pr } = await supabase.from("profiles").select("id, email, is_active, ruul_jeton").eq("id", lu.poster_id!).maybeSingle();
  if (!pr?.id) return { ok: false, raison: "introuvable" };
  let resultat: Record<string, unknown>;
  if (a === "done") {
    if (!pr.ruul_jeton) return { ok: false, raison: "erreur" };
    const { error: e } = await supabase.rpc("ruul_pret_jeton", { p_jeton: pr.ruul_jeton });
    if (e) return { ok: false, raison: "erreur" };
    resultat = { ok: true, fait: "done" };
  } else if (a === "stop") {
    if (!pr.ruul_jeton) return { ok: false, raison: "erreur" };
    const { data: d, error: e } = await supabase.rpc("ruul_arret_jeton", { p_jeton: pr.ruul_jeton });
    if (e || d !== true) return { ok: false, raison: "erreur" };
    resultat = { ok: true, fait: "stop" };
    await confirmerArret(supabase, pr.id).catch(() => null);
  } else {
    if (!pr.is_active) return { ok: false, raison: "introuvable" };
    const motDePasse = motDePasseRecrue();
    const { error: e } = await supabase.auth.admin.updateUserById(pr.id, { password: motDePasse });
    if (e) return { ok: false, raison: "erreur" };
    resultat = { ok: true, fait: "password", login: pr.email, mot_de_passe: motDePasse, dashboard: URL_DASHBOARD_OS };
  }
  await supabase.rpc("lien_posteur_utiliser", { p_jeton: jeton, p_action: a, p_lire: false });
  return resultat;
}

/** v2 : l'email court de confirmation après « I do not wish to continue » (une fois, sans lien d'arrêt). */
async function confirmerArret(supabase: Supabase, posterId: string) {
  if (await reglageTexte(supabase, "ruul_emails_v2") !== "on") return;
  const { data: p } = await supabase.from("profiles").select("prenom, ruul_email, email_perso, email").eq("id", posterId).maybeSingle();
  const to = p?.ruul_email || p?.email_perso;
  if (!to) return;
  const m = emailParcours("arret", {
    prenom: p?.prenom ?? null, login: p?.email ?? null, motDePasse: "", dashboard: URL_DASHBOARD_OS, handle: null, slack: "",
    cohorte_lundi: null, ruul_email: p?.ruul_email ?? null, abonnements: null,
  }, URL_DASHBOARD_OS);
  const r = rendreEmailRuul({ objet: m.objet, corps: m.corps, bouton: null, lienStop: URL_DASHBOARD_OS, sansPied: true, titre: "Vik Studios" });
  const env = await envoyerEmail(to, m.objet, r.html, r.texte, URL_DASHBOARD_OS, ["ruul", "parcours", "arret"]);
  await supabase.from("ruul_parcours_envois").upsert({ poster_id: posterId, cle: "arret", type: "arret", ok: env.ok, canaux: env.ok ? ["email"] : [], erreur: env.erreur, envoye_at: new Date().toISOString() },
    { onConflict: "poster_id,cle" });
}
