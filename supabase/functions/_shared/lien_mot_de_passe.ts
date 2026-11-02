/**
 * 1/11 : plus aucun mot de passe dans un message Upwork (le rappel « Paying
 * outside of Upwork » d'Upwork). Le welcome et la relance « log in » donnent le
 * login et un lien personnel « Set my password » (migration 0491) : à usage
 * unique, valable 14 jours. La recrue y choisit son mot de passe.
 *
 * Le lien est créé au moment de l'envoi : les textes préparés (relances, To
 * approve, aperçus) gardent la variable {lien_mot_de_passe}, remplacée juste
 * avant de partir.
 */

// deno-lint-ignore no-explicit-any
type Client = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> };

export const VAR_LIEN_MOT_DE_PASSE = "{lien_mot_de_passe}";

/** Ce qui s'affiche dans un aperçu, à la place du lien personnel (créé à l'envoi). */
export const LIEN_APERCU = "(personal « Set my password » link, created when the message is sent)";

export function lienMotDePasse(osUrl: string, jeton: string): string {
  return `${osUrl.replace(/\/+$/, "")}/set-password?t=${encodeURIComponent(jeton)}`;
}

/** Le texte avec un vrai lien personnel à la place de {lien_mot_de_passe} (inchangé s'il n'y en a pas). */
export async function avecLienMotDePasse(
  supabase: Client,
  posterId: string,
  texte: string,
  osUrl: string,
  par: string,
): Promise<{ texte: string; erreur: string | null }> {
  if (!texte.includes(VAR_LIEN_MOT_DE_PASSE)) return { texte, erreur: null };
  const { data, error } = await supabase.rpc("mot_de_passe_lien_creer", { p_poster: posterId, p_par: par });
  if (error || typeof data !== "string" || !data) {
    return { texte, erreur: `lien « Set my password » : ${error?.message ?? "non créé"}` };
  }
  return { texte: texte.split(VAR_LIEN_MOT_DE_PASSE).join(lienMotDePasse(osUrl, data)), erreur: null };
}

/** Pour un aperçu : la variable remplacée par un texte qui dit que le lien est créé à l'envoi. */
export function apercuLienMotDePasse(texte: string): string {
  return texte.split(VAR_LIEN_MOT_DE_PASSE).join(LIEN_APERCU);
}

/** Les anciens mots de passe communs : jamais dans un message. */
const MOTS_DE_PASSE_CONNUS = ["12345678"];

/**
 * Le garde-fou de tout message Upwork : la raison du refus, ou null. Refusé :
 * un mot de passe donné (« password: … », « mot de passe : … », sauf un lien),
 * un ancien mot de passe commun, ou {lien_mot_de_passe} pas remplacé.
 */
export function refusMotDePasseUpwork(texte: string): string | null {
  if (texte.includes(VAR_LIEN_MOT_DE_PASSE)) return "lien « Set my password » pas créé : message non envoyé";
  if (MOTS_DE_PASSE_CONNUS.some((m) => texte.includes(m))) return "mot de passe dans le message : jamais sur Upwork (message non envoyé)";
  const donne = /\b(?:pass(?:word|code)|pwd|mot de passe)\s*(?:is\s*)?[:=]\s*(?!https?:\/\/)[^\s(]/i;
  if (donne.test(texte)) return "mot de passe dans le message : jamais sur Upwork (message non envoyé)";
  return null;
}

/** La seule phrase sur le paiement admise dans le welcome et les relances. */
export const PHRASE_PAIEMENT = "All payments are made only through Upwork milestones";

/**
 * Welcome et relances Upwork : aucune mention de paiement, sauf la phrase
 * admise. Rend la raison du refus, ou null.
 */
export function refusPaiementUpwork(texte: string): string | null {
  const reste = texte.split(PHRASE_PAIEMENT).join(" ");
  const m = reste.match(/\b(?:pay|paid|payment|payments|paying|payout|paypal|payoneer|salary|wage|bank|invoice|crypto|venmo|zelle|cash)\b|[$€£]/i);
  return m ? `mention de paiement (« ${m[0]} ») : seule « ${PHRASE_PAIEMENT}. » est admise (message non envoyé)` : null;
}
