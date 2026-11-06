import type { Probleme } from "../api";
import { messageEnAttente, promesseAttente, reponseAJour } from "../logique";

/**
 * 6/11 : la nouvelle page Problèmes (« Ton point du jour »). Tout ce qui se
 * calcule sans réseau est ici, en français, testé à part.
 */

export type BotNom = "new_cohort_bot" | "control_bot" | "pay_bot";

export const NOM_BOT: Record<BotNom, string> = {
  new_cohort_bot: "Bot Nouvelle cohorte",
  control_bot: "Bot Contrôle",
  pay_bot: "Bot Paie",
};

export interface ActionBot {
  id: string;
  bot: BotNom;
  action: string;
  statut: "fait" | "erreur" | "refuse" | "annule";
  at: string;
  canal: string | null;
  message: string | null;
  raison: string | null;
  probleme_id: string | null;
  poster_id: string | null;
  nom: string | null;
}

export interface CorrectionBot {
  id: string;
  at: string;
  verdict: "mauvaise_action" | "pas_un_probleme" | "juste";
  raison: string | null;
  categorie: string | null;
  diagnostic_du_bot: string | null;
  action_du_bot: string | null;
  choix: string | null;
}

export interface PointDuJour {
  depuis: string;
  journal: ActionBot[];
  passages: Partial<Record<BotNom, string>>;
  bonus: { a_payer: number; montant: number };
  semaine: Partial<Record<BotNom, { actions: number; refusees: number; justes: number; corrections: CorrectionBot[] }>>;
}

/** Les groupes du journal « Ce que les bots ont fait », dans l'ordre d'affichage. */
export type GroupeJournal = "reponse" | "mdp" | "stop" | "slack" | "tiktok" | "relance" | "hm" | "decisions" | "autre";

export const GROUPES: readonly { cle: GroupeJournal; icone: string; un: string; plusieurs: string }[] = [
  { cle: "reponse", icone: "💬", un: "réponse envoyée", plusieurs: "réponses envoyées" },
  { cle: "mdp", icone: "🔑", un: "lien de mot de passe renvoyé", plusieurs: "liens de mot de passe renvoyés" },
  { cle: "stop", icone: "🛑", un: "STOP traité", plusieurs: "STOP traités" },
  { cle: "slack", icone: "🔗", un: "Slack relié", plusieurs: "Slack reliés" },
  { cle: "tiktok", icone: "📱", un: "compte TikTok relu", plusieurs: "comptes TikTok relus" },
  { cle: "relance", icone: "🔔", un: "relance d'étape", plusieurs: "relances d'étape" },
  { cle: "hm", icone: "👥", un: "message à une HM", plusieurs: "messages aux HMs" },
  { cle: "decisions", icone: "⏭", un: "cas envoyé à Weekly decisions", plusieurs: "cas envoyés à Weekly decisions" },
  { cle: "autre", icone: "•", un: "autre action", plusieurs: "autres actions" },
];

export function groupeAction(action: string): GroupeJournal {
  if (action === "reponse") return "reponse";
  if (action === "resend_password_link") return "mdp";
  if (["stop", "kill", "kill_samedi", "kill_immediat"].includes(action)) return "stop";
  if (action === "relink_slack") return "slack";
  if (action === "reread_tiktok") return "tiktok";
  if (action === "relance") return "relance";
  if (action === "message_hm") return "hm";
  if (["samedi", "decision", "double", "recreate", "saturday"].includes(action)) return "decisions";
  return "autre";
}

/** Les raisons de refus en français clair (les garde-fous des bots). */
export function raisonClaire(raison: string | null): string {
  const r = (raison ?? "").trim();
  if (!r) return "refusé par les règles";
  if (/argent|money|pay/i.test(r) && /droit|not allowed|jamais/i.test(r)) return "un bot n'a pas le droit d'envoyer de l'argent";
  if (/22 ?h|8 ?h|heure/i.test(r)) return "pas de message la nuit (22 h – 8 h chez la personne)";
  if (/24 ?h|déjà écrit|1 message/i.test(r)) return "déjà un message à cette personne dans les 24 h";
  if (/confiance|0\.8|80/i.test(r)) return "le bot n'était pas assez sûr (moins de 80 %)";
  if (/réponse|reponse/i.test(r) && /obligatoire|attend/i.test(r)) return "la personne attend une réponse : il fallait l'écrire en entier";
  return r.length > 160 ? `${r.slice(0, 157)}…` : r;
}

