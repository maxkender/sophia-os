import { chargerBase, demanderAuCerveau, jetonSlackFaq, posterSlack } from "../_shared/faq_moteur.ts";
import { chargerSourcesSupport } from "../_shared/support_sources.ts";
import { CANAL_TICKETS, erreurTicket, promptContexte, texteTicket } from "../_shared/support_ticket.ts";
import { jetonValide, lireEmailsBrevo, texteReponseEmail } from "../_shared/email_entrant.ts";
import { avecLienMotDePasse, VAR_LIEN_MOT_DE_PASSE } from "../_shared/lien_mot_de_passe.ts";
import { envoyerEmailSite, rendreEmailRuul } from "../_shared/ruul.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import {
  CATEGORIES_PROBLEME,
  contexteTexte,
  estCategorie,
  type Fiche,
  ficheTexte,
  parleDeLAutrePlateforme,
  type Plateforme,
  TEXTE_ENVOYE_EQUIPE,
  texteAlerteMax,
  texteEmailReponse,
  lireVerdict,
  promptVerdict,
  texteProblemeRecu,
} from "../_shared/support.ts";
import { generateTextFast } from "../_shared/gemini.ts";
import {
  appliquerGardeFous, type DecisionBot, lireDecision, lireTop10, plainteSansDonnees, promptBot, promptTop10, signer, type SourceBot, testOk, TEXTE_ON_VERIFIE, type Top10,
  accuseReception, texteBugMax, texteListeAdrien, texteTop10,
} from "../_shared/bot_support.ts";
import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * support (0671) — l'espace support : « Help » côté posteur, « Support » côté admin.
 *
 *   { action: "question", texte, categorie? }            posteur
 *       Le bot répond tout de suite (Official answers de sa portée + sa fiche).
 *       Il ne sait pas, ou sa réponse parle de l'autre plateforme : la question
 *       part à l'équipe (Support › Questions).
 *   { action: "probleme", categorie, texte, capture? }   posteur
 *       L'OS tente d'abord seul (login : lien « Set my password » par email ;
 *       stop : la procédure d'arrêt existante), puis Support › Problems.
 *       Paiement : alerte Slack à Max tout de suite.
 *   { action: "repondre", id, texte }                     admin, Head of Ops
 *       La réponse part au posteur : dashboard + email (+ Slack s'il est relié) ;
 *       une question venue d'un salon Slack reçoit la réponse dans son fil.
 *   { action: "essai", poster_id, texte, type?, categorie? }   admin, cron
 *       Le bot sur un vrai posteur, sans rien écrire ni envoyer (réponse, brouillon, verdict).
 *   { action: "alertes" }                                 cron support-alertes (toutes les heures)
 *       Paiement pas encore signalé, compte Ruul / Upwork bloqué depuis 24 h : alerte à Max.
 */

const OS_URL = "https://sophia-marketing-orga.vercel.app";
/** L'ID Slack de Max (ADMINS_SLACK). */
const MAX_SLACK = "U0BL5FRLBEU";

type Db = ReturnType<typeof serviceClient>;

Deno.serve(async (request) => {
  // 12/11 (Max, point 10) : Brevo (inbound parsing) transmet les réponses des posteurs à nos emails.
  // Pas de JWT : un jeton dédié (EMAIL_ENTRANT_TOKEN, en-tête Authorization: Bearer).
  if (new URL(request.url).searchParams.get("entrant") === "brevo") {
    if (!jetonValide(request.headers.get("authorization"), Deno.env.get("EMAIL_ENTRANT_TOKEN"))) return json({ ok: false, error: "unauthorized" }, 401);
    try {
      return json(await emailsEntrants(serviceClient(), lireEmailsBrevo(await request.json().catch(() => null))));
    } catch (erreur) {
      console.error("[support] emails entrants", messageErreur(erreur));
      return json({ ok: false, error: messageErreur(erreur) }, 500);
    }
  }
  const acces = await assertRole(request, ["admin", "head_of_ops", "poster"]);
  if (acces instanceof Response) return acces;
  try {
    const body = await request.json().catch(() => ({}));
    const db = serviceClient();
    const admin = acces.role === "admin" || acces.role === "head_of_ops";
    switch (body?.action) {
      case "question":
        if (acces.role !== "poster") return json({ ok: false, error: "réservé aux posteurs" }, 403);
        return json(await poserQuestion(db, acces.userId, String(body.texte ?? ""), estCategorie(body.categorie) ? body.categorie : null));
      case "probleme":
        if (acces.role !== "poster") return json({ ok: false, error: "réservé aux posteurs" }, 403);
        return json(await signalerProbleme(db, acces.userId, String(body.categorie ?? ""), String(body.texte ?? ""), typeof body.capture === "string" ? body.capture : null));
      case "repondre":
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await repondre(db, acces.userId === "cron" ? null : acces.userId, String(body.id ?? ""), String(body.texte ?? "")));
      case "bot": {
        // 12/11 (Support propre) : le bot v2 en SIMULATION (page /admin/bot) : rien n'est envoyé, rien n'est écrit.
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        const message = String(body.message ?? "").trim();
        if (message.length < 1) return json({ ok: false, error: "message vide" }, 400);
        return json({
          ok: true, simulation: true,
          ...(await deciderBot(db, {
            message, source: body.source === "slack_salon" ? "slack_salon" : "help",
            poster: typeof body.poster_id === "string" && body.poster_id ? body.poster_id : null,
            profil: body.profil && typeof body.profil === "object" ? body.profil as ProfilFictif : null,
          })),
        });
      }
      case "tests_lancer":
        // 12/11 : les tests du bot (bot_tests), en simulation ; seul le résultat du test est écrit.
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await lancerTests(db, Array.isArray(body.ids) ? body.ids.map(String) : null));
      case "essai": {
        // 12/11 : le bot sur un vrai posteur, sans rien écrire ni envoyer (admin, cron) : sa réponse, son brouillon, son verdict.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        const poster = String(body.poster_id ?? "");
        const texte = String(body.texte ?? "").trim();
        if (!poster || texte.length < 3) return json({ ok: false, error: "poster_id et texte requis" }, 400);
        const [f, ctx] = await Promise.all([fiche(db, poster), contexte(db, poster)]);
        const probleme = body.type === "probleme";
        const categorie = String(body.categorie ?? "autre");
        const v = probleme ? await verifier(categorie, texte, f, ctx) : null;
        const b = await cerveau(db, f, probleme ? questionProbleme(categorie, texte, v) : texte, ctx);
        return json({
          ok: true, plateforme: f?.plateforme ?? null, contexte_caracteres: ctx.length,
          reponse_posteur: probleme ? null : (b.sur ? b.reponse : TEXTE_ENVOYE_EQUIPE),
          envoye_equipe: probleme || !b.sur, decision: b.decision, brouillon: b.brouillon, verdict: v,
        });
      }
      case "alertes":
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await alertes(db));
      case "trier":
        // 12/11 : une demande venue du bouton Slack « I need help » : son niveau (Adrien, ou Max avec l'alerte).
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        return json(await trierDemande(db, String(body.id ?? "")));
      case "messages_traiter":
        // 12/11 (0675) : les messages des posteurs rangés en « autre » passent par le bot v2 (cron */15).
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        return json(await messagesTraiter(db));
      case "liste_adrien":
        // 12/11 (0675) : la liste du soir d'Adrien (21 h Paris ; le cron passe à 19 h et 20 h UTC).
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        if (!body.forcer && heureParis() !== 21) return json({ ok: true, ignore: "pas 21 h à Paris" });
        return json(await listeAdrien(db));
      case "top10_lundi":
        // 12/11 (0675) : lundi 8 h Paris, les 10 questions sans réponse de la semaine et une réponse proposée.
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        if (!body.forcer && heureParis() !== 8) return json({ ok: true, ignore: "pas 8 h à Paris" });
        return json(await top10Lundi(db, body.envoyer !== false));
      case "ticket":
        // 12/11 (Max) : « Envoyer en ticket à l'OS » depuis la Boîte → #a-os-tickets (l'IT guy le traite).
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await envoyerTicket(db, acces.userId === "cron" ? null : acces.userId, String(body.id ?? ""), typeof body.note === "string" ? body.note : null));
      case "contexte":
        // 12/11 (Max) : « Avoir le contexte » : l'analyse de tout ce que l'OS sait sur le posteur. Ne fait que lire.
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await analyserContexte(db, String(body.id ?? "")));
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (erreur) {
    console.error("[support]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

async function fiche(db: Db, poster: string): Promise<Fiche | null> {
  const { data, error } = await db.rpc("support_fiche", { p_poster: poster });
  if (error) throw new Error(`fiche : ${error.message}`);
  return (data ?? null) as Fiche | null;
}

/** 0673 : tout ce que l'OS sait du posteur (messages Upwork et Slack, envois de l'OS, paie, milestones, posts). Ne lève pas. */
async function contexte(db: Db, poster: string): Promise<string> {
  // 0682 : + ses demandes Help et nos réponses, les décisions, ses posts récents, le dernier import Ruul.
  const [base, plus] = await Promise.all([
    db.rpc("support_contexte", { p_poster: poster }),
    db.rpc("support_contexte_plus", { p_poster: poster }),
  ]);
  if (base.error) console.warn(`[support] contexte : ${base.error.message}`);
  if (plus.error) console.warn(`[support] contexte_plus : ${plus.error.message}`);
  if (base.error && plus.error) return "";
  return contexteTexte({ ...((plus.data ?? {}) as Record<string, unknown>), ...((base.data ?? {}) as Record<string, unknown>) });
}

/** Le bot sur une question (ou un problème, pour le brouillon de l'équipe). Ne lève pas. */
async function cerveau(db: Db, f: Fiche | null, texte: string, ctx = "") {
  const plateforme: Plateforme = f?.plateforme === "ruul" ? "ruul" : "upwork";
  try {
    const charge = await chargerBase(db, "poster", plateforme);
    const live = ctx ? `${ficheTexte(f)}\n\n${ctx}` : ficheTexte(f);
    const r = await demanderAuCerveau({ canal: "os", role: "poster", question: texte, base: charge.base, live, langueRepli: "English" });
    const reponse = r.decision === "repondu" && r.section ? `${r.reponse}\n\n📖 ${r.section}` : r.reponse;
    // Une réponse qui parle de l'autre plateforme ne part jamais : elle va à l'équipe, en brouillon.
    const sur = r.decision === "repondu" && !!reponse && !parleDeLAutrePlateforme(reponse, plateforme);
    return { sur, reponse, brouillon: r.proposition || r.reponse || null, decision: r.decision, plateforme };
  } catch (erreur) {
    console.warn(`[support] bot indisponible : ${messageErreur(erreur)}`);
    return { sur: false, reponse: "", brouillon: null, decision: "erreur", plateforme };
  }
}

async function poserQuestion(db: Db, poster: string, texte: string, categorie: string | null) {
  texte = texte.trim();
  if (texte.length < 3) return { ok: false, error: "Please write your question." };
  // 12/11 (Support propre) : le bot v2 répond à tout ; il ne passe la main qu'à Adrien ou Max.
  const r = await deciderBot(db, { message: texte, source: "help", poster, profil: null });
  const d = r.decision;
  const regle = d.niveau === "bot";
  const action = regle && d.action ? await executerAction(db, poster, d, texte) : null;
  const { data, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "question", categorie: categorie ?? d.categorie, texte, bot_reponse: r.texte, bot_decision: d.niveau,
      brouillon: regle || d.reponse === TEXTE_ON_VERIFIE ? null : d.reponse, escalader: !regle,
    },
  });
  if (error) throw new Error(`support_ajouter : ${error.message}`);
  const id = (data as { id: string })?.id ?? null;
  if (id) await noterDecision(db, id, d, action, r.regle_utilisee);
  if (id && d.niveau === "max") await alerterMax(db, id, { nom: (await fiche(db, poster))?.nom ?? "?", plateforme: r.plateforme ?? "upwork", categorie: d.categorie, texte, raison: "urgent", os: d.raison, action: d.reponse });
  return { ok: true, id, reponse: r.texte, envoye_equipe: !regle };
}

/** La décision du bot sur la demande : niveau, risque, action faite, règle, raison, langue. */
async function noterDecision(db: Db, id: string, d: DecisionBot, action: string | null, regle: string | null) {
  await db.from("support_demandes").update({
    niveau: d.niveau, risque: d.risque, action_faite: action, regle, raison: d.raison, langue: d.langue,
  }).eq("id", id);
}

/**
 * L'action du bot, en vrai (jamais en simulation). Les seules écritures sur une fiche posteur
 * permises par Max : pseudo TikTok, email Ruul ; plus le lien de mot de passe, le renvoi d'un
 * parrainage et la procédure d'arrêt existante. Rend ce qui a été fait (ou pourquoi rien).
 */
async function executerAction(db: Db, poster: string, d: DecisionBot, message = ""): Promise<string> {
  try {
    switch (d.action) {
      case "lien_mot_de_passe":
        return `lien de mot de passe : ${await envoyerLienMotDePasse(db, poster, null)}`;
      case "pseudo_tiktok": {
        const handle = (d.action_valeur ?? "").replace(/^@/, "").trim();
        if (!/^[a-z0-9._]{2,30}$/i.test(handle)) return "pseudo TikTok invalide : rien changé";
        const { data: c } = await db.from("comptes").select("id, handle_tiktok").eq("poster_id", poster).eq("is_active", true)
          .eq("type_compte", "perso").order("created_at").limit(1).maybeSingle();
        if (!c) return "aucun compte actif : rien changé";
        const { error } = await db.from("comptes").update({ handle_tiktok: handle }).eq("id", c.id);
        return error ? `pseudo TikTok : ${error.message}` : `pseudo TikTok : @${c.handle_tiktok ?? "?"} → @${handle}`;
      }
      case "email_ruul": {
        const email = (d.action_valeur ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email Ruul invalide : rien changé";
        const { error } = await db.from("profiles").update({ ruul_email: email }).eq("id", poster).eq("canal_paie", "ruul");
        return error ? `email Ruul : ${error.message}` : `email Ruul corrigé : ${email}`;
      }
      case "arret": {
        const { error } = await db.from("posteur_reponses").insert({ poster_id: poster, canal: "bouton", source_id: `support:${crypto.randomUUID()}`, texte: "I want to stop" });
        return error ? `arrêt : ${error.message}` : "arrêt transmis à la procédure d'arrêt";
      }
      case "renvoi_parrainage": {
        const { data, error } = await db.from("parrainage_invitations").update({ prochain_at: new Date().toISOString() })
          .eq("parrain_id", poster).eq("statut", "en_cours").lt("envois", 3).select("id");
        return error ? `parrainage : ${error.message}` : `parrainage : ${(data ?? []).length} invitation(s) renvoyée(s) au prochain passage`;
      }
      case "lien_slack":
        return "lien Slack donné";
      case "prevenir_max": {
        // 12/11 : un bug du dashboard couvert par le catalogue : le posteur a le contournement, Max un DM.
        const jeton = jetonSlackFaq();
        if (!jeton) return "Max pas prévenu : jeton Slack absent";
        const f = await fiche(db, poster);
        const r = await posterSlack(jeton, MAX_SLACK, texteBugMax({
          nom: f?.nom ?? "?", plateforme: f?.plateforme === "ruul" ? "ruul" : "upwork", message, reponse: d.reponse, raison: d.raison,
        }, OS_URL));
        return r.ok ? "Max prévenu (bug)" : `Max pas prévenu : ${r.error}`;
      }
      default:
        return "aucune action";
    }
  } catch (erreur) {
    return `action : ${messageErreur(erreur)}`;
  }
}

async function signalerProbleme(db: Db, poster: string, categorie: string, texte: string, capture: string | null) {
  texte = texte.trim();
  if (!(CATEGORIES_PROBLEME as readonly string[]).includes(categorie)) return { ok: false, error: "Please choose a category." };
  if (texte.length < 3) return { ok: false, error: "Please tell us what happens." };
  const [f, ctx] = await Promise.all([fiche(db, poster), contexte(db, poster)]);
  const plateforme: Plateforme = f?.plateforme === "ruul" ? "ruul" : "upwork";

  // L'OS tente d'abord seul.
  let auto: "lien_envoye" | "arret" | null = null;
  let autoAction: string | null = null;
  let autoResultat: string | null = null;
  if (categorie === "connexion") {
    autoAction = "lien_mot_de_passe";
    autoResultat = await envoyerLienMotDePasse(db, poster, f?.nom ?? null);
    if (autoResultat === "envoyé") auto = "lien_envoye";
  } else if (categorie === "arret") {
    // La procédure d'arrêt existante : le message entre dans les réponses des posteurs (classé stop / pause).
    autoAction = "procedure_arret";
    const { error } = await db.from("posteur_reponses").insert({ poster_id: poster, canal: "slack", source_id: `support:${crypto.randomUUID()}`, texte });
    autoResultat = error ? `erreur : ${error.message}` : "transmis à la procédure d'arrêt";
    if (!error) auto = "arret";
  }

  // Paiement : le verdict d'abord (faits vérifiés) ; Max seulement si les données montrent le problème.
  // Le reste : le bot v2 décide (bot / Adrien / Max) et répond s'il peut.
  let v: Awaited<ReturnType<typeof verifier>> = null;
  let brouillon: string | null = null;
  let reponseBot: string | null = null;
  let d: DecisionBot | null = null;
  let niveau: "bot" | "adrien" | "max";
  if (categorie === "paiement") {
    v = await verifier(categorie, texte, f, ctx);
    const b = await cerveau(db, f, questionProbleme(categorie, texte, v), ctx);
    brouillon = b.brouillon;
    niveau = v?.verdict === "probleme_confirme" ? "max" : v?.verdict === "pas_de_probleme" && b.sur ? "bot" : "adrien";
    if (niveau === "bot") reponseBot = signer(b.reponse);
  } else {
    const r = await deciderBot(db, { message: `[${categorie}] ${texte}`, source: "help", poster, profil: null });
    d = r.decision;
    niveau = auto ? "bot" : d.niveau;
    brouillon = d.reponse === TEXTE_ON_VERIFIE ? null : d.reponse;
    if (niveau === "bot" && !auto) reponseBot = r.texte;
  }
  const recu = reponseBot ?? texteProblemeRecu(categorie, auto);
  const { data, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "probleme", categorie, texte, capture, escalader: niveau !== "bot", brouillon,
      auto_action: autoAction, auto_resultat: autoResultat,
    },
  });
  if (error) throw new Error(`support_ajouter : ${error.message}`);
  const res = data as { id: string; fusion: boolean };
  // Le message de l'OS dans le fil (le posteur le voit sous son problème).
  if (res?.id && !res.fusion) await db.from("support_messages").insert({ demande_id: res.id, auteur: "bot", texte: recu });
  if (res?.id && v) {
    await db.from("support_demandes").update({ verdict: v.verdict, verdict_texte: v.phrase }).eq("id", res.id);
  }
  if (res?.id && auto === "lien_envoye") {
    await db.from("support_demandes").update({ statut: "attente_posteur", maj_at: new Date().toISOString() }).eq("id", res.id);
  }
  if (res?.id) {
    const action = niveau === "bot" && d?.action && !auto ? await executerAction(db, poster, d, texte) : autoResultat;
    await db.from("support_demandes").update({
      niveau, risque: d?.risque ?? [], action_faite: action, raison: d?.raison ?? v?.phrase ?? null, langue: d?.langue ?? null,
      ...(niveau === "bot" ? { statut: "bot" } : {}),
    }).eq("id", res.id);
  }
  if (res?.id && niveau === "max") {
    await alerterMax(db, res.id, {
      nom: f?.nom ?? "?", plateforme, categorie, texte, raison: categorie === "paiement" ? "paiement" : "urgent",
      os: v?.phrase ?? d?.raison ?? null, action: brouillon,
    });
  }
  return { ok: true, id: res?.id ?? null, reponse: recu };
}

