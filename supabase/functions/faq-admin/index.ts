import { ADMINS_SLACK, audiencesNotes, reponseEquipeDansFil } from "../_shared/faq.ts";
import {
  chargerBase,
  chargerEquipeSlack,
  chargerReglagesFaq,
  demanderAuCerveau,
  jetonSlackFaq,
  lireFil,
  posterSlack,
} from "../_shared/faq_moteur.ts";
import { repondreParSituation } from "../_shared/faq_situations_moteur.ts";
import { estRoleManager } from "../_shared/roles.ts";
import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { bloquer, PAUSE } from "../_shared/pause.ts";

/**
 * faq-admin — ce que l'admin fait d'une question de la FAQ, depuis la page
 * Assistant (docs/faq-automatique.md).
 *
 *   { action: "traiter", id, reponse, ajouter_base? }
 *       Ta réponse repart là où la question a été posée : dans le fil Slack, ou
 *       (bulle d'aide) en pop-up sur le dashboard du poster / en message privé
 *       Slack au manager. En mode test, rien ne part : elle est seulement
 *       gardée, et ajoutée à la base si demandé.
 *   { action: "ignorer", id }
 *   { action: "ajouter_base", id, reponse }
 *       Une réponse (la tienne, celle d'Aram dans le fil, celle du cerveau)
 *       devient une réponse validée : la prochaine fois, le cerveau la donne seul.
 *   { action: "tester", question, situation? | poster_id? }
 *       Prompt 21, Q (onglet Test) : la réponse exacte que le bot donnerait,
 *       la situation détectée et l'entrée de FAQ utilisée. N'écrit rien,
 *       n'envoie rien.
 */

type Db = ReturnType<typeof serviceClient>;

interface Question {
  id: string;
  source: "os" | "slack";
  role: string;
  user_id: string | null;
  question: string;
  etat: string | null;
  slack_canal: string | null;
  slack_ts: string | null;
}

const REPONSE_MAX = 3_000;

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin", "head_of_ops"]);
  if (acces instanceof Response) return acces;

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    if (action === "tester") return json(await tester(serviceClient(), body));
    const id = String(body?.id ?? "");
    if (!id) return json({ error: "id manquant" }, 400);

    const db = serviceClient();
    const { data: q, error } = await db
      .from("chatbot_questions")
      .select("id, source, role, user_id, question, etat, slack_canal, slack_ts")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!q) return json({ error: "question introuvable" }, 404);
    const question = q as Question;
    const par = acces.userId === "cron" ? null : acces.userId;
    const maintenant = new Date().toISOString();

    if (action === "ignorer") {
      const { error: e } = await db
        .from("chatbot_questions")
        .update({ etat: "ignore", traite_par: par, traite_at: maintenant })
        .eq("id", id);
      if (e) throw e;
      return json({ ok: true });
    }

    const reponse = String(body?.reponse ?? "").trim().slice(0, REPONSE_MAX);
    if (!reponse) return json({ error: "réponse vide" }, 400);

    if (action === "ajouter_base") {
      await ajouterABase(db, question, reponse);
      return json({ ok: true });
    }
    if (action !== "traiter") return json({ error: `action inconnue : ${action}` }, 400);

    const envoi = await livrer(db, question, reponse);
    const patch: Record<string, unknown> = {
      etat: envoi.deja ? "traite_slack" : "traite_admin",
      reponse_admin: reponse,
      traite_par: par,
      traite_at: maintenant,
    };
    if (envoi.deja) {
      patch.reponse_humaine = envoi.deja.texte;
      patch.reponse_humaine_par = envoi.deja.nom;
    }
    if (envoi.envoye) {
      patch.reponse = reponse;
      patch.envoye_at = maintenant;
    }
    const { error: e } = await db.from("chatbot_questions").update(patch).eq("id", id);
    if (e) throw e;
    if (body?.ajouter_base) await ajouterABase(db, question, reponse);
    return json({ ok: true, envoye: envoi.envoye, raison: envoi.raison ?? null, deja: Boolean(envoi.deja) });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

/** Là où la question a été posée. En mode test, nulle part. */
interface Livraison {
  envoye: boolean;
  raison?: string;
  /** Une réponse de l'équipe était déjà dans le fil Slack. */
  deja?: { user: string; texte: string; nom: string };
}

