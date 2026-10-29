/**
 * Prompt 22, partie 6.3 : TOUS les textes envoyés aux posteurs, au même
 * endroit, rangés dans l'ordre de la semaine. Chaque texte vit dans `reglages`
 * (une chaîne, ou un champ d'un objet : `chemin`). Les {variables} sont celles
 * que remplit le code qui envoie le message ; une variable inconnue reste
 * telle quelle dans le message (comme dans les fonctions).
 */

export const GROUPES_TEXTES = [
  "accueil",
  "relance",
  "lundi",
  "lundi_soir",
  "jeudi",
  "handle",
  "kill",
  "arret",
  "popups",
  "regularite",
  "lien1000",
  "reponses",
  "paie",
  "slack_lien",
  "lien_post",
] as const;
export type GroupeTexte = (typeof GROUPES_TEXTES)[number];

export interface TexteCatalogue {
  /** L'identifiant du texte dans l'interface (libellé i18n `autoOnglets.textes.items.<id>`). */
  id: string;
  groupe: GroupeTexte;
  /** La clé du réglage. */
  cle: string;
  /** Le champ dans un réglage objet (« message » de lien_1000). */
  chemin?: string;
  variables: readonly string[];
  /** Vide permis : pas de message (réponse « absent » : vide = aucune réponse automatique). */
  videPermis?: boolean;
}

/** Les variables du message de bienvenue (fonction upwork, messageAccueil). */
const VARIABLES_ACCUEIL = ["prenom", "url", "email", "mot_de_passe", "handle", "slack", "guide", "date"] as const;
/** Les variables d'un morceau de la relance du jour (_shared/relance_jour.ts, texteRelance). */
const VARIABLES_RELANCE = ["prenom", "handle", "url", "lien_etapes", "date", "email", "mot_de_passe", "follows", "slack"] as const;