/** Ce que le bot reçoit pour un problème : le message du posteur et, s'il existe, le verdict (les faits à donner). */
function questionProbleme(categorie: string, texte: string, v: { phrase: string } | null): string {
  return v
    ? `PROBLÈME signalé (${categorie}) : ${texte}\nFAITS VÉRIFIÉS DANS LES DONNÉES : ${v.phrase}\nRéponds au posteur avec ces faits (dates, montants), simplement.`
    : `PROBLÈME signalé (${categorie}) : ${texte}`;
}

/** 0673 : le verdict du bot (problème confirmé, pas de problème, incertain) et sa phrase pour l'équipe. Ne lève pas. */
async function verifier(categorie: string, texte: string, f: Fiche | null, ctx: string) {
  try {
    const prompt = promptVerdict({ categorie, texte, fiche: ficheTexte(f), contexte: ctx });
    for (let essai = 0; essai < 2; essai++) {
      const v = lireVerdict(await generateTextFast(prompt));
      if (v) return v;
    }
  } catch (erreur) {
    console.warn(`[support] verdict : ${messageErreur(erreur)}`);
  }
  return null;
}

async function contactPosteur(db: Db, poster: string) {
  const [{ data: p }, { data: h }] = await Promise.all([
    db.from("profiles").select("prenom, email, email_perso, slack_user_id").eq("id", poster).maybeSingle(),
    db.from("hub_posteurs").select("email_perso").eq("profile_id", poster).maybeSingle(),
  ]);
  return {
    prenom: (p?.prenom as string | null) ?? null,
    email: (h?.email_perso as string | null) || (p?.email_perso as string | null) || (p?.email as string | null) || null,
    slack: (p?.slack_user_id as string | null) ?? null,
  };
}