async function livrer(db: Db, q: Question, reponse: string): Promise<Livraison> {
  const reglages = await chargerReglagesFaq(db);

  if (q.source === "slack") {
    if (reglages.mode_slack !== "actif") return { envoye: false, raison: "mode test : rien ne part sur Slack" };
    const token = jetonSlackFaq();
    if (!token || !q.slack_canal || !q.slack_ts) return { envoye: false, raison: "jeton ou message Slack manquant" };
    // Quelqu'un de l'équipe a répondu dans le fil depuis (et le passage de
    // slack-faq ne l'a pas encore vu) : on ne double pas sa réponse.
    const fil = await lireFil(token, q.slack_canal, q.slack_ts);
    const deja = fil ? reponseEquipeDansFil(fil, q.slack_ts, await chargerEquipeSlack(db)) : null;
    if (deja) {
      const nom = ADMINS_SLACK[deja.user] ?? deja.user;
      return { envoye: false, raison: `${nom} a déjà répondu dans le fil : rien n'est envoyé`, deja: { ...deja, nom } };
    }
    if (await bloquer(db, { fonction: "faq", action: "reponse_slack", cible: q.slack_ts })) return { envoye: false, raison: PAUSE };
    const r = await posterSlack(token, q.slack_canal, reponse, q.slack_ts);
    return r.ok ? { envoye: true } : { envoye: false, raison: `Slack : ${r.error}` };
  }

  if (reglages.mode_os !== "actif") return { envoye: false, raison: "mode test : rien ne part vers la personne" };
  if (!q.user_id) return { envoye: false, raison: "personne inconnue" };
  const corps = `You asked: "${q.question.slice(0, 300)}"\n\n${reponse}`;

  if (q.role === "poster") {
    // Le pop-up du dashboard (le même que les nudges), sur son compte actif.
    const { data: compte } = await db
      .from("comptes")
      .select("id")
      .eq("poster_id", q.user_id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!compte) return { envoye: false, raison: "aucun compte pour son pop-up" };
    const { error } = await db.from("compte_nudges").insert({
      compte_id: compte.id,
      modele_id: "faq_reponse",
      titre: "Answer to your question",
      corps,
    });
    return error ? { envoye: false, raison: messageErreur(error) } : { envoye: true };
  }

  if (estRoleManager(q.role)) {
    const { data: slack } = await db
      .from("hm_slack")
      .select("slack_user_id")
      .eq("profile_id", q.user_id)
      .maybeSingle();
    const token = jetonSlackFaq();
    if (!slack?.slack_user_id || !token) return { envoye: false, raison: "ID Slack du manager inconnu" };
    if (await bloquer(db, { fonction: "faq", action: "reponse_slack_manager", cible: q.user_id })) return { envoye: false, raison: PAUSE };
    const r = await posterSlack(token, String(slack.slack_user_id), corps);
    return r.ok ? { envoye: true } : { envoye: false, raison: `Slack : ${r.error}` };
  }
  return { envoye: false, raison: "rien à livrer à un admin" };
}

/**
 * Prompt 21, Q : l'onglet Test. Le même chemin que le bot (situation, entrée
 * reconnue, variables), puis, sans réponse par situation, ce que le cerveau
 * du guide répondrait. Aucune écriture, aucun envoi.
 */
// deno-lint-ignore no-explicit-any
async function tester(db: Db, body: any) {
  const question = String(body?.question ?? "").trim().slice(0, 1_500);
  if (!question) throw new Error("question vide");
  const situation = typeof body?.situation === "string" && body.situation.trim() ? body.situation.trim() : null;
  const posterId = typeof body?.poster_id === "string" && body.poster_id.trim() ? body.poster_id.trim() : null;
  const r = await repondreParSituation(db, { question, situation, posterId });
  let cerveau: { decision: string; reponse: string; section: string | null } | null = null;
  if (!r.reponse) {
    const role = r.situation === "hm" ? "hiring_manager" : "poster";
    try {
      const charge = await chargerBase(db, role);
      const c = await demanderAuCerveau({ canal: "os", role, question, base: charge.base });
      cerveau = { decision: c.decision, reponse: c.reponse || c.proposition, section: c.section };
    } catch (erreur) {
      cerveau = { decision: "erreur", reponse: messageErreur(erreur), section: null };
    }
  }
  return { ok: true, ...r, cerveau };
}

/** Une réponse validée, rangée pour le rôle de la personne qui a demandé. */
async function ajouterABase(db: Db, q: Question, reponse: string): Promise<void> {
  const audience = audiencesNotes(q.role)[0] === "admin" ? "all" : audiencesNotes(q.role)[0];
  const titre = q.question.replace(/\s+/g, " ").trim().slice(0, 120) || "Question";
  const { error } = await db.from("chatbot_contexte").insert({
    titre,
    contenu: `Question : ${q.question.trim()}\n\nRéponse : ${reponse}`,
    audience,
  });
  if (error) throw error;
  const { error: e } = await db
    .from("chatbot_questions")
    .update({ ajoute_base_at: new Date().toISOString() })
    .eq("id", q.id);
  if (e) throw e;
}
