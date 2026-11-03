/**
 * Bloc C, C8 (2/11) : qui appelle, et ce qu'il a le droit de demander.
 * Rien ici ne touche la base ni le réseau.
 */

export type Bot = "new_cohort_bot" | "control_bot" | "pay_bot";

/** Le secret Supabase de chaque bot (Edge Functions → Secrets). Jamais renvoyé ni écrit. */
export const SECRETS_BOTS: Readonly<Record<Bot, string>> = {
  new_cohort_bot: "BOT_TOKEN_NEW_COHORT",
  control_bot: "BOT_TOKEN_CONTROL",
  pay_bot: "BOT_TOKEN_PAY",
};

/** Les groupes de posteurs (page Problèmes v4). */
export const GROUPES: readonly string[] = ["onboarding", "nouveaux_actifs", "actifs"];

/** Les actions qu'un bot peut proposer (rien n'est exécuté sans un clic de l'admin). */
export const ACTIONS_BOT: readonly string[] = [
  "resend_password_link", "relink_slack", "reread_tiktok", "recreate", "kill", "mark_read", "open_payroll", "open_who_to_fund", "close", "postpone", "none",
];

/** Quels secrets sont posés (oui / non), jamais leur valeur. */
export function etatSecrets(secrets: Partial<Record<Bot, string | undefined>>): Record<Bot, boolean> {
  return Object.fromEntries((Object.keys(SECRETS_BOTS) as Bot[]).map((b) => [b, Boolean(secrets[b] && secrets[b]!.length >= 20)])) as Record<Bot, boolean>;
}

/** Comparaison en temps constant (même longueur : chaque caractère est lu). */
export function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Le bot dont le jeton correspond (en-tête « Authorization: Bearer … »), ou null. */
export function botDuJeton(entete: string | null, secrets: Partial<Record<Bot, string | undefined>>): Bot | null {
  const jeton = (entete ?? "").replace(/^Bearer\s+/i, "").trim();
  if (jeton.length < 20) return null;
  for (const bot of Object.keys(SECRETS_BOTS) as Bot[]) {
    const s = secrets[bot];
    if (s && s.length >= 20 && egalConstant(jeton, s)) return bot;
  }
  return null;
}

/**
 * Le corps accepté : { action: "lire", probleme_id? } (ses problèmes ouverts avec leur contexte, ses règles,
 * ses feedbacks, les posteurs de son groupe ; un seul problème et 20 messages avec probleme_id) ; { action: "proposer", probleme_id, reponse?, canal?, action_proposee? (dont « none ») }
 * ou { action: "creer", poster_id | contrat_id, categorie, resume, texte?, lien?, reponse?, canal?, action_proposee? }.
 * Tout le reste est refusé (valider, envoyer, kill, payer…).
 */
export function lireCorps(corps: unknown): { action: "lire" | "proposer" | "creer"; args: Record<string, unknown> } | { erreur: string } {
  if (!corps || typeof corps !== "object") return { erreur: "corps JSON attendu" };
  const c = corps as Record<string, unknown>;
  // 3/11 : « lire » : ses problèmes ouverts (avec les messages), ses règles et ses feedbacks.
  if (c.action === "lire") {
    // Option : un seul problème, avec ses 20 derniers messages.
    const id = typeof c.probleme_id === "string" ? c.probleme_id : undefined;
    if (id !== undefined && !/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "probleme_id : uuid attendu" };
    return { action: "lire", args: id ? { probleme_id: id } : {} };
  }
  const texte = (k: string, max = 2000) => (typeof c[k] === "string" ? (c[k] as string).slice(0, max) : undefined);
  // 3/11 (v4) : le diagnostic du bot (300 car.) et le groupe qu'il suggère.
  const groupe = texte("groupe_suggere", 20);
  if (groupe && !GROUPES.includes(groupe)) return { erreur: `groupe_suggere : ${GROUPES.join(", ")}` };
  const args: Record<string, unknown> = {
    reponse: texte("reponse", 4000),
    canal: texte("canal", 10),
    action: texte("action_proposee", 40),
    diagnostic: texte("diagnostic", 300),
    groupe_suggere: groupe,
  };
  if (c.action === "proposer") {
    const id = texte("probleme_id", 40);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "probleme_id (uuid) obligatoire" };
    if (!args.reponse && !args.action && !args.diagnostic) return { erreur: "reponse, action_proposee ou diagnostic obligatoire" };
    return { action: "proposer", args: { ...args, probleme_id: id } };
  }
  if (c.action === "creer") {
    const poster = texte("poster_id", 40);
    const contrat = texte("contrat_id", 20);
    if (!poster && !contrat) return { erreur: "poster_id ou contrat_id obligatoire" };
    if (poster && !/^[0-9a-f-]{36}$/i.test(poster)) return { erreur: "poster_id : uuid attendu" };
    if (!texte("categorie", 40) || !texte("resume", 200)) return { erreur: "categorie et resume obligatoires" };
    return {
      action: "creer",
      args: { ...args, poster_id: poster, contrat_id: contrat, categorie: texte("categorie", 40), resume: texte("resume", 200), texte: texte("texte"), lien: texte("lien", 500) },
    };
  }
  return { erreur: "action refusée : lire, proposer ou creer seulement" };
}
