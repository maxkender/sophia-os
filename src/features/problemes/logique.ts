import type { Groupe, Niveau, OptionDecision, Probleme, Proprietaire, Situation } from "./api";

export const NIVEAUX: readonly Niveau[] = ["urgent", "aujourdhui", "samedi"];
export const PROPRIETAIRES: readonly Proprietaire[] = ["new_cohort_bot", "control_bot", "pay_bot"];

/** C10 : l'argent n'est jamais exécuté par un bouton, ni validé en lot. */
export const CATEGORIES_ARGENT: readonly string[] = ["paie", "kill_contrat"];

/** C12 : jamais d'envoi auto pour ces catégories. */
export const JAMAIS_AUTO: readonly string[] = ["stop", "paie", "menace", "hors_plateforme", "suspect", "contrat_hm", "offre_hm_incorrecte"];

/** La dernière ligne de toute réponse sur Upwork (comme les relances). */
export const LIGNE_STOP_UPWORK = "If you don't wish to continue, just reply STOP here.";

export function avecLigneStop(texte: string): string {
  const t = texte.trimEnd();
  return t.endsWith(LIGNE_STOP_UPWORK) ? t : `${t}\n\n${LIGNE_STOP_UPWORK}`;
}

export interface FiltresProblemes {
  proprietaire: string;
  categorie: string;
  hm: string;
}

export const FILTRES_VIDES: FiltresProblemes = { proprietaire: "", categorie: "", hm: "" };

export function filtrer(liste: readonly Probleme[], f: FiltresProblemes): Probleme[] {
  return liste.filter(
    (p) =>
      (!f.proprietaire || p.proprietaire === f.proprietaire) &&
      (!f.categorie || p.categorie === f.categorie) &&
      (!f.hm || (p.hm ?? "—") === f.hm),
  );
}

export function compterParNiveau(liste: readonly Probleme[]): Record<Niveau, number> {
  const n: Record<Niveau, number> = { urgent: 0, aujourdhui: 0, samedi: 0 };
  for (const p of liste) n[p.niveau]++;
  return n;
}

/** Les options des filtres (triées, sans doublon). */
export function options(liste: readonly Probleme[]): { categories: string[]; hms: string[] } {
  return {
    categories: [...new Set(liste.map((p) => p.categorie))].sort(),
    hms: [...new Set(liste.map((p) => p.hm ?? "—"))].sort(),
  };
}

export type GesteValider =
  | { type: "kill" }
  | { type: "page"; vers: string }
  | { type: "releve"; compte_id: string }
  | { type: "motDePasse"; poster_id: string }
  | { type: "rituel"; choix: "double" | "recreate" }
  | { type: "reponse" }
  | { type: "fermer" };

/**
 * Ce que fait « Valider » (C10). L'argent ouvre Payroll ou Who to fund ;
 * recréer, kill, lien de mot de passe et Slack ouvrent la fiche du posteur
 * (formulaires existants) ; relire TikTok relit le compte ; le reste ferme le
 * problème, avec la réponse quand il y en a une.
 */
export function gesteValider(p: Pick<Probleme, "categorie" | "proposition_action" | "proposition_reponse" | "poster_id" | "compte_id">): GesteValider {
  const fiche = p.poster_id ? `/admin/posters?poster=${p.poster_id}` : "/admin/posters";
  // 3/11 : le Kill ouvre le formulaire (contrat Upwork lié, case « fermer et récupérer »).
  if (p.categorie === "stop" || p.proposition_action === "kill") return p.poster_id ? { type: "kill" } : { type: "page", vers: fiche };
  if (CATEGORIES_ARGENT.includes(p.categorie) || p.proposition_action === "open_payroll") return { type: "page", vers: "/admin/auto/payroll" };
  if (p.proposition_action === "open_who_to_fund") return { type: "page", vers: "/admin/auto/payroll?onglet=financer" };
  // v4 : le lien de mot de passe part depuis la page (mode « on » seulement) ; le reste des formulaires s'ouvre.
  if (p.proposition_action === "resend_password_link" && p.poster_id) return { type: "motDePasse", poster_id: p.poster_id };
  // 0531 : Recréer (jeudi) et Doubler (samedi) : la décision va au rituel, rien n'est exécuté ici.
  if ((p.proposition_action === "recreate" || p.proposition_action === "double") && p.poster_id) return { type: "rituel", choix: p.proposition_action };
  if (["recreate", "kill", "resend_password_link", "relink_slack", "postpone"].includes(p.proposition_action ?? "")) return { type: "page", vers: fiche };
  if (p.proposition_action === "reread_tiktok" && p.compte_id) return { type: "releve", compte_id: p.compte_id };
  if (p.proposition_reponse?.trim()) return { type: "reponse" };
  return { type: "fermer" };
}

