import { chargerBase, demanderAuCerveau, jetonSlackFaq, posterSlack } from "../_shared/faq_moteur.ts";
import { brevoGet } from "../_shared/emails.ts";
import { chargerSourcesSupport } from "../_shared/support_sources.ts";
import { CANAL_TICKETS, erreurTicket, promptContexte, texteTicket } from "../_shared/support_ticket.ts";
import { emailReel, jetonValide, lireEmailsBrevo, texteReponseEmail } from "../_shared/email_entrant.ts";
import { lienMotDePasse, refusMotDePasseUpwork } from "../_shared/lien_mot_de_passe.ts";
import { envoyerEmailSite, rendreEmailRuul } from "../_shared/ruul.ts";
import { type CasFin, estDemandePosteur, OBJET_FIN, raisonFixe, texteCompteArrete, texteFin } from "../_shared/fin_collaboration.ts";
import { type RapportSamedi, samediDe, texteRapportSamedi } from "../_shared/rapport_samedi.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { type Aujourdhui, type LigneAujourdhui, type QualiteSemaine, texteAlertesUrgentes, texteQualite, texteResumeJour } from "../_shared/aujourdhui.ts";
import { type CleSituation, estReactiver2eCompte, estRienPrevu, reponseRienPrevu, situationFixe, TEXTES_SITUATIONS } from "../_shared/support_situations.ts";
import { lundiEnClair, reponseDouble, TEXTE_REFUS_DOUBLE, texteAccordDouble, texteDemarrageDouble, texteOffreDouble } from "../_shared/doublement.ts";
import {
  type CasRuul,
  decisionUpwork,
  detecterCasRuul,
  escalader,
  etapeBloquee,
  reponseCasRuul,
  separerNomLegal,
  TEXTES_RUUL,
  texteEtape,
} from "../_shared/ruul_bot.ts";
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
import { decrireCapture, generateTextFast } from "../_shared/gemini.ts";
import { lireGroupes, promptRegroupement, type QuestionLue, resumerGroupe, TEXTE_ATTENTE } from "../_shared/entrainement.ts";
import {
  appliquerControle, type CanalControle, journaliser, lireControle, modeAction, modeAgent, type ResultatControle,
} from "../_shared/controle.ts";
import {
  type ActionBot, appliquerGardeFous, type DecisionBot, lireDecision, lireTop10, plainteSansDonnees, promptBot, promptTop10, signer, type SourceBot, testOk, TEXTE_ON_VERIFIE, type Top10,
  accuseReception, texteBugMax, texteListeAdrien, texteTop10,
} from "../_shared/bot_support.ts";
import { assertRole, json, messageErreur, secretCron, secretCronConnu, serviceClient } from "../_shared/supabase.ts";
import {
  casDeCategorie, type CasFixe, detecterCas, estDemandeArret, estPasRegle, estProfilUpwork, estQuestionStatut, type EtatReel, etatDashboardTexte,
  ligneStatut, type Situation, situation, TEXTES, texteStatut,
  aDemandeArret, ditPasRecu, estArretDouteux, estCodeRuul, estQuestionPaie, paieRuulEnRoute, QUESTION_ARRET, texteArret, texteCodeRuul, textePaieRuul,
} from "../_shared/support_regles.ts";

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
const ADRIEN_SLACK = "U0BMTK7BLCW";

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
            simulation: true,
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
      case "rapport_samedi":
        // 18/11 (Max) : kills, partie 3 : le rapport du samedi (OS + #a-os-tickets) ; « envoyer: false » = sans Slack.
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        return json(await rapportSamedi(db, typeof body.samedi === "string" ? body.samedi : null, body.envoyer !== false));
      case "doubles_offres":
        // 21/11 (Max) : la proposition de 2e compte (OUI du jeudi) : Upwork (conversation du contrat) ou email (Ruul),
        // et le pop-up du dashboard, dans sa langue. Cron toutes les 15 min.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await doublesOffres(db, body.simuler === true));
      case "doubles_demarrages":
        // 21/11 (Max) : le lundi du démarrage : « From Monday … you manage 2 accounts … ». Une fois.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await doublesDemarrages(db, body.simuler === true));
      case "nudge_jeudi_ruul":
        // 19/11 (Max) : le nudge du jeudi d'un posteur Ruul : email + bandeau sur son dashboard (jamais de DM Slack).
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await nudgeJeudiRuul(db, String(body.lundi ?? ""), Array.isArray(body.comptes) ? body.comptes.map(String) : [], body.simuler === true));
      case "textes_fin":
        // 18/11 (Max) : kills, parties 1 et 2 : textes au posteur (page de fin, bandeau) et message de fin (cron */10).
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        return json(await textesFin(db, body.simuler === true));
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
        // 21/11 : les STOP arrivés par une carte passent aussi par le support (arrêt immédiat).
        return json({ ...(await messagesTraiter(db)), stops: await stopsCartes(db) });
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
      case "entrainement_regrouper":
        // 13/11 (Entraîner le bot) : l'historique (chatbot + Help/Slack/email) regroupé en questions types.
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await entrainementRegrouper(db));
      case "repondre_canal":
        // 13/11 (Max) : répondre depuis la conversation complète, sur le même canal.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await repondreCanal(db, acces.userId === "cron" ? null : acces.userId, {
          poster_id: String(body.poster_id ?? ""), canal: String(body.canal ?? ""), texte: String(body.texte ?? ""),
          demande_id: typeof body.demande_id === "string" && body.demande_id ? body.demande_id : null,
        }));
      case "tickets_auto":
        // 13/11 (escalations, 0706) : les demandes techniques (bot responsable « os_tickets ») partent seules
        // par le bouton existant, une fois chacune (cron support-tickets, toutes les 15 min).
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await ticketsAuto(db));
      case "slack_message":
        // 13/11 (refonte, un seul cerveau) : un message d'un posteur dans un salon Slack (#posting-help…), passé par slack-faq.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await messageSlack(db, {
          canal: String(body.canal ?? ""), ts: String(body.ts ?? ""), auteur: String(body.auteur ?? ""), texte: String(body.texte ?? ""),
          nom: typeof body.nom === "string" ? body.nom : null, plateforme: body.plateforme === "ruul" || body.plateforme === "upwork" ? body.plateforme : null,
        }));
      case "brevo_entrants":
        // 18/11 (Max) : la réception des emails ne marche plus depuis le 16/11 : ce que Brevo a reçu, et ses
        // webhooks entrants (adresse, domaine). Lecture seule.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await brevoEntrants(String(body.depuis ?? "")));
      case "rattrapage_tickets":
        // 21/11 (Max) : les tickets ouverts depuis plus de 48 h repassent par l'agent avec les nouvelles règles.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await rattrapageTickets(db, Math.min(Number(body.limite ?? 10) || 10, 25), body.simuler === true));
      case "suivi":
        // 17/11 (Max, point 8) : fermeture après 48 h sans retour, confirmation d'un arrêt une fois fait (cron support-suivi).
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await suiviSupport(db));
      case "tickets_regles":
        // 13/11 (refonte, 4 bis) : ✅ sur les tickets de #a-os-tickets → posteur prévenu (cron support-tickets-regles).
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json(await ticketsRegles(db));
      case "traduire_fr": {
        // 21/11 (Max) : dans la Boîte, la traduction en français des messages (posteurs et réponses).
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        const textes = (Array.isArray(body.textes) ? body.textes : []).slice(0, 60).map((t: unknown) => String(t ?? "").slice(0, 2000));
        return json({ ok: true, traductions: await traduireFr(textes) });
      }
      case "slack_suite": {
        // 13/11 : la suite d'un fil Slack d'une demande : elle entre dans le fil de la demande, qui repasse « à répondre ».
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        // 21/11 (Max) : le bot répond aussi à la suite d'un fil, dans le fil.
        const canal = String(body.canal ?? "");
        const parent = String(body.parent_ts ?? "");
        const texteSuite = String(body.texte ?? "").trim();
        const { data: dem } = await db.from("support_demandes").select("id, poster_id")
          .eq("slack_canal", canal).eq("slack_ts", parent).limit(1).maybeSingle();
        if (!dem?.id) {
          // Un fil qui n'est pas une demande suivie (la réponse d'un autre posteur, un message de l'équipe) : un message
          // à part entière, la réponse va dans ce fil.
          if (!body.auteur || !body.ts) return json({ ok: true, ignore: "pas une demande suivie" });
          return json(await messageSlack(db, {
            canal, ts: String(body.ts), fil: parent, auteur: String(body.auteur), texte: texteSuite,
            nom: typeof body.nom === "string" ? body.nom : null, plateforme: body.plateforme === "ruul" || body.plateforme === "upwork" ? body.plateforme : null,
          }));
        }
        return json(await suiteFilSlack(db, { canal, parent_ts: parent, texte: texteSuite, demande: dem.id as string, poster: (dem.poster_id as string | null) ?? null }));
      }
      case "lien_mot_de_passe":
        // 13/11 (Max) : envoyer (ou renvoyer, avec excuse) le login + lien « choisir mon mot de passe » par email.
        if (!admin) return json({ ok: false, error: "forbidden" }, 403);
        return json({ ok: true, resultat: await envoyerLienMotDePasse(db, String(body.poster_id ?? ""), null, body.correction === true) });
      case "proposition":
        // 13/11 (Contrôle) : une action proposée par le bot (mode « proposer ») : Max la fait ou l'ignore.
        if (acces.role !== "admin" || acces.userId === "cron") return json({ ok: false, error: "réservé à Max" }, 403);
        return json(await traiterProposition(db, acces.userId, String(body.id ?? ""), body.faire === true));
      case "contexte":
        // 12/11 (Max) : « Avoir le contexte » : l'analyse de tout ce que l'OS sait sur le posteur. Ne fait que lire.
        if (acces.role !== "admin") return json({ ok: false, error: "réservé aux admins" }, 403);
        return json(await analyserContexte(db, String(body.id ?? "")));
      case "aujourdhui_alertes":
        // 21/11 (Max, point 10) : DM urgent (argent, ou ligne bloquée depuis plus de 24 h), une fois par ligne (cron horaire).
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        return json(await aujourdhuiAlertes(db, body.envoyer !== false));
      case "aujourdhui_resume":
        // 21/11 (Max, point 10) : le résumé de 18 h (Paris) en DM.
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        if (!body.forcer && heureParis() !== 18) return json({ ok: true, ignore: "pas 18 h à Paris" });
        return json(await aujourdhuiResume(db, body.envoyer !== false));
      case "qualite_semaine":
        // 21/11 (Max, point 10) : le rapport qualité du lundi 9 h (Paris), semaine qui vient de finir.
        if (acces.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
        if (!body.forcer && heureParis() !== 9) return json({ ok: true, ignore: "pas lundi 9 h à Paris" });
        return json(await qualiteSemaine(db, typeof body.lundi === "string" ? body.lundi : null, body.envoyer !== false));
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

async function poserQuestion(db: Db, poster: string, texte: string, categorie: string | null, source: "help" | "email" = "help") {
  texte = texte.trim();
  if (texte.length < 3) return { ok: false, error: "Please write your question." };
  // 13/11 (refonte, Phase 3) : un simple accusé (« thanks », « ok », « will do ») : pas de réponse, sur tous les canaux, Help compris.
  if (accuseReception(texte)) {
    await noterVu(db, poster, source, texte, `${source}:${crypto.randomUUID()}`);
    return { ok: true, id: null, reponse: "", envoye_equipe: false, muet: true, vu: true };
  }
  // 17/11 (Max, point 8) : « ce n'est pas réglé » : la dernière demande est rouverte, pas une nouvelle.
  const rouverte = await rouvrirSiPasRegle(db, poster, texte, source);
  if (rouverte) return { ok: true, id: rouverte.id, reponse: rouverte.reponse, envoye_equipe: true, muet: false };
  // 12/11 (Support propre) : le bot v2 répond à tout ; il ne passe la main qu'à Adrien ou Max.
  const r = await deciderBot(db, { message: texte, source: "help", poster, profil: null, canal: source });
  const d = r.decision;
  const regle = d.niveau === "bot";
  const action = regle && d.action ? await executerAction(db, poster, d, texte) : null;
  const { data, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "question", categorie: categorie ?? d.categorie, texte, bot_reponse: r.texte, bot_decision: d.niveau, source,
      brouillon: brouillonDe(r), escalader: !regle,
    },
  });
  if (error) throw new Error(`support_ajouter : ${error.message}`);
  const id = (data as { id: string })?.id ?? null;
  if (id) await noterDecision(db, id, d, action, r.regle_utilisee);
  if (id) await apresDemande(db, { poster, demande: id, plan: r.plan, decision: d, source, texte });
  await noterControle(db, poster, id, source, regle ? r.texte : null, r.controle);
  if (id && d.niveau === "max") await alerterMax(db, id, { nom: (await fiche(db, poster))?.nom ?? "?", plateforme: r.plateforme ?? "upwork", categorie: d.categorie, texte, raison: "urgent", os: d.raison, action: d.reponse });
  return { ok: true, id, reponse: r.texte, envoye_equipe: !regle, muet: r.controle.muet };
}

/** Le brouillon pour Max : celui gardé par la page Contrôle, sinon la réponse du bot quand elle n'est pas « We're checking ». */
function brouillonDe(r: { decision: DecisionBot; controle: ResultatControle }): string | null {
  if (r.controle.brouillon) return r.controle.brouillon;
  return r.decision.niveau === "bot" || r.decision.reponse === TEXTE_ON_VERIFIE ? null : r.decision.reponse;
}

