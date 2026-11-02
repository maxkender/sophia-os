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
 * Le corps accepté : { action: "proposer", probleme_id, reponse?, canal?, action_proposee? }
 * ou { action: "creer", poster_id | contrat_id, categorie, resume, texte?, lien?, reponse?, canal?, action_proposee? }.
 * Tout le reste est refusé (valider, envoyer, kill, payer…).
 */
export function lireCorps(corps: unknown): { action: "proposer" | "creer"; args: Record<string, unknown> } | { erreur: string } {
  if (!corps || typeof corps !== "object") return { erreur: "corps JSON attendu" };
  const c = corps as Record<string, unknown>;
  const texte = (k: string, max = 2000) => (typeof c[k] === "string" ? (c[k] as string).slice(0, max) : undefined);
  const args: Record<string, unknown> = {
    reponse: texte("reponse", 4000),
    canal: texte("canal", 10),
    action: texte("action_proposee", 40),
  };
  if (c.action === "proposer") {
    const id = texte("probleme_id", 40);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "probleme_id (uuid) obligatoire" };
    if (!args.reponse && !args.action) return { erreur: "reponse ou action_proposee obligatoire" };
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
  return { erreur: "action refusée : proposer ou creer seulement" };
}