/** « Valider toute la catégorie » : jamais pour l'argent. */
export function peutValiderCategorie(categorie: string): boolean {
  return !CATEGORIES_ARGENT.includes(categorie);
}

/** Le début du jour à Paris (ISO), pour « une réponse par conversation et par jour ». */
export function debutJourParis(maintenant = new Date()): string {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  const decalage = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(maintenant)
    .find((x) => x.type === "timeZoneName")?.value.replace("GMT", "") || "+0";
  const [h, m] = decalage.split(":");
  const signe = h!.startsWith("-") ? "-" : "+";
  const hh = String(Math.abs(Number(h))).padStart(2, "0");
  return new Date(`${jour}T00:00:00${signe}${hh}:${(m ?? "00").padStart(2, "0")}`).toISOString();
}

// ---------------------------------------------------------------------------
// 3/11 : une carte = un diagnostic. La phrase du problème et le geste exact,
// calculés depuis la situation (0520) ; le tri ; le regroupement par catégorie.
// ---------------------------------------------------------------------------

/** Une phrase : une clé de traduction et ses valeurs. */
export interface Phrase {
  cle: string;
  vars?: Record<string, string | number>;
}

export type Geste =
  | { type: "kill"; cle: string }
  | { type: "lien"; cle: string; url: string }
  | { type: "page"; cle: string; vers: string }
  | { type: "releve"; cle: string; compte_id: string };

const fmtJour = (iso: string | null | undefined, locale: string) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "—";

export const urlContratUpwork = (contrat: string) => `https://www.upwork.com/nx/wm/workroom/${contrat}/overview`;

/** Le problème en une phrase précise ; null : rien de précis à dire (la carte montre son résumé). */
export function phraseProbleme(p: Pick<Probleme, "categorie" | "resume" | "situation">, locale = "fr-FR"): Phrase | null {
  const s = p.situation;
  if (!s) return null;
  const pp = s.paie_passee;
  switch (p.categorie) {
    case "paie": {
      if (!s.paye_passee) {
        return { cle: "diag.paieNonPayee", vars: { semaine: fmtJour(pp.semaine, locale), montant: pp.montant ?? "?" } };
      }
      const paye = { semaine: fmtJour(pp.semaine, locale), montant: pp.montant ?? 0, date: fmtJour(pp.paye_at, locale), lundi: fmtJour(s.lundi, locale), attendu: s.attendu_semaine ?? "?" };
      if (s.finances.length === 0) return { cle: "diag.paieRienFinance", vars: paye };
      if (!s.finance_ok) {
        const f = s.finances[0]!;
        return { cle: "diag.paieMauvaisMontant", vars: { ...paye, nom: f.nom ?? "?", finance: f.montant ?? "?", comptes: s.comptes } };
      }
      return { cle: "diag.paieOk", vars: paye };
    }
    case "stop":
      return { cle: "diag.stop", vars: { date: fmtJour(s.message?.at, locale) } };
    case "login":
      return s.etapes.login ? null : { cle: "diag.jamaisConnecte" };
    case "slack":
      return s.etapes.slack ? null : { cle: "diag.slackPasRelie" };
    case "tiktok_setup":
      if (!s.etapes.tiktok) return { cle: "diag.tiktokIntrouvable" };
      if (!s.etapes.warmup) return { cle: "diag.warmupPasFini" };
      return null;
    default:
      if (s.a_ecrit && s.message) return { cle: "diag.attendReponse", vars: { date: fmtJour(s.message.at, locale) } };
      return null;
  }
}