async function envoyerLienMotDePasse(db: Db, poster: string, nom: string | null): Promise<string> {
  const c = await contactPosteur(db, poster);
  if (!c.email) return "pas d'email connu";
  const lien = await avecLienMotDePasse(db, poster, VAR_LIEN_MOT_DE_PASSE, OS_URL, "support:connexion");
  if (lien.erreur) return lien.erreur;
  const objet = "Set a new password for your Sophia dashboard";
  const e = rendreEmailRuul({
    objet,
    corps: `Hi ${c.prenom || nom || "there"},\n\nYou told us you can't log in. Use this button to set a new password (the link works once, for 14 days).`,
    bouton: { texte: "Set my password", lien: lien.texte },
    lienStop: OS_URL,
  });
  const r = await envoyerEmailSite(c.email, objet, e.html, e.texte, OS_URL, ["support", "mot_de_passe"]);
  return r.ok ? "envoyé" : `email : ${r.erreur}`;
}

async function repondre(db: Db, auteur: string | null, id: string, texte: string) {
  texte = texte.trim();
  if (!id || texte.length < 1) return { ok: false, error: "réponse vide" };
  const { data: d, error } = await db.from("support_demandes").select("id, poster_id, source, slack_canal, slack_ts, statut").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!d) return { ok: false, error: "demande introuvable" };

  const envois: Record<string, string> = {};
  // Une question venue d'un salon Slack : la réponse repart dans son fil.
  if (d.source === "slack_salon" && d.slack_canal && d.slack_ts) {
    const jeton = jetonSlackFaq();
    const r = jeton ? await posterSlack(jeton, d.slack_canal, texte, d.slack_ts) : { ok: false, error: "jeton Slack absent" };
    envois.slack_fil = r.ok ? "ok" : `erreur : ${r.error}`;
  }
  if (d.poster_id) {
    const c = await contactPosteur(db, d.poster_id);
    if (c.email) {
      const m = texteEmailReponse(c.prenom, texte, OS_URL);
      const e = rendreEmailRuul({ objet: m.objet, corps: m.corps, bouton: { texte: "Open Help", lien: m.lien }, lienStop: OS_URL });
      const r = await envoyerEmailSite(c.email, m.objet, e.html, e.texte, OS_URL, ["support", "reponse"]);
      envois.email = r.ok ? "ok" : `erreur : ${r.erreur}`;
    } else {
      envois.email = "pas d'email";
    }
    if (c.slack && d.source !== "slack_salon") {
      // 0684 : une réponse à sa demande (pas une relance) : part malgré un STOP.
      const r = await ecrireAuPosteur(db, d.poster_id, `The team answered your request:\n\n${texte}\n\nReply from Help on your dashboard: ${OS_URL}/createur/help`, fetch, undefined, { malgreStop: "reponse" });
      envois.slack = r.statut === "envoye" ? "ok" : `erreur : ${"erreur" in r ? r.erreur : r.statut}`;
    }
  }
  const maintenant = new Date().toISOString();
  const { error: e1 } = await db.from("support_messages").insert({ demande_id: id, auteur: "equipe", auteur_id: auteur, texte, envois });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await db.from("support_demandes").update({ statut: "attente_posteur", equipe_at: maintenant, maj_at: maintenant }).eq("id", id);
  if (e2) throw new Error(e2.message);
  return { ok: true, envois };
}

