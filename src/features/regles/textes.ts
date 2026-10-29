/**
 * Les règles dites aux posteurs (chantier du 28 oct.), en anglais, une seule
 * source : un réglage modifiable dans l'OS, et ce texte par défaut tant que le
 * réglage manque. Rien ici ne touche la base.
 */

/** `paie_regle_lien_texte` : la règle du lien (0304). */
export const REGLE_LIEN =
  "A post only counts when you mark it published with its link on your dashboard, the same day, before midnight (your time). After midnight it counts as missed.";

/** `warmup_regle_texte` : la règle unique du warm-up. */
export const REGLE_WARMUP =
  "Create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight.";

/**
 * `message_bienvenue_texte` : le « Welcome message » copié après la création
 * d'un poster (prompt 15, point 7). Variables : {prenom}, {email},
 * {password}, {url}, {slack}, {guide}, {regle_lien}, {regle_warmup}.
 */
export const MESSAGE_BIENVENUE = [
  "Hi {prenom}, welcome to Vik Studios!",
  "",
  "Your dashboard: {url}",
  "Login: {email}",
  "Password: {password} (you'll choose your own at your first login)",
  "",
  "Join our Slack (recommended), with your full name: {slack}",
  "Poster Guide: {guide}",
  "",
  "{regle_warmup}",
  "{regle_lien}",
  "",
  "Questions? Ask in #questions on Slack, or reply to this message.",
].join("\n");

export const CLES_REGLES = {
  lien: "paie_regle_lien_texte",
  warmup: "warmup_regle_texte",
  bienvenue: "message_bienvenue_texte",
} as const;
export type Regle = keyof typeof CLES_REGLES;

export const DEFAUTS_REGLES: Record<Regle, string> = { lien: REGLE_LIEN, warmup: REGLE_WARMUP, bienvenue: MESSAGE_BIENVENUE };

/** Le message de bienvenue rempli ; une variable inconnue reste telle quelle. */
export function remplirBienvenue(modele: string, valeurs: Record<string, string>): string {
  return modele.replace(/\{(\w+)\}/g, (tout, cle: string) => (cle in valeurs ? valeurs[cle] : tout));
}

/**
 * La règle de paie qui compte pour le posteur (prompt 21, B1 : le minimum de
 * posts avec lien par semaine, `paie_minimum_posts`, 6 par défaut). Plus
 * aucune retenue par post manqué depuis le 2 nov.
 */
export interface ReglesPaie {
  minimumPosts: number;
}

export const REGLES_PAIE_DEFAUT: ReglesPaie = { minimumPosts: 6 };

/**
 * La carte « How you're paid » (prompt 21, C8), les règles du 2 nov. : le
 * minimum de la semaine, la fin de la collaboration en dessous (semaine
 * payée), puis lundi 20 h, jeudi et samedi. La règle du lien (le jour même)
 * suit la carte, depuis son réglage.
 */
export function phrasesPaie(r: ReglesPaie): string[] {
  const n = r.minimumPosts;
  return [
    `Paid every Monday for the week just finished (Monday to Sunday): ${n} posts or more with their link = your full rate.`,
    `Below ${n} posts with link in a week, we stop our collaboration. That last week is still paid in full.`,
    "Monday 8 pm, on your first day: no post with its link yet? We message you once.",
    "Thursday: posts or links missing since Monday? You get one reminder with your count.",
    "Saturday: we review every account. An account can be stopped, or you can be offered a 2nd one.",
  ];
}

/** Lit un réglage texte ; vide ou absent : le texte par défaut. */
export function texteRegle(valeur: unknown, regle: Regle): string {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : DEFAUTS_REGLES[regle];
}

/** `paie_minimum_posts` (0415) : un entier positif, sinon 6. */
export function lireReglesPaie(valeur: unknown): ReglesPaie {
  const n = Number(valeur);
  return {
    minimumPosts:
      valeur !== undefined && valeur !== null && Number.isInteger(n) && n > 0 ? n : REGLES_PAIE_DEFAUT.minimumPosts,
  };
}