/** Les gestes de la carte, du plus utile au moins utile. Jamais d'argent exécuté ici : on ouvre la bonne page. */
export function gestes(p: Pick<Probleme, "categorie" | "poster_id" | "compte_id" | "contrat_id" | "situation">): Geste[] {
  const s = p.situation;
  const fiche = p.poster_id ? `/admin/posters?poster=${p.poster_id}` : "/admin/posters";
  const contrat = s?.contrat_id ?? p.contrat_id;
  const g: Geste[] = [];
  switch (p.categorie) {
    case "paie":
      g.push(s && !s.paye_passee
        ? { type: "page", cle: "geste.payroll", vers: "/admin/auto/payroll" }
        : { type: "page", cle: "geste.whoToFund", vers: "/admin/auto/payroll?onglet=financer" });
      break;
    case "stop":
      g.push(p.poster_id ? { type: "kill", cle: "geste.kill" } : { type: "page", cle: "geste.kill", vers: fiche });
      break;
    case "kill_contrat":
      // Fermer + récupérer à la main : le contrat d'abord (lien plus bas), puis Payroll.
      g.push({ type: "page", cle: "geste.payroll", vers: "/admin/auto/payroll" });
      break;
    case "login":
      g.push({ type: "page", cle: "geste.motDePasse", vers: fiche });
      break;
    case "slack":
      g.push({ type: "page", cle: "geste.relierSlack", vers: fiche });
      break;
    case "tiktok_setup":
      if (p.compte_id) g.push({ type: "releve", cle: "geste.relireTiktok", compte_id: p.compte_id });
      g.push({ type: "page", cle: "geste.fiche", vers: fiche });
      break;
    case "offre_hm_incorrecte":
      break;
    // L'accueil en erreur ou à relier, et « retirer de Slack » : l'ancienne page Needs you (pendant le test).
    case "accueil":
      g.push({ type: "page", cle: "geste.accueil", vers: "/admin/auto/needs-you-ancien" });
      break;
    case "retirer_slack":
      g.push({ type: "page", cle: "geste.retirerSlack", vers: "/admin/auto/needs-you-ancien" });
      break;
    default:
      if (s?.bloque) g.push({ type: "page", cle: "geste.fiche", vers: fiche });
  }
  if (s?.message?.lien) g.push({ type: "lien", cle: "geste.conversation", url: s.message.lien });
  if (contrat) g.push({ type: "lien", cle: "geste.contrat", url: urlContratUpwork(contrat) });
  return g;
}

/** Le rang de tri (5) : d'abord qui a écrit et attend, puis qui est bloqué(e) et ne poste pas, puis le reste. */
export function rang(p: Pick<Probleme, "situation">): number {
  if (p.situation?.a_ecrit) return 0;
  if (p.situation?.bloque) return 1;
  return 2;
}

/** La date qui compte pour « plus vieux en premier » : son message, sinon l'ouverture de la carte. */
export function depuis(p: Pick<Probleme, "situation" | "created_at">): string {
  return p.situation?.a_ecrit && p.situation.message ? p.situation.message.at : p.created_at;
}

export function trier<T extends Pick<Probleme, "situation" | "created_at">>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => rang(a) - rang(b) || depuis(a).localeCompare(depuis(b)));
}

/** Les cartes d'un onglet, par catégorie (la catégorie la plus pressée d'abord), triées dans chaque groupe. */
export function grouper<T extends Pick<Probleme, "categorie" | "situation" | "created_at">>(liste: readonly T[]): { categorie: string; cartes: T[] }[] {
  const m = new Map<string, T[]>();
  for (const p of liste) m.set(p.categorie, [...(m.get(p.categorie) ?? []), p]);
  return [...m.entries()]
    .map(([categorie, cartes]) => ({ categorie, cartes: trier(cartes) }))
    .sort((a, b) => rang(a.cartes[0]!) - rang(b.cartes[0]!) || b.cartes.length - a.cartes.length || a.categorie.localeCompare(b.categorie));
}

