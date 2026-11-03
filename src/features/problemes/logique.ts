import type { Groupe, Niveau, Probleme, Proprietaire, Situation } from "./api";

export const NIVEAUX: readonly Niveau[] = ["urgent", "aujourdhui", "samedi"];
export const PROPRIETAIRES: readonly Proprietaire[] = ["new_cohort_bot", "control_bot", "pay_bot"];

/** C10 : l'argent n'est jamais exécuté par un bouton, ni validé en lot. */
export const CATEGORIES_ARGENT: readonly string[] = ["paie"];

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
  | { type: "page"; vers: string }
  | { type: "releve"; compte_id: string }
  | { type: "motDePasse"; poster_id: string }
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
  if (CATEGORIES_ARGENT.includes(p.categorie) || p.proposition_action === "open_payroll") return { type: "page", vers: "/admin/auto/payroll" };
  if (p.proposition_action === "open_who_to_fund") return { type: "page", vers: "/admin/auto/payroll?onglet=financer" };
  // v4 : le lien de mot de passe part depuis la page (mode « on » seulement) ; le reste des formulaires s'ouvre.
  if (p.proposition_action === "resend_password_link" && p.poster_id) return { type: "motDePasse", poster_id: p.poster_id };
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
      g.push({ type: "page", cle: "geste.kill", vers: fiche });
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
export function aDiagnosticOuAction(p: Pick<Probleme, "categorie" | "resume" | "situation" | "diagnostic" | "proposition_action" | "proposition_reponse" | "sources" | "poster_id" | "compte_id" | "contrat_id">): boolean {
  if (p.diagnostic?.trim() || p.proposition_action || p.proposition_reponse?.trim()) return true;
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
