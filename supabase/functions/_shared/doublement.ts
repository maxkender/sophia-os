/**
 * 21/11 (Max) : le doublement passe par l'accord du posteur. Partie sans réseau ni base (testée) : les textes (en
 * anglais, traduits ensuite dans sa langue) et la lecture d'une réponse courte « yes » / « no » sur Upwork ou par email.
 */

const MOIS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** « Monday, November 23 » (lundi AAAA-MM-JJ). */
export function lundiEnClair(lundi: string): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  return `Monday, ${MOIS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const montant = (n: number) => (Math.round(n * 100) / 100).toString();

/** La proposition (Upwork : « reply YES here » ; Ruul : « reply YES to this email »). */
export function texteOffreDouble(o: {
  prenom: string | null; handle: string | null; tarif: number | null; lundi: string; canal: "upwork" | "ruul";
}): string {
  const compte = o.handle ? `@${o.handle.replace(/^@/, "")}` : "your account";
  // 21/11 : jamais le nom interne du label (jargon) dans un message au posteur.
  const paie = o.tarif && o.tarif > 0
    ? `Same work on it, and your weekly pay goes from ${montant(o.tarif)} $ to ${montant(2 * o.tarif)} $.`
    : "Same work on it, and you're paid for 2 accounts.";
  const repondre = o.canal === "ruul" ? "reply YES to this email" : "reply YES here";
  return `Hi ${o.prenom?.trim() || "there"}, ${compte} is doing great. Would you like to manage a 2nd TikTok account? ${paie} ` +
    `To accept, ${repondre} or click "Accept" on your dashboard before Sunday 23:59 (Paris time). ` +
    `The 2nd account does its warm-up until Sunday and starts posting on ${lundiEnClair(o.lundi)}.`;
}

/** Le message du démarrage, le lundi. */
export function texteDemarrageDouble(o: { handle1: string | null; handle2: string | null; tarif: number | null; lundi: string }): string {
  const h = (x: string | null) => (x ? `@${x.replace(/^@/, "")}` : "your new account");
  const paie = o.tarif && o.tarif > 0 ? ` Your weekly pay is now ${montant(2 * o.tarif)} $.` : "";
  return `From ${lundiEnClair(o.lundi)} you manage 2 accounts: ${h(o.handle1)} and ${h(o.handle2)}.${paie}`;
}

/** La confirmation après un « yes ». */
export function texteAccordDouble(lundi: string): string {
  return `Great! Your 2nd account is on your dashboard: do its warm-up until Sunday. It starts posting on ${lundiEnClair(lundi)}.`;
}

export const TEXTE_REFUS_DOUBLE = "No problem, nothing changes for you. Keep up the great work!";

const OUI = /^(yes|yeah|yep|yess+|sure|ok(ay)?|oui|ouais|s[ií]|sim|ja|jaa|evet|tak|da|ano|igen|ναι|نعم|да|так|כן|はい|是|accept(ed)?|i accept|i want it|let'?s go)[\s!.,👍🙏😊🙂]*$/iu;
const NON = /^(no|nope|non|nein|nee|hay[ıi]r|nie|n[ãa]o|ne|nem|όχι|لا|нет|ні|לא|いいえ|不|no thanks?|non merci|no,? thank you)[\s!.,🙏]*$/iu;

/**
 * La réponse à une proposition en cours : seulement un message court et clair (« Yes! », « oui », « evet »).
 * Une phrase plus longue (une question, une condition) passe au support normal.
 */
export function reponseDouble(message: string): "oui" | "non" | null {
  const t = message.trim().replace(/^(hi|hello|hey|bonjour|merci|thanks?)[\s,!]+/i, "").replace(/[\s,!.]+(thanks?( you)?|merci|thank u)[\s!.]*$/i, "").trim();
  if (!t || t.length > 40) return null;
  if (OUI.test(t)) return "oui";
  if (NON.test(t)) return "non";
  return null;
}