/** 13/11 (Contrôle) : la réponse partie (« agir ») ou le brouillon et l'action proposés à Max, dans le journal. */
async function noterControle(db: Db, poster: string, demande: string | null, canal: string, envoyee: string | null, c: ResultatControle) {
  if (envoyee) await journaliser(db, { qui: "cerveau_support", quoi: "reponse", poster_id: poster, canal, resultat: envoyee.slice(0, 200), demande_id: demande });
  if (c.brouillon) {
    await journaliser(db, { qui: "cerveau_support", quoi: "reponse", mode: "proposer", poster_id: poster, canal, resultat: c.brouillon.slice(0, 200), demande_id: demande });
  }
  if (c.action_proposee) {
    await journaliser(db, {
      qui: "cerveau_support", quoi: c.action_proposee.action, mode: "proposer", poster_id: poster, canal, demande_id: demande,
      resultat: `proposé${c.action_proposee.valeur ? ` : ${c.action_proposee.valeur}` : ""}`,
      details: { action: c.action_proposee.action, valeur: c.action_proposee.valeur },
    });
  }
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
async function executerAction(
  db: Db, poster: string, d: Pick<DecisionBot, "action" | "action_valeur" | "reponse" | "raison">, message = "", qui = "cerveau_support",
): Promise<string> {
  if (!d.action) return "aucune action";
  const r = await executerActionBrute(db, poster, d, message);
  // 13/11 (Contrôle) : chaque action faite entre au journal ; @ TikTok et email Ruul gardent la valeur d'avant (annulables).
  await journaliser(db, {
    qui, quoi: d.action, poster_id: poster, resultat: r.texte, details: r.details ?? {}, annulable: !!r.details && r.ok,
  });
  return r.texte;
}

async function executerActionBrute(
  db: Db, poster: string, d: Pick<DecisionBot, "action" | "action_valeur" | "reponse" | "raison">, message: string,
): Promise<{ texte: string; ok: boolean; details?: Record<string, unknown> }> {
  const t = (texte: string, ok = true) => ({ texte, ok });
  try {
    switch (d.action) {
      case "lien_mot_de_passe":
        return t(`lien de mot de passe : ${await envoyerLienMotDePasse(db, poster, null)}`);
      case "pseudo_tiktok": {
        const handle = (d.action_valeur ?? "").replace(/^@/, "").trim();
        if (!/^[a-z0-9._]{2,30}$/i.test(handle)) return t("pseudo TikTok invalide : rien changé", false);
        const { data: c } = await db.from("comptes").select("id, handle_tiktok").eq("poster_id", poster).eq("is_active", true)
          .eq("type_compte", "perso").order("created_at").limit(1).maybeSingle();
        if (!c) return t("aucun compte actif : rien changé", false);
        const { error } = await db.from("comptes").update({ handle_tiktok: handle }).eq("id", c.id);
        return error ? t(`pseudo TikTok : ${error.message}`, false)
          : { texte: `pseudo TikTok : @${c.handle_tiktok ?? "?"} → @${handle}`, ok: true, details: { compte_id: c.id, avant: c.handle_tiktok ?? "", apres: handle } };
      }
      case "email_ruul": {
        // Réparer Ruul (point 4) : adresse valide, pas déjà prise ; historique gardé ; fiche « à réinviter ».
        const { data: avant } = await db.from("profiles").select("ruul_email").eq("id", poster).maybeSingle();
        const { data, error } = await db.rpc("ruul_bot_nouvelle_adresse", { p_poster: poster, p_email: d.action_valeur ?? "" });
        if (error) return t(`email Ruul : ${error.message}`, false);
        const r = data as { ok: boolean; raison?: string; texte?: string };
        return r.ok
          ? { texte: `fait par le bot : ${r.texte}`, ok: true, details: { avant: avant?.ruul_email ?? "", apres: d.action_valeur ?? "" } }
          : t(`email Ruul pas changé (${r.raison})`, false);
      }
      case "nom_legal": {
        // 21/11 (Max) : le nom légal (celui de sa pièce d'identité) mis à jour dans l'OS, pour qu'il corresponde à Ruul.
        const n = separerNomLegal(d.action_valeur ?? "");
        if (!n) return t("nom légal illisible : rien changé", false);
        const { data: avant } = await db.from("hub_posteurs").select("prenom_legal, nom_legal").eq("profile_id", poster).maybeSingle();
        const { error } = await db.from("hub_posteurs").update({ prenom_legal: n.prenom, nom_legal: n.nom }).eq("profile_id", poster);
        return error ? t(`nom légal : ${error.message}`, false)
          : { texte: `fait par le bot : nom légal ${[avant?.prenom_legal, avant?.nom_legal].filter(Boolean).join(" ") || "?"} → ${n.prenom} ${n.nom}`, ok: true, details: { avant: [avant?.prenom_legal, avant?.nom_legal].filter(Boolean).join(" "), apres: `${n.prenom} ${n.nom}` } };
      }
      case "invitation_ruul": {
        // Moins de 24 h : les spams ; plus : à réinviter (2 renvois au plus) ; ensuite Adrien.
        const { data, error } = await db.rpc("ruul_bot_invitation", { p_poster: poster });
        if (error) return t(`invitation Ruul : ${error.message}`, false);
        const r = data as { cas: string; adresse?: string; renvoi?: number };
        if (r.cas === "adrien") {
          await db.rpc("probleme_ajouter", {
            p_type: "ruul_invite", p_ref: `${poster}:invitation_pas_recue`, p_poster: poster, p_contrat: null, p_categorie: "paie",
            p_resume: "Invitation Ruul pas reçue après 2 renvois",
            p_texte: `Le posteur dit ne pas avoir reçu l'invitation Ruul (${r.adresse ?? "email ?"}), déjà renvoyée 2 fois.`,
            p_at: new Date().toISOString(), p_lien: null, p_canal: "os", p_par: null,
          });
          return t("invitation Ruul : 2 renvois déjà faits, Adrien prévenu (Problèmes)");
        }
        return t(r.cas === "reinvite" ? `fait par le bot : à réinviter dans Ruul (renvoi ${r.renvoi}/2)` : `invitation Ruul : ${r.cas}`);
      }
      case "arret": {
        const { error } = await db.from("posteur_reponses").insert({ poster_id: poster, canal: "bouton", source_id: `support:${crypto.randomUUID()}`, texte: "I want to stop" });
        return error ? t(`arrêt : ${error.message}`, false) : t("arrêt transmis à la procédure d'arrêt");
      }
      case "renvoi_parrainage": {
        const { data, error } = await db.from("parrainage_invitations").update({ prochain_at: new Date().toISOString() })
          .eq("parrain_id", poster).eq("statut", "en_cours").lt("envois", 3).select("id");
        return error ? t(`parrainage : ${error.message}`, false) : t(`parrainage : ${(data ?? []).length} invitation(s) renvoyée(s) au prochain passage`);
      }
      case "lien_slack":
        return t("lien Slack donné");
      case "prevenir_max": {
        // 12/11 : un bug du dashboard couvert par le catalogue : le posteur a le contournement, Max un DM.
        const jeton = jetonSlackFaq();
        if (!jeton) return t("Max pas prévenu : jeton Slack absent", false);
        const f = await fiche(db, poster);
        const r = await posterSlack(jeton, MAX_SLACK, texteBugMax({
          nom: f?.nom ?? "?", plateforme: f?.plateforme === "ruul" ? "ruul" : "upwork", message, reponse: d.reponse, raison: d.raison,
        }, OS_URL));
        return r.ok ? t("Max prévenu (bug)") : t(`Max pas prévenu : ${r.error}`, false);
      }
      default:
        return t("aucune action", false);
    }
  } catch (erreur) {
    return t(`action : ${messageErreur(erreur)}`, false);
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
  // 13/11 (Contrôle) : ces gestes automatiques suivent aussi leur interrupteur (« agir » seulement).
  const ctl = await lireControle(db);
  if (categorie === "connexion" && modeAction(ctl, "lien_mot_de_passe") === "agir") {
    autoAction = "lien_mot_de_passe";
    autoResultat = await envoyerLienMotDePasse(db, poster, f?.nom ?? null);
    if (autoResultat === "envoyé") auto = "lien_envoye";
    await journaliser(db, { qui: "cerveau_support", quoi: "lien_mot_de_passe", poster_id: poster, canal: "help", resultat: `lien de mot de passe : ${autoResultat}` });
  } else if (categorie === "arret" && modeAction(ctl, "arret") === "agir") {
    // La procédure d'arrêt existante : le message entre dans les réponses des posteurs (classé stop / pause).
    autoAction = "procedure_arret";
    const { error } = await db.from("posteur_reponses").insert({ poster_id: poster, canal: "slack", source_id: `support:${crypto.randomUUID()}`, texte });
    autoResultat = error ? `erreur : ${error.message}` : "transmis à la procédure d'arrêt";
    if (!error) auto = "arret";
    await journaliser(db, { qui: "cerveau_support", quoi: "arret", poster_id: poster, canal: "help", resultat: autoResultat });
  }

  // Paiement : le verdict d'abord (faits vérifiés) ; Max seulement si les données montrent le problème.
  // Le reste : le bot v2 décide (bot / Adrien / Max) et répond s'il peut.
  let v: Awaited<ReturnType<typeof verifier>> = null;
  let brouillon: string | null = null;
  let reponseBot: string | null = null;
  let d: DecisionBot | null = null;
  let ctlRes: ResultatControle | null = null;
  let planProbleme: PlanRegles | undefined;
  let niveau: "bot" | "adrien" | "max";
  if (categorie === "paiement") {
    v = await verifier(categorie, texte, f, ctx);
    const b = await cerveau(db, f, questionProbleme(categorie, texte, v), ctx);
    brouillon = b.brouillon;
    niveau = v?.verdict === "probleme_confirme" ? "max" : v?.verdict === "pas_de_probleme" && b.sur ? "bot" : "adrien";
    if (niveau === "bot") reponseBot = signer(b.reponse, (b as { langue?: string | null }).langue ?? null);
  } else {
    const r = await deciderBot(db, { message: `[${categorie}] ${texte}`, source: "help", poster, profil: null, canal: "help" });
    d = r.decision;
    ctlRes = r.controle;
    planProbleme = r.plan;
    niveau = auto ? "bot" : d.niveau;
    // 17/11 : la procédure d'arrêt est déjà lancée par la catégorie « arrêt » : pas une deuxième fois.
    // 18/11 : même passée par la procédure d'arrêt, la demande est notée (Kill pré-coché au samedi, idempotent).
    brouillon = r.controle.brouillon ?? (d.reponse === TEXTE_ON_VERIFIE ? null : d.reponse);
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
  if (res?.id && ctlRes) await noterControle(db, poster, res.id, "help", reponseBot, ctlRes);
  if (res?.id && d && !res.fusion) await apresDemande(db, { poster, demande: res.id, plan: planProbleme, decision: d, source: "help", texte });
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
    db.from("profiles").select("prenom, email, email_perso, ruul_email, slack_user_id").eq("id", poster).maybeSingle(),
    db.from("hub_posteurs").select("email_perso").eq("profile_id", poster).maybeSingle(),
  ]);
  return {
    prenom: (p?.prenom as string | null) ?? null,
    email: emailReel([h?.email_perso, p?.email_perso, p?.ruul_email, p?.email]),
    slack: (p?.slack_user_id as string | null) ?? null,
  };
}

/**
 * 13/11 (Max) : « Jamais de mot de passe dans un message. Toujours login + lien « choisir mon mot de passe ». »
 * L'email part à la vraie adresse du posteur : son login et son lien personnel (une fois, 14 jours).
 * `correction` : une ligne d'excuse pour un email précédent qui donnait un mauvais mot de passe.
 */
async function envoyerLienMotDePasse(db: Db, poster: string, nom: string | null, correction = false): Promise<string> {
  const c = await contactPosteur(db, poster);
  if (!c.email) return "pas d'email connu";
  const { data: p } = await db.from("profiles").select("email").eq("id", poster).maybeSingle();
  const login = (p?.email as string | null) ?? null;
  if (!login) return "pas de login";
  const { data: jeton, error } = await db.rpc("mot_de_passe_lien_creer", { p_poster: poster, p_par: "support" });
  if (error || typeof jeton !== "string" || !jeton) return `lien : ${error?.message ?? "non créé"}`;
  const lien = lienMotDePasse(OS_URL, jeton);
  const objet = correction ? "Your Sophia dashboard login (corrected)" : "Your Sophia dashboard login";
  const e = rendreEmailRuul({
    objet,
    corps: `Hi ${c.prenom || nom || "there"},\n\n` +
      (correction ? "Sorry, our previous email gave you a wrong password. Please ignore it and use the link below instead.\n\n" : "") +
      `Your login: ${login}\n\nClick the button below to choose your own password (the link works once, for 14 days), then log in to your dashboard: ${OS_URL}`,
    bouton: { texte: "Choose my password", lien },
    lienStop: OS_URL,
  });
  const r = await envoyerEmailSite(c.email, objet, e.html, e.texte, OS_URL, ["support", "mot_de_passe"]);
  return r.ok ? "envoyé" : `email : ${r.erreur}`;
}

async function repondre(db: Db, auteur: string | null, id: string, texte: string) {
  texte = texte.trim();
  if (!id || texte.length < 1) return { ok: false, error: "réponse vide" };
  if (refusMotDePasseUpwork(texte)) return { ok: false, error: "Jamais de mot de passe dans un message : envoie le lien « choisir mon mot de passe »." };
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
const RISQUES_SILENCE: readonly string[] = ["argent_tiers", "multi_comptes", "hors_plateforme", "menace"];
const TEXTE_LIEN_ENVOYE = "I've just emailed you your login and a personal link to choose your password. Check your inbox (and spam), then log in to your dashboard.";

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
    /** 13/11 (Contrôle) : le canal d'où vient le message (help, email, slack, upwork). */
    canal?: CanalControle;
    /** Simulation (/admin/bot, tests) : la page Contrôle ne s'applique pas. */
    simulation?: boolean;
  },
) {
  const fictif = !o.poster && o.profil;
  const ctlReglage = o.simulation ? null : await lireControle(db);
  // 13/11 (Contrôle) : STOP général ou cerveau éteint : pas de modèle, tout va à Max.
  const eteint = ctlReglage ? modeAgent(ctlReglage, "cerveau_support") === "eteint" : false;
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
  // 17/11 (Max, point 2) : le dashboard et le bot lisent la même source (support_etat_reel).
  const etat = o.poster ? await etatReel(db, o.poster) : null;
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
    etat: o.poster ? etatDashboardTexte(etat) : "",
  };
  let decision: DecisionBot | null = null;
  if (eteint) {
    decision = { langue: "en", categorie: "autre", personnel: false, reponse: TEXTE_ON_VERIFIE, action: null, action_valeur: null,
      niveau: "max", regle: null, risque: [], raison: "Contrôle : support éteint (STOP général ou cerveau éteint) : la demande va à Max." };
  }
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
  const finale = appliquerGardeFous(decision, { source: o.source, plateforme, lienHelp: LIEN_HELP, nbMemeSujet, connu: !!f });
  // 13/11 (Max) : jamais de mot de passe dans un message : le lien « choisir mon mot de passe » à la place.
  if (refusMotDePasseUpwork(finale.reponse)) {
    finale.raison = `${finale.raison} (mot de passe retiré de la réponse : lien « choisir mon mot de passe » à la place)`.trim();
    if (finale.niveau === "bot") {
      finale.reponse = TEXTE_LIEN_ENVOYE;
      finale.action = "lien_mot_de_passe";
      finale.action_valeur = null;
    } else {
      finale.reponse = TEXTE_ON_VERIFIE;
    }
  }
  // 13/11 (page Contrôle) : ce qui n'est pas en « agir » (cerveau, canal, action) ne part pas :
  // la demande va à Max avec le brouillon du bot et l'action proposée (un clic dans la Boîte).
  const controle: ResultatControle = ctlReglage
    ? appliquerControle(ctlReglage, finale, o.canal ?? "help", TEXTE_ON_VERIFIE)
    : { brouillon: null, action_proposee: null, muet: false };
  // 13/11 (Max) : « Fraude, litige, paiement hors plateforme : directement à Max, sans réponse automatique. »
  if (finale.risque.some((x) => RISQUES_SILENCE.includes(x))) {
    finale.niveau = "max";
    finale.reponse = TEXTE_ON_VERIFIE;
    finale.action = null;
    finale.action_valeur = null;
    // 17/11 (Max, point 7) : jamais de réponse vide : « We're checking » part, la demande va à Max.
    finale.raison = `${finale.raison} (fraude / litige / hors plateforme : à Max)`.trim();
  }
  // 0683 : pas payé + aucune paie connue (contrat pas relié, milestones illisibles) → on vérifie, Max tranche.
  if (o.source === "help" && f && plainteSansDonnees(o.message, plateforme, !f.derniere_paie) && finale.niveau !== "max") {
    finale.niveau = "max";
    finale.reponse = TEXTE_ON_VERIFIE;
    finale.raison = `${finale.raison} (plainte de paie sans paie connue dans l'OS : à Max)`.trim();
  }
  // 17/11 (Max) : les cas à réponse fixe, la vraie situation (arrêt / kill), l'écart dashboard, l'escalade utile.
  const plan = await appliquerRegles(db, { message: o.message, poster: o.poster, plateforme, etat, decision: finale, historique: entree.historique, simulation: !!o.simulation });
  const regle = finale.regle ? (entree.catalogue.find((c) => c.id === finale.regle)?.question ?? finale.regle) : null;
  return {
    plan,
    decision: finale,
    texte: signer(finale.reponse, finale.langue),
    regle_utilisee: regle,
    plateforme,
    action_prevue: finale.action ? { action: finale.action, valeur: finale.action_valeur, executee: false } : null,
    controle,
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

// ---------------------------------------------------------------------------------------------------------------
// 17/11 (Max) : corrections du bot support. Cas à réponse fixe, vraie situation, incidents groupés, exception
// Upwork, arrêts, demandes rouvertes et suivi. Les escalades passent toujours par la Boîte et #a-os-tickets.
// ---------------------------------------------------------------------------------------------------------------

/** Ce qui doit se passer après la réponse (écritures faites par apresDemande, jamais en simulation). */
export interface PlanRegles {
  cas: CasFixe | "statut" | "arret" | "ecart_dashboard" | "code_ruul" | "paie_ruul" | `ruul_${CasRuul}` | "double_jeudi" | `situation_${CleSituation}` | "annule" | null;
  /** 21/11 (Max) : la demande se ferme dès la réponse envoyée. */
  fermer?: boolean;
  /** 21/11 : le contenu du jour est signalé à la qualité (jamais à Max). */
  qualite?: string | null;
  /** 21/11 : le jour compte comme fait (contenu faux de notre côté). */
  jour_compte?: string | null;
  /** 21/11 : un ticket dans #a-os-tickets (bug technique) ; la demande reste ouverte jusqu'à ce que ce soit réglé. */
  ticket?: string | null;
  /** 21/11 (Max) : renvoyé au support Ruul, avec l'échéance après laquelle la collaboration s'arrête. */
  support_ruul?: { cle: string; echeance: string } | null;
  /** 21/11 (Max) : le problème Ruul compté (le bot répond 2 fois au plus au même problème, puis escalade). */
  tentative_ruul: string | null;
  /** 21/11 : escalade Ruul (cas inconnu ou 3e message sur le même problème) → ticket dans #a-os-tickets. */
  escalade_ruul: boolean;
  upwork: "demander" | "lien" | null;
  lien: string | null;
  doublon_de: string | null;
  incident: { cle: string; titre: string; groupe_seul: boolean } | null;
  arret: boolean;
  /** 21/11 (Max) : fin immédiate (réglage arret_immediat) : texte de fin envoyé, arrêt créé (arrets) après la réponse. */
  arret_immediat?: { en: string } | null;
  incoherences: string[];
  statut_posteur: string;
  resume: string | null;
  action_proposee: string | null;
}

/** La vraie situation du posteur (même source que son dashboard). Ne lève pas. */
async function etatReel(db: Db, poster: string): Promise<EtatReel | null> {
  const { data, error } = await db.rpc("support_etat_reel", { p_poster: poster });
  if (error) console.warn(`[support] etat_reel : ${error.message}`);
  return (data ?? null) as EtatReel | null;
}

/** Un texte fixe (anglais) dans la langue du message du posteur ; l'anglais tel quel ; en cas d'échec, l'anglais. */
/** Aujourd'hui à Paris, AAAA-MM-JJ. */
function jourParisIso(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Le lundi qui suit (heure de Paris), AAAA-MM-JJ. */
function lundiQuiSuit(d: Date): string {
  const paris = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const iso = (paris.getDay() + 6) % 7;
  paris.setDate(paris.getDate() + 7 - iso);
  return `${paris.getFullYear()}-${String(paris.getMonth() + 1).padStart(2, "0")}-${String(paris.getDate()).padStart(2, "0")}`;
}

async function traduire(texte: string, langue: string | null | undefined): Promise<string> {
  const l = (langue ?? "en").toLowerCase();
  if (!l || l.startsWith("en")) return texte;
  try {
    const r = (await generateTextFast(
      `Translate this message into the language whose ISO code is "${l}". Keep links, numbers, "$", "Upwork" and "Ruul" unchanged. ` +
        `Same meaning, natural and short, nothing added. Reply with the translation only.\n\n${texte}`,
    )).trim().replace(/^["«“]+|["»”]+$/g, "");
    return r && r.length < texte.length * 3 ? r : texte;
  } catch {
    return texte;
  }
}

/** 21/11 : des messages traduits en français, dans l'ordre ; un message déjà en français reste tel quel. Ne lève pas. */
async function traduireFr(textes: string[]): Promise<(string | null)[]> {
  const sortie: (string | null)[] = textes.map(() => null);
  const aFaire = textes.map((t, i) => ({ t: t.trim(), i })).filter((x) => x.t.length > 0);
  for (let k = 0; k < aFaire.length; k += 15) {
    const lot = aFaire.slice(k, k + 15);
    try {
      const r = await generateTextFast(
        "Traduis chaque message en français, naturellement, sans rien ajouter. Garde les liens, les @, les nombres et « $ ». " +
          "Si un message est déjà en français, recopie-le. Réponds uniquement par un tableau JSON de chaînes, dans le même ordre.\n\n" +
          JSON.stringify(lot.map((x) => x.t)),
      );
      const m = r.match(/\[[\s\S]*\]/);
      const tab = m ? JSON.parse(m[0]) as unknown[] : [];
      lot.forEach((x, j) => { if (typeof tab[j] === "string") sortie[x.i] = tab[j] as string; });
    } catch (e) {
      console.warn(`[support] traduire_fr : ${messageErreur(e)}`);
    }
  }
  return sortie;
}

/**
 * 21/11 : une traduction relue (messages qui engagent la paie : doublement) : traduite, puis relue par le modèle face à
 * l'anglais (mots faux ou inventés corrigés). « Accept », les @, « TikTok », les nombres et « $ » restent tels quels.
 */
async function traduireSoigne(texte: string, langue: string | null | undefined): Promise<string> {
  const l = (langue ?? "en").toLowerCase();
  if (!l || l.startsWith("en")) return texte;
  const premier = await traduire(texte, langue);
  if (premier === texte) return texte;
  try {
    const r = (await generateTextFast(
      `Below is an English message and its translation into the language whose ISO code is "${l}". Proofread the translation: ` +
        `fix any mistranslation, wrong, English or non-existent word, so it reads like a native speaker wrote it. Keep "Accept" ` +
        `(a button name), "@" handles, "TikTok", numbers, dates and "$" unchanged. Same meaning, nothing added. Reply with the ` +
        `corrected translation only.\n\nENGLISH:\n${texte}\n\nTRANSLATION:\n${premier}`,
    )).trim().replace(/^["«“]+|["»”]+$/g, "");
    return r && r.length < texte.length * 3 ? r : premier;
  } catch {
    return premier;
  }
}

/** 18/11 : le texte de la page « collaboration terminée » (anglais), stocké s'il existe, sinon composé pareil. */
async function texteFinBot(db: Db, poster: string | null, e: EtatReel, s: Situation): Promise<string | null> {
  if (poster) {
    const { data } = await db.from("posteur_textes").select("texte_en").eq("poster_id", poster).eq("cle", "fin").maybeSingle();
    if (data?.texte_en) return data.texte_en as string;
  }
  if (!s.le) return null;
  const cas: CasFin = estDemandePosteur(e.arret?.source, e.arret?.motif) ? "demande" : "kill";
  const raison = cas === "demande" ? null : raisonFixe(s.raison) ?? await raisonEnClair(s.raison);
  if (cas === "kill" && !raison) return null;
  return texteFin(e, cas, s.le, raison);
}

/** 18/11 : un de ses deux comptes désactivé ces 3 dernières semaines : le texte du bandeau du dashboard. */
async function bandeauBot(db: Db, poster: string | null): Promise<string | null> {
  if (!poster) return null;
  const { data } = await db.from("posteur_textes").select("texte_en, maj_at").eq("poster_id", poster).like("cle", "compte_arrete:%")
    .gte("maj_at", new Date(Date.now() - 21 * 86_400_000).toISOString()).order("maj_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.texte_en as string | undefined) ?? null;
}

/** Kills, partie 3 : le rapport d'un samedi (par défaut le dernier), gardé pour la page de l'OS et posté dans #a-os-tickets. */
async function rapportSamedi(db: Db, samedi: string | null, envoyer: boolean) {
  const jour = samedi && /^\d{4}-\d{2}-\d{2}$/.test(samedi)
    ? samedi
    : samediDe(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()));
  const { data, error } = await db.rpc("samedi_rapport", { p_samedi: jour });
  if (error) throw new Error(error.message);
  const r = data as RapportSamedi;
  // 0797 : la ligne des inactifs arrêtés automatiquement (et leur liste, dépliable dans l'OS).
  const { data: ina } = await db.rpc("inactifs_rapport", { p_samedi: jour });
  if (ina) r.inactifs = ina as RapportSamedi["inactifs"];
  const { error: e1 } = await db.rpc("samedi_rapport_ecrire", { p_samedi: jour, p_contenu: r });
  if (e1) throw new Error(e1.message);
  if (!envoyer) return { ok: true, samedi: jour, envoye: false, rapport: r };
  const jeton = jetonSlackFaq();
  const texte = texteRapportSamedi(r, `${OS_URL}/admin/auto/rapport-kills`);
  const res = jeton ? await posterSlack(jeton, CANAL_TICKETS, texte) : { ok: false, error: "jeton Slack absent" };
  await db.rpc("samedi_rapport_slack", { p_samedi: jour, p_erreur: res.ok ? null : String(res.error ?? "échec") });
  return { ok: true, samedi: jour, envoye: res.ok, erreur: res.ok ? null : res.error, complets: r.complets, partiels: r.comptes_partiels };
}

/** 18/11 (Max) : le message de fin ne part qu'aux arrêts à partir du 19/11 (jamais aux anciens). */
const DEBUT_MESSAGE_FIN = Date.parse("2026-11-19T00:00:00Z");

interface TexteFinAFaire {
  poster_id: string; cle: string; cas: string; le: string | null; motif: string | null; compte_id: string | null; handle: string | null;
  autre: string | null; montant: number | null; langue: string | null; email: string | null; envoye: boolean; texte_en: string | null;
}

/**
 * Kills, parties 1 et 2 : les textes au posteur (page « collaboration terminée », bandeau « un de vos comptes… »),
 * composés depuis la vraie situation (support_etat_reel), traduits dans sa langue et écrits (posteur_textes).
 * Le message de fin part une seule fois, par email, avec le même contenu que la page. Cron toutes les 10 min.
 */
async function textesFin(db: Db, simuler: boolean) {
  const { data, error } = await db.rpc("textes_fin_a_faire", { p_limite: 40 });
  if (error) throw new Error(error.message);
  const debut = Date.now();
  const bilan = { lus: 0, ecrits: 0, envoyes: 0, erreurs: [] as string[], exemples: [] as { cle: string; langue: string | null; texte_en: string }[] };
  for (const t of (data ?? []) as TexteFinAFaire[]) {
    if (Date.now() - debut > 110_000) break;
    bilan.lus++;
    try {
      if (!t.le) continue;
      const raison = t.cas === "demande" ? null : raisonFixe(t.motif) ?? await raisonEnClair(t.motif);
      let en: string;
      if (t.cle === "fin") {
        const etat = await etatReel(db, t.poster_id);
        if (!etat) continue;
        en = texteFin(etat, t.cas === "demande" ? "demande" : "kill", t.le, raison);
      } else {
        en = texteCompteArrete({ handle: t.handle, le: t.le, raison, autre: t.autre, montant: t.montant == null ? null : Number(t.montant) });
      }
      if (simuler) {
        if (bilan.exemples.length < 6) bilan.exemples.push({ cle: t.cle.split(":")[0]!, langue: t.langue, texte_en: en });
        continue;
      }
      let texte: string | null = null;
      if (en === t.texte_en) {
        const { data: ancien } = await db.from("posteur_textes").select("texte").eq("poster_id", t.poster_id).eq("cle", t.cle).maybeSingle();
        texte = (ancien?.texte as string | undefined) ?? null;
      }
      texte = texte ?? await traduire(en, t.langue);
      const { error: e1 } = await db.rpc("texte_poster_ecrire", { p_poster: t.poster_id, p_cle: t.cle, p_en: en, p_texte: texte, p_langue: t.langue });
      if (e1) throw new Error(e1.message);
      bilan.ecrits++;
      // Le message de fin, une seule fois, aux arrêts récents seulement.
      if (t.cle === "fin" && !t.envoye && Date.parse(t.le) >= DEBUT_MESSAGE_FIN) {
        const c = await contactPosteur(db, t.poster_id);
        let erreur: string | null = "pas d'email connu";
        if (c.email) {
          const objet = await traduire(OBJET_FIN, t.langue);
          const e = rendreEmailRuul({ objet, titre: "Vik Studios", corps: texte.split("\n").join("\n\n"), lienStop: OS_URL, sansPied: true });
          const r = await envoyerEmailSite(c.email, objet, e.html, e.texte, OS_URL, ["fin_collaboration"]);
          erreur = r.ok ? null : String(r.erreur ?? "échec");
        }
        await db.rpc("texte_poster_envoye", { p_poster: t.poster_id, p_cle: "fin", p_erreur: erreur });
        if (!erreur) bilan.envoyes++;
        else bilan.erreurs.push(`${t.poster_id} : message de fin : ${erreur}`);
      }
    } catch (e) {
      bilan.erreurs.push(`${t.poster_id} ${t.cle} : ${messageErreur(e).slice(0, 160)}`);
    }
  }
  return { ok: true, simulation: simuler, ...bilan };
}

interface NudgeRuul { poster_id: string; compte_id: string; prenom: string | null; faits: number; attendus: number; texte_en: string; deja: boolean }

/**
 * 19/11 (Max) : le nudge du jeudi pour les posteurs Ruul : le texte du nudge (jeudi_nudge_texte), traduit dans sa langue,
 * par email et en bandeau sur son dashboard. Jamais en DM Slack. Noté dans nudges (canal « os ») : la ligne du jeudi
 * affiche « déjà nudgé ». Un canal qui ne peut pas partir n'est pas un échec du nudge tant que l'autre est parti.
 */
async function nudgeJeudiRuul(db: Db, lundi: string, comptes: string[], simuler: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lundi)) return { ok: false, error: "lundi invalide" };
  const ids = comptes.filter((c) => /^[0-9a-f-]{36}$/.test(c));
  if (!ids.length) return { ok: true, envoyes: 0, deja: 0, erreurs: [] };
  const { data: pause } = await db.rpc("automation_en_pause");
  if (pause === true && !simuler) return { ok: false, error: "automatisation en pause : rien n'est parti" };
  const { data, error } = await db.rpc("jeudi_nudges_ruul", { p_lundi: lundi, p_comptes: ids });
  if (error) throw new Error(error.message);
  const bilan = { envoyes: 0, deja: 0, email: 0, slack: 0, bandeau: 0, sans_canal: 0, erreurs: [] as string[], exemples: [] as { langue: string | null; texte: string }[] };
  for (const n of (data ?? []) as NudgeRuul[]) {
    if (n.deja) {
      bilan.deja++;
      continue;
    }
    const { data: compte } = await db.from("comptes").select("pays").eq("id", n.compte_id).maybeSingle();
    const { data: lg } = await db.rpc("parrainage_langue_pays", { p_pays: compte?.pays ?? null });
    const langue = typeof lg === "string" ? lg : null;
    const texte = await traduire(n.texte_en, langue);
    if (simuler) {
      if (bilan.exemples.length < 3) bilan.exemples.push({ langue, texte });
      continue;
    }
    const canaux: string[] = [];
    const erreurs: string[] = [];
    // Le bandeau sur son dashboard (jusqu'à « Got it »).
    const { error: eB } = await db.rpc("texte_poster_ecrire", { p_poster: n.poster_id, p_cle: `nudge_jeudi:${lundi}`, p_en: n.texte_en, p_texte: texte, p_langue: langue });
    if (eB) erreurs.push(`bandeau : ${eB.message}`);
    else {
      canaux.push("dashboard");
      bilan.bandeau++;
    }
    // L'email, à sa vraie adresse (0808 : email Ruul, puis de candidature, puis Upwork ; jamais @sophia.com ni une adresse revenue).
    const { data: adresse } = await db.rpc("ruul_adresse_joignable", { p_poster: n.poster_id });
    if (typeof adresse === "string" && adresse) {
      const objet = await traduire("This week's posts", langue);
      const e = rendreEmailRuul({ objet, titre: "Vik Studios", corps: texte, lienStop: OS_URL, sansPied: true });
      const r = await envoyerEmailSite(adresse, objet, e.html, e.texte, OS_URL, ["ruul", "nudge_jeudi"]);
      if (r.ok) {
        canaux.push("email");
        bilan.email++;
      } else erreurs.push(`email : ${String(r.erreur ?? "échec")}`);
    } else erreurs.push("email : pas d'adresse valide");
    // 0808 : Slack en plus, seulement si les DM aux posteurs sont activés (en pause : ce n'est pas une erreur).
    const sl = await ecrireAuPosteur(db, n.poster_id, texte);
    if (sl.statut === "envoye") {
      canaux.push("slack");
      bilan.slack++;
    } else if (sl.statut === "erreur" && !/pause|stop|manquant|contacter/i.test(sl.erreur)) erreurs.push(`slack : ${sl.erreur}`);
    const { error: eN } = await db.rpc("jeudi_nudge_ruul_noter", {
      p_poster: n.poster_id, p_compte: n.compte_id, p_lundi: lundi, p_texte: texte, p_canaux: canaux, p_erreur: erreurs.length ? erreurs.join(" ; ") : null,
    });
    if (eN) erreurs.push(`noter : ${eN.message}`);
    // 0808 : « envoyé » seulement si l'email ou Slack est parti (le bandeau seul ne suffit pas).
    if (canaux.includes("email") || canaux.includes("slack")) bilan.envoyes++;
    else bilan.sans_canal++;
    if (erreurs.length) bilan.erreurs.push(`${n.poster_id} : ${erreurs.join(" ; ")}`);
  }
  return { ok: true, simulation: simuler, ...bilan };
}