// ---------------------------------------------------------------------------
// v4 (3/11) : trois groupes, filtre « Paie » transversal, diagnostic, étapes manquantes.
// ---------------------------------------------------------------------------

export const GROUPES: readonly Groupe[] = ["onboarding", "nouveaux_actifs", "actifs"];

/** L'onglet du haut : un groupe, ou « paie » (toutes les cartes de paie, tous groupes). */
export type OngletGroupe = Groupe | "paie";

/** Le groupe d'une carte : celui de la situation lue à l'instant, sinon celui du dernier passage. */
export function groupeDe(p: Pick<Probleme, "groupe" | "situation" | "categorie">): Groupe {
  return p.situation?.groupe ?? p.groupe ?? (p.categorie === "accueil" || p.categorie === "offre_hm_incorrecte" ? "onboarding" : "actifs");
}

export function dansOnglet(p: Pick<Probleme, "groupe" | "situation" | "categorie">, o: OngletGroupe): boolean {
  return o === "paie" ? CATEGORIES_ARGENT.includes(p.categorie) : groupeDe(p) === o;
}

export function compterParGroupe(liste: readonly Pick<Probleme, "groupe" | "situation" | "categorie">[]): Record<OngletGroupe, number> {
  const n: Record<OngletGroupe, number> = { onboarding: 0, nouveaux_actifs: 0, actifs: 0, paie: 0 };
  for (const p of liste) {
    n[groupeDe(p)]++;
    if (CATEGORIES_ARGENT.includes(p.categorie)) n.paie++;
  }
  return n;
}

/** Les étapes pas faites (dans l'ordre), pour la ligne SITUATION. */
export function etapesManquantes(s: Pick<Situation, "etapes">): ("login" | "slack" | "tiktok" | "warmup")[] {
  return (["login", "slack", "tiktok", "warmup"] as const).filter((e) => !s.etapes[e]);
}

/** Les sources qui viennent de l'OS (pas d'un simple message) : un constat, donc un diagnostic. */
const SOURCES_MESSAGE = ["reponse", "slack", "bot"];

/**
 * B2 : une carte n'est montrée que si elle a un diagnostic (celui du bot, la
 * phrase de l'OS, ou un constat de l'OS) ou une action (proposée, ou un geste).
 */
export function aDiagnosticOuAction(p: Pick<Probleme, "categorie" | "resume" | "situation" | "diagnostic" | "diagnostic_par" | "proposition_action" | "proposition_reponse" | "sources" | "poster_id" | "compte_id" | "contrat_id"> & Partial<Pick<Probleme, "question">>): boolean {
  // 0528 : une question posée à Max est toujours une carte.
  if (p.question?.trim()) return true;
  // Le diagnostic d'un bot compte ; celui de l'OS est recalculé ci-dessous (phrase ou constat).
  if ((p.diagnostic?.trim() && p.diagnostic_par !== "os") || p.proposition_action || p.proposition_reponse?.trim()) return true;
  if (phraseProbleme(p)) return true;
  if (p.sources.some((x) => !SOURCES_MESSAGE.includes(x.type))) return true;
  return gestes(p).some((g) => g.type !== "lien");
}

// ---------------------------------------------------------------------------
// 3/11 : le feedback aux bots (0523).
// ---------------------------------------------------------------------------

export const VERDICTS = ["juste", "pas_un_probleme", "mauvais_diagnostic", "mauvaise_action"] as const;
export const EMOJI_VERDICT: Record<(typeof VERDICTS)[number], string> = {
  juste: "👍", pas_un_probleme: "❌", mauvais_diagnostic: "🔧", mauvaise_action: "↪️",
};