export const TEXTES: readonly TexteCatalogue[] = [
  { id: "accueil", groupe: "accueil", cle: "accueil_message_texte", variables: VARIABLES_ACCUEIL },
  // Prompt 25 : la relance du jour (une par recrue et par jour, avec seulement ce qui lui manque).
  { id: "relance_cadre", groupe: "relance", cle: "relance_texte_cadre", variables: ["prenom", "date", "ce_qui_manque"] },
  // Prompt 25 v4 : l'étape 0, rejoindre Slack (avec la prochaine étape, dans le même message).
  { id: "relance_slack", groupe: "relance", cle: "relance_texte_slack", variables: VARIABLES_RELANCE },
  { id: "relance_connexion", groupe: "relance", cle: "relance_texte_connexion", variables: VARIABLES_RELANCE },
  { id: "relance_tiktok", groupe: "relance", cle: "relance_texte_compte_tiktok", variables: VARIABLES_RELANCE },
  { id: "relance_warmup", groupe: "relance", cle: "relance_texte_start_warmup", variables: VARIABLES_RELANCE },
  { id: "relance_follows", groupe: "relance", cle: "relance_texte_follows", variables: VARIABLES_RELANCE },
  { id: "lundi_tous", groupe: "lundi", cle: "lundi_texte_tous", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_cohorte", groupe: "lundi", cle: "lundi_texte_cohorte", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_warmup", groupe: "lundi", cle: "lundi_texte_warmup", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_soir", groupe: "lundi_soir", cle: "lundi_soir_texte", variables: ["prenom"] },
  // Prompt 25 : le nudge du jeudi, envoyé seulement depuis Weekly decisions → Thursday.
  { id: "jeudi", groupe: "jeudi", cle: "jeudi_nudge_texte", variables: ["prenom", "faits", "attendus"] },
  // 0444 : le @ TikTok introuvable (jamais « create your account »), l'excuse, les réponses du dashboard.
  { id: "handle_introuvable", groupe: "handle", cle: "handle_introuvable_texte", variables: ["prenom", "handle"] },
  { id: "handle_excuse", groupe: "handle", cle: "handle_excuse_texte", variables: ["prenom", "handle"] },
  { id: "handle_trouve", groupe: "handle", cle: "handle_trouve_texte", variables: ["handle"] },
  { id: "handle_pas_trouve", groupe: "handle", cle: "handle_pas_trouve_texte", variables: ["handle"] },
  // Prompt 25 MAJ, 7a et 7d : le DM de liaison Slack, le lien de post introuvable.
  { id: "slack_lien_dm", groupe: "slack_lien", cle: "slack_lien_dm_texte", variables: ["lien"] },
  { id: "lien_introuvable", groupe: "lien_post", cle: "lien_introuvable_texte", variables: ["prenom", "lien"] },
  { id: "kill", groupe: "kill", cle: "kill_message_texte", variables: ["prenom"] },
  { id: "kill_moins6", groupe: "kill", cle: "kill_moins6_texte", variables: ["prenom", "n"] },
  { id: "arret", groupe: "arret", cle: "arret_message_texte", variables: [] },
  { id: "double_popup", groupe: "popups", cle: "double_popup_texte", variables: ["prenom"] },
  { id: "recreer_popup", groupe: "popups", cle: "recreer_popup_texte", variables: ["prenom", "nouveau", "date"] },
  { id: "regularite", groupe: "regularite", cle: "nudge_regularite_texte", variables: ["prenom"] },
  { id: "lien1000", groupe: "lien1000", cle: "lien_1000", chemin: "message", variables: ["handle", "lien"] },
  { id: "lien1000_relance", groupe: "lien1000", cle: "lien_1000", chemin: "message_relance", variables: ["handle", "lien"] },
  { id: "reponse_upwork", groupe: "reponses", cle: "reponse_texte_upwork", variables: ["slack"] },
  { id: "reponse_augmentation", groupe: "reponses", cle: "reponse_texte_augmentation", variables: [] },
  { id: "reponse_propre_compte", groupe: "reponses", cle: "reponse_texte_propre_compte", variables: [] },
  { id: "reponse_absent", groupe: "reponses", cle: "reponse_texte_absent", variables: ["jours"], videPermis: true },
  { id: "paie_soumettre", groupe: "paie", cle: "paie_soumettre_texte", variables: ["prenom", "NN"] },
  { id: "paie_payee", groupe: "paie", cle: "paie_reponse_payee_texte", variables: ["montant", "NN"] },
  { id: "paie_deja_payee", groupe: "paie", cle: "paie_reponse_deja_payee_texte", variables: ["montant", "NN", "date"] },
  { id: "paie_financee", groupe: "paie", cle: "paie_reponse_financee_texte", variables: ["NN"] },
  { id: "paie_attente", groupe: "paie", cle: "paie_reponse_attente_texte", variables: [] },
];

/** Les clés lues par l'onglet (sans doublon), plus celles qui servent à l'aperçu. */
export const CLES_TEXTES: readonly string[] = [...new Set(TEXTES.map((x) => x.cle))];
export const CLES_APERCU = ["slack_lien_invitation", "lien_etapes_tiktok"] as const;

const OS_URL = "https://sophia-marketing-orga.vercel.app";
const GUIDE_POSTER = "https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/** Les valeurs d'exemple de l'aperçu (Ana, un lundi de cohorte, une semaine de paie). */
export function exemples(reglages: Record<string, unknown>): Record<string, string> {
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return {
    prenom: "Ana",
    handle: "ana.studies",
    url: OS_URL,
    email: "ana@sophia.com",
    mot_de_passe: "12345678",
    slack: texte(reglages.slack_lien_invitation) || "https://join.slack.com/…",
    guide: GUIDE_POSTER,
    lien_etapes: texte(reglages.lien_etapes_tiktok) || GUIDE_POSTER,
    date: "2 November",
    ce_qui_manque: "follow 5 accounts",
    faits: "4",
    attendus: "14",
    n: "4",
    nouveau: "ana.studies2",
    lien: "taap.it/sophia.culture",
    montant: "84",
    NN: "45",
    jours: "3",
  };
}

/** Le texte d'un réglage (ou d'un champ de réglage objet) ; absent → null. */
export function lireTexte(valeur: unknown, chemin?: string): string | null {
  const v = chemin ? (valeur && typeof valeur === "object" ? (valeur as Record<string, unknown>)[chemin] : undefined) : valeur;
  return typeof v === "string" ? v : null;
}

/** La valeur à écrire : la chaîne, ou l'objet relu juste avant avec ce seul champ changé (les autres restent). */
export function ecrireTexte(valeurFraiche: unknown, chemin: string | undefined, texte: string): unknown {
  if (!chemin) return texte;
  const base = valeurFraiche && typeof valeurFraiche === "object" ? (valeurFraiche as Record<string, unknown>) : {};
  return { ...base, [chemin]: texte };
}