/** Un message dans la conversation Upwork du contrat du posteur (fonction upwork). */
async function messageUpworkPosteur(poster: string, texte: string, type: string): Promise<string | null> {
  await secretCron();
  const secret = secretCronConnu();
  const rep = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/upwork`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) },
    body: JSON.stringify({ action: "message_posteur", poster_id: poster, texte, type }),
  });
  const data = await rep.json().catch(() => ({})) as { ok?: boolean; error?: string };
  return !rep.ok || data.ok === false ? `Upwork : ${data.error ?? `HTTP ${rep.status}`}` : null;
}

/** Un message de doublement : Upwork pour un posteur Upwork, email pour un posteur Ruul (+ le texte sur son dashboard). */
async function envoyerDoublement(db: Db, o: { poster: string; canal: string; cle: string | null; en: string; texte: string; langue: string | null; objet: string; tag: string }) {
  const canaux: string[] = [];
  const erreurs: string[] = [];
  if (o.cle) {
    const { error } = await db.rpc("texte_poster_ecrire", { p_poster: o.poster, p_cle: o.cle, p_en: o.en, p_texte: o.texte, p_langue: o.langue });
    if (error) erreurs.push(`dashboard : ${error.message}`);
    else canaux.push("dashboard");
  }
  if (o.canal === "ruul") {
    const c = await contactPosteur(db, o.poster);
    if (c.email) {
      const objet = await traduire(o.objet, o.langue);
      const e = rendreEmailRuul({ objet, titre: "Vik Studios", corps: o.texte, lienStop: OS_URL, sansPied: true });
      const r = await envoyerEmailSite(c.email, objet, e.html, e.texte, OS_URL, [o.tag]);
      if (r.ok) canaux.push("email");
      else erreurs.push(`email : ${String(r.erreur ?? "échec")}`);
    } else erreurs.push("email : pas d'adresse connue");
  } else {
    const err = await messageUpworkPosteur(o.poster, o.texte, o.tag);
    if (err) erreurs.push(err);
    else canaux.push("upwork");
  }
  return { canaux, erreur: erreurs.length ? erreurs.join(" ; ") : null };
}

async function langueDuPays(db: Db, pays: string | null): Promise<string | null> {
  const { data } = await db.rpc("parrainage_langue_pays", { p_pays: pays });
  return typeof data === "string" ? data : null;
}

/** 21/11 (Max) : les propositions de 2e compte à envoyer (OUI de Max le jeudi, jamais envoyées). */
async function doublesOffres(db: Db, simuler: boolean) {
  const { data: pause } = await db.rpc("automation_en_pause");
  if (pause === true && !simuler) return { ok: false, error: "automatisation en pause : rien n'est parti" };
  const { data, error } = await db.rpc("doubles_offres_a_envoyer");
  if (error) throw new Error(error.message);
  const bilan = { envoyees: 0, erreurs: [] as string[], exemples: [] as { langue: string | null; canal: string; texte_en: string; texte: string }[] };
  for (const o of (data ?? []) as { id: string; poster_id: string; prenom: string | null; canal_paie: string; pays: string | null; handle: string | null; label: string | null; lundi: string; tarif: number | null }[]) {
    const langue = await langueDuPays(db, o.pays);
    const canal = o.canal_paie === "ruul" ? "ruul" : "upwork";
    const en = texteOffreDouble({ prenom: o.prenom, handle: o.handle, tarif: o.tarif === null ? null : Number(o.tarif), lundi: o.lundi, canal });
    const texte = await traduireSoigne(en, langue);
    if (simuler) {
      bilan.exemples.push({ langue, canal, texte_en: en, texte });
      continue;
    }
    const r = await envoyerDoublement(db, { poster: o.poster_id, canal, cle: `double_offre:${o.id}`, en, texte, langue, objet: "A 2nd TikTok account for you", tag: "double_offre" });
    // Envoyée quand le posteur l'a reçue quelque part en dehors du dashboard (Upwork ou email).
    const parti = r.canaux.filter((c) => c !== "dashboard");
    await db.rpc("double_offre_noter", { p_id: o.id, p_canaux: parti.length ? r.canaux : [], p_erreur: r.erreur });
    if (parti.length) bilan.envoyees++;
    if (r.erreur) bilan.erreurs.push(`${o.poster_id} : ${r.erreur}`);
  }
  return { ok: true, simulation: simuler, ...bilan };
}

/** 21/11 (Max) : le message du lundi où le 2e compte démarre. */
async function doublesDemarrages(db: Db, simuler: boolean) {
  const { data: pause } = await db.rpc("automation_en_pause");
  if (pause === true && !simuler) return { ok: false, error: "automatisation en pause : rien n'est parti" };
  const { data, error } = await db.rpc("doubles_demarrages_a_envoyer");
  if (error) throw new Error(error.message);
  const bilan = { envoyes: 0, erreurs: [] as string[], exemples: [] as { langue: string | null; texte: string }[] };
  for (const o of (data ?? []) as { id: string; poster_id: string; canal_paie: string; pays: string | null; handle1: string | null; handle2: string | null; lundi: string; tarif: number | null }[]) {
    const langue = await langueDuPays(db, o.pays);
    const en = texteDemarrageDouble({ handle1: o.handle1, handle2: o.handle2, tarif: o.tarif === null ? null : Number(o.tarif), lundi: o.lundi });
    const texte = await traduireSoigne(en, langue);
    if (simuler) {
      bilan.exemples.push({ langue, texte });
      continue;
    }
    const r = await envoyerDoublement(db, { poster: o.poster_id, canal: o.canal_paie === "ruul" ? "ruul" : "upwork", cle: `double_demarrage:${o.id}`, en, texte, langue, objet: "Your 2 accounts", tag: "double_demarrage" });
    if (r.canaux.some((c) => c !== "dashboard")) {
      await db.rpc("double_demarrage_noter", { p_id: o.id });
      bilan.envoyes++;
    }
    if (r.erreur) bilan.erreurs.push(`${o.poster_id} : ${r.erreur}`);
  }
  return { ok: true, simulation: simuler, ...bilan };
}

const TEXTE_FIN_IMMEDIAT = "We're ending our collaboration today, thank you for your understanding.";

async function reglageVrai(db: Db, cle: string): Promise<boolean> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", cle).maybeSingle();
  return data?.valeur === true || data?.valeur === "on";
}

const TEXTE_HANDLE_INCONNU = "Could you send us your TikTok handle so we can find your account?";

/** 21/11 : « envoyée par email » sur le dernier message du bot (ou de l'équipe) d'une demande. */
async function noterEnvoiEmail(db: Db, demande: string, statut: string) {
  const { data: m } = await db.from("support_messages").select("id, envois").eq("demande_id", demande).neq("auteur", "posteur")
    .order("cree_at", { ascending: false }).limit(1).maybeSingle();
  if (m?.id) await db.from("support_messages").update({ envois: { ...((m.envois as Record<string, string> | null) ?? {}), email: statut } }).eq("id", m.id);
}

/** 21/11 : on a déjà demandé son handle à cette adresse (7 jours) : une seule fois. */
async function handleDejaDemande(db: Db, email: string): Promise<boolean> {
  const { count } = await db.from("support_demandes").select("id", { count: "exact", head: true }).ilike("email_de", email.trim())
    .is("poster_id", null).gte("cree_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return (count ?? 0) > 0;
}

/** 21/11 : le posteur d'un email venu d'une adresse inconnue : @TikTok, numéro de contrat Upwork, puis nom exact (unique). */
async function posteurParIndices(db: Db, o: { texte: string; nom: string | null }): Promise<string | null> {
  for (const m of o.texte.matchAll(/@([a-z0-9._]{3,30})/gi)) {
    const h = m[1]!.replace(/\.+$/, "");
    const { data } = await db.from("comptes").select("poster_id").ilike("handle_tiktok", h).limit(2);
    if (data?.length === 1 && data[0]!.poster_id) return data[0]!.poster_id as string;
  }
  for (const m of o.texte.matchAll(/\b(\d{8,9})\b/g)) {
    const { data } = await db.from("profiles").select("id").eq("upwork_contract_id", m[1]!).limit(2);
    if (data?.length === 1) return data[0]!.id as string;
  }
  const nom = (o.nom ?? "").trim().replace(/\s+/g, " ");
  const parts = nom.split(" ");
  if (parts.length >= 2) {
    const { data } = await db.from("profiles").select("id").ilike("prenom", parts[0]!).ilike("nom", parts.slice(1).join(" ")).limit(2);
    if (data?.length === 1) return data[0]!.id as string;
  }
  return null;
}

/**
 * 21/11 (Max) : « les tickets de plus de 48 h → traités avec les nouvelles règles ». Chaque demande ouverte depuis plus
 * de 48 h repasse par l'agent (sa fiche, son historique) : réponse claire (niveau bot) → envoyée sur son canal, avec
 * (21/11 : sans « Sorry for the late reply ») ; arrêt, posteur arrêté ou cas pour Max → rien n'est envoyé, la demande reste à Max avec
 * son résumé. Une demande déjà rattrapée n'est jamais reprise (raison « rattrapage 21/11 »).
 */
async function rattrapageTickets(db: Db, limite: number, simuler: boolean) {
  const il48h = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data, error } = await db.from("support_demandes").select("id, poster_id, source, texte, langue, raison")
    .neq("statut", "resolu").lt("cree_at", il48h).not("poster_id", "is", null)
    .or("raison.is.null,raison.not.ilike.%rattrapage 21/11%").order("cree_at").limit(limite);
  if (error) throw new Error(error.message);
  const bilan = { envoyees: 0, pour_max: 0, arretes_fermes: 0, erreurs: [] as string[], exemples: [] as Record<string, unknown>[] };
  for (const dem of (data ?? []) as { id: string; poster_id: string; source: string | null; texte: string; langue: string | null; raison: string | null }[]) {
    const { data: stop } = await db.rpc("ne_plus_contacter_bloque", { p_poster: dem.poster_id });
    if (stop === true) {
      // POSTEUR ARRÊTÉ : plus de réponse.
      if (!simuler) await db.from("support_demandes").update({ statut: "resolu", resolu_at: new Date().toISOString(), verdict_fermeture: "pas_un_probleme", raison: `${dem.raison ?? ""} (rattrapage 21/11 : posteur arrêté)`.trim() }).eq("id", dem.id);
      bilan.arretes_fermes++;
      continue;
    }
    try {
      const r = await deciderBot(db, { message: dem.texte, source: dem.source === "slack_salon" ? "slack_salon" : "help", poster: dem.poster_id, profil: null, simulation: true });
      const clair = r.decision.niveau === "bot" && r.plan?.cas !== "arret" && !r.plan?.arret && r.decision.reponse !== TEXTE_ON_VERIFIE;
      if (!clair) {
        if (!simuler) {
          await db.from("support_demandes").update({ niveau: "max", resume: r.plan?.resume ?? null, action_proposee: r.plan?.action_proposee ?? null,
            brouillon: r.decision.reponse, raison: `${dem.raison ?? ""} (rattrapage 21/11 : pour Max)`.trim() }).eq("id", dem.id);
        }
        bilan.pour_max++;
        if (bilan.exemples.length < 6) bilan.exemples.push({ id: dem.id, pour: "max", resume: r.plan?.resume ?? r.decision.raison });
        continue;
      }
      // 21/11 (Max) : jamais « Sorry for the late reply ».
      const texte = r.texte;
      if (simuler) {
        if (bilan.exemples.length < 6) bilan.exemples.push({ id: dem.id, source: dem.source, texte });
        bilan.envoyees++;
        continue;
      }
      const m = await messageCanal(db, { id: dem.id, poster_id: dem.poster_id, source: dem.source }, texte);
      if (!m.ok) { bilan.erreurs.push(`${dem.id} : ${m.error ?? "envoi impossible"}`); continue; }
      await db.from("support_demandes").update({ statut: "bot", niveau: "bot", bot_reponse: texte, raison: `${dem.raison ?? ""} (rattrapage 21/11 : réponse envoyée)`.trim() }).eq("id", dem.id);
      bilan.envoyees++;
    } catch (e) {
      bilan.erreurs.push(`${dem.id} : ${messageErreur(e)}`);
    }
  }
  return { ok: true, simulation: simuler, traitees: (data ?? []).length, ...bilan };
}

/** Le motif interne d'un arrêt, en anglais clair, pour « because … ». */
async function raisonEnClair(motif: string | null): Promise<string | null> {
  if (!motif) return null;
  try {
    const r = (await generateTextFast(
      `Rewrite this internal reason for stopping a TikTok poster's contract as a short plain English clause that can follow the word "because" ` +
        `(e.g. "of missing posts", "you asked to stop", "the contract was ended on Upwork"). No names, no blame, 12 words max. Reply with the clause only.\n\n${motif}`,
    )).trim().replace(/^because\s+/i, "").replace(/[.\s]+$/, "");
    return r && r.length <= 140 ? r : null;
  } catch {
    return null;
  }
}