export const estBot = (qui: string | null | undefined): qui is Proprietaire => PROPRIETAIRES.includes(qui as Proprietaire);

/** Une carte proposée par un bot (ouverte), ou fermée par un bot avec « close ». */
export function peutDonnerFeedback(p: Pick<Probleme, "propose_par" | "statut" | "proposition_action">): boolean {
  if (!estBot(p.propose_par)) return false;
  return p.statut === "ouvert" || p.proposition_action === "close";
}

/** « Pourquoi » : obligatoire sauf pour 👍. */
export const raisonObligatoire = (v: (typeof VERDICTS)[number]) => v !== "juste";

/** % de 👍 sur 7 jours ; null sans feedback. */
export function pourcentJuste(s: { total: number; justes: number }): number | null {
  return s.total > 0 ? Math.round((100 * s.justes) / s.total) : null;
}

/** « En faire une règle » : la règle pré-remplie depuis la raison donnée, l'exemple depuis ce que le bot avait dit. */
export function regleDepuisFeedback(f: { id: string; bot: Proprietaire; raison: string | null; diagnostic_du_bot: string | null; action_du_bot: string | null; categorie: string | null }) {
  const vu = f.diagnostic_du_bot ?? f.action_du_bot;
  return {
    id: null,
    bot: f.bot,
    regle: (f.raison ?? "").trim(),
    exemple: vu ? `${f.categorie ? `${f.categorie} — ` : ""}${vu}` : null,
    sources: [f.id],
    active: true,
  };
}

// ---------------------------------------------------------------------------
// 3/11 (0528) : la page Problèmes est le SEUL endroit où Max décide. Une carte
// « décision » : une question, 2 à 4 options, la 1re recommandée.
// ---------------------------------------------------------------------------

export const estDecision = (p: Pick<Probleme, "question" | "options">): boolean => Boolean(p.question?.trim() && p.options?.length);

/** Ce que fait le clic sur une option. Jamais d'argent : une option « paie » ouvre le contrat Upwork. */
export interface PlanDecision {
  /** Lien Upwork à ouvrir (paie). */
  ouvrir: string | null;
  /** Page de l'OS à ouvrir après le choix (Kill, recréer, reporter, Payroll…). */
  page: string | null;
  /** Mode « on » : le lien de mot de passe part à ce posteur. */
  motDePasse: string | null;
  /** Mode « on » : ce texte part sur Upwork au posteur (avec la ligne STOP). */
  envoyer: string | null;
  /** La réponse à l'HM : montrée pour être copiée (jamais envoyée par la page). */
  aCopier: string | null;
  /** « Vérifier samedi » : la carte revient samedi. */
  samedi: boolean;
}

export function planDecision(
  o: OptionDecision,
  p: Pick<Probleme, "poster_id" | "contrat_id" | "destinataire"> & Partial<Pick<Probleme, "categorie">>,
  mode: "test" | "on",
  texteLibre?: string,
): PlanDecision {
  const plan: PlanDecision = { ouvrir: null, page: null, motDePasse: null, envoyer: null, aCopier: null, samedi: false };
  if (o.paie) {
    plan.ouvrir = o.lien ?? (p.contrat_id ? urlContratUpwork(p.contrat_id) : null);
    return plan;
  }
  const fiche = p.poster_id ? `/admin/posters?poster=${p.poster_id}` : "/admin/posters";
  switch (o.action) {
    case "resend_password_link":
      if (mode === "on" && p.poster_id) plan.motDePasse = p.poster_id;
      break;
    case "kill":
      // 0533 : « Kill samedi » d'une décision : préparé par la base (probleme_decider), rien à ouvrir.
      break;
    case "recreate": case "postpone": case "relink_slack":
      plan.page = fiche;
      break;
    case "open_payroll": case "pay_check":
      plan.page = "/admin/auto/payroll";
      break;
    case "open_who_to_fund":
      plan.page = "/admin/auto/payroll?onglet=financer";
      break;
    case "saturday":
      plan.samedi = true;
      break;
  }
  const texte = (o.reponse ?? texteLibre ?? "").trim();
  if (texte) {
    if (p.destinataire === "hm") plan.aCopier = texte;
    else if (mode === "on" && p.poster_id) plan.envoyer = estArret(p) ? texte : avecLigneStop(texte);
  }
  return plan;
}