export interface JournalGroupe {
  faits: { groupe: (typeof GROUPES)[number]; actions: ActionBot[] }[];
  refuses: ActionBot[];
  erreurs: ActionBot[];
  annules: ActionBot[];
  /** Le nombre de cas réglés seuls (actions faites). */
  regles: number;
}

export function grouperJournal(journal: readonly ActionBot[]): JournalGroupe {
  const faits = GROUPES.map((g) => ({ groupe: g, actions: journal.filter((a) => a.statut === "fait" && groupeAction(a.action) === g.cle) }))
    .filter((g) => g.actions.length > 0);
  return {
    faits,
    refuses: journal.filter((a) => a.statut === "refuse"),
    erreurs: journal.filter((a) => a.statut === "erreur"),
    annules: journal.filter((a) => a.statut === "annule"),
    regles: journal.filter((a) => a.statut === "fait").length,
  };
}

/** Des noms : « Lia, Stamen, Ana… » (au plus 4, puis « +N »). */
export function noms(actions: readonly ActionBot[]): string {
  const uniques = [...new Set(actions.map((a) => (a.nom ?? "").split(" ")[0]).filter(Boolean))];
  return uniques.length > 4 ? `${uniques.slice(0, 4).join(", ")} +${uniques.length - 4}` : uniques.join(", ");
}

const CATS_RISQUE = ["menace", "hors_plateforme", "suspect", "upwork_mauvais_compte", "contrat_hm"];

/**
 * Pourquoi la carte est en Urgent, en clair. null : aucune raison valable,
 * la carte ne doit pas être en Urgent (elle va avec ce que font les bots).
 */
export function raisonUrgent(
  p: Pick<Probleme, "sans_reponse" | "messages" | "proposition_reponse" | "propose_at" | "categorie" | "confiance" | "sujet" | "question" | "options"> & {
    niveau_force?: boolean | null;
  },
  maintenant: number = Date.now(),
): string | null {
  const promesse = promesseAttente(p, maintenant);
  if (promesse) return `le bot a promis une réponse il y a ${promesse.depuisH} h`;
  if (messageEnAttente(p) && !reponseAJour(p) && (p.sans_reponse?.depuis_heures ?? 0) >= 24) {
    return `sans réponse depuis ${Math.round(p.sans_reponse!.depuis_heures)} h`;
  }
  if (CATS_RISQUE.includes(p.categorie)) return "risque à vérifier (menace, hors plateforme, compte suspect)";
  if (p.sujet === "hm") return "concerne une HM";
  if (["paie", "kill_contrat"].includes(p.categorie)) return "argent";
  if (p.categorie === "offre_hm_incorrecte") return "offre HM à corriger";
  if (p.question?.trim() && p.options?.length) return "une question pour toi";
  if ((p.confiance ?? 1) < 0.8) return "le bot n'est pas sûr";
  if (p.niveau_force) return "mis en Urgent à la main";
  return null;
}

