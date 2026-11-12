import { supabase } from "@/lib/supabase/client";

/**
 * 12/11 (Support propre, F) : la page /admin/bot. Le bac à sable (simulation : rien n'est
 * envoyé ni écrit), le catalogue (réponses officielles, avec historique et retour arrière),
 * les infos à connaître, les tests automatiques et le suivi des 7 derniers jours.
 */

export type Niveau = "bot" | "adrien" | "max";
export type Portee = "tous" | "ruul" | "upwork";

export const NIVEAUX: readonly Niveau[] = ["bot", "adrien", "max"];
export const ACTIONS = ["lien_mot_de_passe", "renvoi_parrainage", "pseudo_tiktok", "email_ruul", "arret", "lien_slack", "prevenir_max"] as const;
export const CATEGORIES_BOT = [
  "posting", "tiktok", "warmup", "login", "slack", "paie", "parrainage", "arret", "ruul", "upwork", "bug", "statut", "salutation", "autre",
] as const;

export const LIBELLE_NIVEAU: Record<Niveau, string> = { bot: "Bot seul", adrien: "Adrien", max: "Max" };
export const LIBELLE_ACTION: Record<string, string> = {
  lien_mot_de_passe: "Lien de mot de passe",
  renvoi_parrainage: "Renvoi du parrainage",
  pseudo_tiktok: "Pseudo TikTok",
  email_ruul: "Email Ruul",
  arret: "Arrêt",
  lien_slack: "Lien Slack",
  prevenir_max: "Prévenir Max (bug)",
};

export interface DecisionBot {
  langue: string;
  categorie: string;
  personnel: boolean;
  reponse: string;
  action: string | null;
  action_valeur: string | null;
  niveau: Niveau;
  regle: string | null;
  risque: string[];
  raison: string;
}

export interface ResultatBot {
  decision: DecisionBot;
  texte: string;
  regle_utilisee: string | null;
  plateforme: "ruul" | "upwork" | null;
  action_prevue: { action: string; valeur: string | null; executee: boolean } | null;
}

export interface ProfilFictif {
  plateforme: "ruul" | "upwork";
  zone: string;
  etape: string;
  statut: string;
  prenom: string;
}

export interface EntreeCatalogue {
  id: string;
  question: string;
  formulations: string[];
  reponse: string;
  action: string | null;
  niveau: Niveau;
  portee: Portee;
  categorie: string | null;
  actif: boolean;
  valide_at: string | null;
  ordre: number;
  maj_at: string;
}

export interface Historique {
  id: string;
  reponse_id: string;
  avant: Partial<EntreeCatalogue> | null;
  apres: Partial<EntreeCatalogue> | null;
  at: string;
}

export interface Info {
  cle: string;
  titre: string;
  valeur: string;
  ordre: number;
  maj_at: string;
}

export interface BotTest {
  id: string;
  message: string;
  poster_id: string | null;
  profil: Partial<ProfilFictif> | null;
  source: "help" | "slack_salon";
  attendu_niveau: Niveau | null;
  attendu_contient: string[];
  attendu_action: string | null;
  note: string | null;
  actif: boolean;
  dernier: ResultatBot | null;
  dernier_ok: boolean | null;
  dernier_at: string | null;
}

export interface DemandeSuivi {
  id: string;
  poster_id: string | null;
  type: "question" | "probleme";
  categorie: string | null;
  plateforme: "ruul" | "upwork";
  source: string;
  texte: string;
  bot_reponse: string | null;
  statut: string;
  niveau: Niveau | null;
  risque: string[];
  action_faite: string | null;
  regle: string | null;
  raison: string | null;
  cree_at: string;
}

async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("support", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const corps = ctx && typeof ctx.json === "function" ? ((await ctx.json()) as { error?: string }) : null;
      if (corps?.error) message = corps.error;
    } catch {
      /* message générique */
    }
    throw new Error(message);
  }
  const r = data as T & { ok?: boolean; error?: string };
  if (r && r.ok === false) throw new Error(r.error ?? "erreur");
  return r;
}

// --- Tester ------------------------------------------------------------------