/** Une option sans réponse ni action (« Autre ») : Max écrit la réponse avant de confirmer. */
export const optionLibre = (o: OptionDecision): boolean => !o.paie && !o.action && !o.reponse?.trim();

/** « 07/11 » : le samedi de la semaine du lundi donné. */
export function samediDe(lundi: string): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 5);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 0531 : « 05/11 » : le jour du rituel (jeudi : lundi + 3 ; samedi : lundi + 5). */
export function jourRituel(lundi: string, choix: "double" | "recreate"): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (choix === "recreate" ? 3 : 5));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 0533 : une carte d'arrêt (stop sûr ou doute) : la réponse part sans la ligne « reply STOP ». */
export const estArret = (p: Partial<Pick<Probleme, "categorie">>): boolean => p.categorie === "stop" || p.categorie === "stop_doute";

// ---------------------------------------------------------------------------
// 4/11 : simplification. Une carte par posteur ; « ✅ Faire ça » fait tout :
// l'action ET l'envoi du message. Jamais d'argent : il ouvre le contrat.
// ---------------------------------------------------------------------------

export type PlanFaire =
  | { type: "decision"; index: number }
  | { type: "kill" }
  | { type: "rituel"; choix: "double" | "recreate" }
  | { type: "argent"; url: string | null; vers: string }
  | { type: "motDePasse" }
  | { type: "releve"; compte_id: string }
  | { type: "fiche"; vers: string }
  | { type: "reponse" }
  | { type: "fermer" };

/** Ce que fait « ✅ Faire ça » pour la proposition d'une carte. */
export function planFaire(
  p: Pick<Probleme, "categorie" | "proposition_action" | "proposition_reponse" | "poster_id" | "compte_id" | "contrat_id" | "question" | "options">,
): PlanFaire {
  if (estDecision(p)) return { type: "decision", index: 0 };
  const g = gesteValider(p);
  switch (g.type) {
    case "kill":
      return { type: "kill" };
    case "rituel":
      return { type: "rituel", choix: g.choix };
    case "motDePasse":
      return { type: "motDePasse" };
    case "releve":
      return { type: "releve", compte_id: g.compte_id };
    case "reponse":
      return { type: "reponse" };
    case "fermer":
      return { type: "fermer" };
    case "page":
      if (CATEGORIES_ARGENT.includes(p.categorie) || g.vers.startsWith("/admin/auto/payroll")) {
        return { type: "argent", url: p.contrat_id ? urlContratUpwork(p.contrat_id) : null, vers: g.vers };
      }
      return { type: "fiche", vers: g.vers };
  }
}

/** Le texte de la proposition (👉) : l'option recommandée d'une décision, sinon la réponse proposée. */
export function texteProposition(p: Pick<Probleme, "proposition_reponse" | "question" | "options">): string | null {
  if (estDecision(p)) return p.options?.[0]?.reponse ?? null;
  return p.proposition_reponse?.trim() ? p.proposition_reponse : null;
}

/** Le feedback automatique : ✅ = bon ; ✏️ puis ✅ = correction ; Ignorer = pas un problème. */
export function feedbackAuto(geste: "fait" | "corrige" | "ignore", texte?: string | null): { verdict: "juste" | "mauvaise_action" | "pas_un_probleme"; raison: string | null } {
  if (geste === "fait") return { verdict: "juste", raison: null };
  if (geste === "corrige") return { verdict: "mauvaise_action", raison: `Max a corrigé le message : « ${(texte ?? "").slice(0, 280)} »` };
  return { verdict: "pas_un_probleme", raison: "Ignoré par Max (pas un problème)" };
}