async function alerterMax(
  db: Db,
  id: string,
  d: Parameters<typeof texteAlerteMax>[0],
): Promise<boolean> {
  const jeton = jetonSlackFaq();
  if (!jeton) return false;
  const r = await posterSlack(jeton, MAX_SLACK, texteAlerteMax(d, OS_URL));
  if (r.ok) await db.from("support_demandes").update({ alerte_at: new Date().toISOString() }).eq("id", id);
  else console.error("[support] alerte Max", r.error);
  return r.ok;
}

/** Toutes les heures : paiement pas encore signalé, compte bloqué depuis plus de 24 h. */
async function alertes(db: Db) {
  const il24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data, error } = await db.from("support_demandes")
    .select("id, poster_id, categorie, plateforme, texte, escalade_at")
    .eq("statut", "ouvert").eq("type", "probleme").is("alerte_at", null)
    // 12/11 (Support propre) : Max n'est alerté que pour le niveau « max » (paiement / urgent).
    .eq("niveau", "max")
    .or(`categorie.eq.paiement,and(categorie.eq.compte,escalade_at.lt.${il24h})`)
    .limit(50);
  if (error) throw new Error(error.message);
  let envoyees = 0;
  for (const d of data ?? []) {
    const { data: p } = d.poster_id
      ? await db.from("profiles").select("prenom, nom, email").eq("id", d.poster_id).maybeSingle()
      : { data: null };
    const nom = [p?.prenom, p?.nom].filter(Boolean).join(" ") || p?.email || "?";
    if (await alerterMax(db, d.id, {
      nom, plateforme: d.plateforme === "ruul" ? "ruul" : "upwork", categorie: d.categorie, texte: d.texte,
      raison: d.categorie === "paiement" ? "paiement" : "compte_24h",
    })) envoyees++;
  }
  return { ok: true, alertes: envoyees };
}