/** « same issue as X » : la demande ouverte d'origine (7 derniers jours) d'un posteur nommé X. */
async function demandeDOrigine(db: Db, nom: string, poster: string | null): Promise<string | null> {
  const motif = nom.replace(/[%_]/g, "").trim();
  if (motif.length < 2) return null;
  const { data: profils } = await db.from("profiles").select("id").or(`prenom.ilike.%${motif}%,nom.ilike.%${motif}%`).limit(10);
  const ids = (profils ?? []).map((p) => p.id as string).filter((id) => id !== poster);
  if (!ids.length) return null;
  const { data } = await db.from("support_demandes").select("id").in("poster_id", ids).in("statut", ["ouvert", "attente_posteur", "bot"])
    .gte("cree_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("cree_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Les règles de Max après la décision du modèle (modifie la décision en place) : textes fixes traduits, vraie situation,
 * écart dashboard, incident groupé, escalade utile. Rend le plan des écritures (apresDemande).
 */
/** 21/11 : combien de fois le bot a déjà répondu à ce problème Ruul (support_ruul_tentatives). */
async function tentativesRuul(db: Db, poster: string, cle: string): Promise<number> {
  const { data } = await db.from("support_ruul_tentatives").select("n").eq("poster_id", poster).eq("cle", cle).maybeSingle();
  return Number(data?.n ?? 0);
}

async function paysRuulRefuse(db: Db, poster: string): Promise<boolean> {
  const { data } = await db.rpc("ruul_pays_refuse", { p_poster: poster });
  return data === true;
}

/** Ses 3 étapes Ruul et son email de candidature. */
async function setupRuul(db: Db, poster: string): Promise<{ etapes: { inscrit: boolean; identite: boolean; banque: boolean; refus_identite?: number }; email: string | null }> {
  const [{ data: e }, { data: h }, { data: p }] = await Promise.all([
    db.rpc("ruul_etapes", { p_poster: poster }),
    db.from("hub_posteurs").select("email_perso").eq("profile_id", poster).maybeSingle(),
    db.from("profiles").select("ruul_email, email_perso").eq("id", poster).maybeSingle(),
  ]);
  const etapes = (e ?? { inscrit: false, identite: false, banque: false }) as { inscrit: boolean; identite: boolean; banque: boolean; refus_identite?: number };
  const email = [h?.email_perso, p?.ruul_email, p?.email_perso].map((x) => String(x ?? "").trim()).find((x) => x.includes("@") && !/@sophia\.com$/i.test(x)) ?? null;
  return { etapes, email };
}

async function appliquerRegles(
  db: Db,
  o: { message: string; poster: string | null; plateforme: "ruul" | "upwork" | null; etat: EtatReel | null; decision: DecisionBot; historique: { bot_reponse?: string | null }[]; simulation: boolean },
): Promise<PlanRegles> {
  const d = o.decision;
  const plan: PlanRegles = {
    cas: null, upwork: null, lien: null, doublon_de: null, incident: null, arret: false, incoherences: [],
    statut_posteur: ligneStatut(o.etat), resume: d.resume ?? null, action_proposee: d.action_proposee ?? null,
    tentative_ruul: null, escalade_ruul: false,
  };
  const fixe = (texte: string, categorie: string) => {
    d.reponse = texte;
    d.niveau = "bot";
    d.categorie = categorie;
    d.action = null;
    d.action_valeur = null;
    d.risque = d.risque.filter((r) => r !== "argent_tiers" && r !== "hors_plateforme");
  };
  // 21/11 (Max) : une proposition de 2e compte en cours et un « yes » / « no » court (Upwork, email, Help) : la réponse
  // est enregistrée (le 2e compte est créé s'il ne l'est pas encore) et le posteur reçoit la confirmation.
  if (o.poster) {
    const r = reponseDouble(o.message);
    if (r) {
      const { data: offre } = await db.rpc("double_jeudi_en_cours", { p_poster: o.poster });
      if (typeof offre === "string" && offre) {
        let lundi = lundiQuiSuit(new Date());
        if (!o.simulation) {
          const { data: rep } = await db.rpc("double_jeudi_repondre_interne", { p_id: offre, p_oui: r === "oui", p_via: "message" });
          const l = (rep as { lundi?: string } | null)?.lundi;
          if (l) lundi = l;
        }
        fixe(r === "oui" ? texteAccordDouble(lundi) : TEXTE_REFUS_DOUBLE, "double");
        plan.cas = "double_jeudi";
        d.personnel = true;
        d.reponse = await traduire(d.reponse, d.langue);
        return plan;
      }
    }
  }
  // 21/11 (Max, « Les situations ») : vérifier avant de répondre, une réponse adaptée, et on ferme.
  if (o.etat && situation(o.etat).statut === "kill" && !estDemandeArret(o.message)) {
    // 5. Posteur killé qui écrit.
    fixe(TEXTES_SITUATIONS.annule, "statut");
    plan.cas = "annule";
    plan.fermer = true;
    d.reponse = await traduire(d.reponse, d.langue);
    return plan;
  }
  const sit = situationFixe(o.message, { plateforme: o.plateforme });
  if (sit) {
    fixe(sit.texte, sit.categorie);
    plan.cas = `situation_${sit.cle}`;
    plan.fermer = sit.fermer;
    if (sit.qualite) plan.qualite = o.message.slice(0, 500);
    if (sit.jourCompte) plan.jour_compte = "Contenu faux signalé par le posteur : jour compté comme fait";
    if (sit.ticket) plan.ticket = sit.ticket;
    plan.resume = plan.resume ?? `Situation « ${sit.cle} » : réponse fixe.`;
    d.reponse = await traduire(d.reponse, d.langue);
    return plan;
  }
  if (o.poster && o.etat?.actif && estReactiver2eCompte(o.message)) {
    // 17. Réactiver son 2e compte : automatique s'il existe (et n'a pas été arrêté pour une raison) ; sinon Max.
    const { data: handle } = o.simulation ? { data: null } : await db.rpc("compte_reactiver_2e", { p_poster: o.poster });
    if (typeof handle === "string" && handle) {
      fixe(TEXTES_SITUATIONS.reactive, "tiktok");
      plan.cas = "situation_reactiver_2e_compte";
      plan.fermer = true;
      plan.resume = `2e compte @${handle} réactivé automatiquement.`;
      d.reponse = await traduire(d.reponse, d.langue);
      return plan;
    }
    d.niveau = "max";
    plan.action_proposee = "Réactiver son 2e compte : aucun 2e compte réactivable automatiquement (à vérifier).";
  }
  if (o.etat && estRienPrevu(o.message)) {
    // 1 et 2. « Nothing planned » : reporté (nouvelle date et ce qui manquait), sinon un vrai incident.
    const r = reponseRienPrevu({ aujourdhui: jourParisIso(new Date()), actif: o.etat.actif, cohorte: o.etat.cohorte, warmup: o.etat.warmup });
    if (r.texte) {
      fixe(r.texte, "posting");
      plan.cas = "situation_rien_prevu";
      plan.fermer = !r.incident;
      if (r.incident) plan.incident = { cle: "posts_manquants", titre: "Posts manquants (« nothing planned »)", groupe_seul: false };
      d.reponse = await traduire(d.reponse, d.langue);
      return plan;
    }
  }
  const attente = o.etat?.upwork_exception?.statut === "lien_attendu";
  const det = detecterCas(o.message, { plateforme: o.plateforme, attenteLienUpwork: attente });
  const cas = det.cas ?? casDeCategorie(d.categorie, o.plateforme);
  if (cas === "lien_post") {
    fixe(TEXTES.lien_post, "lien_post");
    plan.incident = { cle: "lien_post", titre: "Liens de posts impossibles à ajouter", groupe_seul: true };
  } else if (cas === "upwork_demande") {
    // 21/11 (Max) : pays refusé par Ruul → Upwork sans discuter ; 1re demande → une réponse (pas de frais, payé chaque
    // lundi, 5 minutes, sa prochaine étape) ; 2e demande → exception Upwork, sans discuter.
    const avant = o.poster ? await tentativesRuul(db, o.poster, "upwork_demande") : 0;
    const refuse = o.poster ? await paysRuulRefuse(db, o.poster) : false;
    if (decisionUpwork({ paysRefuse: refuse, demandesAvant: avant }) === "exception") {
      fixe(TEXTES.upwork_demande, "paie_upwork");
      plan.upwork = "demander";
    } else {
      const s = o.poster ? await setupRuul(db, o.poster) : null;
      fixe(TEXTES_RUUL.persuasion.replace("{etape}", texteEtape(s?.etapes ?? { inscrit: false, identite: false, banque: false }, s?.email ?? null)), "paie_upwork");
    }
    plan.tentative_ruul = "upwork_demande";
  } else if (cas === "upwork_lien" && det.lien) {
    fixe(estProfilUpwork(det.lien) ? TEXTES.upwork_lien_ok : TEXTES.upwork_lien_invalide, "paie_upwork");
    if (estProfilUpwork(det.lien)) {
      plan.upwork = "lien";
      plan.lien = det.lien;
    }
  } else if (cas === "parrainage_cash") {
    fixe(TEXTES.parrainage_cash, "parrainage_cash");
  } else if (cas === "meme_probleme" && det.meme_que) {
    const origine = o.simulation ? null : await demandeDOrigine(db, det.meme_que, o.poster);
    if (origine) {
      fixe(TEXTES.meme_probleme, d.categorie);
      plan.doublon_de = origine;
    } else fixe(TEXTES.flou, "flou");
  } else if (cas === "flou") {
    fixe(TEXTES.flou, "flou");
  } else if (cas === "pas_de_reponse") {
    fixe(TEXTES.pas_de_reponse, "pas_de_reponse");
  }
  if (cas && cas !== "pas_regle") plan.cas = cas;

  // 19/11 (Max) : posteurs Ruul : le code à 6 chiffres (il vient de Ruul) et « quand serai-je payé ? » (le vrai statut).
  const ruul = o.plateforme === "ruul" || o.etat?.canal_paie === "ruul";
  // 21/11 (Max) : réponse à la question « Do you want to end our collaboration? » : « yes » = arrêt, « no » = rien.
  const derniereReponse = o.historique.find((h) => h.bot_reponse)?.bot_reponse ?? null;
  const suiteQuestion = aDemandeArret(derniereReponse) ? reponseDouble(o.message) : null;
  const demandeArretMsg = suiteQuestion === "oui" || (suiteQuestion !== "non" &&
    (estDemandeArret(o.message) || d.action === "arret" || (d.categorie === "arret" && !estQuestionStatut(o.message) && !estArretDouteux(o.message))));
  if (!plan.cas && suiteQuestion === "non") {
    fixe("Great, nothing changes for you. Keep up the good work!", "arret");
    plan.cas = "arret";
  } else if (!plan.cas && !demandeArretMsg && estArretDouteux(o.message)) {
    // Frustration ou condition : une seule question, jamais d'arrêt sur un doute.
    fixe(QUESTION_ARRET, "arret");
    plan.cas = "arret";
  }
  // 21/11 (Max) : « je n'arrive pas à activer Ruul » : les cas connus réglés par le bot ; le même problème une 3e fois,
  // escalade (#a-os-tickets) avec l'étape bloquée, ce qui a été tenté et une réponse proposée.
  if (!plan.cas && ruul && !demandeArretMsg && !(estQuestionPaie(o.message) && !estCodeRuul(o.message))) {
    const casR = detecterCasRuul(o.message, { categorie: d.categorie, estCode: estCodeRuul(o.message) });
    if (casR) {
      const avant = o.poster ? await tentativesRuul(db, o.poster, casR) : 0;
      const s = o.poster ? await setupRuul(db, o.poster) : null;
      const etapes = s?.etapes ?? { inscrit: false, identite: false, banque: false, refus_identite: 0 };
      const nomPropose = casR === "nom" && d.action === "nom_legal" && d.action_valeur && separerNomLegal(d.action_valeur) ? d.action_valeur.trim() : null;
      const r = reponseCasRuul(casR, { message: o.message, email: s?.email ?? null, refusIdentite: Number(etapes.refus_identite ?? 0), demandesAvant: avant, nomPropose });
      plan.cas = `ruul_${casR}`;
      plan.tentative_ruul = casR;
      d.personnel = true;
      if (escalader(avant) && !r.upwork) {
        // 21/11 (Max) : un problème Ruul qu'on n'arrive pas à régler : le posteur contacte le support Ruul ; s'il n'est
        // pas réglé à l'échéance (7 jours), la collaboration s'arrête (ruul_support_echeances, chaque jour).
        const echeance = new Date(Date.now() + 7 * 86_400_000);
        const dateClaire = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Europe/Paris" }).format(echeance);
        fixe(TEXTES_RUUL.support_ruul.replace("{date}", dateClaire), "ruul");
        plan.support_ruul = { cle: casR, echeance: jourParisIso(echeance) };
        plan.resume = `Ruul bloqué à l'étape « ${etapeBloquee(etapes)} » (${casR}) : renvoyé au support Ruul, échéance ${jourParisIso(echeance)}.`;
      } else {
        fixe(r.texte, "ruul");
        if (r.upwork) plan.upwork = "demander";
        if (r.action) {
          d.action = r.action.type;
          d.action_valeur = r.action.valeur;
        }
      }
    }
  }
  if (!plan.cas && ruul && !demandeArretMsg && (estCodeRuul(o.message) || estQuestionPaie(o.message))) {
    const { data: pr } = o.poster ? await db.from("profiles").select("ruul_email").eq("id", o.poster).maybeSingle() : { data: null };
    const emailRuul = (pr?.ruul_email as string | null | undefined) ?? null;
    if (estCodeRuul(o.message)) {
      fixe(texteCodeRuul(emailRuul), "ruul");
      plan.cas = "code_ruul";
      d.personnel = true;
    } else if (o.etat) {
      const pasRecu = ditPasRecu(o.message);
      fixe(textePaieRuul(o.etat, new Date(), emailRuul), "paie");
      plan.cas = "paie_ruul";
      // 21/11 (Max) : lot parti mais pas arrivé jeudi, ou échec chez Ruul : à Max avec le statut Ruul du paiement.
      const enRoute = paieRuulEnRoute(o.etat, new Date());
      if (enRoute?.escalader) {
        d.niveau = "max";
        plan.resume = `Paiement Ruul de la semaine du ${enRoute.semaine} pas arrivé (statut Ruul : ${enRoute.statut}).`;
        plan.action_proposee = "vérifier le paiement sur Ruul";
      }
      // Un montant ou une adresse : jamais dans un salon public (message privé).
      d.personnel = true;
      // Payé chez nous mais « pas reçu » : la réponse part, et Max regarde (jamais de litige sans lui).
      if (pasRecu && o.etat.paie.some((p) => p.paye_at || p.ruul_statut === "PAID")) {
        d.niveau = "max";
        plan.resume = "Paiement Ruul marqué payé mais le posteur dit ne pas l'avoir reçu.";
        plan.action_proposee = "vérifier le paiement sur Ruul";
      }
    }
  }

  // 6. Arrêts et kills : la vraie situation, jamais supposée.
  if (!plan.cas && o.etat) {
    const dejaAnnonce = o.historique.some((h) => /\b(stopped|ended|terminated|no longer active)\b/i.test(h.bot_reponse ?? ""));
    const s = situation(o.etat, dejaAnnonce);
    const demandeArret = demandeArretMsg;
    const surLeStatut = demandeArret || estQuestionStatut(o.message) || d.categorie === "arret" || d.categorie === "statut";
    // 19/11 (Max) : une demande d'arrêt déjà notée (demandes_arret, pas encore décidée) : le compte est encore actif
    // jusqu'au samedi, mais on ne lui dit jamais « continue de poster ».
    // 21/11 (Max) : avec l'arrêt immédiat, une demande claire est exécutée tout de suite, même si un arrêt était
    // déjà noté pour le samedi.
    const immediat = demandeArret && s.statut === "actif" && !!o.poster && await reglageVrai(db, "arret_immediat");
    const arretDejaDemande = !immediat && surLeStatut && s.statut === "actif" && !!o.poster && await arretEnAttente(db, o.poster);
    if (surLeStatut) {
      plan.incoherences = s.incoherences;
      if (arretDejaDemande) {
        fixe(texteArret(o.etat.canal_paie, new Date()), "arret");
        plan.cas = "arret";
      } else if (immediat && o.poster) {
        // 21/11 (Max) : demande claire = fin immédiate : le message de fin (avec la dernière semaine si elle est due),
        // puis l'arrêt (arrets) : posteur et comptes désactivés, Slack, relances coupées, contrat fermé après la paie.
        const due = s.a_payer.length > 0 || (o.etat.posts_semaine?.publies ?? 0) > 0;
        const en = TEXTE_FIN_IMMEDIAT + (due ? ` Your last week will of course be paid on ${lundiEnClair(lundiQuiSuit(new Date()))}.` : "");
        fixe(en, "arret");
        plan.cas = "arret";
        plan.arret_immediat = { en };
        plan.resume = "Le posteur a demandé l'arrêt : fin immédiate.";
      } else if (demandeArret && s.statut === "actif") {
        // 18/11 (Max) : la demande d'arrêt va directement au Kill du samedi (pré-coché), rien n'est fermé avant.
        // 19/11 (Max) : une réponse qui dit la vraie situation : traitée samedi, payée lundi, arrêter de poster samedi.
        fixe(texteArret(o.etat.canal_paie, new Date()), "arret");
        plan.cas = "arret";
        plan.arret = true;
        plan.resume = plan.resume ?? "Le posteur demande l'arrêt de son contrat.";
        plan.action_proposee = `exécuter l'arrêt (désactiver le compte${o.etat.canal_paie === "upwork" && o.etat.contrat_upwork?.actif ? `, fermer le contrat Upwork ${o.etat.contrat_upwork.id}` : ""})`;
      } else if (s.statut === "arret_en_cours") {
        // 19/11 (Max) : arrêt déjà demandé : la même réponse avec les dates, jamais « continue de poster ».
        fixe(texteArret(o.etat.canal_paie, new Date()), "arret");
        plan.cas = "arret";
      } else {
        // 18/11 (Max) : exactement le texte de la page « collaboration terminée » / du bandeau du dashboard.
        const t = s.statut === "kill"
          ? await texteFinBot(db, o.poster, o.etat, s)
          : (s.statut === "actif" ? await bandeauBot(db, o.poster) : null) ?? texteStatut(s, null);
        fixe(t ?? TEXTES.inactif_sans_raison, d.categorie === "arret" ? "arret" : "statut");
        plan.cas = "statut";
        if (!t) d.niveau = "adrien";
      }
      if (s.incoherences.length) {
        d.niveau = "adrien";
        plan.resume = `Incohérence de statut : ${s.incoherences.join(" ; ")}`;
        plan.action_proposee = s.incoherences.some((x) => x.includes("contrat Upwork")) ? "fermer le contrat Upwork" : "vérifier le statut du posteur";
      }
    }
  }

  // 2. Le dashboard contredit ce que vit le posteur : bug de notre côté.
  if (!plan.cas && d.ecart_dashboard) {
    d.reponse = TEXTES.ecart_dashboard;
    d.niveau = "adrien";
    d.action = null;
    plan.cas = "ecart_dashboard";
    plan.resume = `Écart dashboard / données : ${d.ecart_detail ?? d.raison}`;
    plan.action_proposee = plan.action_proposee ?? "bug dashboard à corriger";
    plan.incident = { cle: "ecart_dashboard", titre: "Écart entre le dashboard et nos données", groupe_seul: false };
  }

  // 7. Un bug technique réel : regroupé avec les mêmes signalements du jour.
  if (!plan.incident && d.niveau !== "bot" && d.bug_cle) {
    plan.incident = { cle: d.bug_cle, titre: plan.resume ?? d.raison ?? d.bug_cle, groupe_seul: false };
  }

  // 5. La langue du message : les textes fixes sont traduits ; « We're checking » aussi.
  if (plan.cas || d.reponse === TEXTE_ON_VERIFIE) d.reponse = await traduire(d.reponse, d.langue);
  if (!d.reponse.trim()) d.reponse = await traduire(TEXTES.equipe, d.langue);
  return plan;
}

/** Une demande d'arrêt notée et pas encore décidée (le Kill du samedi la traite). */
async function arretEnAttente(db: Db, poster: string): Promise<boolean> {
  const { data } = await db.from("demandes_arret").select("id").eq("poster_id", poster).is("decision", null).limit(1);
  return (data ?? []).length > 0;
}

/** Les écritures du plan, une fois la demande enregistrée. Ne lève pas. */
async function apresDemande(
  db: Db,
  o: { poster: string | null; demande: string | null; plan: PlanRegles | undefined; decision: DecisionBot; source: string; texte: string },
): Promise<string[]> {
  const fait: string[] = [];
  const { plan, decision: d } = o;
  if (!plan || !o.demande) return fait;
  try {
    await db.from("support_demandes").update({
      resume: plan.resume, action_proposee: plan.action_proposee, statut_posteur: plan.statut_posteur,
    }).eq("id", o.demande);
    const source = o.source === "slack_salon" || o.source === "slack_aide" ? "slack" : o.source;
    if (o.poster && plan.tentative_ruul) {
      const { error } = await db.rpc("support_ruul_tentative_noter", { p_poster: o.poster, p_cle: plan.tentative_ruul });
      if (error) fait.push(`tentative Ruul : ${error.message}`);
    }
    if (o.poster && plan.support_ruul) {
      const { error } = await db.from("ruul_support_renvois").upsert(
        { poster_id: o.poster, cle: plan.support_ruul.cle, echeance: plan.support_ruul.echeance, demande_id: o.demande, renvoye_at: new Date().toISOString(), resolu_at: null, arret_at: null },
        { onConflict: "poster_id" },
      );
      fait.push(error ? `support Ruul : ${error.message}` : `renvoyé au support Ruul (échéance ${plan.support_ruul.echeance})`);
    }
    if (plan.escalade_ruul) {
      const r = await envoyerTicket(db, null, o.demande, "Ruul : le bot a échoué 2 fois sur le même problème. Adrien valide la réponse proposée en un clic (Boîte) ou contacte le support Ruul.");
      fait.push(r.ok ? "escalade Ruul : ticket #a-os-tickets" : `escalade Ruul : ${(r as { error?: string }).error ?? "échec"}`);
    }
    if (o.poster && plan.upwork === "demander") {
      const { error } = await db.rpc("upwork_exception_demander", { p_poster: o.poster, p_source: source, p_demande: o.demande });
      fait.push(error ? `exception Upwork : ${error.message}` : "exception Upwork : lien attendu");
    }
    if (o.poster && plan.upwork === "lien" && plan.lien) {
      const { data, error } = await db.rpc("upwork_exception_lien", { p_poster: o.poster, p_url: plan.lien, p_source: source });
      fait.push(error ? `exception Upwork : ${error.message}` : `exception Upwork : ${(data as { statut?: string })?.statut ?? "?"} (page À ajouter sur Upwork)`);
    }
    if (plan.doublon_de) {
      const maintenant = new Date().toISOString();
      await db.from("support_messages").insert({ demande_id: plan.doublon_de, auteur: "posteur", auteur_id: o.poster, texte: `[même problème] ${o.texte}`.slice(0, 4000) });
      await db.from("support_demandes").update({ doublon_de: plan.doublon_de, statut: "resolu", resolu_at: maintenant, resolu_par_bot: true, verdict_fermeture: "doublon" }).eq("id", o.demande);
      const { data: orig } = await db.from("support_demandes").select("incident_id, categorie").eq("id", plan.doublon_de).maybeSingle();
      if (orig?.incident_id) {
        const { data: inc } = await db.from("support_incidents").select("cle, titre").eq("id", orig.incident_id).maybeSingle();
        if (inc) plan.incident = { cle: inc.cle as string, titre: inc.titre as string, groupe_seul: false };
      }
      fait.push("rattachée à la demande d'origine (doublon)");
    }
    if (plan.incident) fait.push(await incidentAjouter(db, o.poster, o.demande, plan.incident, d.categorie));
    if (o.poster && plan.jour_compte) {
      // 21/11 (Max, règle 6) : texte vraiment faux → le jour compte comme fait.
      const { data: c, error } = await db.rpc("jour_crediter", { p_poster: o.poster, p_jour: jourParisIso(new Date()), p_raison: plan.jour_compte });
      fait.push(error ? `jour compté : ${error.message}` : `jour compté comme fait (${c ?? 0} post(s))`);
    }
    if (plan.ticket) {
      // 21/11 (Max) : un bug technique → un ticket au format d'Adrien ; la demande reste ouverte jusqu'à ce que ce soit réglé.
      const r = await envoyerTicket(db, null, o.demande, plan.ticket);
      fait.push(r.ok ? "ticket #a-os-tickets" : `ticket : ${(r as { error?: string }).error ?? "échec"}`);
    }
    if (o.poster && plan.qualite) {
      const { error } = await db.from("contenu_signalements").insert({ poster_id: o.poster, demande_id: o.demande, texte: plan.qualite });
      fait.push(error ? `qualité : ${error.message}` : "contenu signalé à la qualité");
    }
    if (plan.fermer && !plan.incident) {
      await db.from("support_demandes").update({ statut: "resolu", resolu_at: new Date().toISOString(), resolu_par_bot: true, verdict_fermeture: "regle_bot" }).eq("id", o.demande);
      fait.push("fermée (réponse envoyée)");
    }
    if (o.poster && plan.arret_immediat) {
      // La réponse (le message de fin) est déjà partie : elle devient aussi la page de fin, notée envoyée (le passage
      // des textes de fin ne la renvoie pas), puis l'arrêt est créé.
      const { data: lg } = await db.from("support_demandes").select("langue, bot_reponse").eq("id", o.demande).maybeSingle();
      await db.rpc("texte_poster_ecrire", { p_poster: o.poster, p_cle: "fin", p_en: plan.arret_immediat.en, p_texte: String(lg?.bot_reponse ?? plan.arret_immediat.en), p_langue: (lg?.langue as string | null) ?? null });
      await db.rpc("texte_poster_envoye", { p_poster: o.poster, p_cle: "fin", p_erreur: null });
      const { data: deja } = await db.from("arrets").select("id").eq("poster_id", o.poster).is("annule_at", null).in("statut", ["a_faire", "fait"]).limit(1);
      if (!deja?.length) {
        const { error } = await db.from("arrets").insert({ poster_id: o.poster, source: "je_ne_veux_plus", motif: `Demande du posteur : ${o.texte.slice(0, 300)}` });
        fait.push(error ? `arrêt : ${error.message}` : "arrêt immédiat fait (OS, Slack, relances ; contrat fermé après la paie)");
      } else fait.push("arrêt : déjà fait");
      await db.from("support_demandes").update({ statut: "resolu", resolu_at: new Date().toISOString(), verdict_fermeture: "regle_bot" }).eq("id", o.demande);
    }
    if (o.poster && plan.arret) {
      // 18/11 (Max) : demande d'arrêt notée (relances coupées, Kill pré-coché au samedi suivant) ; rien n'est fermé
      // maintenant : le samedi exécute le Kill, la confirmation part au posteur une fois l'arrêt fait (suiviSupport).
      const { data: note, error } = await db.rpc("demande_arret_noter", { p_poster: o.poster, p_source: "message", p_raison: o.texte.slice(0, 500), p_reponse: null });
      await db.from("support_demandes").update({ suivi: "arret_attendu" }).eq("id", o.demande);
      fait.push(error ? `arrêt : ${error.message}` : note ? "arrêt : Kill pré-coché au samedi" : "arrêt : déjà demandé (Kill pré-coché au samedi)");
    }
    if (o.poster && plan.incoherences.length) {
      await db.rpc("probleme_ajouter", {
        p_type: "incoherence_statut", p_ref: `${o.poster}:incoherence`, p_poster: o.poster, p_contrat: null, p_categorie: "stop",
        p_resume: "Incohérence de statut", p_texte: plan.incoherences.join(" ; "), p_at: new Date().toISOString(), p_lien: null, p_canal: "os", p_par: null,
      });
      fait.push("incohérence signalée");
    }
  } catch (erreur) {
    fait.push(`règles : ${messageErreur(erreur)}`);
  }
  return fait;
}

/**
 * Un incident groupé par bug et par jour. Liens de posts : jamais d'escalade individuelle ; un seul ticket dans
 * #a-os-tickets dès 2 posteurs (le même fil ensuite). Autres bugs : la 1re demande part en ticket comme avant ;
 * les suivantes rejoignent son fil au lieu d'ouvrir un nouveau ticket.
 */
async function incidentAjouter(db: Db, poster: string | null, demande: string, inc: { cle: string; titre: string; groupe_seul: boolean }, categorie: string): Promise<string> {
  const { data, error } = await db.rpc("support_incident_ajouter", { p_cle: inc.cle, p_titre: inc.titre, p_categorie: categorie, p_poster: poster, p_demande: demande });
  if (error) return `incident : ${error.message}`;
  const r = data as { id: string; nb: number; nouveau_posteur: boolean; ticket_at: string | null; ticket_ts: string | null };
  const jeton = jetonSlackFaq();
  const lire = async () => (await db.rpc("support_incident_lire", { p_id: r.id })).data as { titre: string; posteurs: { nom: string; plateforme: string }[]; messages: string[] } | null;
  if (r.ticket_ts) {
    // Le ticket existe : la demande le rejoint (✅ dessus préviendra aussi ce posteur).
    await db.from("support_demandes").update({ ticket_at: r.ticket_at, ticket_slack_ts: r.ticket_ts }).eq("id", demande);
    if (r.nouveau_posteur && jeton && poster) {
      const f = await fiche(db, poster);
      await posterSlack(jeton, CANAL_TICKETS, `+ ${f?.nom ?? "un posteur"} (${f?.plateforme === "ruul" ? "Ruul" : "Upwork"}) — même problème.`, r.ticket_ts);
    }
    return `incident ${inc.cle} (${r.nb} posteurs, ticket existant)`;
  }
  if (!inc.groupe_seul || r.nb < 2) return `incident ${inc.cle} (${r.nb} posteur${r.nb > 1 ? "s" : ""})`;
  // Liens de posts : 2 posteurs ou plus le même jour → UN ticket pour l'équipe tech.
  if (modeAction(await lireControle(db), "ticket_os") !== "agir" || !jeton) return `incident ${inc.cle} (${r.nb} posteurs, ticket pas envoyé : Contrôle ou jeton)`;
  const i = await lire();
  const texte = [
    `🎫 Ticket (Support OS) — Incident groupé : ${i?.titre ?? inc.titre} (${r.nb} posteurs aujourd'hui)`,
    ...(i?.posteurs ?? []).map((p) => `• ${p.nom} (${p.plateforme === "ruul" ? "Ruul" : "Upwork"})`),
    ...(i?.messages ?? []).slice(0, 5).map((m) => `« ${m.replace(/\s+/g, " ")} »`),
    "Réponse déjà envoyée à chacun : « As long as you posted, it's fine… » (pas d'escalade individuelle).",
    `Action proposée : corriger le bug d'ajout du lien. Support : ${OS_URL}/admin/auto/support`,
  ].join("\n");
  const t = await posterSlack(jeton, CANAL_TICKETS, texte);
  if (!t.ok) return `incident ${inc.cle} : ticket pas envoyé (${t.error})`;
  const maintenant = new Date().toISOString();
  await db.from("support_incidents").update({ ticket_at: maintenant, ticket_ts: t.ts ?? null }).eq("id", r.id);
  const { data: inc2 } = await db.from("support_incidents").select("demandes").eq("id", r.id).maybeSingle();
  const ids = ((inc2?.demandes ?? []) as string[]);
  if (ids.length) await db.from("support_demandes").update({ ticket_at: maintenant, ticket_slack_ts: t.ts ?? null }).in("id", ids);
  await journaliser(db, { qui: "cerveau_support", quoi: "ticket_os", poster_id: poster, demande_id: demande, resultat: `incident groupé ${inc.cle} : ticket envoyé (${r.nb} posteurs)` });
  return `incident ${inc.cle} : ticket groupé envoyé (${r.nb} posteurs)`;
}

/**
 * 8. Le posteur répond que ce n'est pas réglé : sa dernière demande (7 jours) est rouverte et repart en escalade avec
 * le contexte, au lieu d'une nouvelle demande. Rend la réponse à lui envoyer, ou null.
 */
async function rouvrirSiPasRegle(db: Db, poster: string, texte: string, canal: string): Promise<{ id: string; reponse: string } | null> {
  // 22/11 (Max) : une question de contenu qui revient reçoit à nouveau sa réponse (jamais « rouverte » sans réponse).
  if (!estPasRegle(texte) || situationFixe(texte)) return null;
  const { data: d } = await db.from("support_demandes").select("id, niveau, langue, statut")
    .eq("poster_id", poster).in("statut", ["bot", "attente_posteur", "resolu"]).is("doublon_de", null)
    .gte("cree_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("cree_at", { ascending: false }).limit(1).maybeSingle();
  if (!d?.id) return null;
  const maintenant = new Date().toISOString();
  await db.from("support_messages").insert({ demande_id: d.id, auteur: "posteur", auteur_id: poster, texte: texte.slice(0, 4000) });
  await db.from("support_demandes").update({
    statut: "ouvert", rouverte_at: maintenant, posteur_at: maintenant, maj_at: maintenant, resolu_at: null, verdict_fermeture: null,
    niveau: d.niveau === "max" ? "max" : "adrien", remonte_par: "posteur", remonte_at: maintenant,
    remonte_pourquoi: `Le posteur dit que ce n'est pas réglé (${canal}) : « ${texte.slice(0, 200)} »`,
  }).eq("id", d.id);
  await journaliser(db, { qui: "cerveau_support", quoi: "rouverte", poster_id: poster, canal, demande_id: d.id, resultat: "demande rouverte : pas réglée selon le posteur" });
  return { id: d.id as string, reponse: signer(await traduire(TEXTES.rouverte, d.langue as string | null), d.langue as string | null) };
}

/**
 * 8. Le suivi (cron support-suivi, toutes les heures) : sans réponse du posteur 48 h après une réponse qui règle le
 * problème, la demande passe « résolu » (verdict rempli) ; un arrêt demandé est confirmé au posteur seulement
 * une fois fait dans l'OS (comptes désactivés, contrat Upwork fermé si Upwork).
 */
// 21/11 (Max) : « Le bot a répondu et le posteur n'a pas relancé en 24 h : ticket fermé. Il se rouvre si le posteur
// répond. Doublons fusionnés. » Pour toutes les demandes (plus seulement celles d'après le 18/11).

async function suiviSupport(db: Db) {
  const il24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const il48h = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const maintenant = new Date().toISOString();
  const bilan: Record<string, number> = { regle_bot: 0, regle_equipe: 0, pas_un_probleme: 0, arret_confirme: 0, doublon: 0 };
  // Réglées par le bot (réponse envoyée), sans retour du posteur depuis 24 h. Jamais un cas pour Max.
  const { data: bots } = await db.from("support_demandes").select("id, categorie, cree_at, posteur_at, niveau, statut, bot_reponse")
    .in("statut", ["bot", "ouvert"]).is("suivi", null).neq("niveau", "max").not("bot_reponse", "is", null)
    .lt("cree_at", il24h).limit(300);
  for (const d of (bots ?? []) as { id: string; categorie: string | null; cree_at: string; posteur_at: string | null; niveau: string | null; statut: string; bot_reponse: string | null }[]) {
    if (!d.bot_reponse?.trim()) continue;
    if (d.statut === "ouvert" && d.niveau !== "bot") continue;
    // Le posteur a écrit après sa demande (relance) : elle reste ouverte.
    if (d.posteur_at && new Date(d.posteur_at).getTime() > new Date(d.cree_at).getTime() + 60_000) continue;
    const verdict = d.categorie === "flou" || d.categorie === "salutation" ? "pas_un_probleme" : "regle_bot";
    await db.from("support_demandes").update({ statut: "resolu", resolu_at: maintenant, resolu_par_bot: true, verdict_fermeture: verdict, maj_at: maintenant }).eq("id", d.id);
    bilan[verdict]++;
  }
  // Réponse de l'équipe envoyée, sans retour du posteur depuis 48 h.
  const { data: equipe } = await db.from("support_demandes").select("id, posteur_at, equipe_at").eq("statut", "attente_posteur").is("suivi", null)
    .not("equipe_at", "is", null).lt("equipe_at", il48h).limit(200);
  for (const d of (equipe ?? []) as { id: string; posteur_at: string | null; equipe_at: string }[]) {
    if (d.posteur_at && d.posteur_at > d.equipe_at) continue;
    await db.from("support_demandes").update({ statut: "resolu", resolu_at: maintenant, verdict_fermeture: "regle_equipe", maj_at: maintenant }).eq("id", d.id);
    bilan.regle_equipe++;
  }
  // Doublons : plusieurs demandes ouvertes du même posteur → une seule (la plus récente), les autres fusionnées.
  const { data: ouvertes } = await db.from("support_demandes").select("id, poster_id, cree_at, niveau").neq("statut", "resolu")
    .not("poster_id", "is", null).order("cree_at", { ascending: false }).limit(1000);
  const garde = new Map<string, string>();
  for (const d of (ouvertes ?? []) as { id: string; poster_id: string; cree_at: string; niveau: string | null }[]) {
    const recente = garde.get(d.poster_id);
    if (!recente) { garde.set(d.poster_id, d.id); continue; }
    await db.from("support_demandes").update({ statut: "resolu", resolu_at: maintenant, verdict_fermeture: "doublon", doublon_de: recente, maj_at: maintenant }).eq("id", d.id);
    // Le niveau le plus haut reste visible sur la demande gardée.
    if (d.niveau === "max") await db.from("support_demandes").update({ niveau: "max" }).eq("id", recente);
    bilan.doublon++;
  }
  // Arrêts demandés : la confirmation part seulement quand l'arrêt est fait.
  const { data: arrets } = await db.from("support_demandes").select("id, poster_id, source, langue").eq("suivi", "arret_attendu").limit(50);
  for (const d of (arrets ?? []) as { id: string; poster_id: string | null; source: string | null; langue: string | null }[]) {
    if (!d.poster_id) continue;
    const e = await etatReel(db, d.poster_id);
    if (!e) continue;
    const fait = e.comptes_actifs === 0 && !(e.canal_paie === "upwork" && e.contrat_upwork?.actif);
    if (!fait) continue;
    const m = await messageCanal(db, { id: d.id, poster_id: d.poster_id, source: d.source }, signer(await traduire(TEXTES.arret_confirme, d.langue), d.langue));
    if (!m.ok) continue;
    await db.from("support_demandes").update({ suivi: "arret_confirme", statut: "resolu", resolu_at: maintenant, verdict_fermeture: "regle_equipe", maj_at: maintenant }).eq("id", d.id);
    bilan.arret_confirme++;
  }
  return { ok: true, ...bilan };
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
      const r = await deciderBot(db, { message: t.message, source: t.source, poster: t.poster_id, profil: t.profil, historique: t.historique, simulation: true });
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
    const r = await traiterCarteMessage(db, c, ["reponse", "slack"]);
    if (r) resultats.push(r);
  }
  return { ok: true, traites: resultats.length, resultats };
}

/**
 * 21/11 (Max) : un STOP est entièrement automatique. Les cartes « stop » (bouton « I want to stop », message Upwork ou
 * Slack) arrivées depuis le réglage stops_cartes_depuis passent par le support, comme un message : une demande claire
 * = message de fin et arrêt immédiat (arrets), puis la carte se ferme (0806) ; un doute = une seule question. La
 * carte ne remonte à Max que si l'arrêt échoue (carte « arret_echec »).
 */
async function stopsCartes(db: Db) {
  const { data: r } = await db.from("reglages").select("valeur").eq("cle", "stops_cartes_depuis").maybeSingle();
  const depuis = typeof r?.valeur === "string" ? r.valeur : null;
  if (!depuis) return { ok: true, traites: 0, raison: "stops_cartes_depuis absent" };
  const { data, error } = await db.from("problemes").select("id, poster_id, sources, created_at")
    .eq("statut", "ouvert").eq("categorie", "stop").not("poster_id", "is", null)
    .gte("created_at", depuis).order("created_at").limit(20);
  if (error) throw new Error(error.message);
  const cartes = (data ?? []) as { id: string; poster_id: string; sources: SourceProbleme[] | null }[];
  if (!cartes.length) return { ok: true, traites: 0 };
  const { data: faits } = await db.from("support_demandes").select("probleme_id").in("probleme_id", cartes.map((c) => c.id));
  const deja = new Set((faits ?? []).map((f) => f.probleme_id as string));
  const resultats: { probleme: string; niveau: string; envoi: string }[] = [];
  for (const c of cartes) {
    if (deja.has(c.id) || resultats.length >= 10) continue;
    const res = await traiterCarteMessage(db, c, ["reponse", "slack", "demande_arret"]);
    if (res) resultats.push(res);
  }
  return { ok: true, traites: resultats.length, resultats };
}

/** Une carte (un message du posteur) traitée par le support comme un message reçu ; null si rien à traiter. */
async function traiterCarteMessage(
  db: Db,
  c: { id: string; poster_id: string; sources: SourceProbleme[] | null },
  types: readonly string[],
): Promise<{ probleme: string; niveau: string; envoi: string } | null> {
  {
    const src = (c.sources ?? []).filter((x) => types.includes(x.type ?? ""));
    // « Asked to stop (message) : … » (demande_arret) : le message du posteur, sans le préfixe interne.
    const texte = src.map((x) => (x.texte ?? "").replace(/^Asked to stop \([^)]*\)\s*:\s*/i, "")).filter(Boolean).join("\n").trim();
    // 13/11 (Max) : la vraie source (Upwork ou Slack), plus « help ».
    const canal = src.some((x) => x.canal === "upwork") ? "upwork" : "slack";
    if (!texte) return null;
    // 13/11 (Max) : un simple accusé (« thank you », « ok », « I'll do it tonight ») : pas de demande, « vu » dans le fil.
    if (accuseReception(texte)) {
      await noterVu(db, c.poster_id, canal, texte, `probleme:${c.id}`);
      return null;
    }
    const rouverte = await rouvrirSiPasRegle(db, c.poster_id, texte, canal);
    if (rouverte) {
      await db.from("support_demandes").update({ probleme_id: c.id }).eq("id", rouverte.id).is("probleme_id", null);
      const envoi = await envoyerAuPosteur(db, c.poster_id, rouverte.reponse);
      return { probleme: c.id, niveau: "rouverte", envoi };
    }
    const r = await deciderBot(db, { message: texte, source: "help", poster: c.poster_id, profil: null, canal: canal === "upwork" ? "upwork" : "slack" });
    const d = r.decision;
    if (d.categorie === "salutation") {
      await noterVu(db, c.poster_id, canal, texte, `probleme:${c.id}`);
      return null;
    }
    const parBot = d.niveau === "bot" && d.reponse !== TEXTE_ON_VERIFIE;
    let envoi = "rien";
    let action: string | null = null;
    if (parBot) {
      action = d.action ? await executerAction(db, c.poster_id, d, texte) : null;
      envoi = await envoyerAuPosteur(db, c.poster_id, r.texte);
    } else if (!r.controle.muet) {
      // 17/11 (Max, point 7) : chaque demande reçoit au minimum une réponse.
      envoi = await envoyerAuPosteur(db, c.poster_id, r.texte);
    }
    const { data: aj, error: e } = await db.rpc("support_ajouter", {
      p: {
        poster_id: c.poster_id, type: "question", categorie: d.categorie, texte, bot_reponse: envoi !== "rien" ? r.texte : null, source: canal,
        bot_decision: d.niveau, brouillon: parBot ? null : brouillonDe(r), escalader: !parBot,
      },
    });
    if (e) return { probleme: c.id, niveau: d.niveau, envoi: `support_ajouter : ${e.message}` };
    const id = (aj as { id: string })?.id ?? null;
    if (id) {
      await db.from("support_demandes").update({
        probleme_id: c.id, niveau: parBot ? "bot" : d.niveau, risque: d.risque, action_faite: action, regle: r.regle_utilisee,
        raison: `${d.raison} (message ${src[0]?.canal ?? src[0]?.type ?? "?"} repris ; réponse : ${envoi})`, langue: d.langue,
      }).eq("id", id);
      await noterControle(db, c.poster_id, id, canal, parBot ? r.texte : null, r.controle);
      await apresDemande(db, { poster: c.poster_id, demande: id, plan: r.plan, decision: d, source: canal, texte });
      if (d.niveau === "max") {
        const f = await fiche(db, c.poster_id);
        await alerterMax(db, id, {
          nom: f?.nom ?? "?", plateforme: f?.plateforme === "ruul" ? "ruul" : "upwork", categorie: d.categorie, texte, raison: "urgent",
          os: d.raison, action: brouillonDe(r) ?? d.reponse,
        });
      }
    }
    return { probleme: c.id, niveau: parBot ? "bot" : d.niveau, envoi };
  }
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
    brouillon = brouillon ?? r.controle.brouillon ?? (r.decision.reponse === TEXTE_ON_VERIFIE ? null : r.decision.reponse);
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
    .select("id, poster_id, plateforme, categorie, texte, slack_canal, slack_ts, slack_user, ticket_at, ticket_slack_ts, source, capture, action_faite, auto_resultat, bot_reponse, resume, action_proposee, statut_posteur, langue, raison, incident_id")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!d) return { ok: false, error: "demande introuvable" };
  if (d.ticket_at) return { ok: true, deja: true, ticket_at: d.ticket_at };
  // 17/11 (Max, point 7) : une demande d'un incident qui a déjà son ticket le rejoint (pas de 2e ticket).
  if (d.incident_id) {
    const { data: inc } = await db.from("support_incidents").select("ticket_at, ticket_ts").eq("id", d.incident_id).maybeSingle();
    if (inc?.ticket_ts) {
      await db.from("support_demandes").update({ ticket_at: inc.ticket_at, ticket_slack_ts: inc.ticket_ts, maj_at: new Date().toISOString() }).eq("id", id);
      return { ok: true, deja: true, ticket_at: inc.ticket_at, incident: true };
    }
  }
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const f = d.poster_id ? await fiche(db, d.poster_id) : null;
  // 13/11 (refonte, 4 bis) : le ticket dit tout : posteur, canal, message exact, capture, ce que le bot a déjà essayé.
  const essaye = [d.auto_resultat, d.action_faite, d.bot_reponse ? `réponse : ${String(d.bot_reponse).slice(0, 200)}` : null].filter(Boolean).join(" · ");
  const capture = d.capture ? await lienCaptureSigne(db, String(d.capture)) : null;
  // 17/11 (Max, point 7) : résumé, statut du posteur, ce que le bot a vérifié et répondu, action proposée, langue.
  const note2 = [
    d.resume ? `Résumé : ${d.resume}` : null,
    d.statut_posteur ? `Statut du posteur : ${d.statut_posteur}` : null,
    d.raison ? `Vérifié par le bot : ${String(d.raison).slice(0, 300)}` : null,
    d.bot_reponse ? `Déjà répondu : ${String(d.bot_reponse).replace(/\s+/g, " ").slice(0, 200)}` : "Déjà répondu : rien",
    d.action_proposee ? `Action proposée : ${d.action_proposee}` : null,
    `Langue du posteur : ${d.langue ?? "?"}`,
    note, `Canal : ${d.source ?? "help"}`, capture ? `Capture : ${capture}` : null, essaye ? `Déjà essayé : ${essaye}` : null,
  ].filter(Boolean).join("\n");
  const texte = texteTicket({ ...d, nom: (f as { nom?: string } | null)?.nom ?? d.slack_user ?? null, note: note2 }, OS_URL);
  const r = await posterSlack(jeton, CANAL_TICKETS, texte);
  if (!r.ok) return { ok: false, error: erreurTicket(r.error ?? "inconnue") };
  const maintenant = new Date().toISOString();
  const { error: e } = await db.from("support_demandes")
    .update({ ticket_at: maintenant, ticket_slack_ts: r.ts ?? null, ticket_par: par, maj_at: maintenant }).eq("id", id);
  if (e) throw new Error(e.message);
  // 17/11 : le ticket devient celui de l'incident ; les demandes du même bug le rejoignent.
  if (d.incident_id && r.ts) {
    await db.from("support_incidents").update({ ticket_at: maintenant, ticket_ts: r.ts }).eq("id", d.incident_id).is("ticket_ts", null);
    const { data: inc } = await db.from("support_incidents").select("demandes").eq("id", d.incident_id).maybeSingle();
    const autres = ((inc?.demandes ?? []) as string[]).filter((x) => x !== id);
    if (autres.length) await db.from("support_demandes").update({ ticket_at: maintenant, ticket_slack_ts: r.ts }).in("id", autres).is("ticket_at", null);
  }
  await journaliser(db, { qui: par ? "Max" : "cerveau_support", quoi: "ticket_os", poster_id: d.poster_id, canal: d.source ?? null, demande_id: id, resultat: "ticket envoyé dans #a-os-tickets" });
  // Le posteur est prévenu sur son canal (une fois).
  let posteur = "pas de posteur";
  if (d.poster_id) {
    const m = await messageCanal(db, { id, poster_id: d.poster_id, source: d.source ?? null }, TEXTE_TICKET_OUVERT);
    posteur = m.ok ? "prévenu" : `pas prévenu : ${m.error}`;
  }
  return { ok: true, ticket_at: maintenant, posteur };
}

