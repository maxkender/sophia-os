/**
 * 20/11 (Max) : le recrutement des Comment Masters dans toutes les langues (0794).
 *   1. Les offres « à préparer » : le texte du pop-up (anglais, la source) traduit dans la langue du posteur, puis
 *      l'offre passe « envoyée » (le pop-up s'affiche à sa prochaine connexion).
 *   2. Les offres « acceptées » : le salon Slack de la langue (créé s'il n'existe pas), le posteur invité dedans,
 *      son ID Slack noté pour le suivi des Done ; titulaire : il devient le Comment Master de la région (mandat) et
 *      la région s'allume ; suppléant : son mandat de suppléant. Une erreur reste sur l'offre (rien n'est réessayé à
 *      l'aveugle ; la page Comment Masters la montre).
 * Le refus (« No thanks ») passe au candidat suivant directement en base (comment_master_offre_repondre).
 */
import { normaliserLangue, traduireChamps } from "../_shared/traduction_email.ts";
import type { serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Le Slack de Max : invité dans les nouveaux salons. */
const SLACK_MAX = "U0BL5FRLBEU";

export const NOMS_LANGUES: Record<string, string> = {
  ar: "Arabic", bg: "Bulgarian", cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English", es: "Spanish",
  "es-419": "Spanish (Latin America)", et: "Estonian", fi: "Finnish", fr: "French", he: "Hebrew", hr: "Croatian",
  hu: "Hungarian", it: "Italian", ja: "Japanese", lt: "Lithuanian", lv: "Latvian", nl: "Dutch", no: "Norwegian", pl: "Polish",
  pt: "Portuguese", "pt-BR": "Portuguese (Brazil)", ro: "Romanian", ru: "Russian", sk: "Slovak", sl: "Slovenian", sr: "Serbian",
  sv: "Swedish", tr: "Turkish",
};

/** Le texte anglais du pop-up (Max, 20/11), avant traduction. */
export function textesOffre(langue: string, role: "titulaire" | "suppleant", tarif: number): Record<string, string> {
  const nom = NOMS_LANGUES[langue] ?? langue;
  const qui = role === "titulaire" ? `the Comment Master for ${nom}` : `the backup Comment Master for ${nom}`;
  const montant = `${Number(tarif).toFixed(2)} $`;
  return {
    titre: `Become ${qui}`,
    texte: `Become ${qui}: you'll get a Slack message when one of our posts takes off, you post the comment we give you from your account within 3 hours, and you earn ${montant} per comment.`,
    accepter: "Accept",
    refuser: "No thanks",
    merci_oui: `Great, you're now ${qui}! We're adding you to the Slack channel.`,
    merci_non: "No problem, thank you!",
  };
}

async function slackApi(token: string, methode: string, corps: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${methode}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(corps),
  });
  return (await res.json()) as { ok: boolean; error?: string; channel?: { id?: string; name?: string }; [k: string]: unknown };
}

interface Offre {
  id: string;
  langue: string;
  role: "titulaire" | "suppleant";
  profile_id: string;
  nom: string;
  tarif: number | null;
}

/** 1. Les textes traduits ; l'offre devient visible (pop-up). */
async function preparer(supabase: Supabase): Promise<{ preparees: number; erreurs: string[] }> {
  const { data } = await supabase.from("comment_master_offres").select("id, langue, role, profile_id, nom, tarif").eq("statut", "a_preparer").limit(40);
  let preparees = 0;
  const erreurs: string[] = [];
  for (const o of (data ?? []) as Offre[]) {
    const en = textesOffre(o.langue, o.role, Number(o.tarif ?? 0));
    const { champs } = await traduireChamps(supabase, normaliserLangue(o.langue), en);
    const { error } = await supabase.from("comment_master_offres")
      .update({ textes: { ...champs, en }, statut: "envoye", envoye_at: new Date().toISOString() }).eq("id", o.id).eq("statut", "a_preparer");
    if (error) erreurs.push(`${o.id} : ${error.message}`);
    else preparees++;
  }
  return { preparees, erreurs };
}