// ---------------------------------------------------------------------------
// Bot v2 « Support propre » (12/11) : la décision (catégorie, réponse, action, niveau, risque).
// ---------------------------------------------------------------------------

/** Un faux posteur pour le bac à sable (/admin/bot). */
interface ProfilFictif {
  plateforme?: "ruul" | "upwork";
  zone?: string;
  etape?: string;
  statut?: string;
  prenom?: string;
}

const LIEN_HELP = `${OS_URL}/createur/help`;

function ficheFictive(p: ProfilFictif): string {
  return [
    `Posteur FICTIF (test) : ${p.prenom ?? "Alex"}. Plateforme de paie : ${p.plateforme === "ruul" ? "Ruul" : "Upwork"}.`,
    p.plateforme === "ruul"
      ? "RÈGLE : ce posteur est payé par Ruul. Ne parle JAMAIS d'Upwork (ni contrat, ni milestone, ni message Upwork)."
      : "RÈGLE : ce posteur est payé par Upwork. Ne parle JAMAIS de Ruul.",
    `Zone : ${p.zone ?? "?"}. Étape : ${p.etape ?? "?"}. Statut : ${p.statut ?? "actif"}.`,
  ].join("\n");
}

async function deciderBot(
  db: Db,
  o: {
    message: string;
    source: SourceBot;
    poster: string | null;
    profil: ProfilFictif | null;
    /** 0683 : un test peut simuler des demandes passées (cas « même question pour la 3e fois »). */
    historique?: { cree_at: string; categorie: string | null; texte: string; bot_reponse: string | null }[] | null;
  },
) {
  const fictif = !o.poster && o.profil;
  const [f, ctx, infos, histo] = await Promise.all([
    o.poster ? fiche(db, o.poster) : Promise.resolve(null),
    o.poster ? contexte(db, o.poster) : Promise.resolve(""),
    db.from("support_infos").select("titre, valeur").order("ordre").limit(100),
    o.historique?.length
      ? Promise.resolve({ data: o.historique })
      : o.poster
      ? db.from("support_demandes").select("cree_at, categorie, texte, bot_reponse").eq("poster_id", o.poster).order("cree_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as { cree_at: string; categorie: string | null; texte: string; bot_reponse: string | null }[] }),
  ]);
  const plateforme: "ruul" | "upwork" | null = f?.plateforme ?? (fictif ? (o.profil!.plateforme === "ruul" ? "ruul" : "upwork") : null);
  // 0680 : consignes, catalogue et documents lus exactement là où Support les montre.
  const sources = await chargerSourcesSupport(db, { plateforme, poster: o.poster });
  const entree = {
    message: o.message,
    source: o.source,
    plateforme,
    fiche: f ? ficheTexte(f) : fictif ? ficheFictive(o.profil!) : "Fiche : personne introuvable dans l'OS.",
    contexte: ctx,
    infos: (infos.data ?? []) as { titre: string; valeur: string }[],
    catalogue: sources.catalogue,
    historique: ((histo.data ?? []) as { cree_at: string; categorie: string | null; texte: string; bot_reponse: string | null }[]),
    inconnu: !f && !fictif,
    consignes: sources.consignes,
    documents: sources.documents,
  };
  let decision: DecisionBot | null = null;
  try {
    const prompt = promptBot(entree);
    for (let essai = 0; essai < 2 && !decision; essai++) decision = lireDecision(await generateTextFast(prompt));
  } catch (erreur) {
    console.warn(`[support] bot v2 : ${messageErreur(erreur)}`);
  }
  if (!decision) {
    decision = { langue: "en", categorie: "autre", personnel: false, reponse: TEXTE_ENVOYE_EQUIPE, action: null, action_valeur: null,
      niveau: "adrien", regle: null, risque: [], raison: "Le modèle n'a pas répondu : la demande va à Adrien." };
  }
  const nbMemeSujet = entree.historique.filter((h) => h.categorie && h.categorie === decision!.categorie).length;
  const finale = appliquerGardeFous(decision, { source: o.source, plateforme, lienHelp: LIEN_HELP, nbMemeSujet });
  // 0683 : pas payé + aucune paie connue (contrat pas relié, milestones illisibles) → on vérifie, Max tranche.
  if (o.source === "help" && f && plainteSansDonnees(o.message, plateforme, !f.derniere_paie) && finale.niveau !== "max") {
    finale.niveau = "max";
    finale.reponse = TEXTE_ON_VERIFIE;
    finale.raison = `${finale.raison} (plainte de paie sans paie connue dans l'OS : à Max)`.trim();
  }
  const regle = finale.regle ? (entree.catalogue.find((c) => c.id === finale.regle)?.question ?? finale.regle) : null;
  return {
    decision: finale,
    texte: signer(finale.reponse),
    regle_utilisee: regle,
    plateforme,
    action_prevue: finale.action ? { action: finale.action, valeur: finale.action_valeur, executee: false } : null,
    // 0683 (Tester) : ce que le bot a lu avant de répondre, pour voir tout de suite ce qui lui manquait.
    lu: {
      fiche: entree.fiche,
      donnees: entree.contexte ? entree.contexte.slice(0, 6000) : "",
      consignes: entree.consignes,
      regles: entree.infos.map((i) => i.titre),
      documents: (entree.documents ?? []).map((d) => d.titre),
      catalogue: entree.catalogue.length,
      demandes_passees: entree.historique.length,
      meme_sujet: nbMemeSujet,
    },
  };
}

async function lancerTests(db: Db, ids: string[] | null) {
  let q = db.from("bot_tests").select("id, message, poster_id, profil, source, attendu_niveau, attendu_contient, attendu_action, historique").eq("actif", true);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q.order("cree_at").limit(60);
  if (error) throw new Error(error.message);
  const resultats: { id: string; ok: boolean; niveau: string; reponse: string; action: string | null }[] = [];
  // 4 à la fois : le modèle répond en quelques secondes.
  const liste = (data ?? []) as { id: string; message: string; poster_id: string | null; profil: ProfilFictif | null; source: SourceBot;
    attendu_niveau: string | null; attendu_contient: string[]; attendu_action: string | null;
    historique: { cree_at: string; categorie: string | null; texte: string; bot_reponse: string | null }[] | null }[];
  for (let i = 0; i < liste.length; i += 4) {
    await Promise.all(liste.slice(i, i + 4).map(async (t) => {
      const r = await deciderBot(db, { message: t.message, source: t.source, poster: t.poster_id, profil: t.profil, historique: t.historique });
      const ok = testOk(r.decision, t);
      resultats.push({ id: t.id, ok, niveau: r.decision.niveau, reponse: r.texte, action: r.decision.action });
      await db.from("bot_tests").update({ dernier: r, dernier_ok: ok, dernier_at: new Date().toISOString() }).eq("id", t.id);
    }));
  }
  return { ok: true, total: resultats.length, verts: resultats.filter((r) => r.ok).length, resultats };
}

// ---------------------------------------------------------------------------
// 0675 : mise en ligne (messages repris, liste d'Adrien, top 10 du lundi).
// ---------------------------------------------------------------------------


function heureParis(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(d));
}