const ACCES = /\b(log ?in|sign ?in|password|mot de passe|connexion|can'?t access|cannot access|locked out|connect)\b/i;

/** Un lien « choisir mon mot de passe » envoyé à ce posteur ces 24 dernières heures (journal). */
async function lienRecent(db: Db, poster: string): Promise<boolean> {
  const { data } = await db.from("journal_auto").select("id").eq("poster_id", poster).eq("quoi", "lien_mot_de_passe").eq("mode", "agir")
    .gte("at", new Date(Date.now() - 86_400_000).toISOString()).limit(1);
  return (data ?? []).length > 0;
}

const TEXTE_TICKET_OUVERT = "Thanks, our team is fixing it. We'll get back to you here.";

/** Un message de l'équipe au posteur sur le canal de sa demande (Upwork : message Upwork ; sinon Help + email + Slack). */
async function messageCanal(db: Db, d: { id: string; poster_id: string; source: string | null }, texte: string): Promise<{ ok: boolean; error?: string }> {
  const r = d.source === "upwork"
    ? await repondreCanal(db, null, { poster_id: d.poster_id, canal: "upwork", texte, demande_id: d.id })
    : await repondre(db, null, d.id, texte);
  return { ok: r.ok !== false, error: (r as { error?: string }).error };
}

/** Une capture Help (chemin du stockage) en lien signé 7 jours ; un lien http tel quel. */
async function lienCaptureSigne(db: Db, chemin: string): Promise<string | null> {
  if (/^https?:\/\//.test(chemin)) return chemin;
  try {
    const { data } = await db.storage.from("support").createSignedUrl(chemin, 7 * 86_400);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * 13/11 (refonte, 4 bis) : ✅ de Max ou d'Adrien sur un ticket de #a-os-tickets (lecture des réactions seulement) :
 * le ticket est noté réglé, et le posteur prévenu sur son canal selon l'action « ticket_regle_prevenir » (Contrôle).
 */
async function ticketsRegles(db: Db) {
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const { data, error } = await db.from("support_demandes").select("id, poster_id, source, ticket_slack_ts")
    .not("ticket_slack_ts", "is", null).is("ticket_regle_at", null).gte("ticket_at", new Date(Date.now() - 21 * 86_400_000).toISOString())
    .order("ticket_at").limit(40);
  if (error) throw new Error(error.message);
  const ctl = await lireControle(db);
  const resultats: Record<string, unknown>[] = [];
  for (const d of (data ?? []) as { id: string; poster_id: string | null; source: string | null; ticket_slack_ts: string }[]) {
    const r = await fetch(`https://slack.com/api/reactions.get?channel=${CANAL_TICKETS}&timestamp=${encodeURIComponent(d.ticket_slack_ts)}&full=true`, {
      headers: { authorization: `Bearer ${jeton}` },
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: messageErreur(e) })) as { ok: boolean; error?: string; message?: { reactions?: { name: string; users?: string[] }[] } };
    if (!r.ok) { resultats.push({ id: d.id, erreur: r.error }); continue; }
    const regle = (r.message?.reactions ?? []).some((x) => /^(white_check_mark|heavy_check_mark|ballot_box_with_check)$/.test(x.name) &&
      (x.users ?? []).some((u) => u === MAX_SLACK || u === ADRIEN_SLACK));
    if (!regle) continue;
    await db.from("support_demandes").update({ ticket_regle_at: new Date().toISOString() }).eq("id", d.id);
    let prevenu = "pas de posteur";
    if (d.poster_id) {
      const mode = modeAction(ctl, "ticket_regle_prevenir");
      if (mode === "agir") prevenu = await prevenirTicketRegle(db, d.id);
      else if (mode === "proposer") {
        await journaliser(db, { qui: "cerveau_support", quoi: "ticket_regle_prevenir", mode: "proposer", poster_id: d.poster_id, canal: d.source, demande_id: d.id,
          resultat: "ticket réglé (✅) : prévenir le posteur ?", details: { action: "ticket_regle_prevenir", valeur: d.id } });
        prevenu = "proposé";
      } else prevenu = "action éteinte";
    }
    resultats.push({ id: d.id, regle: true, prevenu });
  }
  return { ok: true, lus: (data ?? []).length, resultats };
}

/** Le message « c'est réglé » au posteur (texte du réglage ticket_regle_texte), une fois. */
async function prevenirTicketRegle(db: Db, id: string): Promise<string> {
  const { data: d } = await db.from("support_demandes").select("id, poster_id, source, ticket_prevenu_at").eq("id", id).maybeSingle();
  if (!d?.poster_id) return "pas de posteur";
  if (d.ticket_prevenu_at) return "déjà prévenu";
  const { data: reg } = await db.from("reglages").select("valeur").eq("cle", "ticket_regle_texte").maybeSingle();
  const texte = typeof reg?.valeur === "string" && reg.valeur.trim() ? reg.valeur.trim() : "Good news: it's fixed. Can you try again?";
  const m = await messageCanal(db, { id: d.id, poster_id: d.poster_id, source: d.source }, texte);
  if (!m.ok) return `pas prévenu : ${m.error}`;
  await db.from("support_demandes").update({ ticket_prevenu_at: new Date().toISOString() }).eq("id", id);
  await journaliser(db, { qui: "cerveau_support", quoi: "ticket_regle_prevenir", poster_id: d.poster_id, canal: d.source, demande_id: id, resultat: texte });
  return "prévenu";
}

/**
 * 13/11 (Entraîner le bot) : relit l'historique des 90 derniers jours (chatbot_questions des posteurs et
 * support_demandes), le fait regrouper en questions types par le modèle (en réutilisant celles qui
 * existent), puis met à jour bot_questions_types (compteur, plateformes, exemples, réponse actuelle,
 * statut). Les choix d'entraînement de Max ne sont jamais touchés.
 */
async function entrainementRegrouper(db: Db) {
  const depuis = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [cq, sd, ex] = await Promise.all([
    db.from("chatbot_questions").select("id, user_id, question, reponse, etat, source, slack_nom, created_at")
      .eq("role", "poster").not("test", "is", true).or("etat.is.null,etat.not.in.(hors_sujet,ignore)").gte("created_at", depuis)
      .order("created_at", { ascending: false }).limit(700),
    db.from("support_demandes").select("id, poster_id, texte, bot_reponse, niveau, plateforme, source, cree_at, regle, slack_user, email_de")
      .gte("cree_at", depuis).order("cree_at", { ascending: false }).limit(300),
    db.from("bot_questions_types").select("id, question"),
  ]);
  if (cq.error) throw new Error(cq.error.message);
  if (sd.error) throw new Error(sd.error.message);
  if (ex.error) throw new Error(ex.error.message);
  const ids = [...new Set([...(cq.data ?? []).map((q) => q.user_id), ...(sd.data ?? []).map((d) => d.poster_id)].filter(Boolean))] as string[];
  const profils = new Map<string, { prenom: string | null; canal_paie: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("profiles").select("id, prenom, canal_paie").in("id", ids.slice(i, i + 300));
    for (const p of (data ?? []) as { id: string; prenom: string | null; canal_paie: string | null }[]) profils.set(p.id, p);
  }
  const plat = (id: string | null) => (id ? (profils.get(id)?.canal_paie === "ruul" ? "ruul" : "upwork") : null) as QuestionLue["plateforme"];
  const lues: QuestionLue[] = [
    ...((cq.data ?? []) as { id: string; user_id: string | null; question: string; reponse: string | null; etat: string | null; source: string; slack_nom: string | null; created_at: string }[])
      .filter((q) => (q.question ?? "").trim().length >= 4)
      .map((q) => ({
        ref: `c:${q.id}`, texte: q.question, reponse: q.reponse, repondu: q.etat === "repondu" && !!q.reponse && q.reponse.trim() !== TEXTE_ATTENTE,
        plateforme: plat(q.user_id), source: q.source === "slack" ? "Slack" : "Chatbot OS", qui: (q.user_id ? profils.get(q.user_id)?.prenom : null) ?? q.slack_nom ?? null,
        at: q.created_at, regle: null,
      })),
    ...((sd.data ?? []) as { id: string; poster_id: string | null; texte: string; bot_reponse: string | null; niveau: string | null; plateforme: string | null; source: string; cree_at: string; regle: string | null; slack_user: string | null; email_de: string | null }[])
      .map((d) => ({
        ref: `s:${d.id}`, texte: d.texte, reponse: d.bot_reponse, repondu: d.niveau === "bot" && !!d.bot_reponse && !d.bot_reponse.includes(TEXTE_ATTENTE),
        plateforme: (d.plateforme === "ruul" ? "ruul" : d.plateforme === "upwork" ? "upwork" : plat(d.poster_id)) as QuestionLue["plateforme"],
        source: d.source === "help" ? "Help" : d.source === "email" ? "Email" : "Slack", qui: (d.poster_id ? profils.get(d.poster_id)?.prenom : null) ?? d.slack_user ?? d.email_de ?? null,
        at: d.cree_at, regle: d.regle,
      })),
  ];
  if (!lues.length) return { ok: true, lues: 0, types: 0 };
  const existants = (ex.data ?? []) as { id: string; question: string }[];
  const groupes = lireGroupes(await generateTextFast(promptRegroupement(lues, existants)), lues.length, existants);
  if (!groupes.length) return { ok: false, error: "le modèle n'a rendu aucun groupe lisible" };
  const maintenant = new Date().toISOString();
  let crees = 0;
  let majs = 0;
  for (const g of groupes) {
    const r = resumerGroupe(g.membres.map((i) => lues[i]!));
    const champs = { ...r, regroupe_at: maintenant, maj_at: maintenant };
    if (g.existant) {
      const { error } = await db.from("bot_questions_types").update(champs).eq("id", g.existant);
      if (error) throw new Error(error.message);
      majs++;
    } else {
      const { error } = await db.from("bot_questions_types").insert({ ...champs, question: g.question, categorie: g.categorie });
      if (error) throw new Error(error.message);
      crees++;
    }
  }
  return { ok: true, lues: lues.length, types: groupes.length, crees, mis_a_jour: majs };
}

/**
 * 13/11 (Contrôle) : une proposition du bot (journal_auto, mode « proposer »). Faire : l'action part
 * (comme si le bot était en « agir »), notée au journal par Max. Ignorer : marquée, rien ne part.
 */
async function traiterProposition(db: Db, par: string, id: string, faire: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "id requis" };
  const { data: j, error } = await db.from("journal_auto").select("id, quoi, mode, poster_id, details, annule_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const details = (j?.details ?? {}) as { action?: string; valeur?: string | null; fait?: string };
  if (!j || j.mode !== "proposer" || !details.action) return { ok: false, error: "pas une action proposée" };
  if (details.fait || j.annule_at) return { ok: false, error: "déjà traitée" };
  const maintenant = new Date().toISOString();
  if (!faire) {
    await db.from("journal_auto").update({ annule_at: maintenant, annule_par: par, details: { ...details, fait: "ignoree" } }).eq("id", id);
    return { ok: true, ignoree: true };
  }
  if (details.action === "pay_ok") {
    // 13/11 (Pay BOT) : OK de Max pour une milestone hors barème ou au-dessus du plafond : Pay BOT pourra la financer.
    const { error: e } = await db.from("paie_a_financer").update({ ok_max_at: maintenant, ok_max_par: par }).eq("id", String(details.valeur ?? "")).is("finance_at", null);
    const resultat = e ? `OK pas noté : ${e.message}` : "OK donné : Pay BOT peut la financer";
    await db.from("journal_auto").update({ details: { ...details, fait: maintenant, resultat } }).eq("id", id);
    return { ok: !e, resultat };
  }
  if (!j.poster_id) return { ok: false, error: "pas de posteur" };
  if (details.action === "ticket_regle_prevenir") {
    const resultat = await prevenirTicketRegle(db, String(details.valeur ?? ""));
    await db.from("journal_auto").update({ details: { ...details, fait: maintenant, resultat } }).eq("id", id);
    return { ok: true, resultat };
  }
  const resultat = await executerAction(db, j.poster_id, { action: details.action as ActionBot, action_valeur: details.valeur ?? null, reponse: "", raison: "fait par Max (proposition)" }, "", "Max");
  await db.from("journal_auto").update({ details: { ...details, fait: maintenant, resultat } }).eq("id", id);
  return { ok: true, resultat };
}

/** 0706 : les demandes techniques ouvertes sans ticket, créées depuis l'allumage (réglage support_tickets_auto). */
async function ticketsAuto(db: Db) {
  const { data: reg } = await db.from("reglages").select("valeur").eq("cle", "support_tickets_auto").maybeSingle();
  const depuis = (reg?.valeur as { depuis?: string } | null)?.depuis;
  if (!depuis) return { ok: true, ignore: "réglage support_tickets_auto absent" };
  // 13/11 (Contrôle) : « Créer un ticket OS » seul en « agir » ; sinon Max l'envoie d'un clic depuis la Boîte.
  const mode = modeAction(await lireControle(db), "ticket_os");
  if (mode !== "agir") return { ok: true, ignore: `ticket_os en « ${mode} » (page Contrôle)` };
  const { data, error } = await db.from("support_demandes").select("id, poster_id, texte, categorie")
    .eq("bot_responsable", "os_tickets").eq("statut", "ouvert").is("ticket_at", null).gte("cree_at", depuis).order("cree_at").limit(10);
  if (error) throw new Error(error.message);
  const resultats: { id: string; ok: boolean; erreur?: string; lien?: string }[] = [];
  for (const d of (data ?? []) as { id: string; poster_id: string | null; texte: string; categorie: string | null }[]) {
    // 13/11 (Max) : un problème de mot de passe ou d'accès n'est PAS un bug : d'abord le lien « choisir mon mot de passe ».
    if (d.poster_id && ACCES.test(`${d.categorie ?? ""} ${d.texte}`) && !(await lienRecent(db, d.poster_id))) {
      const lien = await executerAction(db, d.poster_id, { action: "lien_mot_de_passe", action_valeur: null, reponse: "", raison: "accès avant ticket" });
      await db.from("support_demandes").update({ action_faite: lien, maj_at: new Date().toISOString() }).eq("id", d.id);
      resultats.push({ id: d.id, ok: true, lien });
      continue;
    }
    const r = await envoyerTicket(db, null, d.id, "Envoyé automatiquement par l'OS (demande technique).");
    resultats.push({ id: d.id, ok: r.ok, ...(r.ok ? {} : { erreur: (r as { error?: string }).error }) });
  }
  return { ok: true, envoyes: resultats.filter((r) => r.ok).length, resultats };
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
/**
 * 13/11 (Max) : chaque réponse email d'un posteur devient une demande Support (source « email »),
 * traitée par le bot comme Help ; il reçoit la réponse par email et dans son chat Help. Une demande
 * déjà ouverte (moins de 7 jours) reçoit l'email dans son fil. Rien ne va à Adrien : tout va à Max.
 */
async function brevoEntrants(depuis: string) {
  const debut = /^\d{4}-\d{2}-\d{2}$/.test(depuis) ? depuis : new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const fin = new Date().toISOString().slice(0, 10);
  const webhooks = await brevoGet("/webhooks?type=inbound");
  const events = await brevoGet(`/inbound/events?startDate=${debut}&endDate=${fin}&limit=100&sort=desc`);
  const liste = ((events.data as { events?: { uuid: string; date: string; sender: string; recipient: string }[] } | null)?.events ?? []);
  // Le détail (logs de livraison au webhook) des 5 plus récents.
  const details = await Promise.all(liste.slice(0, 5).map(async (e) => (await brevoGet(`/inbound/events/${e.uuid}`)).data));
  return {
    ok: webhooks.ok && events.ok, erreurs: [webhooks.erreur, events.erreur].filter(Boolean),
    // Jamais le jeton du webhook : seulement l'adresse, le domaine et les dates.
    webhooks: ((webhooks.data as { webhooks?: Record<string, unknown>[] } | null)?.webhooks ?? []).map((w) => ({
      url: w.url, domain: w.domain, events: w.events, createdAt: w.createdAt, modifiedAt: w.modifiedAt,
    })),
    nb_evenements: liste.length,
    evenements: liste.map((e) => ({ uuid: e.uuid, date: e.date, destinataire: e.recipient, expediteur_domaine: String(e.sender ?? "").split("@")[1] ?? null })),
    details,
  };
}

async function emailsEntrants(db: Db, emails: ReturnType<typeof lireEmailsBrevo>) {
  const bilan: Record<string, unknown>[] = [];
  for (const e of emails) {
    const { data: deja } = await db.from("support_demandes").select("id").eq("email_message_id", e.messageId).limit(1);
    if ((deja ?? []).length) { bilan.push({ de: e.de, ignore: "déjà reçu" }); continue; }
    let poster = await posteurParEmail(db, e.de);
    // 13/11 (Max) : une capture jointe est lue (décrite en une phrase) et ajoutée au message.
    const captures = await decrireImagesBrevo(e.images ?? []);
    const corpsEmail = captures.length ? `${e.texte}\n\n${captures.map((c) => `[Screenshot: ${c}]`).join("\n")}` : e.texte;
    const texte = e.sujet && !/^re:/i.test(e.sujet) ? `${e.sujet}\n\n${corpsEmail}` : corpsEmail;
    // 13/11 (Max) : un simple accusé d'un posteur : pas de demande ni de réponse, « vu » dans son fil.
    if (poster && !captures.length && accuseReception(e.texte)) {
      await noterVu(db, poster, "email", e.texte, `email:${e.messageId}`);
      bilan.push({ de: e.de, poster, vu: true });
      continue;
    }
    if (!poster) {
      // 21/11 (Max) : adresse inconnue : on cherche avec le @TikTok, le numéro de contrat ou le nom cités ; trouvé, la
      // nouvelle adresse est ajoutée à sa fiche. Sinon, une seule réponse : son handle TikTok (pas d'escalade).
      const trouve = await posteurParIndices(db, { texte, nom: e.nom ?? null });
      if (trouve) {
        await db.from("posteur_emails").upsert({ poster_id: trouve, email: e.de.trim().toLowerCase(), source: "email_entrant" }, { onConflict: "email" });
        poster = trouve;
      }
    }
    if (!poster) {
      const dejaDemande = await handleDejaDemande(db, e.de);
      if (!dejaDemande) {
        const objet = e.sujet ? (/^re:/i.test(e.sujet) ? e.sujet : `Re: ${e.sujet}`) : "Your message";
        const m = rendreEmailRuul({ objet, corps: signer(TEXTE_HANDLE_INCONNU, "en"), lienStop: OS_URL, sansPied: true });
        await envoyerEmailSite(e.de, objet, m.html, m.texte, OS_URL, ["support", "reponse_email", "handle_demande"]);
      }
      const { data, error } = await db.rpc("support_ajouter", { p: { poster_id: null, type: "question", texte, source: "email", escalader: false, slack_user: e.nom ?? e.de } });
      if (error) { bilan.push({ de: e.de, erreur: error.message }); continue; }
      const id = (data as { id?: string } | null)?.id;
      if (id) {
        await db.from("support_demandes").update({
          email_message_id: e.messageId, email_de: e.de, niveau: "bot", statut: "attente_posteur", bot_reponse: TEXTE_HANDLE_INCONNU,
          raison: dejaDemande ? "Email d'un expéditeur inconnu (handle déjà demandé)." : "Email d'un expéditeur inconnu : handle TikTok demandé.",
        }).eq("id", id);
      }
      bilan.push({ de: e.de, poster: null, id });
      continue;
    }
    // Une demande déjà ouverte (moins de 7 jours) : l'email entre dans son fil, la demande repasse « à répondre ».
    const depuis = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: ouverte } = await db.from("support_demandes").select("id, niveau")
      .eq("poster_id", poster).in("statut", ["ouvert", "attente_posteur"]).gte("cree_at", depuis)
      .order("cree_at", { ascending: false }).limit(1).maybeSingle();
    if (ouverte?.id) {
      const maintenant = new Date().toISOString();
      await db.from("support_messages").insert({ demande_id: ouverte.id, auteur: "posteur", auteur_id: poster, texte: corpsEmail });
      await db.from("support_demandes").update({
        statut: "ouvert", posteur_at: maintenant, maj_at: maintenant, ...(ouverte.niveau === "adrien" || !ouverte.niveau ? { niveau: "max" } : {}),
      }).eq("id", ouverte.id);
      bilan.push({ de: e.de, poster, id: ouverte.id, fil: true });
      continue;
    }
    const r = await poserQuestion(db, poster, texte, null, "email");
    if (r.id) {
      // Rien ne va à Adrien : ce que le bot ne règle pas va à Max.
      const { data: d } = await db.from("support_demandes").select("niveau").eq("id", r.id).maybeSingle();
      await db.from("support_demandes").update({ email_message_id: e.messageId, email_de: e.de, ...(d?.niveau === "adrien" ? { niveau: "max" } : {}) }).eq("id", r.id);
    }
    let envoi = "pas de réponse";
    if (r.ok && r.muet) envoi = "canal email coupé (Contrôle) : rien envoyé";
    else if (r.ok && r.reponse) {
      const { data: p } = await db.from("profiles").select("prenom, ruul_jeton").eq("id", poster).maybeSingle();
      const objet = e.sujet ? (/^re:/i.test(e.sujet) ? e.sujet : `Re: ${e.sujet}`) : "Your question";
      const corps = texteReponseEmail(p?.prenom ?? null, r.reponse);
      const lienStop = p?.ruul_jeton ? `https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul?stop=${p.ruul_jeton}` : OS_URL;
      const m = rendreEmailRuul({ objet, corps, bouton: { texte: "Open Help", lien: `${OS_URL}/createur/help` }, lienStop });
      // 21/11 (Max) : la réponse est reliée à la demande (tag demande:<id> sur l'email, pour son statut Brevo) et notée
      // « envoyée par email » sur le message du bot.
      const s = await envoyerEmailSite(e.de, objet, m.html, m.texte, lienStop, ["support", "reponse_email", ...(r.id ? [`demande:${r.id}`] : [])]);
      envoi = s.ok ? "envoyée" : `erreur : ${s.erreur}`;
      if (r.id) await noterEnvoiEmail(db, r.id, s.ok ? "ok" : `erreur : ${s.erreur ?? "?"}`);
    }
    bilan.push({ de: e.de, poster, id: r.id ?? null, envoye_equipe: r.envoye_equipe ?? null, reponse: envoi });
  }
  return { ok: true, recus: emails.length, bilan };
}

/**
 * 13/11 (refonte, Phase 2) : un seul cerveau. Un message d'un posteur dans un salon Slack : le bot v2 lit sa situation,
 * répond dans le fil (question générale) ou en message privé (sujet perso), fait l'action permise ; sinon la demande
 * va à Max (« We're checking » dans le fil seulement pour une vraie remontée). Jamais de renvoi vers Help ni #questions
 * quand on connaît le posteur. Tout passe par la page Contrôle.
 */
async function messageSlack(db: Db, o: { canal: string; ts: string; fil?: string; auteur: string; texte: string; nom: string | null; plateforme: "ruul" | "upwork" | null }) {
  const filReponse = o.fil ?? o.ts;
  const texte = o.texte.trim();
  if (!o.canal || !o.ts || texte.length < 2) return { ok: false, error: "canal, ts et texte requis" };
  const { data: deja } = await db.from("support_demandes").select("id").eq("slack_canal", o.canal).eq("slack_ts", o.ts).limit(1);
  if ((deja ?? []).length) return { ok: true, deja: true };
  const { data: p } = await db.from("profiles").select("id").eq("slack_user_id", o.auteur).limit(1).maybeSingle();
  const poster = (p?.id as string | undefined) ?? null;
  if (poster && accuseReception(texte)) {
    await noterVu(db, poster, "slack", texte, `slack:${o.canal}:${o.ts}`);
    return { ok: true, vu: true };
  }
  const rouverte = poster ? await rouvrirSiPasRegle(db, poster, texte, "slack") : null;
  if (rouverte) {
    const jeton0 = jetonSlackFaq();
    if (jeton0) await posterSlack(jeton0, o.canal, rouverte.reponse, filReponse);
    return { ok: true, id: rouverte.id, rouverte: true };
  }
  const r = await deciderBot(db, { message: texte, source: "slack_salon", poster, profil: null, canal: "slack" });
  const d = r.decision;
  if (d.categorie === "salutation" && poster) {
    await noterVu(db, poster, "slack", texte, `slack:${o.canal}:${o.ts}`);
    return { ok: true, vu: true };
  }
  const parBot = d.niveau === "bot" && d.reponse !== TEXTE_ON_VERIFIE;
  const jeton = jetonSlackFaq();
  let envoi = "rien";
  let action: string | null = null;
  if (parBot && poster && d.action) action = await executerAction(db, poster, d, texte);
  if (!r.controle.muet && jeton) {
    if (parBot && d.personnel && poster) {
      const dm = await ecrireAuPosteur(db, poster, r.texte, fetch, undefined, { malgreStop: "reponse" });
      envoi = dm.statut === "envoye" ? "message privé" : `message privé : ${"erreur" in dm ? dm.erreur : dm.statut}`;
      if (dm.statut === "envoye") await posterSlack(jeton, o.canal, "I've sent you a private message 👋", filReponse);
    } else {
      // 17/11 (Max, point 7) : chaque demande reçoit au minimum une réponse (dans sa langue).
      const t = await posterSlack(jeton, o.canal, r.texte, filReponse);
      envoi = t.ok ? "fil" : `fil : ${t.error}`;
    }
  }
  const { data: aj, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "question", categorie: d.categorie, texte, source: "slack_salon", escalader: !parBot, plateforme: o.plateforme,
      bot_reponse: parBot ? r.texte : null, bot_decision: d.niveau, brouillon: parBot ? null : brouillonDe(r),
      slack_canal: o.canal, slack_ts: o.ts, slack_user: o.nom ?? o.auteur,
    },
  });
  if (error) return { ok: false, error: `support_ajouter : ${error.message}` };
  const id = (aj as { id?: string } | null)?.id ?? null;
  if (id) {
    await db.from("support_demandes").update({
      niveau: parBot ? "bot" : d.niveau === "adrien" ? "max" : d.niveau, risque: d.risque, action_faite: action, regle: r.regle_utilisee,
      raison: `${d.raison} (salon Slack ; réponse : ${envoi})`, langue: d.langue, ...(parBot ? { statut: "bot" } : {}),
    }).eq("id", id);
    if (poster) await noterControle(db, poster, id, "slack", parBot ? r.texte : null, r.controle);
    await apresDemande(db, { poster, demande: id, plan: r.plan, decision: d, source: "slack_salon", texte });
    if (d.niveau === "max") {
      await alerterMax(db, id, { nom: o.nom ?? "?", plateforme: o.plateforme ?? "upwork", categorie: d.categorie, texte, raison: "urgent", os: d.raison, action: brouillonDe(r) });
    }
  }
  return { ok: true, id, niveau: parBot ? "bot" : d.niveau, envoi };
}

/**
 * 21/11 (Max) : la suite d'un fil Slack suivi (le posteur répond au bot) : le bot lit le message, vérifie et répond dans
 * le même fil. Un simple « thanks » / « ok » : noté vu, pas de réponse.
 */
async function suiteFilSlack(db: Db, o: { canal: string; parent_ts: string; texte: string; demande: string; poster: string | null }) {
  const maintenant = new Date().toISOString();
  if (o.texte.length < 1) return { ok: true, ignore: "vide" };
  await db.from("support_messages").insert({ demande_id: o.demande, auteur: "posteur", auteur_id: o.poster, texte: o.texte.slice(0, 4000) });
  if (accuseReception(o.texte)) {
    await db.from("support_demandes").update({ posteur_at: maintenant, maj_at: maintenant }).eq("id", o.demande);
    return { ok: true, id: o.demande, vu: true };
  }
  const r = await deciderBot(db, { message: o.texte, source: "slack_salon", poster: o.poster, profil: null, canal: "slack" });
  const d = r.decision;
  const parBot = d.niveau === "bot" && d.reponse !== TEXTE_ON_VERIFIE;
  let envoi = "rien";
  let action: string | null = null;
  if (parBot && o.poster && d.action) action = await executerAction(db, o.poster, d, o.texte);
  const jeton = jetonSlackFaq();
  if (!r.controle.muet && jeton) {
    const t = await posterSlack(jeton, o.canal, r.texte, o.parent_ts);
    envoi = t.ok ? "fil" : `fil : ${t.error}`;
    if (t.ok) await db.from("support_messages").insert({ demande_id: o.demande, auteur: "bot", texte: r.texte.slice(0, 4000) });
  }
  await db.from("support_demandes").update({
    statut: parBot ? "bot" : "ouvert", niveau: parBot ? "bot" : d.niveau === "adrien" ? "max" : d.niveau,
    bot_reponse: parBot ? r.texte : null, brouillon: parBot ? null : brouillonDe(r), action_faite: action,
    posteur_at: maintenant, maj_at: maintenant,
  }).eq("id", o.demande);
  await apresDemande(db, { poster: o.poster, demande: o.demande, plan: r.plan, decision: d, source: "slack_salon", texte: o.texte });
  return { ok: true, id: o.demande, niveau: parBot ? "bot" : d.niveau, envoi };
}

/** Les images jointes d'un email Brevo, téléchargées (API Brevo) et décrites par le modèle. Ne lève pas. */
async function decrireImagesBrevo(images: { nom: string; type: string; jeton: string }[]): Promise<string[]> {
  const cle = Deno.env.get("BREVO_API_KEY");
  if (!cle || !images.length) return [];
  const sortie: string[] = [];
  for (const im of images) {
    try {
      const r = await fetch(`https://api.brevo.com/v3/inbound/attachments/${encodeURIComponent(im.jeton)}`, { headers: { "api-key": cle } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const octets = new Uint8Array(await r.arrayBuffer());
      let binaire = "";
      for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      sortie.push((await decrireCapture(btoa(binaire), im.type === "image/jpg" ? "image/jpeg" : im.type)).slice(0, 600));
    } catch (erreur) {
      console.warn(`[support] capture ${im.nom} : ${messageErreur(erreur)}`);
      sortie.push(`${im.nom} (image not readable)`);
    }
  }
  return sortie;
}

/** 13/11 (Max) : un accusé reçu, gardé pour le fil (« vu »), sans demande. Une seule fois par message. */
async function noterVu(db: Db, poster: string, canal: string, texte: string, ref: string) {
  await db.from("support_vus").upsert({ poster_id: poster, canal, texte: texte.slice(0, 2000), ref }, { onConflict: "ref", ignoreDuplicates: true });
}

/**
 * 13/11 (Max) : répondre depuis la conversation, sur le canal choisi. Help : dans sa demande (chat + email) ;
 * Email : un email ; Slack : un message privé ; Upwork : un message dans la conversation Upwork.
 * La réponse entre dans le fil de la demande (si une est donnée) et la passe « attente posteur ».
 */
async function repondreCanal(db: Db, auteur: string | null, o: { poster_id: string; canal: string; texte: string; demande_id: string | null }) {
  const texte = o.texte.trim();
  if (!o.poster_id || texte.length < 1) return { ok: false, error: "posteur et texte obligatoires" };
  if (refusMotDePasseUpwork(texte)) return { ok: false, error: "Jamais de mot de passe dans un message : envoie le lien « choisir mon mot de passe »." };
  if (o.canal === "help") {
    if (!o.demande_id) return { ok: false, error: "Help : il faut une demande (sinon choisis Email, Slack ou Upwork)" };
    return await repondre(db, auteur, o.demande_id, texte);
  }
  let envoi: string;
  if (o.canal === "email") {
    const c = await contactPosteur(db, o.poster_id);
    if (!c.email) return { ok: false, error: "pas d'email pour ce posteur" };
    const m = texteEmailReponse(c.prenom, texte, OS_URL);
    const e = rendreEmailRuul({ objet: m.objet, corps: m.corps, bouton: { texte: "Open Help", lien: m.lien }, lienStop: OS_URL });
    const r = await envoyerEmailSite(c.email, m.objet, e.html, e.texte, OS_URL, ["support", "reponse"]);
    if (!r.ok) return { ok: false, error: `email : ${r.erreur}` };
    envoi = "email";
  } else if (o.canal === "slack") {
    const r = await ecrireAuPosteur(db, o.poster_id, texte, fetch, undefined, { malgreStop: "reponse" });
    if (r.statut !== "envoye") return { ok: false, error: `Slack : ${"erreur" in r ? r.erreur : r.statut}` };
    envoi = "slack";
  } else if (o.canal === "upwork") {
    await secretCron();
    const secret = secretCronConnu();
    const rep = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-cron-secret": secret } : {}) },
      body: JSON.stringify({ action: "message_posteur", poster_id: o.poster_id, texte, type: "support_reponse" }),
    });
    const data = await rep.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!rep.ok || data.ok === false) return { ok: false, error: `Upwork : ${data.error ?? `HTTP ${rep.status}`}` };
    envoi = "upwork";
  } else {
    return { ok: false, error: "canal : help, email, slack ou upwork" };
  }
  if (o.demande_id) {
    const maintenant = new Date().toISOString();
    await db.from("support_messages").insert({ demande_id: o.demande_id, auteur: "equipe", auteur_id: auteur, texte, envois: { [envoi]: "ok" } });
    await db.from("support_demandes").update({ statut: "attente_posteur", equipe_at: maintenant, maj_at: maintenant }).eq("id", o.demande_id);
  }
  return { ok: true, envoi };
}

