import { supabase } from "@/lib/supabase/client";

/**
 * 0671 : l'espace support. « Help » côté posteur (questions au bot, problèmes
 * signalés, le fil des réponses) ; « Support » côté admin (onglets Problems et
 * Questions, panneau de réponse). La base filtre : un posteur ne lit que ses
 * demandes, sans le brouillon de l'équipe.
 */

export type Plateforme = "ruul" | "upwork";
export type TypeDemande = "question" | "probleme";
export type StatutDemande = "bot" | "ouvert" | "attente_posteur" | "resolu";
export type Urgence = "rouge" | "orange" | "gris";

export const CATEGORIES_PROBLEME = ["paiement", "connexion", "compte", "tiktok", "arret", "autre"] as const;
export const CATEGORIES = ["paiement", "connexion", "compte", "tiktok", "posting", "parrainage", "arret", "autre"] as const;
export type Categorie = (typeof CATEGORIES)[number];

export interface MessageFil {
  auteur: "posteur" | "equipe" | "bot";
  texte: string;
  cree_at: string;
}

export interface MaDemande {
  id: string;
  type: TypeDemande;
  categorie: string | null;
  texte: string;
  statut: StatutDemande;
  equipe_a_repondu: boolean;
  cree_at: string;
  resolu_at: string | null;
  messages: MessageFil[];
}

export interface LigneSupport {
  id: string;
  type: TypeDemande;
  categorie: string | null;
  plateforme: Plateforme;
  source: "help" | "slack_salon" | "slack_aide";
  statut: StatutDemande;
  extrait: string;
  escalade_at: string;
  cree_at: string;
  posteur_at: string | null;
  equipe_at: string | null;
  resolu_at: string | null;
  urgence: Urgence;
  en_retard: boolean;
  poster_id: string | null;
  nom: string;
  messages: number;
}

export interface Fiche {
  poster_id: string;
  nom: string;
  plateforme: Plateforme;
  debut: string | null;
  premiere_connexion: string | null;
  slack_relie: boolean;
  tiktok: string | null;
  ruul: { statut: string | null; email_ruul: boolean; pret_at: string | null; premier_paiement_at: string | null } | null;
  contrat_upwork: string | null;
  parrainages: { declares: number; invites: number; recrues: number } | null;
  derniere_paie: { semaine: string | null; statut: string | null; montant: number | null } | null;
  manque: string[];
}

export interface DetailSupport {
  id: string;
  type: TypeDemande;
  categorie: string | null;
  plateforme: Plateforme;
  source: LigneSupport["source"];
  statut: StatutDemande;
  texte: string;
  capture: string | null;
  brouillon: string | null;
  bot_reponse: string | null;
  auto_action: string | null;
  auto_resultat: string | null;
  slack_user: string | null;
  /** 0673 : le verdict du bot (problème confirmé, pas de problème, incertain) et sa phrase. */
  verdict?: "probleme_confirme" | "pas_de_probleme" | "incertain" | null;
  verdict_texte?: string | null;
  escalade_at: string | null;
  urgence: Urgence;
  en_retard: boolean;
  poster_id: string | null;
  messages: MessageFil[];
  fiche: Fiche | null;
  /** 0685 : envoyée en ticket dans #a-os-tickets (bouton de la Boîte). */
  ticket_at?: string | null;
  /** 0685 : la dernière analyse « Avoir le contexte ». */
  contexte_analyse?: string | null;
  contexte_at?: string | null;
}

/** Le libellé d'une ligne : la catégorie d'un problème ; « Question » pour une question sans catégorie. */
export function cleLibelle(type: TypeDemande, c: string | null | undefined, plateforme: Plateforme): string {
  return type === "question" && !c ? "question" : cleCategorie(c, plateforme);
}

/** Ce que la plateforme du posteur permet de dire : « compte » = Ruul account ou Upwork contract. */
export function cleCategorie(c: string | null | undefined, plateforme: Plateforme): string {
  if (c === "compte") return plateforme === "ruul" ? "compte_ruul" : "compte_upwork";
  return c && (CATEGORIES as readonly string[]).includes(c) ? c : "autre";
}