/** Le salon privé de la langue : celui de la région, sinon créé (zz-comments-<langue>). */
async function salon(supabase: Supabase, token: string, langue: string): Promise<{ id: string | null; erreur: string | null }> {
  const { data: r } = await supabase.from("comment_master_regions").select("slack_channel_id").eq("langue", langue).maybeSingle();
  if (r?.slack_channel_id) return { id: r.slack_channel_id as string, erreur: null };
  const nom = `zz-comments-${langue.toLowerCase()}`;
  const c = await slackApi(token, "conversations.create", { name: nom, is_private: true });
  const id = c.ok ? c.channel?.id ?? null : null;
  if (!id) return { id: null, erreur: `création du salon ${nom} : ${c.error ?? "?"}` };
  await slackApi(token, "conversations.invite", { channel: id, users: SLACK_MAX });
  await supabase.from("comment_master_regions").update({ slack_channel_id: id, slack_canal_nom: nom }).eq("langue", langue);
  return { id, erreur: null };
}

/** 2. L'installation d'une offre acceptée. */
async function installer(supabase: Supabase, token: string, o: Offre): Promise<string | null> {
  const { data: p } = await supabase.from("profiles").select("slack_user_id").eq("id", o.profile_id).maybeSingle();
  const slackUser = p?.slack_user_id as string | null;
  if (!slackUser) return "pas de Slack relié";
  const s = await salon(supabase, token, o.langue);
  if (!s.id) return s.erreur;
  const inv = await slackApi(token, "conversations.invite", { channel: s.id, users: slackUser });
  if (!inv.ok && inv.error !== "already_in_channel") return `invitation Slack : ${inv.error ?? "?"}`;
  await supabase.from("comment_master_slack").upsert({ profile_id: o.profile_id, slack_user_id: slackUser, maj_at: new Date().toISOString() }, { onConflict: "profile_id" });
  if (o.role === "suppleant") {
    const { error } = await supabase.from("comment_master_suppleants").insert({ langue: o.langue, profile_id: o.profile_id, nom: o.nom });
    if (error) return `mandat de suppléant : ${error.message}`;
  } else {
    // Le trigger de la région ferme l'ancien mandat et ouvre le nouveau.
    const { error } = await supabase.from("comment_master_regions").update({ comment_master_id: o.profile_id, comment_master: o.nom }).eq("langue", o.langue);
    if (error) return `mandat : ${error.message}`;
    const info = await slackApi(token, "conversations.info", { channel: s.id });
    if (!info.ok) return `salon introuvable pour le bot : ${info.error ?? "?"}`;
    const { error: e1 } = await supabase.from("comment_master_regions")
      .update({ slack_verifie_canal: s.id, slack_verifie_at: new Date().toISOString(), slack_erreur: null }).eq("langue", o.langue);
    if (e1) return `vérification du salon : ${e1.message}`;
    const { error: e2 } = await supabase.from("comment_master_regions").update({ actif: true }).eq("langue", o.langue);
    if (e2) return `activation de la région : ${e2.message}`;
  }
  const qui = o.role === "titulaire" ? "the Comment Master" : "the backup Comment Master";
  await slackApi(token, "chat.postMessage", { channel: s.id, text: `👋 Welcome <@${slackUser}>, you're now ${qui} for ${NOMS_LANGUES[o.langue] ?? o.langue}!` });
  return null;
}

export async function recrutement(supabase: Supabase, token: string | null) {
  const prep = await preparer(supabase);
  const { data } = await supabase.from("comment_master_offres").select("id, langue, role, profile_id, nom, tarif").eq("statut", "accepte").limit(20);
  const installes: string[] = [];
  const erreurs: string[] = [...prep.erreurs];
  for (const o of (data ?? []) as Offre[]) {
    const erreur = token ? await installer(supabase, token, o) : "SLACK_BOT_TOKEN manquant";
    await supabase.from("comment_master_offres").update(erreur
      ? { statut: "erreur", erreur }
      : { statut: "installe", installe_at: new Date().toISOString(), erreur: null }).eq("id", o.id);
    if (erreur) erreurs.push(`${o.langue} ${o.role} : ${erreur}`);
    else installes.push(`${o.langue} ${o.role}`);
  }
  return { ok: true, preparees: prep.preparees, installes, erreurs };
}