/** Le posteur d'une adresse email : login, email Ruul, ou email perso donné au site. */
async function posteurParEmail(db: Db, email: string): Promise<string | null> {
  // 21/11 (Max) : les adresses reconnues plus tard (posteur_emails), puis toutes les adresses connues.
  const { data: connue } = await db.from("posteur_emails").select("poster_id").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (connue?.poster_id) return connue.poster_id as string;
  // 13/11 (refonte, Phase 3) : login, email Ruul, email perso (profils désactivés compris) ; « _ » et « % » pris à la lettre.
  const motif = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!motif) return null;
  for (const col of ["email", "ruul_email", "email_perso"]) {
    const { data: p } = await db.from("profiles").select("id").ilike(col, motif).order("is_active", { ascending: false }).limit(1);
    if (p?.[0]?.id) return p[0].id as string;
  }
  const { data: h } = await db.from("hub_posteurs").select("profile_id").ilike("email_perso", motif).not("profile_id", "is", null).limit(1);
  return (h?.[0]?.profile_id as string | undefined) ?? null;
}

// ── 21/11 : page « Aujourd'hui » : DM à Max (alertes urgentes, résumé de 18 h, rapport qualité du lundi) ──

const URL_AUJOURDHUI = `${OS_URL}/admin/auto/aujourdhui`;