/** Le statut vu par le posteur : Received / In progress / Solved. */
export function statutPosteur(d: Pick<MaDemande, "statut" | "equipe_a_repondu">): "recu" | "repondu" | "en_cours" | "resolu" {
  if (d.statut === "resolu") return "resolu";
  // Le bot a répondu ; le posteur n'a pas encore dit « This solved it » ou « I still need help ».
  if (d.statut === "bot") return "repondu";
  if (d.statut === "attente_posteur" || d.equipe_a_repondu) return "en_cours";
  return "recu";
}

/** La page Support : un onglet, des filtres, l'urgence puis l'ancienneté. */
export interface FiltresSupport {
  plateforme: "" | Plateforme;
  /** 12/11 (Support propre) : le niveau (Adrien, ou Max pour « Paiement / urgent »). */
  niveau?: "" | "adrien" | "max";
  categorie: string;
  statut: "" | "ouvert" | "attente_posteur" | "resolu";
  retard: boolean;
}

export function filtrer(lignes: readonly LigneSupport[], type: TypeDemande, f: FiltresSupport, niveaux?: ReadonlyMap<string, string | null>): LigneSupport[] {
  const rang = { rouge: 0, orange: 1, gris: 2 } as const;
  return lignes
    .filter((l) => l.type === type)
    .filter((l) => !f.niveau || (niveaux?.get(l.id) ?? "adrien") === f.niveau)
    .filter((l) => (f.statut ? l.statut === f.statut : l.statut !== "resolu"))
    .filter((l) => !f.plateforme || l.plateforme === f.plateforme)
    .filter((l) => !f.categorie || (l.categorie ?? "autre") === f.categorie)
    .filter((l) => !f.retard || l.en_retard)
    // 12/11 (Max) : une seule liste dans la Boîte ; la paie (niveau Max) passe en premier.
    .sort((a, b) => paie(a) - paie(b) || rang[a.urgence] - rang[b.urgence] || a.escalade_at.localeCompare(b.escalade_at));
  function paie(l: LigneSupport): number {
    return niveaux?.get(l.id) === "max" ? 0 : 1;
  }
}

export function compter(lignes: readonly LigneSupport[], type: TypeDemande): number {
  return lignes.filter((l) => l.type === type && l.statut === "ouvert").length;
}

