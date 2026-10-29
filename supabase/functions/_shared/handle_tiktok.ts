/**
 * 0444 — Le @ TikTok qui ne correspond pas. Cas réel : l'OS attendait
 * @sara.studie746, la recrue avait créé @sara.studio746, et l'OS lui a dit
 * « your account isn't created yet ».
 *
 * - Start warmup cliqué et deux lectures de suite (au moins 12 h après le clic)
 *   qui ne trouvent pas le @ : jamais « create your account ». Un message
 *   « we can't find your TikTok account @… » (Slack, puis Upwork 24 h après
 *   sans réaction), pour qu'elle donne son @ exact.
 * - Le @ donné (dashboard « My TikTok account », ou une réponse Slack /
 *   Upwork) est lu sur TikTok : trouvé → le @ du compte est remplacé (les
 *   dates du warm-up restent) ; introuvable → « please check the spelling »
 *   (dashboard) ou « To read » (réponse).
 */
// deno-lint-ignore-file no-explicit-any
import type { ProfilTiktok } from "./profil_tiktok.ts";

/** Un @ TikTok : 2 à 24 caractères, lettres, chiffres, points et tirets bas. */
const HANDLE = /^[a-z0-9._]{2,24}$/;

/** Le @ propre (sans @, en minuscules) ; null s'il n'a pas la forme d'un @ TikTok. */
export function normaliserHandle(brut: string | null | undefined): string | null {
  let s = String(brut ?? "").trim();
  const lien = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (lien) s = lien[1]!;
  s = s.replace(/^@+/, "").replace(/[.,!?;:]+$/, "").toLowerCase();
  return HANDLE.test(s) && !/^\.|\.$/.test(s) ? s : null;
}

/**
 * Le @ TikTok écrit dans un message (« my account is @sara.studio746 », un lien
 * tiktok.com/@…). Jamais une adresse e-mail. null : aucun.
 */
export function extraireHandle(texte: string | null | undefined): string | null {
  const t = String(texte ?? "");
  const lien = t.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (lien) return normaliserHandle(lien[1]);
  for (const m of t.matchAll(/(^|[^A-Za-z0-9._@])@([A-Za-z0-9._]{2,30})/g)) {
    const h = normaliserHandle(m[2]);
    if (h) return h;
  }
  return null;
}

/** Une recrue dont le @ est introuvable (`handles_introuvables`, 0444). */
export interface HandleIntrouvable {
  compte_id: string;
  poster_id: string;
  handle: string;
  warmup_at: string;
  introuvable_at: string | null;
  /** Le 1er message « we can't find your TikTok account » parti, et ses canaux. */
  message_at: string | null;
  message_canaux: string[] | null;
  /** Le 2e, sur Upwork. */
  upwork_at: string | null;
  /** Une réponse ou un @ donné depuis le 1er message. */
  reaction_at: string | null;
  propose: string | null;
  propose_statut: string | null;
  propose_at: string | null;
}

export type EtapeHandle = "handle" | "handle_upwork";

/**
 * Le message à préparer : le 1er (Slack s'il y est, sinon Upwork) ; puis, s'il
 * est parti sur Slack seulement, Upwork 24 h après, sans réaction entre-temps.
 * null : rien (déjà fait, une réaction, ou aucun canal).
 */
export function etapeHandle(
  h: HandleIntrouvable,
  p: { slack: boolean; contrat: boolean },
  maintenant: Date,
): EtapeHandle | null {
  if (!h.message_at) return p.slack || p.contrat ? "handle" : null;
  if (h.upwork_at || h.reaction_at || !p.contrat) return null;
  if ((h.message_canaux ?? []).includes("upwork")) return null;
  return maintenant.getTime() - new Date(h.message_at).getTime() >= 24 * 3_600_000 ? "handle_upwork" : null;
}

const remplir = (modele: string, vars: Record<string, string>) =>
  modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();

export const TEXTES_HANDLE_DEFAUT = {
  introuvable:
    "Hi {prenom}, we can't find your TikTok account @{handle}. If your account has a different name, update it on your dashboard (My TikTok account), or reply here with your exact @.",
  excuse:
    "Sorry, our last message was a mistake. If your account has a different name than @{handle}, update it on your dashboard or reply with your exact @.",
  trouve: "Thanks, we found @{handle}.",
  pas_trouve: "We still can't find @{handle}, please check the spelling.",
};

