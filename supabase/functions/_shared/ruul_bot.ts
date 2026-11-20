/**
 * 21/11 (Max) : le bot face aux posteurs RUUL qui n'arrivent pas à activer Ruul ou qui veulent être payés sur Upwork.
 * Partie sans réseau ni base (testée) : la détection des cas connus (toutes langues : les règles, puis la catégorie
 * donnée par le modèle) et les textes (en anglais, traduits ensuite dans la langue du message).
 *
 *   « Je veux Upwork » : pays refusé par Ruul → Upwork tout de suite ; 1re demande → une réponse (pas de frais, payé
 *   chaque lundi, 5 minutes, la prochaine étape) ; 2e demande → exception Upwork sans discuter.
 *   Cas connus : code / connexion, compte Ruul avec un autre email, nom différent, identité refusée (2e refus → Upwork),
 *   pays ou banque refusés (→ Upwork), bug ou écran bloqué (capture, puis escalade).
 *   Escalade : cas inconnu, ou le bot a déjà répondu 2 fois au même problème.
 */

export type CasRuul = "code" | "autre_email" | "nom" | "identite" | "pays" | "bug";
export type EtapeRuul = "inscrit" | "identite" | "banque";

export const TEXTES_RUUL = {
  persuasion: "We pay through Ruul: no fees for you, paid every Monday. Setup takes about 5 minutes, here's your next step: {etape}. Need help? Tell us what's blocking you.",
  etape_inscrit: "sign up on app.ruul.io with {email}",
  etape_identite: "verify your identity on app.ruul.io",
  etape_banque: "add your bank account on app.ruul.io",
  code: "The code is sent by Ruul, not by us. On app.ruul.io, click \"Resend code\", check your spam folder, and use your application email: {email}.",
  autre_email: "No problem. Reply here with the email of your existing Ruul account: we'll update it on our side and Ruul will send you a new invitation.",
  autre_email_fait: "Done: we've updated your Ruul email to {email}. You'll receive a new invitation from Ruul at this address.",
  nom: "Ruul needs the exact name on your ID. Reply here with your first and last name exactly as written on your ID, and we'll update it on our side.",
  nom_fait: "Done: your legal name is now {nom} on our side. Use exactly this name on Ruul.",
  identite: "Ruul declined your identity check. To redo it on app.ruul.io: use a valid ID that isn't expired (not a copy or a screenshot), take a sharp photo in good light with the 4 corners visible, then a clear selfie.",
  identite_2: "Ruul declined your identity check twice, so we'll pay you on Upwork instead. Reply here with the link to your Upwork freelancer profile and we'll send you an offer.",
  pays: "Ruul doesn't support your country or bank, so we'll pay you on Upwork instead. Reply here with the link to your Upwork freelancer profile and we'll send you an offer.",
  capture: "Can you send a screenshot of the Ruul screen where you're stuck? We'll sort it out with you.",
  bloque_7j: "Still stuck with Ruul? We can pay you on Upwork instead: reply with the link to your Upwork freelancer profile and we'll send you an offer.",
} as const;

/** Le cas d'après la catégorie du modèle (il comprend toutes les langues). */
const CATEGORIES: Record<string, CasRuul> = {
  ruul_code: "code", ruul_autre_email: "autre_email", ruul_nom: "nom", ruul_identite: "identite", ruul_pays: "pays", ruul_bug: "bug",
};
export const CATEGORIES_RUUL = Object.keys(CATEGORIES);