interface SourceProbleme { type?: string; canal?: string; texte?: string; ref?: string }

/**
 * Les messages des posteurs que le tri range en « autre » (Upwork, Slack) : la carte est fermée
 * (0675) et le bot v2 s'en occupe. Niveau bot : il répond (Slack s'il est relié, sinon email).
 * Adrien / Max : la demande entre dans Support (une par personne et par sujet).
 */
async function messagesTraiter(db: Db) {
  const depuis = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const { data, error } = await db.from("problemes").select("id, poster_id, sources, created_at")
    .eq("ferme_raison", "tri_support").eq("categorie", "autre").not("poster_id", "is", null)
    .gte("created_at", depuis).order("created_at").limit(40);
  if (error) throw new Error(error.message);
  const cartes = (data ?? []) as { id: string; poster_id: string; sources: SourceProbleme[] | null }[];
  if (!cartes.length) return { ok: true, traites: 0 };
  const { data: faits } = await db.from("support_demandes").select("probleme_id").in("probleme_id", cartes.map((c) => c.id));
  const deja = new Set((faits ?? []).map((f) => f.probleme_id as string));
  const resultats: { probleme: string; niveau: string; envoi: string }[] = [];
  for (const c of cartes) {
    if (deja.has(c.id) || resultats.length >= 15) continue;
    const src = (c.sources ?? []).filter((x) => x.type === "reponse" || x.type === "slack");
    const texte = src.map((x) => x.texte ?? "").filter(Boolean).join("\n").trim();
    if (!texte || accuseReception(texte)) continue;
    const r = await deciderBot(db, { message: texte, source: "help", poster: c.poster_id, profil: null });
    const d = r.decision;
    const parBot = d.niveau === "bot" && d.reponse !== TEXTE_ON_VERIFIE;
    let envoi = "rien";
    let action: string | null = null;
    if (parBot) {
      action = d.action ? await executerAction(db, c.poster_id, d, texte) : null;
      envoi = await envoyerAuPosteur(db, c.poster_id, r.texte);
    }
    const { data: aj, error: e } = await db.rpc("support_ajouter", {
      p: {
        poster_id: c.poster_id, type: "question", categorie: d.categorie, texte, bot_reponse: parBot ? r.texte : null,
        bot_decision: d.niveau, brouillon: parBot || d.reponse === TEXTE_ON_VERIFIE ? null : d.reponse, escalader: !parBot,
      },
    });
    if (e) {
      resultats.push({ probleme: c.id, niveau: d.niveau, envoi: `support_ajouter : ${e.message}` });
      continue;
    }
    const id = (aj as { id: string })?.id ?? null;
    if (id) {
      await db.from("support_demandes").update({
        probleme_id: c.id, niveau: parBot ? "bot" : d.niveau, risque: d.risque, action_faite: action, regle: r.regle_utilisee,
        raison: `${d.raison} (message ${src[0]?.canal ?? src[0]?.type ?? "?"} repris ; réponse : ${envoi})`, langue: d.langue,
      }).eq("id", id);
      if (d.niveau === "max") {
        const f = await fiche(db, c.poster_id);
        await alerterMax(db, id, {
          nom: f?.nom ?? "?", plateforme: f?.plateforme === "ruul" ? "ruul" : "upwork", categorie: d.categorie, texte, raison: "urgent",
          os: d.raison, action: d.reponse,
        });
      }
    }
    resultats.push({ probleme: c.id, niveau: parBot ? "bot" : d.niveau, envoi });
  }
  return { ok: true, traites: resultats.length, resultats };
}

/** La réponse du bot au posteur : Slack s'il est relié, sinon email. */
async function envoyerAuPosteur(db: Db, poster: string, texte: string): Promise<string> {
  const c = await contactPosteur(db, poster);
  if (c.slack) {
    const r = await ecrireAuPosteur(db, poster, texte, fetch, undefined, { malgreStop: "reponse" });
    if (r.statut === "envoye") return "slack";
  }
  if (!c.email) return "aucun canal";
  const m = texteEmailReponse(c.prenom, texte, OS_URL);
  const e = rendreEmailRuul({ objet: m.objet, corps: m.corps, bouton: { texte: "Open Help", lien: m.lien }, lienStop: OS_URL });
  const r = await envoyerEmailSite(c.email, m.objet, e.html, e.texte, OS_URL, ["support", "bot"]);
  return r.ok ? "email" : `email : ${r.erreur}`;
}

