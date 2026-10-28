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

/** Les réglages de paie qui comptent pour le posteur (`paie`, 0380 / 0393). */
export interface ReglesPaie {
  manquesToleres: number;
  retenueParPost: number;
}

export const REGLES_PAIE_DEFAUT: ReglesPaie = { manquesToleres: 1, retenueParPost: 1 };

const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * La carte « How you're paid », trois phrases. Les nombres viennent des
 * réglages : 1 post manqué toléré par compte et par semaine, puis 1 $.
 */
export function phrasesPaie(r: ReglesPaie): string[] {
  const tolere =
    r.manquesToleres === 0
      ? `Every missed post is ${dollars(r.retenueParPost)} off.`
      : `${r.manquesToleres} missed post${r.manquesToleres > 1 ? "s" : ""} per account per week ${r.manquesToleres > 1 ? "are" : "is"} tolerated. Every further missed post is ${dollars(r.retenueParPost)} off.`;
  return [
    "Paid every Monday, for the week just finished.",
    tolere,
    "No post on Monday and Tuesday: we message you once on Upwork. Still no post by Friday: the contract ends on Saturday.",
  ];
}

/** Lit un réglage texte ; vide ou absent : le texte par défaut. */
export function texteRegle(valeur: unknown, regle: Regle): string {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : DEFAUTS_REGLES[regle];
}

export function lireReglesPaie(valeur: unknown): ReglesPaie {
  const v = (valeur && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  const nombre = (x: unknown, defaut: number) => {
    const n = Number(x);
    return x !== undefined && x !== null && Number.isFinite(n) && n >= 0 ? n : defaut;
  };
  return {
    manquesToleres: nombre(v.manques_toleres, REGLES_PAIE_DEFAUT.manquesToleres),
    retenueParPost: nombre(v.retenue_par_post, REGLES_PAIE_DEFAUT.retenueParPost),
  };
}
