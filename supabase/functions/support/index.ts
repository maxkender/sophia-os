import { chargerBase, demanderAuCerveau, jetonSlackFaq, posterSlack } from "../_shared/faq_moteur.ts";
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
import { appliquerGardeFous, type DecisionBot, lireDecision, promptBot, signer, type SourceBot, testOk } from "../_shared/bot_support.ts";
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
  const { data, error } = await db.rpc("support_contexte", { p_poster: poster });
  if (error) {
    console.warn(`[support] contexte : ${error.message}`);
    return "";
  }
  return contexteTexte((data ?? null) as Record<string, unknown> | null);
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
  const [f, ctx] = await Promise.all([fiche(db, poster), contexte(db, poster)]);
  const b = await cerveau(db, f, texte, ctx);
  const visible = b.sur ? b.reponse : TEXTE_ENVOYE_EQUIPE;
  const { data, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "question", categorie, texte, bot_reponse: visible, bot_decision: b.decision,
      brouillon: b.brouillon, escalader: !b.sur,
    },
  });
  if (error) throw new Error(`support_ajouter : ${error.message}`);
  return { ok: true, id: (data as { id: string })?.id ?? null, reponse: visible, envoye_equipe: !b.sur };
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

  // Le verdict d'abord : le brouillon de l'équipe répond avec ses faits (dates, montants), pas avec une réponse générale.
  const v = await verifier(categorie, texte, f, ctx);
  const b = await cerveau(db, f, questionProbleme(categorie, texte, v), ctx);
  const recu = texteProblemeRecu(categorie, auto);
  const { data, error } = await db.rpc("support_ajouter", {
    p: {
      poster_id: poster, type: "probleme", categorie, texte, capture, escalader: true, brouillon: b.brouillon,
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
  if (res?.id && categorie === "paiement") {
    await alerterMax(db, res.id, { nom: f?.nom ?? "?", plateforme, categorie, texte, raison: "paiement" });
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
      const r = await ecrireAuPosteur(db, d.poster_id, `The team answered your request:\n\n${texte}\n\nReply from Help on your dashboard: ${OS_URL}/createur/help`);
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
  d: { nom: string; plateforme: Plateforme; categorie: string | null; texte: string; raison: "paiement" | "compte_24h" },
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
  o: { message: string; source: SourceBot; poster: string | null; profil: ProfilFictif | null },
) {
  const fictif = !o.poster && o.profil;
  const [f, ctx, infos, histo] = await Promise.all([
    o.poster ? fiche(db, o.poster) : Promise.resolve(null),
    o.poster ? contexte(db, o.poster) : Promise.resolve(""),
    db.from("support_infos").select("titre, valeur").order("ordre").limit(100),
    o.poster
      ? db.from("support_demandes").select("cree_at, categorie, texte").eq("poster_id", o.poster).order("cree_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as { cree_at: string; categorie: string | null; texte: string }[] }),
  ]);
  const plateforme: "ruul" | "upwork" | null = f?.plateforme ?? (fictif ? (o.profil!.plateforme === "ruul" ? "ruul" : "upwork") : null);
  let requete = db.from("reponses_officielles").select("id, question, formulations, reponse, action, niveau, categorie")
    .eq("actif", true).not("valide_at", "is", null);
  if (plateforme) requete = requete.in("portee", ["tous", plateforme]);
  const { data: catalogue } = await requete.order("ordre").limit(300);
  const entree = {
    message: o.message,
    source: o.source,
    plateforme,
    fiche: f ? ficheTexte(f) : fictif ? ficheFictive(o.profil!) : "Fiche : personne introuvable dans l'OS.",
    contexte: ctx,
    infos: (infos.data ?? []) as { titre: string; valeur: string }[],
    catalogue: ((catalogue ?? []) as DecisionCatalogue[]).map((c) => ({ ...c, formulations: c.formulations ?? [] })),
    historique: ((histo.data ?? []) as { cree_at: string; categorie: string | null; texte: string }[]),
    inconnu: !f && !fictif,
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
  const regle = finale.regle ? (entree.catalogue.find((c) => c.id === finale.regle)?.question ?? finale.regle) : null;
  return {
    decision: finale,
    texte: signer(finale.reponse),
    regle_utilisee: regle,
    plateforme,
    action_prevue: finale.action ? { action: finale.action, valeur: finale.action_valeur, executee: false } : null,
  };
}

interface DecisionCatalogue {
  id: string;
  question: string;
  formulations: string[] | null;
  reponse: string;
  action: string | null;
  niveau: string;
  categorie: string | null;
}

async function lancerTests(db: Db, ids: string[] | null) {
  let q = db.from("bot_tests").select("id, message, poster_id, profil, source, attendu_niveau, attendu_contient, attendu_action").eq("actif", true);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q.order("cree_at").limit(60);
  if (error) throw new Error(error.message);
  const resultats: { id: string; ok: boolean; niveau: string; reponse: string; action: string | null }[] = [];
  // 4 à la fois : le modèle répond en quelques secondes.
  const liste = (data ?? []) as { id: string; message: string; poster_id: string | null; profil: ProfilFictif | null; source: SourceBot;
    attendu_niveau: string | null; attendu_contient: string[]; attendu_action: string | null }[];
  for (let i = 0; i < liste.length; i += 4) {
    await Promise.all(liste.slice(i, i + 4).map(async (t) => {
      const r = await deciderBot(db, { message: t.message, source: t.source, poster: t.poster_id, profil: t.profil });
      const ok = testOk(r.decision, t);
      resultats.push({ id: t.id, ok, niveau: r.decision.niveau, reponse: r.texte, action: r.decision.action });
      await db.from("bot_tests").update({ dernier: r, dernier_ok: ok, dernier_at: new Date().toISOString() }).eq("id", t.id);
    }));
  }
  return { ok: true, total: resultats.length, verts: resultats.filter((r) => r.ok).length, resultats };
}