const AUTRE_EMAIL = /(another|different|other|old|second|personal)\s+(e-?mail|address|account)|already\s+(have|got|had|created)\s+(a\s+|an\s+)?(ruul\s+)?account|account\s+(with|under)\s+(another|a\s+different|my\s+other)|(e-?mail|address)\s+(is\s+)?(different|wrong|not\s+the\s+same)|autre\s+(adresse|e-?mail)|déjà\s+un\s+compte|otro\s+(correo|email)|ya\s+tengo\s+(una\s+)?cuenta|altra\s+(email|mail)|ho\s+già\s+un\s+account|andere\s+e-?mail|başka\s+(bir\s+)?(e-?posta|mail)|zaten\s+(bir\s+)?hesab/i;
const NOM = /\bname\s+(doesn'?t|does\s+not|don'?t|isn'?t|is\s+not)\s+(match|the\s+same|correct|right)|(different|wrong|incorrect)\s+(last\s+|first\s+)?name|name\s+(is\s+)?(wrong|different|mismatch)|name\s+mismatch|nom\s+(différent|incorrect|ne\s+correspond)|nombre\s+(diferente|incorrecto|no\s+coincide)|nome\s+(diverso|sbagliato)|name\s+stimmt\s+nicht|isim\s+(farklı|yanlış|uyuşmuyor)|ad(ım)?\s+(farklı|yanlış)/i;
const IDENTITE = /(identity|\bid\b|kyc|verification|document|passport|selfie)[^.?!]{0,30}(rejected|declined|refused|failed|not\s+(approved|accepted|verified))|(rejected|declined|refused)\s+(my\s+)?(id|identity|kyc|document|passport|verification)|identit[ée]\s+(refus|rejet)|(documento|identidad)\s+(rechazad|denegad)|(documento|identità)\s+(rifiutat|respint)|ausweis\s+(abgelehnt|nicht\s+akzeptiert)|kimli[kğ][^.?!]{0,20}(reddedildi|onaylanmadı)/i;
const PAYS = /(country|bank|currency)[^.?!]{0,30}(not\s+(supported|available|accepted|listed|in\s+the\s+list)|unsupported|isn'?t\s+(supported|available|listed))|can'?t\s+(find|select|choose)\s+my\s+(country|bank)|(my\s+)?country\s+is\s+not\s+there|pays\s+(non\s+)?(pris\s+en\s+charge|disponible|accepté)|país\s+no\s+(disponible|aceptado|soportado)|paese\s+non\s+(supportato|disponibile)|land\s+(wird\s+)?nicht\s+unterstützt|ülke(m)?\s+(desteklenmiyor|listede\s+yok)|banka(m)?\s+(desteklenmiyor|yok)/i;
const BUG = /(can'?t|cannot|unable\s+to|won'?t\s+let\s+me)\s+(submit|send|upload|continue|proceed|click|save|finish|complete|move\s+on|go\s+further)|(stuck|blocked|frozen|keeps\s+loading|infinite\s+loading|blank\s+(page|screen)|error\s+message|an?\s+error|bug|crash|glitch)|(bloqué|erreur|ne\s+charge\s+pas)|(atascad|bloquead|error)|(bloccat|errore)|(hängt|fehler)|(takıldı|hata|ilerlemiyor)/i;
const CONNEXION = /(can'?t|cannot|unable\s+to)\s+(log\s?in|sign\s?in|access|get\s+into)[^.?!]{0,30}ruul|ruul[^.?!]{0,40}(log\s?in|sign\s?in|password|login)/i;
const PARLE_RUUL = /ruul|kyc|identity|verify|verification|bank|iban|passport|selfie|sign\s?up|register/i;

/**
 * Le cas connu, d'après le message (règles, plusieurs langues) puis la catégorie du modèle. Le code à 6 chiffres
 * (estCode, déjà reconnu ailleurs) est passé en paramètre pour ne pas dupliquer sa règle.
 */
export function detecterCasRuul(message: string, o: { categorie?: string | null; estCode?: boolean } = {}): CasRuul | null {
  const t = message.replace(/[’‘]/g, "'");
  if (o.estCode || CONNEXION.test(t)) return "code";
  if (PAYS.test(t)) return "pays";
  if (IDENTITE.test(t)) return "identite";
  if (NOM.test(t)) return "nom";
  if (AUTRE_EMAIL.test(t) && PARLE_RUUL.test(t)) return "autre_email";
  if (BUG.test(t) && PARLE_RUUL.test(t)) return "bug";
  return o.categorie ? CATEGORIES[o.categorie] ?? null : null;
}

/** Une adresse email dans le message (le posteur donne celle de son compte Ruul). */
export function emailDansMessage(message: string): string | null {
  const m = message.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** La prochaine étape du set-up Ruul, en clair. */
export function texteEtape(e: { inscrit: boolean; identite: boolean; banque: boolean }, email: string | null): string {
  if (!e.inscrit) return TEXTES_RUUL.etape_inscrit.replace("{email}", email ?? "your application email");
  if (!e.identite) return TEXTES_RUUL.etape_identite;
  return TEXTES_RUUL.etape_banque;
}

export function etapeBloquee(e: { inscrit: boolean; identite: boolean; banque: boolean }): EtapeRuul {
  return !e.inscrit ? "inscrit" : !e.identite ? "identite" : "banque";
}

export type DecisionUpwork = "exception" | "persuasion";

/**
 * « Je veux être payé sur Upwork » : pays refusé par Ruul → exception sans discuter ; sinon la 1re demande reçoit une
 * réponse (persuasion), la 2e (ou plus) passe en exception.
 */
export function decisionUpwork(o: { paysRefuse: boolean; demandesAvant: number }): DecisionUpwork {
  return o.paysRefuse || o.demandesAvant >= 1 ? "exception" : "persuasion";
}

/** Le bot a déjà répondu 2 fois au même problème : escalade (la 3e fois). */
export function escalader(demandesAvant: number): boolean {
  return demandesAvant >= 2;
}

export interface ReponseRuul {
  texte: string;
  /** L'exception Upwork est demandée (lien de profil attendu, page « À ajouter sur Upwork »). */
  upwork: boolean;
  /** Une action à exécuter (email Ruul changé et réinvitation, nom légal mis à jour). */
  action: { type: "email_ruul" | "nom_legal"; valeur: string } | null;
}

/** La réponse à un cas connu (avant escalade). */
export function reponseCasRuul(cas: CasRuul, o: { message: string; email: string | null; refusIdentite: number; demandesAvant: number; nomPropose?: string | null }): ReponseRuul {
  switch (cas) {
    case "code":
      return { texte: TEXTES_RUUL.code.replace("{email}", o.email ?? "the email you applied with"), upwork: false, action: null };
    case "autre_email": {
      const email = emailDansMessage(o.message);
      return email
        ? { texte: TEXTES_RUUL.autre_email_fait.replace("{email}", email), upwork: false, action: { type: "email_ruul", valeur: email } }
        : { texte: TEXTES_RUUL.autre_email, upwork: false, action: null };
    }
    case "nom":
      return o.nomPropose
        ? { texte: TEXTES_RUUL.nom_fait.replace("{nom}", o.nomPropose), upwork: false, action: { type: "nom_legal", valeur: o.nomPropose } }
        : { texte: TEXTES_RUUL.nom, upwork: false, action: null };
    case "identite":
      return o.refusIdentite >= 2 ? { texte: TEXTES_RUUL.identite_2, upwork: true, action: null } : { texte: TEXTES_RUUL.identite, upwork: false, action: null };
    case "pays":
      return { texte: TEXTES_RUUL.pays, upwork: true, action: null };
    case "bug":
      return { texte: TEXTES_RUUL.capture, upwork: false, action: null };
  }
}

/** Le nom légal donné par le posteur (« Prénom Nom ») : prénom = premier mot, nom = le reste. */
export function separerNomLegal(nom: string): { prenom: string; nom: string } | null {
  const mots = nom.trim().replace(/\s+/g, " ").split(" ");
  if (mots.length < 2 || mots.some((m) => !/^[\p{L}'.-]+$/u.test(m))) return null;
  return { prenom: mots[0]!, nom: mots.slice(1).join(" ") };
}