/** La liste du soir d'Adrien : ses demandes ouvertes, la plus ancienne d'abord. */
async function listeAdrien(db: Db) {
  const { data, error } = await db.from("support_demandes")
    .select("id, poster_id, categorie, plateforme, texte, raison, cree_at, statut")
    .eq("niveau", "adrien").in("statut", ["ouvert", "attente_posteur"]).order("cree_at").limit(60);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as { id: string; poster_id: string | null; categorie: string | null; plateforme: string; texte: string; raison: string | null; cree_at: string; statut: string }[];
  const ids = [...new Set(lignes.map((l) => l.poster_id).filter(Boolean))] as string[];
  const { data: profils } = ids.length ? await db.from("profiles").select("id, prenom, nom, email").in("id", ids) : { data: [] };
  const noms = new Map((profils ?? []).map((p) => [p.id as string, [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string) || "?"]));
  const texte = texteListeAdrien(lignes.map((l) => ({
    nom: l.poster_id ? noms.get(l.poster_id) ?? "?" : "?", plateforme: l.plateforme, categorie: l.categorie, texte: l.texte,
    attente: l.statut === "attente_posteur", heures: Math.round((Date.now() - Date.parse(l.cree_at)) / 3_600_000),
  })), OS_URL);
  // 12/11 (OS clair) : pas de DM Slack à Adrien ; sa liste est dans Support › Boîte › Pour Adrien.
  return { ok: true, total: lignes.length, texte };
}

/** Lundi : les 10 questions de la semaine que le bot n'a pas réglées, groupées, avec une réponse proposée. */
async function top10Lundi(db: Db, envoyer: boolean) {
  const depuis = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const [{ data, error }, { data: infos }] = await Promise.all([
    db.from("support_demandes").select("texte, categorie, plateforme").neq("niveau", "bot").is("regle", null)
      .gte("cree_at", depuis).order("cree_at", { ascending: false }).limit(200),
    db.from("support_infos").select("titre, valeur").order("ordre").limit(100),
  ]);
  if (error) throw new Error(error.message);
  const questions = (data ?? []) as { texte: string; categorie: string | null; plateforme: string }[];
  if (!questions.length) return { ok: true, top: [] };
  const prompt = promptTop10(questions.map((q) => `[${q.plateforme}${q.categorie ? `, ${q.categorie}` : ""}] ${q.texte.slice(0, 300)}`),
    ((infos ?? []) as { titre: string; valeur: string }[]));
  let top: Top10[] = [];
  try {
    top = lireTop10(await generateTextFast(prompt));
  } catch (erreur) {
    return { ok: false, error: `modèle : ${messageErreur(erreur)}` };
  }
  const texte = texteTop10(top, OS_URL);
  if (!envoyer) return { ok: true, top, texte };
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent", top };
  // 12/11 (OS clair) : à Max seulement, pas de DM à Adrien.
  const envoi = await posterSlack(jeton, MAX_SLACK, texte);
  return { ok: envoi.ok, top };
}

/**
 * Une demande déjà dans Support (bouton Slack « I need help ») : le niveau, sans répondre au posteur
 * (Slack lui a déjà dit que l'équipe regarde). Paiement : le verdict décide (Max si les données
 * montrent le problème) ; le reste : le bot v2 (jamais moins qu'Adrien ici).
 */
async function trierDemande(db: Db, id: string) {
  if (!id) return { ok: false, error: "id requis" };
  const { data: dem, error } = await db.from("support_demandes").select("id, poster_id, categorie, plateforme, texte, niveau, brouillon").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!dem?.poster_id) return { ok: false, error: "demande introuvable" };
  if (dem.niveau) return { ok: true, niveau: dem.niveau, deja: true };
  const [f, ctx] = await Promise.all([fiche(db, dem.poster_id), contexte(db, dem.poster_id)]);
  let niveau: "adrien" | "max" = "adrien";
  let os: string | null = null;
  let brouillon: string | null = dem.brouillon;
  let maj: Record<string, unknown> = {};
  if (dem.categorie === "paiement") {
    const v = await verifier("paiement", dem.texte, f, ctx);
    const b = await cerveau(db, f, questionProbleme("paiement", dem.texte, v), ctx);
    niveau = v?.verdict === "probleme_confirme" ? "max" : "adrien";
    os = v?.phrase ?? null;
    brouillon = brouillon ?? b.brouillon;
    maj = v ? { verdict: v.verdict, verdict_texte: v.phrase } : {};
  } else {
    const r = await deciderBot(db, { message: `[${dem.categorie ?? "autre"}] ${dem.texte}`, source: "help", poster: dem.poster_id, profil: null });
    niveau = r.decision.niveau === "max" ? "max" : "adrien";
    os = r.decision.raison;
    brouillon = brouillon ?? (r.decision.reponse === TEXTE_ON_VERIFIE ? null : r.decision.reponse);
    maj = { risque: r.decision.risque, langue: r.decision.langue };
  }
  await db.from("support_demandes").update({ ...maj, niveau, raison: os, brouillon }).eq("id", id);
  if (niveau === "max") {
    await alerterMax(db, id, {
      nom: f?.nom ?? "?", plateforme: dem.plateforme === "ruul" ? "ruul" : "upwork", categorie: dem.categorie, texte: dem.texte,
      raison: dem.categorie === "paiement" ? "paiement" : "urgent", os, action: brouillon,
    });
  }
  return { ok: true, niveau };
}

/** 12/11 (Max) : la demande part en ticket dans #a-os-tickets ; elle reste ouverte dans la Boîte. */
async function envoyerTicket(db: Db, par: string | null, id: string, note: string | null) {
  const { data: d, error } = await db.from("support_demandes")
    .select("id, poster_id, plateforme, categorie, texte, slack_canal, slack_ts, slack_user, ticket_at, ticket_slack_ts").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!d) return { ok: false, error: "demande introuvable" };
  if (d.ticket_at) return { ok: true, deja: true, ticket_at: d.ticket_at };
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const f = d.poster_id ? await fiche(db, d.poster_id) : null;
  const texte = texteTicket({ ...d, nom: (f as { nom?: string } | null)?.nom ?? d.slack_user ?? null, note }, OS_URL);
  const r = await posterSlack(jeton, CANAL_TICKETS, texte);
  if (!r.ok) return { ok: false, error: erreurTicket(r.error ?? "inconnue") };
  const maintenant = new Date().toISOString();
  const { error: e } = await db.from("support_demandes")
    .update({ ticket_at: maintenant, ticket_slack_ts: r.ts ?? null, ticket_par: par, maj_at: maintenant }).eq("id", id);
  if (e) throw new Error(e.message);
  return { ok: true, ticket_at: maintenant };
}

