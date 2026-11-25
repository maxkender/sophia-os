/**
 * WhatsApp — l'envoi (réseau + base), partagé par les fonctions `whatsapp` et `support`.
 * Chaque envoi est d'abord noté dans whatsapp_envois (clé anti-doublon), puis parti chez Meta ; le wamid relie
 * ensuite les statuts du webhook (envoyé, livré, lu, échec). Les secrets ne sont jamais écrits ni journalisés.
 */
import { messageErreur, type serviceClient } from "./supabase.ts";
import { corpsModele, corpsTexte, coutEstime, e164, fenetreOuverte, GRAPH, numeroAutorise, paysDuNumero } from "./whatsapp.ts";
import { avecPiedWhatsApp, banniereActive } from "./whatsapp_relances.ts";
import { choisirLangueEnvoi, cleModeleLangue, langueMeta } from "./whatsapp_traductions.ts";

type Db = ReturnType<typeof serviceClient>;

export const secretsWhatsApp = () => ({
  token: Deno.env.get("WHATSAPP_TOKEN") ?? "",
  phoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
  waba: Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") ?? "",
});

/**
 * L'identifiant du compte WhatsApp Business : le réglage whatsapp_waba_id s'il existe (ce n'est pas un secret),
 * sinon le secret WHATSAPP_BUSINESS_ACCOUNT_ID.
 */
export async function wabaId(db: Db): Promise<string> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "whatsapp_waba_id").maybeSingle();
  const v = typeof data?.valeur === "string" ? data.valeur.trim() : typeof data?.valeur === "number" ? String(data.valeur) : "";
  return /^\d{6,25}$/.test(v) ? v : secretsWhatsApp().waba;
}

export async function lireModeWhatsApp(db: Db): Promise<unknown> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "whatsapp_mode").maybeSingle();
  return data?.valeur ?? { mode: "test", numeros_autorises: [] };
}

/** L'erreur de l'API Graph (champs utiles seulement : jamais le jeton, absent de ces champs). */
export interface ErreurGraph {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
}

/**
 * 25/11 : le texte d'une erreur Meta, avec le sous-code et l'explication donnée à l'utilisateur (« 100 Invalid
 * parameter » seul ne dit pas pourquoi un modèle est refusé) : « 100/2388023 Invalid parameter — titre : message ».
 */
export function texteErreurGraph(e: ErreurGraph, status: number): string {
  const code = `${e.code ?? status}${e.error_subcode ? `/${e.error_subcode}` : ""}`;
  const detail = [e.error_user_title, e.error_user_msg].map((x) => String(x ?? "").trim()).filter(Boolean).join(" : ");
  return `${code} ${e.message ?? ""}${detail ? ` — ${detail}` : ""}`.replace(/\s+/g, " ").trim().slice(0, 600);
}