export type TextesHandle = typeof TEXTES_HANDLE_DEFAUT;

export const CLES_TEXTES_HANDLE: Record<keyof TextesHandle, string> = {
  introuvable: "handle_introuvable_texte",
  excuse: "handle_excuse_texte",
  trouve: "handle_trouve_texte",
  pas_trouve: "handle_pas_trouve_texte",
};

export function texteHandle(modele: string, o: { prenom?: string | null; handle: string }): string {
  return remplir(modele, { prenom: (o.prenom ?? "").trim() || "there", handle: o.handle.replace(/^@/, "") });
}

/** Les 4 textes (réglages, sinon le texte par défaut). */
export async function lireTextesHandle(supabase: any): Promise<TextesHandle> {
  const { data } = await supabase.from("reglages").select("cle, valeur").in("cle", Object.values(CLES_TEXTES_HANDLE));
  const v = Object.fromEntries(((data ?? []) as { cle: string; valeur: unknown }[]).map((x) => [x.cle, x.valeur]));
  const lire = (k: keyof TextesHandle) => {
    const x = v[CLES_TEXTES_HANDLE[k]];
    return typeof x === "string" && x.trim() ? x.trim() : TEXTES_HANDLE_DEFAUT[k];
  };
  return { introuvable: lire("introuvable"), excuse: lire("excuse"), trouve: lire("trouve"), pas_trouve: lire("pas_trouve") };
}

export type IssueHandle = "trouve" | "introuvable" | "illisible";

/**
 * Lit un @ proposé sur TikTok et range le résultat (`handles_proposes`).
 * Trouvé : le @ du compte est remplacé (seulement `handle_tiktok` : les dates
 * du warm-up restent), la lecture est notée, l'événement aussi. Page illisible
 * (TikTok bloque) : rien ne change, une autre lecture plus tard.
 */
export async function verifierHandlePropose(
  supabase: any,
  lire: (handle: string) => Promise<ProfilTiktok>,
  p: { id: string; poster_id: string; compte_id: string; handle_propose: string; handle_attendu: string | null; tentatives?: number },
): Promise<IssueHandle> {
  const profil = await lire(p.handle_propose);
  const maintenant = new Date().toISOString();
  if (profil.existe === null) {
    await supabase.from("handles_proposes")
      .update({ tentatives: (p.tentatives ?? 0) + 1, erreur: profil.erreur })
      .eq("id", p.id);
    return "illisible";
  }
  await supabase.from("ckd_warmup_releves").insert({
    compte_id: p.compte_id, handle: p.handle_propose, existe: profil.existe, cree_tiktok_at: profil.creeLe,
    abonnements: profil.abonnements, likes: profil.likes, abonnes: profil.abonnes, videos: profil.videos, erreur: profil.erreur,
  });
  if (!profil.existe) {
    await supabase.from("handles_proposes")
      .update({ statut: "introuvable", verifie_at: maintenant, tentatives: (p.tentatives ?? 0) + 1, erreur: null })
      .eq("id", p.id);
    return "introuvable";
  }
  if (p.handle_propose !== (p.handle_attendu ?? "").toLowerCase()) {
    const { error } = await supabase.from("comptes").update({ handle_tiktok: p.handle_propose }).eq("id", p.compte_id);
    if (error) throw error;
    await supabase.from("recrue_evenements").upsert({
      poster_id: p.poster_id, compte_id: p.compte_id, type: "handle_corrige", at: maintenant,
      detail: `@${p.handle_attendu ?? "?"} → @${p.handle_propose} (trouvé sur TikTok)`, cle: p.id,
    }, { onConflict: "poster_id,type,cle", ignoreDuplicates: true });
  }
  await supabase.from("handles_proposes")
    .update({ statut: "trouve", verifie_at: maintenant, tentatives: (p.tentatives ?? 0) + 1, erreur: null })
    .eq("id", p.id);
  return "trouve";
}