export interface Echeance {
  quand: string;
  quoi: string;
  lien: string;
  date: Date;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** La prochaine date (heure de Paris approximée par l'heure locale du navigateur) pour un jour de semaine et une heure. */
function prochain(maintenant: Date, jour: number, heure: number, minute = 0): Date {
  const d = new Date(maintenant);
  d.setHours(heure, minute, 0, 0);
  let ecart = (jour - d.getDay() + 7) % 7;
  if (ecart === 0 && d.getTime() <= maintenant.getTime()) ecart = 7;
  d.setDate(d.getDate() + ecart);
  return d;
}

function libelleQuand(d: Date, maintenant: Date): string {
  const jours = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(maintenant).setHours(0, 0, 0, 0)) / 86_400_000);
  const h = d.getHours() === 0 && d.getMinutes() === 0 ? "minuit" : `${d.getHours()} h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
  const jour = jours === 0 ? "aujourd'hui" : jours === 1 ? "demain" : JOURS[d.getDay()];
  return `${jour[0]!.toUpperCase()}${jour.slice(1)} ${h}`;
}

/** Les échéances de la semaine, la plus proche d'abord. */
export function echeances(maintenant: Date = new Date()): Echeance[] {
  const liste = [
    { date: prochain(maintenant, 4, 19), quoi: "nudges et recréations à décider", lien: "/admin/auto/decisions?onglet=jeudi" },
    { date: prochain(maintenant, 6, 10), quoi: "kills, doubler ou garder", lien: "/admin/auto/decisions?onglet=samedi" },
    { date: prochain(maintenant, 1, 0), quoi: "fin du warm-up de la cohorte (dimanche minuit)", lien: "/admin/auto/decisions?onglet=dimanche" },
    { date: prochain(maintenant, 1, 10), quoi: "paie et financement en bulk", lien: "/admin/auto/payroll" },
  ];
  return liste
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({ ...e, quand: libelleQuand(e.date, maintenant) }));
}

export type Niveau = "vert" | "orange" | "rouge";

export interface LigneCouverture {
  cle: string;
  libelle: string;
  n: number;
  niveau: Niveau;
  lien: string | null;
  detail?: string;
}

/** « Est-ce que tout est couvert ? » : ce que la page sait calculer à partir des cartes et du journal. */
export function couverture(
  cartes: readonly Probleme[],
  point: PointDuJour | undefined,
  maintenant: number = Date.now(),
): LigneCouverture[] {
  const sansReponse = cartes.filter((p) => messageEnAttente(p) && !reponseAJour(p) && (p.sans_reponse?.depuis_heures ?? 0) > 24);
  const sansProposition = cartes.filter((p) =>
    !p.proposition_reponse?.trim() && !p.proposition_action && !(p.question?.trim() && p.options?.length)
    && maintenant - Date.parse(p.created_at) > 6 * 3_600_000);
  const refusees = (point?.journal ?? []).filter((a) => a.statut === "refuse" && maintenant - Date.parse(a.at) < 24 * 3_600_000);
  const stops = cartes.filter((p) => p.categorie === "stop" || (p.sujets ?? []).some((s) => s.categorie === "stop"));
  const offres = cartes.filter((p) => p.categorie === "offre_hm_incorrecte");
  const bots = (["new_cohort_bot", "control_bot", "pay_bot"] as const).map((b) => {
    const dernier = point?.passages?.[b];
    const heures = dernier ? (maintenant - Date.parse(dernier)) / 3_600_000 : Infinity;
    return { b, heures };
  });
  const botsEnRetard = bots.filter((x) => x.heures > 8);
  const niveau = (n: number, rouge = 1): Niveau => (n === 0 ? "vert" : n >= rouge ? "rouge" : "orange");
  return [
    { cle: "sans_reponse", libelle: "Messages sans réponse depuis plus de 24 h", n: sansReponse.length, niveau: niveau(sansReponse.length), lien: "/admin/auto/problemes-v2#urgent" },
    { cle: "sans_proposition", libelle: "Cartes sans proposition d'un bot depuis plus de 6 h", n: sansProposition.length, niveau: sansProposition.length ? "orange" : "vert", lien: "/admin/auto/problemes-v2#urgent" },
    { cle: "refusees", libelle: "Actions des bots refusées (24 h)", n: refusees.length, niveau: refusees.length ? "orange" : "vert", lien: "/admin/auto/problemes-v2#journal" },
    {
      cle: "bots", libelle: "Bots passés depuis moins de 8 h", n: botsEnRetard.length, niveau: botsEnRetard.length ? "rouge" : "vert", lien: null,
      detail: bots.map((x) => `${NOM_BOT[x.b]} : ${Number.isFinite(x.heures) ? `il y a ${Math.round(x.heures)} h` : "jamais"}`).join(" · "),
    },
    { cle: "stop", libelle: "STOP pas encore traités", n: stops.length, niveau: stops.length ? "orange" : "vert", lien: "/admin/auto/decisions?onglet=samedi" },
    { cle: "offres", libelle: "Offres HM incorrectes à corriger", n: offres.length, niveau: offres.length ? "orange" : "vert", lien: "/admin/auto/decisions" },
    { cle: "bonus", libelle: "Bonus à valider", n: point?.bonus.a_payer ?? 0, niveau: point?.bonus.a_payer ? "orange" : "vert", lien: "/admin/auto/payroll" },
  ];
}