/** Un appel à l'API Graph avec le jeton (jamais renvoyé ni journalisé). */
export async function graph(chemin: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; erreur: string | null }> {
  const { token } = secretsWhatsApp();
  if (!token) return { ok: false, status: 0, data: null, erreur: "WHATSAPP_TOKEN absent" };
  try {
    const r = await fetch(`${GRAPH}/${chemin.replace(/^\//, "")}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const data = await r.json().catch(() => null) as Record<string, unknown> | null;
    const e = (data?.error ?? null) as ErreurGraph | null;
    return { ok: r.ok && !e, status: r.status, data, erreur: e ? texteErreurGraph(e, r.status) : r.ok ? null : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, data: null, erreur: messageErreur(e) };
  }
}

export interface EnvoiWhatsApp {
  e164: string;
  posterId?: string | null;
  motif: string;
  /** Anti-doublon : un même envoi n'est jamais fait deux fois. */
  cle?: string | null;
  demandeId?: string | null;
  modele?: { nom: string; langue: string; variables: string[] } | null;
  /**
   * 25/11 (Max) : la langue du posteur ou du candidat (code de l'OS ou de Join : fr, de, pt, pt-BR, es-419…). Avec un
   * modèle : sa version dans cette langue si elle est APPROVED chez Meta, sinon l'anglais (la langue réellement
   * utilisée est notée dans whatsapp_envois.langue). Absente : modele.langue tel quel, comme avant.
   */
  langueCible?: string | null;
  texte?: string | null;
}

/**
 * La langue d'envoi d'un modèle pour cette langue cible (code OS ou Join) : la langue Meta du posteur si le modèle
 * y est APPROVED (whatsapp_modeles, tenu à jour par modeles_sync), sinon « en ».
 */
export async function langueModeleEnvoi(db: Db, nom: string, langueCible: string | null | undefined): Promise<string> {
  const l = langueMeta(langueCible);
  if (l === "en") return "en";
  const { data } = await db.from("whatsapp_modeles").select("statut").eq("nom", nom).eq("langue", l).maybeSingle();
  return choisirLangueEnvoi(nom, l, new Set(data?.statut === "APPROVED" ? [cleModeleLangue(nom, l)] : []));
}

/**
 * Un envoi WhatsApp. En mode test, seuls les numéros autorisés reçoivent (les autres : « bloque », rien ne part).
 * Un texte libre n'est possible que dans la fenêtre de 24 h (dernier message reçu du numéro).
 */
export async function envoyerWhatsApp(db: Db, envoi: EnvoiWhatsApp): Promise<{ ok: boolean; id?: string; wamid?: string; statut: string; erreur?: string }> {
  const numero = e164(envoi.e164);
  if (!numero) return { ok: false, statut: "bloque", erreur: "numéro invalide" };
  // 25/11 : la langue du posteur si le modèle y est APPROVED, sinon l'anglais.
  const o: EnvoiWhatsApp = envoi.modele && envoi.langueCible
    ? { ...envoi, modele: { ...envoi.modele, langue: await langueModeleEnvoi(db, envoi.modele.nom, envoi.langueCible) } }
    : envoi;
  const type = o.modele ? "modele" : "texte";
  const mode = await lireModeWhatsApp(db);
  const test = (mode as { mode?: string })?.mode !== "live";
  let refus: string | null = null;
  if (!numeroAutorise(mode, numero)) refus = "mode test : numéro non autorisé";
  if (!refus && type === "texte") {
    const { data: dernier } = await db.from("whatsapp_recus").select("recu_at").eq("de", numero).order("recu_at", { ascending: false }).limit(1).maybeSingle();
    if (!fenetreOuverte(dernier?.recu_at as string | undefined)) refus = "fenêtre de 24 h fermée";
  }
  const { data: pays } = o.posterId ? await db.rpc("paie_pays_posteur", { p_poster: o.posterId }) : { data: null };
  const ligne = {
    cle: o.cle ?? null, poster_id: o.posterId ?? null, e164: numero, type, motif: o.motif, demande_id: o.demandeId ?? null,
    modele: o.modele?.nom ?? null, langue: o.modele?.langue ?? null, variables: o.modele?.variables ?? null, texte: o.texte ?? null,
    test, statut: refus ? "bloque" : "a_envoyer", erreur: refus,
    cout_estime: refus ? null : coutEstime((pays as string | null) ?? paysDuNumero(numero), type),
  };
  const { data: cree, error } = await db.from("whatsapp_envois").insert(ligne).select("id").maybeSingle();
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: true, statut: "deja_envoye" };
    return { ok: false, statut: "erreur", erreur: error.message };
  }
  const id = cree?.id as string;
  if (refus) return { ok: false, id, statut: "bloque", erreur: refus };

  const { phoneId } = secretsWhatsApp();
  if (!phoneId) {
    await db.from("whatsapp_envois").update({ statut: "echec", erreur: "WHATSAPP_PHONE_NUMBER_ID absent", echec_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, id, statut: "echec", erreur: "WHATSAPP_PHONE_NUMBER_ID absent" };
  }
  const corps = o.modele ? corpsModele(numero, o.modele.nom, o.modele.langue, o.modele.variables) : corpsTexte(numero, String(o.texte ?? ""));
  const r = await graph(`${phoneId}/messages`, { method: "POST", body: corps });
  const wamid = ((r.data?.messages as { id?: string }[] | undefined)?.[0]?.id) ?? null;
  const maintenant = new Date().toISOString();
  if (!r.ok || !wamid) {
    await db.from("whatsapp_envois").update({ statut: "echec", erreur: r.erreur ?? "pas de wamid", echec_at: maintenant }).eq("id", id);
    return { ok: false, id, statut: "echec", erreur: r.erreur ?? "pas de wamid" };
  }
  await db.from("whatsapp_envois").update({ statut: "envoye", wamid, envoye_at: maintenant }).eq("id", id);
  return { ok: true, id, wamid, statut: "envoye" };
}

/** Les modèles APPROVED chez Meta (anglais), lus dans whatsapp_modeles (tenu à jour par l'action modeles_sync). */
export async function modelesApprouves(db: Db): Promise<Set<string>> {
  const { data } = await db.from("whatsapp_modeles").select("nom").eq("langue", "en").eq("statut", "APPROVED").limit(500);
  return new Set((data ?? []).map((m: { nom: string }) => m.nom));
}

/** 25/11 : les modèles APPROVED dans toutes les langues, en clés « nom:langue » (cleModeleLangue). */
export async function modelesApprouvesLangues(db: Db): Promise<Set<string>> {
  const { data } = await db.from("whatsapp_modeles").select("nom, langue").eq("statut", "APPROVED").limit(2000);
  return new Set((data ?? []).map((m: { nom: string; langue: string }) => cleModeleLangue(m.nom, m.langue)));
}

/**
 * Ce numéro ne doit plus rien recevoir : accord retiré (STOP), ou son posteur est sur la liste « ne plus contacter »
 * ou arrêté. Pour les envois hors relances (Join), qui ne passent pas par whatsapp_relances_faits.
 */
export async function numeroBloque(db: Db, numero: string, posterId?: string | null): Promise<boolean> {
  const { data: ct } = await db.from("posteur_contacts").select("poster_id, whatsapp_optout_at").eq("whatsapp_e164", numero).limit(20);
  if ((ct ?? []).some((x) => !!x.whatsapp_optout_at)) return true;
  const ids = [...new Set([posterId, ...(ct ?? []).map((x) => x.poster_id as string | null)].filter((x): x is string => !!x))];
  if (!ids.length) return false;
  const [n, a] = await Promise.all([
    db.from("ne_plus_contacter").select("poster_id").in("poster_id", ids).is("leve_at", null).limit(1),
    db.from("arrets").select("poster_id").in("poster_id", ids).is("annule_at", null).limit(1),
  ]);
  return !!(n.data?.length || a.data?.length);
}

/** Le numéro WhatsApp d'un posteur (s'il en a un) et son accord. */
export async function contactWhatsApp(db: Db, posterId: string): Promise<{ e164: string | null; optin: boolean; optout: boolean }> {
  const { data } = await db.from("posteur_contacts").select("whatsapp_e164, whatsapp_optin_at, whatsapp_optout_at").eq("poster_id", posterId).maybeSingle();
  return { e164: (data?.whatsapp_e164 as string | null) ?? null, optin: !!data?.whatsapp_optin_at, optout: !!data?.whatsapp_optout_at };
}

/**
 * 0839 : le texte d'un prochain email avec la phrase WhatsApp au pied, seulement si le réglage whatsapp_banniere est
 * allumé (éteint par défaut : le texte revient alors tel quel). Préparé, branché nulle part pour l'instant.
 */
export async function avecPiedWhatsAppSiActif(db: Db, texte: string): Promise<string> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "whatsapp_banniere").maybeSingle();
  return avecPiedWhatsApp(texte, banniereActive(data?.valeur));
}
