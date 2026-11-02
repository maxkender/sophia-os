/**
 * Le cerveau de la FAQ — partie qui parle au monde : la base (Supabase),
 * Gemini, Slack. La logique de décision est dans `faq.ts`, testée à part.
 */

import {
  ADMINS_SLACK,
  assemblerBase,
  type BaseFaq,
  construirePromptFaq,
  lireReglagesFaq,
  lireReponseFaq,
  type MessageFil,
  type NoteBase,
  type PageGuide,
  type ReglagesFaq,
  REGLAGES_FAQ_DEFAUT,
  type ReponseFaq,
} from "./faq.ts";
import { generateTextFast } from "./gemini.ts";
import { liensPublics } from "./guide_public.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";

type Db = ReturnType<typeof serviceClient>;

export async function chargerReglagesFaq(db: Db): Promise<ReglagesFaq> {
  const { data, error } = await db.from("reglages").select("valeur").eq("cle", "faq_automatique").maybeSingle();
  if (error) {
    console.warn(`[faq] réglages illisibles, mode test : ${messageErreur(error)}`);
    return REGLAGES_FAQ_DEFAUT;
  }
  return lireReglagesFaq(data?.valeur);
}

export interface BaseChargee {
  base: BaseFaq;
  /** Pages du guide recopiées : 0 = la copie Notion n'a jamais tourné. */
  pages: number;
}

/**
 * Le guide recopié et les réponses validées, pour le rôle de la personne. Deux
 * petites tables (une ligne par page Notion, une par réponse validée) : un
 * plafond de 500 lignes est très au-dessus de ce qu'elles contiendront.
 */
export async function chargerBase(db: Db, role: string): Promise<BaseChargee> {
  const [pages, notes] = await Promise.all([
    db.from("guides_notion").select("guide, chemin, texte, ordre").order("ordre", { ascending: true }).limit(500),
    db.from("chatbot_contexte").select("titre, contenu, audience, updated_at").order("updated_at", { ascending: false })
      .limit(500),
  ]);
  if (pages.error) throw new Error(`guides_notion : ${messageErreur(pages.error)}`);
  if (notes.error) throw new Error(`chatbot_contexte : ${messageErreur(notes.error)}`);
  // Les liens du Poster Guide recopiés pointent vers app.notion.com : le bot donne le site public.
  const lignes = ((pages.data ?? []) as PageGuide[]).map((p) => (p.guide === "poster" && p.texte ? { ...p, texte: liensPublics(p.texte) } : p));
  return {
    base: assemblerBase(lignes, (notes.data ?? []) as NoteBase[], role),
    pages: lignes.length,
  };
}

/**
 * Une question, une décision. Un JSON illisible vaut un second essai ; s'il
 * l'est encore, on lève : l'appelant range la question « À traiter », un humain
 * la verra.
 */
export async function demanderAuCerveau(
  input: Parameters<typeof construirePromptFaq>[0],
  generer: (prompt: string) => Promise<string> = generateTextFast,
): Promise<ReponseFaq> {
  const prompt = construirePromptFaq(input);
  for (let essai = 0; essai < 2; essai++) {
    const lue = lireReponseFaq(await generer(prompt));
    if (lue) return lue;
  }
  throw new Error("réponse du modèle illisible (JSON attendu)");
}

/* -------------------------------------------------------------------------
 * Slack
 * ---------------------------------------------------------------------- */

type Fetch = typeof fetch;

/**
 * Le bot qui répond est l'appli Slack « Sophia OS » (celle de Check, Kill or
 * Double : `SLACK_HM_*`), pas « Sophia Comments » (`SLACK_BOT_TOKEN`, comment
 * masters) : une réponse signée « Sophia Comments » dans #questions ne
 * voudrait rien dire. `SLACK_FAQ_*` permet une appli à part sans redéploiement.
 */
export function jetonSlackFaq(): string | null {
  return Deno.env.get("SLACK_FAQ_BOT_TOKEN") ?? Deno.env.get("SLACK_HM_BOT_TOKEN") ?? null;
}

export function secretSignatureFaq(): string | null {
  return Deno.env.get("SLACK_FAQ_SIGNING_SECRET") ?? Deno.env.get("SLACK_HM_SIGNING_SECRET") ?? null;
}