/** Les lignes urgentes pas encore signalées, en un seul DM ; chaque ligne n'est signalée qu'une fois (7 jours). */
async function aujourdhuiAlertes(db: Db, envoyer: boolean) {
  const { data, error } = await db.rpc("aujourdhui_alertes_a_envoyer");
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as (LigneAujourdhui & { cle: string })[];
  const texte = texteAlertesUrgentes(lignes.map((l) => ({ ...l, id: l.cle })), URL_AUJOURDHUI);
  if (!texte) return { ok: true, lignes: 0 };
  if (!envoyer) return { ok: true, lignes: lignes.length, texte };
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const r = await posterSlack(jeton, MAX_SLACK, texte);
  if (!r.ok) return { ok: false, error: r.error ?? "Slack" };
  const maintenant = new Date().toISOString();
  const { error: e2 } = await db.from("aujourdhui_alertes_envoyees")
    .upsert(lignes.map((l) => ({ cle: l.cle, titre: l.titre, envoye_at: maintenant })), { onConflict: "cle" });
  if (e2) console.error("[support] alertes envoyées", e2.message);
  return { ok: true, lignes: lignes.length };
}

async function aujourdhuiResume(db: Db, envoyer: boolean) {
  const { data, error } = await db.rpc("aujourdhui_lire");
  if (error) throw new Error(error.message);
  const texte = texteResumeJour(data as Aujourdhui, URL_AUJOURDHUI);
  if (!envoyer) return { ok: true, texte };
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const r = await posterSlack(jeton, MAX_SLACK, texte);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Slack" };
}

async function qualiteSemaine(db: Db, lundi: string | null, envoyer: boolean) {
  const { data, error } = await db.rpc("support_qualite", { p_lundi: lundi && /^\d{4}-\d{2}-\d{2}$/.test(lundi) ? lundi : null });
  if (error) throw new Error(error.message);
  const texte = texteQualite(data as QualiteSemaine, `${OS_URL}/admin/auto/qualite`);
  if (!envoyer) return { ok: true, texte };
  const jeton = jetonSlackFaq();
  if (!jeton) return { ok: false, error: "jeton Slack absent" };
  const r = await posterSlack(jeton, MAX_SLACK, texte);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Slack" };
}