export function simuler(p: { message: string; source: "help" | "slack_salon"; poster_id: string | null; profil: ProfilFictif | null }): Promise<ResultatBot> {
  return appeler({ action: "bot", ...p });
}

export interface PosteurTrouve {
  id: string;
  nom: string;
  email: string | null;
  plateforme: "ruul" | "upwork";
}

/** Un vrai posteur, par prénom, nom ou email (5 au plus). */
export async function chercherPosteurs(q: string): Promise<PosteurTrouve[]> {
  const t = q.trim().replace(/[%,()]/g, "");
  if (t.length < 2) return [];
  const { data, error } = await supabase.from("profiles").select("id, prenom, nom, email, canal_paie")
    .or(`prenom.ilike.%${t}%,nom.ilike.%${t}%,email.ilike.%${t}%`).limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nom: [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string) || "?",
    email: (p.email as string | null) ?? null,
    plateforme: p.canal_paie === "ruul" ? "ruul" : "upwork",
  }));
}

/** « Bonne réponse » : le cas devient un test automatique (niveau et action attendus = ceux du bot). */
export async function garderCommeTest(p: { message: string; source: "help" | "slack_salon"; poster_id: string | null; profil: ProfilFictif | null; r: ResultatBot }): Promise<void> {
  const { error } = await supabase.from("bot_tests").insert({
    message: p.message, source: p.source, poster_id: p.poster_id, profil: p.poster_id ? null : p.profil,
    attendu_niveau: p.r.decision.niveau, attendu_action: p.r.decision.action, note: "Bonne réponse (Tester)",
  });
  if (error) throw new Error(error.message);
}

/** « Corriger » : la bonne réponse est proposée au catalogue (pas encore validée, donc pas utilisée). */
export async function proposerAuCatalogue(p: { question: string; reponse: string; niveau: Niveau; action: string | null; portee: Portee; categorie: string | null }): Promise<void> {
  const { error } = await supabase.from("reponses_officielles").insert({
    question: p.question.slice(0, 500), reponse: p.reponse, niveau: p.niveau, action: p.action, portee: p.portee, categorie: p.categorie,
    formulations: [p.question.slice(0, 500)], actif: true, valide_at: null,
  });
  if (error) throw new Error(error.message);
}

// --- Catalogue -----------------------------------------------------------------

export async function lireCatalogue(): Promise<EntreeCatalogue[]> {
  const { data, error } = await supabase.from("reponses_officielles")
    .select("id, question, formulations, reponse, action, niveau, portee, categorie, actif, valide_at, ordre, maj_at")
    .order("ordre").order("cree_at").limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as EntreeCatalogue[]).map((e) => ({ ...e, formulations: e.formulations ?? [] }));
}

export type ChampsCatalogue = Pick<EntreeCatalogue, "question" | "formulations" | "reponse" | "action" | "niveau" | "portee" | "categorie" | "actif"> & { valide: boolean };