interface ReponseSlack {
  ok: boolean;
  error?: string;
  ts?: string;
  user?: { real_name?: string; profile?: { display_name?: string; real_name?: string } };
}

/** Méthode d'écriture Slack, corps JSON. */
async function appelSlack(
  token: string,
  methode: string,
  corps: Record<string, unknown>,
  fetchFn: Fetch,
): Promise<ReponseSlack> {
  try {
    const reponse = await fetchFn(`https://slack.com/api/${methode}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(corps),
    });
    if (!reponse.ok) return { ok: false, error: `http_${reponse.status}` };
    return (await reponse.json()) as ReponseSlack;
  } catch (erreur) {
    return { ok: false, error: messageErreur(erreur).slice(0, 200) };
  }
}

/**
 * Poste un message. `canal` peut être l'ID d'une personne : Slack l'envoie
 * alors en message privé, de la part du bot.
 */
export async function posterSlack(
  token: string,
  canal: string,
  texte: string,
  threadTs?: string | null,
  fetchFn: Fetch = fetch,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const r = await appelSlack(token, "chat.postMessage", {
    channel: canal,
    text: texte,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    unfurl_links: false,
    unfurl_media: false,
  }, fetchFn);
  return r.ok ? { ok: true, ts: r.ts } : { ok: false, error: r.error ?? "inconnue" };
}

/**
 * Le nom affiché d'une personne (scope `users:read`), null si Slack refuse.
 * Méthode de lecture : Slack n'y accepte pas de corps JSON, d'où le GET.
 */
export async function nomSlack(token: string, userId: string, fetchFn: Fetch = fetch): Promise<string | null> {
  let r: ReponseSlack;
  try {
    const reponse = await fetchFn(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!reponse.ok) return null;
    r = (await reponse.json()) as ReponseSlack;
  } catch {
    return null;
  }
  if (!r.ok || !r.user) return null;
  return r.user.profile?.display_name?.trim() || r.user.profile?.real_name?.trim() || r.user.real_name?.trim() || null;
}

/**
 * Les messages d'un fil (scope `channels:history`). `null` si Slack refuse :
 * l'appelant décide alors s'il poste quand même.
 */
export async function lireFil(
  token: string,
  canal: string,
  ts: string,
  fetchFn: Fetch = fetch,
): Promise<MessageFil[] | null> {
  try {
    const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(canal)}&ts=${encodeURIComponent(ts)}&limit=100`;
    const reponse = await fetchFn(url, { headers: { authorization: `Bearer ${token}` } });
    if (!reponse.ok) return null;
    const r = (await reponse.json()) as { ok: boolean; messages?: MessageFil[] };
    return r.ok ? (r.messages ?? []) : null;
  } catch {
    return null;
  }
}

/** L'équipe sur Slack : les admins (constantes) et les managers connus de l'OS. */
export async function chargerEquipeSlack(db: Db): Promise<Set<string>> {
  const managers = await chargerManagersSlack(db);
  return new Set([...Object.keys(ADMINS_SLACK), ...managers.keys()]);
}

/**
 * Qui compte comme « l'équipe » sur Slack : les admins (constantes) et les
 * managers dont l'OS connaît l'ID Slack. `managers` : ID Slack → profil OS.
 */
export async function chargerManagersSlack(db: Db): Promise<Map<string, string>> {
  const [hm, recrues] = await Promise.all([
    db.from("hm_slack").select("profile_id, slack_user_id").not("slack_user_id", "is", null).limit(900),
    db.from("recrutement_hms").select("profile_id, slack_user_id").not("slack_user_id", "is", null).limit(900),
  ]);
  const managers = new Map<string, string>();
  for (const ligne of [...(recrues.data ?? []), ...(hm.data ?? [])]) {
    const slack = String(ligne.slack_user_id ?? "").trim();
    if (slack && ligne.profile_id) managers.set(slack, String(ligne.profile_id));
  }
  if (hm.error) console.warn(`[faq] hm_slack : ${messageErreur(hm.error)}`);
  if (recrues.error) console.warn(`[faq] recrutement_hms : ${messageErreur(recrues.error)}`);
  return managers;
}