/** 12/11 (Max) : fiche + historique OS + Upwork + Slack + messages reçus → une note en français (Gemini). */
async function analyserContexte(db: Db, id: string) {
  const { data: d, error } = await db.from("support_demandes").select("id, poster_id, texte, categorie, source").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!d) return { ok: false, error: "demande introuvable" };
  if (!d.poster_id) return { ok: false, error: "posteur inconnu : pas de contexte à lire" };
  const poster = d.poster_id as string;
  const { data: profil } = await db.from("profiles").select("slack_user_id").eq("id", poster).maybeSingle();
  const [f, plus, upwork, slack, reponses] = await Promise.all([
    fiche(db, poster),
    db.rpc("support_contexte_plus", { p_poster: poster }).then((r) => r.data ?? null),
    db.from("upwork_messages").select("at, role, texte").eq("poster_id", poster).order("at", { ascending: false }).limit(40)
      .then((r) => (r.data ?? []).map((m) => ({ at: String(m.at), role: (m.role as string | null) ?? null, texte: String(m.texte ?? "").slice(0, 400) }))),
    profil?.slack_user_id
      ? db.from("slack_messages").select("at, canal, texte").eq("slack_user", profil.slack_user_id).order("at", { ascending: false }).limit(20)
        .then((r) => (r.data ?? []).map((m) => ({ at: String(m.at), canal: String(m.canal), texte: String(m.texte ?? "").slice(0, 400) })))
      : Promise.resolve([]),
    db.from("posteur_reponses").select("recu_at, canal, texte, reponse_texte").eq("poster_id", poster).order("recu_at", { ascending: false }).limit(20)
      .then((r) => (r.data ?? []).map((m) => ({
        at: String(m.recu_at), canal: (m.canal as string | null) ?? null, texte: String(m.texte ?? "").slice(0, 400),
        notre_reponse: m.reponse_texte ? String(m.reponse_texte).slice(0, 300) : null,
      }))),
  ]);
  const analyse = (await generateTextFast(promptContexte({
    fiche: f, plus, demande: { texte: String(d.texte), categorie: (d.categorie as string | null) ?? null, source: (d.source as string | null) ?? null },
    upwork, slack, reponses,
  }))).trim();
  const maintenant = new Date().toISOString();
  const { error: e } = await db.from("support_demandes").update({ contexte_analyse: analyse, contexte_at: maintenant }).eq("id", id);
  if (e) throw new Error(e.message);
  return { ok: true, analyse, contexte_at: maintenant, sources: { upwork: upwork.length, slack: slack.length, messages: reponses.length } };
}

/**
 * 12/11 (Max, point 10) : la réponse d'un posteur à un de nos emails = une demande Help (même bot,
 * même circuit : réponse, Adrien, Max, ticket) ; l'OS lui répond par email avec la réponse et le lien
 * Help. Un expéditeur inconnu : la demande arrive dans la Boîte, sans réponse. Un email déjà reçu
 * (même Message-ID) n'est jamais traité deux fois.
 */
async function emailsEntrants(db: Db, emails: ReturnType<typeof lireEmailsBrevo>) {
  const bilan: Record<string, unknown>[] = [];
  for (const e of emails) {
    const { data: deja } = await db.from("support_demandes").select("id").eq("email_message_id", e.messageId).limit(1);
    if ((deja ?? []).length) { bilan.push({ de: e.de, ignore: "déjà reçu" }); continue; }
    const poster = await posteurParEmail(db, e.de);
    const texte = e.sujet && !/^re:/i.test(e.sujet) ? `${e.sujet}\n\n${e.texte}` : e.texte;
    if (!poster) {
      const { data, error } = await db.rpc("support_ajouter", { p: { poster_id: null, type: "question", texte, source: "help", escalader: true, slack_user: e.nom ?? e.de } });
      if (error) { bilan.push({ de: e.de, erreur: error.message }); continue; }
      const id = (data as { id?: string } | null)?.id;
      if (id) await db.from("support_demandes").update({ email_message_id: e.messageId, email_de: e.de, niveau: "adrien", raison: "Email d'un expéditeur inconnu." }).eq("id", id);
      bilan.push({ de: e.de, poster: null, id });
      continue;
    }
    const r = await poserQuestion(db, poster, texte, null);
    if (r.id) await db.from("support_demandes").update({ email_message_id: e.messageId, email_de: e.de }).eq("id", r.id);
    let envoi = "pas de réponse";
    if (r.ok && r.reponse) {
      const { data: p } = await db.from("profiles").select("prenom, ruul_jeton").eq("id", poster).maybeSingle();
      const objet = e.sujet ? (/^re:/i.test(e.sujet) ? e.sujet : `Re: ${e.sujet}`) : "Your question";
      const corps = texteReponseEmail(p?.prenom ?? null, r.reponse);
      const lienStop = p?.ruul_jeton ? `https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul?stop=${p.ruul_jeton}` : OS_URL;
      const m = rendreEmailRuul({ objet, corps, bouton: { texte: "Open Help", lien: `${OS_URL}/createur/help` }, lienStop });
      const s = await envoyerEmailSite(e.de, objet, m.html, m.texte, lienStop, ["support", "reponse_email"]);
      envoi = s.ok ? "envoyée" : `erreur : ${s.erreur}`;
    }
    bilan.push({ de: e.de, poster, id: r.id ?? null, envoye_equipe: r.envoye_equipe ?? null, reponse: envoi });
  }
  return { ok: true, recus: emails.length, bilan };
}

/** Le posteur d'une adresse email : login, email Ruul, ou email perso donné au site. */
async function posteurParEmail(db: Db, email: string): Promise<string | null> {
  for (const col of ["email", "ruul_email"]) {
    const { data: p } = await db.from("profiles").select("id").ilike(col, email).limit(1);
    if (p?.[0]?.id) return p[0].id as string;
  }
  const { data: h } = await db.from("hub_posteurs").select("profile_id").ilike("email_perso", email).not("profile_id", "is", null).limit(1);
  return (h?.[0]?.profile_id as string | undefined) ?? null;
}
