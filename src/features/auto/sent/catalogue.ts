/**
 * Prompt 22, partie 6.3 : TOUS les textes envoyés aux posteurs, au même
 * endroit, rangés dans l'ordre de la semaine. Chaque texte vit dans `reglages`
 * (une chaîne, ou un champ d'un objet : `chemin`). Les {variables} sont celles
 * que remplit le code qui envoie le message ; une variable inconnue reste
 * telle quelle dans le message (comme dans les fonctions).
 */

export const GROUPES_TEXTES = [
  "accueil",
  "etapes",
  "lundi",
  "lundi_soir",
  "jeudi",
  "kill",
  "arret",
  "popups",
  "regularite",
  "lien1000",
  "reponses",
  "paie",
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
const VARIABLES_ACCUEIL = ["prenom", "url", "email", "mot_de_passe", "slack", "guide", "date"] as const;
/** Les variables des messages d'étape (_shared/etapes.ts, texteEtape). */
const VARIABLES_ETAPE = ["prenom", "handle", "url", "lien_etapes", "date", "ce_qui_manque"] as const;

export const TEXTES: readonly TexteCatalogue[] = [
  { id: "accueil", groupe: "accueil", cle: "accueil_message_texte", variables: VARIABLES_ACCUEIL },
  { id: "etape_connexion", groupe: "etapes", cle: "etape_texte_connexion", variables: VARIABLES_ETAPE },
  // 0432 : la bienvenue n'a pas été envoyée par l'OS → les identifiants dans le rappel.
  { id: "etape_connexion_identifiants", groupe: "etapes", cle: "etape_texte_connexion_identifiants", variables: [...VARIABLES_ETAPE, "email", "mot_de_passe"] },
  { id: "etape_tiktok", groupe: "etapes", cle: "etape_texte_tiktok", variables: VARIABLES_ETAPE },
  // 0432 : Start warmup cliqué, @ introuvable → on demande le bon @ (jamais « create your account »).
  { id: "etape_tiktok_verifier", groupe: "etapes", cle: "etape_texte_tiktok_verifier", variables: VARIABLES_ETAPE },
  { id: "etape_warmup_lance", groupe: "etapes", cle: "etape_texte_warmup_lance", variables: VARIABLES_ETAPE },
  { id: "etape_warmup_bien_fait", groupe: "etapes", cle: "etape_texte_warmup_bien_fait", variables: VARIABLES_ETAPE },
  { id: "lundi_tous", groupe: "lundi", cle: "lundi_texte_tous", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_cohorte", groupe: "lundi", cle: "lundi_texte_cohorte", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_warmup", groupe: "lundi", cle: "lundi_texte_warmup", variables: ["prenom", "ce_qui_manque"] },
  { id: "lundi_soir", groupe: "lundi_soir", cle: "lundi_soir_texte", variables: ["prenom"] },
  { id: "jeudi", groupe: "jeudi", cle: "jeudi_texte", variables: ["prenom", "faits", "attendus"] },
  // Prompt 21, C7 : le texte des recrues pas encore prêtes (créé par la partie C).
  { id: "jeudi_recrue", groupe: "jeudi", cle: "jeudi_texte_recrue", variables: ["prenom", "date", "ce_qui_manque"] },
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