/** L'âge d'une demande, court (« 3 h », « 2 d »). */
export function age(depuis: string, maintenant = Date.now()): string {
  const minutes = Math.max(0, Math.round((maintenant - new Date(depuis).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `${heures} h`;
  return `${Math.round(heures / 24)} d`;
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
  if (r && r.ok === false) throw new Error(r.error ?? "error");
  return r;
}

// --- Posteur ---------------------------------------------------------------

export async function lireMesDemandes(): Promise<MaDemande[]> {
  const { data, error } = await supabase.rpc("support_mes_demandes");
  if (error) throw new Error(error.message);
  return (data ?? []) as MaDemande[];
}

/** 12/11 (OS clair, 0677) : l'espace Help d'un posteur, pour l'aperçu admin. */
export async function lireDemandesDe(posterId: string): Promise<MaDemande[]> {
  const { data, error } = await supabase.rpc("support_demandes_de", { p_poster: posterId });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaDemande[];
}

export function poserQuestion(texte: string): Promise<{ id: string | null; reponse: string; envoye_equipe: boolean }> {
  return appeler({ action: "question", texte });
}

export function signalerProbleme(p: { categorie: string; texte: string; capture: string | null }): Promise<{ id: string | null; reponse: string }> {
  return appeler({ action: "probleme", ...p });
}

export async function actionPosteur(id: string, action: "resolu" | "aide" | "repondre", texte?: string): Promise<void> {
  const { error } = await supabase.rpc("support_posteur_action", { p_id: id, p_action: action, p_texte: texte ?? null });
  if (error) throw new Error(error.message);
}

/** La capture va dans le seau privé « support », dans le dossier du posteur. */
export async function deposerCapture(fichier: File, userId: string): Promise<string> {
  const ext = (fichier.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const chemin = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("support").upload(chemin, fichier, { contentType: fichier.type || undefined });
  if (error) throw new Error(error.message);
  return chemin;
}

// --- Admin -----------------------------------------------------------------

export async function lireSupport(): Promise<LigneSupport[]> {
  const { data, error } = await supabase.rpc("support_liste");
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneSupport[];
}

/** 12/11 : le niveau de chaque demande (bot / adrien / max), lu à part (support_liste ne le donne pas). */
export async function lireNiveaux(): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.from("support_demandes").select("id, niveau").neq("statut", "resolu").limit(1000);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((d) => [d.id as string, (d.niveau as string | null) ?? null]));
}

export async function lireDetail(id: string): Promise<DetailSupport | null> {
  const { data, error } = await supabase.rpc("support_detail", { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? null) as DetailSupport | null;
}

export function envoyerReponse(id: string, texte: string): Promise<{ envois: Record<string, string> }> {
  return appeler({ action: "repondre", id, texte });
}

/** 12/11 (Max) : la demande part en ticket dans #a-os-tickets ; l'IT guy la traite. */
export function envoyerTicket(id: string, note?: string): Promise<{ ticket_at?: string; deja?: boolean }> {
  return appeler({ action: "ticket", id, note: note ?? null });
}

/** 12/11 (Max) : l'analyse de tout ce que l'OS sait sur le posteur (fiche, Upwork, Slack, Help, Ruul, posts). */
export function analyserContexte(id: string): Promise<{ analyse: string; contexte_at: string }> {
  return appeler({ action: "contexte", id });
}

export async function changer(id: string, p: { statut?: "ouvert" | "resolu"; type?: TypeDemande }): Promise<void> {
  const { error } = await supabase.rpc("support_changer", { p_id: id, p_statut: p.statut ?? null, p_type: p.type ?? null });
  if (error) throw new Error(error.message);
}

export async function versOfficielles(p: { question: string; reponse: string; portee: "tous" | Plateforme; categorie: string }): Promise<void> {
  const { error } = await supabase.rpc("support_vers_officielles", {
    p_question: p.question, p_reponse: p.reponse, p_portee: p.portee, p_categorie: p.categorie,
  });
  if (error) throw new Error(error.message);
}

/** Un lien de lecture (1 h) pour la capture d'une demande (seau privé ; une adresse Slack reste telle quelle). */
export async function lienCapture(capture: string): Promise<string> {
  if (/^https?:\/\//.test(capture)) return capture.split(" ")[0]!;
  const { data, error } = await supabase.storage.from("support").createSignedUrl(capture, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** La plateforme du posteur connecté (sa fiche) : Ruul ou Upwork. */
export async function lireMaPlateforme(userId: string): Promise<Plateforme> {
  const { data, error } = await supabase.rpc("support_fiche", { p_poster: userId });
  if (error) throw new Error(error.message);
  return (data as { plateforme?: string } | null)?.plateforme === "ruul" ? "ruul" : "upwork";
}

// --- 13/11 (Max) : Help en mode chat ; Support admin en 3 onglets ------------------------------

/** Une bulle du chat Help : le posteur à droite, « Vik Studios » (bot ou équipe) à gauche. */
export interface Bulle {
  cle: string;
  demandeId: string;
  cote: "moi" | "eux";
  texte: string;
  at: string;
}

/** Une demande du chat : ses bulles dans l'ordre, et ce que le posteur peut faire en dessous. */
export interface GroupeChat {
  demande: MaDemande;
  bulles: Bulle[];
  /** Le bot a répondu : « 👍 Solved » / « I still need help ». */
  choix: boolean;
  /** Envoyée à l'équipe, pas encore de réponse de sa part. */
  chezEquipe: boolean;
}

/** Le fil du chat : toutes ses demandes (questions et problèmes), de la plus ancienne à la plus récente. */
export function filChat(demandes: readonly MaDemande[]): GroupeChat[] {
  return [...demandes]
    .sort((a, b) => a.cree_at.localeCompare(b.cree_at))
    .map((d) => {
      const bulles: Bulle[] = [
        { cle: `${d.id}:q`, demandeId: d.id, cote: "moi", texte: d.texte, at: d.cree_at },
        ...d.messages.map((m, i) => ({
          cle: `${d.id}:${i}`, demandeId: d.id, cote: (m.auteur === "posteur" ? "moi" : "eux") as Bulle["cote"], texte: m.texte, at: m.cree_at,
        })),
      ];
      const derniere = bulles[bulles.length - 1]!;
      return {
        demande: d,
        bulles,
        choix: (d.statut === "bot" || d.statut === "attente_posteur") && derniere.cote === "eux",
        chezEquipe: d.statut === "ouvert" && derniere.cote === "moi",
      };
    });
}

/** La demande encore ouverte la plus récente (le posteur y répond depuis le chat), ou null. */
export function demandeOuverte(demandes: readonly MaDemande[]): MaDemande | null {
  const ouvertes = demandes.filter((d) => d.statut === "ouvert" || d.statut === "attente_posteur");
  return ouvertes.sort((a, b) => b.cree_at.localeCompare(a.cree_at))[0] ?? null;
}

/** Ce que l'OS sait de « qui a agi » sur une demande (champs de support_demandes). */
export interface TraceDemande {
  id: string;
  statut: StatutDemande;
  niveau: string | null;
  bot_reponse: string | null;
  auto_action: string | null;
  auto_resultat: string | null;
  action_faite: string | null;
  ticket_at: string | null;
  equipe_at: string | null;
  escalade_at: string | null;
  resolu_par_bot: boolean | null;
  posteur_at?: string | null;
}

export type CleQui =
  | "bot" | "mot_de_passe" | "lien_slack" | "email_ruul" | "pseudo_tiktok" | "parrainage" | "arret" | "etape"
  | "ruul_bot" | "os_tickets" | "max" | "equipe" | "renvoyee";

/** 13/11 (Max) : les étiquettes « qui a agi » d'une demande, dans l'ordre où elles se lisent. */
export function quiAAgi(d: TraceDemande): { cle: CleQui; detail?: string }[] {
  const out: { cle: CleQui; detail?: string }[] = [];
  const action = `${d.action_faite ?? ""} ${d.auto_resultat ?? ""}`.toLowerCase();
  const reussie = (s: string) => !/erreur|pas chang|rien chang|invalide|introuvable|aucun compte/.test(s);
  if (d.bot_reponse || d.niveau === "bot" || d.statut === "bot" || d.resolu_par_bot) out.push({ cle: "bot" });
  if ((d.auto_action === "lien_mot_de_passe" || action.includes("mot de passe")) && reussie(action)) out.push({ cle: "mot_de_passe" });
  if (/lien slack|slack (relié|renvoy)/.test(action) && reussie(action)) out.push({ cle: "lien_slack" });
  if (action.includes("email ruul") || (action.includes("fait par le bot") && action.includes("@"))) {
    if (reussie(action)) out.push({ cle: "email_ruul" }, { cle: "ruul_bot", detail: "nouvelle adresse" });
  }
  if (action.includes("réinviter dans ruul") || action.includes("reinviter dans ruul")) out.push({ cle: "ruul_bot", detail: "réinvitation" });
  if (action.includes("pseudo tiktok") && reussie(action)) out.push({ cle: "pseudo_tiktok" });
  if (action.includes("parrainage") && reussie(action)) out.push({ cle: "parrainage" });
  if ((d.auto_action === "procedure_arret" || action.includes("arrêt")) && reussie(action)) out.push({ cle: "arret" });
  if (action.includes("étape")) out.push({ cle: "etape" });
  if (d.ticket_at) out.push({ cle: "os_tickets" });
  if (d.niveau === "max") out.push({ cle: "max" });
  if (d.equipe_at) out.push({ cle: "equipe" });
  if (d.statut === "ouvert" && d.niveau !== "max" && (d.bot_reponse || d.resolu_par_bot === false) && !d.equipe_at) out.push({ cle: "renvoyee" });
  return out;
}

/** Une ligne de « Toutes les demandes » (admin) : la demande, son posteur, ce qui a été fait. */
export interface LigneToutes extends TraceDemande {
  poster_id: string | null;
  type: TypeDemande;
  source: string;
  categorie: string | null;
  plateforme: string | null;
  texte: string;
  cree_at: string;
  nom: string;
  email: string | null;
}

export async function lireToutes(limite = 400): Promise<LigneToutes[]> {
  const { data, error } = await supabase.from("support_demandes")
    .select("id, poster_id, type, source, categorie, plateforme, statut, niveau, texte, bot_reponse, auto_action, auto_resultat, action_faite, ticket_at, equipe_at, escalade_at, resolu_par_bot, posteur_at, cree_at, slack_user, email_de")
    .order("cree_at", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as (Omit<LigneToutes, "nom" | "email"> & { slack_user: string | null; email_de: string | null })[];
  const ids = [...new Set(lignes.map((l) => l.poster_id).filter((x): x is string => !!x))];
  const profils = new Map<string, { prenom: string | null; nom: string | null; email: string | null; email_perso: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: p, error: e } = await supabase.from("profiles").select("id, prenom, nom, email, email_perso").in("id", ids.slice(i, i + 300));
    if (e) throw new Error(e.message);
    for (const x of (p ?? []) as { id: string; prenom: string | null; nom: string | null; email: string | null; email_perso: string | null }[]) profils.set(x.id, x);
  }
  return lignes.map((l) => {
    const p = l.poster_id ? profils.get(l.poster_id) : undefined;
    const nom = p ? [p.prenom, p.nom].filter(Boolean).join(" ").trim() : "";
    return { ...l, nom: nom || l.slack_user || l.email_de || "?", email: p?.email_perso ?? p?.email ?? l.email_de ?? null };
  });
}

export interface FiltresToutes {
  q: string;
  source: string;
  statut: string;
  niveau: string;
  qui: "" | CleQui;
}

export function filtrerToutes(lignes: readonly LigneToutes[], f: FiltresToutes): LigneToutes[] {
  const q = f.q.trim().toLowerCase();
  return lignes.filter((l) =>
    (!q || `${l.nom} ${l.email ?? ""}`.toLowerCase().includes(q))
    && (!f.source || (f.source === "slack" ? l.source.startsWith("slack") : l.source === f.source))
    && (!f.statut || l.statut === f.statut)
    && (!f.niveau || (l.niveau ?? "adrien") === f.niveau)
    && (!f.qui || quiAAgi(l).some((x) => x.cle === f.qui)));
}

/** « À répondre » : ce que le bot n'a pas su et ce que le posteur a renvoyé. Max (argent) d'abord, puis le plus ancien. */
export function aRepondre(lignes: readonly LigneToutes[]): LigneToutes[] {
  return lignes
    .filter((l) => l.statut === "ouvert")
    .sort((a, b) => (a.niveau === "max" ? 0 : 1) - (b.niveau === "max" ? 0 : 1) || (a.escalade_at ?? a.cree_at).localeCompare(b.escalade_at ?? b.cree_at));
}

/** « Apprendre au bot » : le texte de la règle proposé à partir de la question et de la réponse (modifiable). */
export function regleProposee(question: string, reponse: string): string {
  const q = question.trim().replace(/\s+/g, " ").slice(0, 200);
  return `When a poster asks something like « ${q} », answer: ${reponse.trim()}`;
}

/** 0704 : la dernière fois que l'OS a fait chaque action seul (null : jamais), pour « Ce que le bot peut faire ». */
export async function lireCapacites(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.rpc("support_capacites");
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, string | null>;
}