/** Ajoute ou modifie une entrée ; la base garde l'historique (qui, quoi, quand). */
export async function enregistrerEntree(id: string | null, c: ChampsCatalogue, valideAt: string | null): Promise<string> {
  const ligne = {
    question: c.question.trim(), reponse: c.reponse.trim(), action: c.action || null, niveau: c.niveau, portee: c.portee,
    categorie: c.categorie || null, actif: c.actif, formulations: c.formulations.map((f) => f.trim()).filter(Boolean),
    valide_at: c.valide ? (valideAt ?? new Date().toISOString()) : null, maj_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await supabase.from("reponses_officielles").update(ligne).eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }
  const { data, error } = await supabase.from("reponses_officielles").insert(ligne).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function lireHistorique(id: string): Promise<Historique[]> {
  const { data, error } = await supabase.from("reponses_officielles_historique").select("id, reponse_id, avant, apres, at")
    .eq("reponse_id", id).order("at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as Historique[];
}

export async function restaurer(historiqueId: string): Promise<void> {
  const { error } = await supabase.rpc("reponse_officielle_restaurer", { p_historique: historiqueId });
  if (error) throw new Error(error.message);
}

export async function lireInfos(): Promise<Info[]> {
  const { data, error } = await supabase.from("support_infos").select("cle, titre, valeur, ordre, maj_at").order("ordre");
  if (error) throw new Error(error.message);
  return (data ?? []) as Info[];
}

export async function modifierInfo(cle: string, titre: string, valeur: string): Promise<void> {
  const { error } = await supabase.rpc("support_info_modifier", { p_cle: cle, p_titre: titre, p_valeur: valeur });
  if (error) throw new Error(error.message);
}

/** Le filtre du catalogue : recherche (question, formulations, réponse), plateforme, catégorie. */
export function filtrerCatalogue(liste: readonly EntreeCatalogue[], f: { q: string; portee: "" | Portee; categorie: string; inactifs: boolean }): EntreeCatalogue[] {
  const q = f.q.trim().toLowerCase();
  return liste
    .filter((e) => f.inactifs || e.actif)
    .filter((e) => !f.portee || e.portee === f.portee || (f.portee !== "tous" && e.portee === "tous"))
    .filter((e) => !f.categorie || (e.categorie ?? "autre") === f.categorie)
    .filter((e) => !q || [e.question, e.reponse, ...e.formulations].some((t) => t.toLowerCase().includes(q)));
}

// --- Tests automatiques ---------------------------------------------------------

export async function lireTests(): Promise<BotTest[]> {
  const { data, error } = await supabase.from("bot_tests")
    .select("id, message, poster_id, profil, source, attendu_niveau, attendu_contient, attendu_action, note, actif, dernier, dernier_ok, dernier_at")
    .order("cree_at").limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as BotTest[];
}

export interface ResultatTests {
  total: number;
  verts: number;
  resultats: { id: string; ok: boolean; niveau: string; reponse: string; action: string | null }[];
}

export function lancerTests(ids: string[] | null = null): Promise<ResultatTests> {
  return appeler({ action: "tests_lancer", ids });
}

export async function ajouterTest(t: { message: string; source: "help" | "slack_salon"; attendu_niveau: Niveau | null; attendu_action: string | null; attendu_contient: string[]; note: string; profil: Partial<ProfilFictif> | null }): Promise<void> {
  const { error } = await supabase.from("bot_tests").insert({ ...t, attendu_contient: t.attendu_contient.filter(Boolean) });
  if (error) throw new Error(error.message);
}

export async function activerTest(id: string, actif: boolean): Promise<void> {
  const { error } = await supabase.from("bot_tests").update({ actif }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Les tests verts avant un changement et rouges après. */
export function regressions(avant: readonly Pick<BotTest, "id" | "dernier_ok">[], apres: ResultatTests): string[] {
  const vert = new Set(avant.filter((t) => t.dernier_ok).map((t) => t.id));
  return apres.resultats.filter((r) => !r.ok && vert.has(r.id)).map((r) => r.id);
}

// --- Suivi ------------------------------------------------------------------------

export async function lireSuivi(): Promise<DemandeSuivi[]> {
  const depuis = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const { data, error } = await supabase.from("support_demandes")
    .select("id, poster_id, type, categorie, plateforme, source, texte, bot_reponse, statut, niveau, risque, action_faite, regle, raison, cree_at")
    .gte("cree_at", depuis).order("cree_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as DemandeSuivi[];
}

/** Une question répétée : la même personne revient sur la même catégorie, ou le bot a noté « repetition ». */
export function repetees(liste: readonly DemandeSuivi[]): Set<string> {
  const vus = new Map<string, number>();
  for (const d of liste) {
    if (!d.poster_id) continue;
    const k = `${d.poster_id}|${d.categorie ?? "autre"}`;
    vus.set(k, (vus.get(k) ?? 0) + 1);
  }
  return new Set(liste.filter((d) => d.risque?.includes("repetition") || (d.poster_id && (vus.get(`${d.poster_id}|${d.categorie ?? "autre"}`) ?? 0) > 1)).map((d) => d.id));
}

/** Les compteurs de la semaine par niveau (objectif : moins de 10 pour Max). */
export function compteurs(liste: readonly DemandeSuivi[]): Record<Niveau, number> {
  const c: Record<Niveau, number> = { bot: 0, adrien: 0, max: 0 };
  for (const d of liste) c[d.niveau ?? "adrien"] += 1;
  return c;
}

export const OBJECTIF_MAX = 10;
