/**
 * 8/11 : parrainage par email. Les 3 emails au filleul (J0, J+2, J+5), dans
 * la langue de son pays, depuis sophia-culture.com (expéditeur « Sophia »).
 * Texte J0 validé par Max (anglais) ; les autres langues en sont la
 * traduction. Une langue absente → anglais.
 */

import { TRADUCTIONS, type TextesTraduits } from "./parrainage_traductions.ts";

export type EtapeEmail = 0 | 2 | 5;

interface Textes {
  objet: Record<EtapeEmail, string>;
  /** Paragraphes ; {prenom} {referrer} {tarif} sont remplacés, {lien} devient le bouton. */
  corps: Record<EtapeEmail, string[]>;
  bouton: string;
  signature: string[];
  pied: string;
  desinscrire: string;
}

const EN: Textes = {
  objet: {
    0: "{referrer} thinks you'd be great for this 🙂",
    2: "Just a reminder: {referrer} recommended you 🙂",
    5: "Last reminder from Sophia",
  },
  corps: {
    0: [
      "Hi {prenom},",
      "{referrer} recommended you for a paid side job with Sophia, a learning app.",
      "You post 2 ready-made slideshows a day on a TikTok account we give you. Everything is prepared for you (slides, caption, music), no camera and no experience needed.",
      "💰 {tarif}/week · ⏱ under 10 minutes a day · 💸 paid every Monday",
    ],
    2: [
      "Hi {prenom},",
      "Just a reminder, {referrer} recommended you for a paid side job with Sophia: 2 ready-made TikTok slideshows a day, under 10 minutes, {tarif}/week paid every Monday.",
    ],
    5: [
      "Hi {prenom},",
      "This is our last email. {referrer}'s recommendation is still open: 2 ready-made TikTok slideshows a day, {tarif}/week paid every Monday.",
      "If it's not for you, no worries, you won't hear from us again.",
    ],
  },
  bouton: "👉 Apply in 1 minute",
  signature: ["See you soon,", "The Sophia team"],
  pied: "You received this email because {referrer} shared your address with us.",
  desinscrire: "Unsubscribe",
};

const EL: Textes = {
  objet: {
    0: "Ο/Η {referrer} πιστεύει ότι αυτό είναι ιδανικό για σένα 🙂",
    2: "Μια υπενθύμιση: ο/η {referrer} σε πρότεινε 🙂",
    5: "Τελευταία υπενθύμιση από τη Sophia",
  },
  corps: {
    0: [
      "Γεια σου {prenom},",
      "Ο/Η {referrer} σε πρότεινε για μια αμειβόμενη δουλειά με λίγο χρόνο, με τη Sophia, μια εφαρμογή μάθησης.",
      "Δημοσιεύεις 2 έτοιμα slideshows την ημέρα σε έναν λογαριασμό TikTok που σου δίνουμε. Όλα είναι έτοιμα για σένα (slides, λεζάντα, μουσική), χωρίς κάμερα και χωρίς εμπειρία.",
      "💰 {tarif}/εβδομάδα · ⏱ λιγότερο από 10 λεπτά την ημέρα · 💸 πληρωμή κάθε Δευτέρα",
    ],
    2: [
      "Γεια σου {prenom},",
      "Μια υπενθύμιση: ο/η {referrer} σε πρότεινε για μια αμειβόμενη δουλειά με τη Sophia: 2 έτοιμα slideshows στο TikTok την ημέρα, λιγότερο από 10 λεπτά, {tarif}/εβδομάδα με πληρωμή κάθε Δευτέρα.",
    ],
    5: [
      "Γεια σου {prenom},",
      "Αυτό είναι το τελευταίο μας email. Η πρόταση του/της {referrer} ισχύει ακόμα: 2 έτοιμα slideshows στο TikTok την ημέρα, {tarif}/εβδομάδα με πληρωμή κάθε Δευτέρα.",
      "Αν δεν σε ενδιαφέρει, κανένα πρόβλημα, δεν θα ξαναλάβεις κάτι από εμάς.",
    ],
  },
  bouton: "👉 Κάνε αίτηση σε 1 λεπτό",
  signature: ["Τα λέμε σύντομα,", "Η ομάδα της Sophia"],
  pied: "Έλαβες αυτό το email επειδή ο/η {referrer} μοιράστηκε τη διεύθυνσή σου μαζί μας.",
  desinscrire: "Απεγγραφή",
};

function depuisTraduction(t: TextesTraduits): Textes {
  return {
    objet: { 0: t.objet[0], 2: t.objet[1], 5: t.objet[2] },
    corps: { 0: [...t.j0], 2: [...t.j2], 5: [...t.j5] },
    bouton: t.bouton,
    signature: [...t.signature],
    pied: t.pied,
    desinscrire: t.desinscrire,
  };
}

export const TEXTES_PARRAINAGE: Readonly<Record<string, Textes>> = {
  en: EN,
  el: EL,
  ...Object.fromEntries(Object.entries(TRADUCTIONS).map(([l, t]) => [l, depuisTraduction(t)])),
};

/** La langue de l'email : celle du pays (« es-419 » → « es »), anglais si elle n'est pas traduite. */
export function langueEmail(langue: string | null | undefined): string {
  const l = String(langue ?? "en").toLowerCase();
  if (TEXTES_PARRAINAGE[l]) return l;
  const base = l.split("-")[0];
  return TEXTES_PARRAINAGE[base] ? base : "en";
}

/** La langue de la page du site : « el », « en »… (le site a des pages par langue). */
export function langueSite(langue: string | null | undefined): string {
  return String(langue ?? "en").toLowerCase().split("-")[0] || "en";
}

export function lienCreators(langue: string | null | undefined, code: string): string {
  return `https://sophia-culture.com/${langueSite(langue)}/creators?ref=${encodeURIComponent(code)}`;
}

export interface DonneesEmail {
  etape: EtapeEmail;
  langue: string | null | undefined;
  prenom: string;
  referrer: string;
  /** Tarif d'une semaine (zone du pays du filleul) : 14, 10 ou 7. */
  tarif: number;
  lien: string;
  lienDesinscription: string;
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function remplir(s: string, d: DonneesEmail): string {
  return s
    .replace(/\{prenom\}/g, d.prenom.trim() || "there")
    .replace(/\{referrer\}/g, d.referrer.trim())
    .replace(/\{tarif\}/g, `$${Number.isInteger(d.tarif) ? d.tarif : d.tarif.toFixed(2)}`);
}

/** L'email rendu : objet, HTML (simple, lisible partout) et texte brut. */
export function rendreEmail(d: DonneesEmail): { objet: string; html: string; texte: string; langue: string } {
  const langue = langueEmail(d.langue);
  const t = TEXTES_PARRAINAGE[langue];
  const objet = remplir(t.objet[d.etape], d);
  const paragraphes = t.corps[d.etape].map((p) => remplir(p, d));
  const pied = remplir(t.pied, d);
  const html = `<!doctype html><html lang="${langue}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(objet)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">Sophia</td></tr>
${paragraphes.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(p)}</td></tr>`).join("\n")}
<tr><td style="padding:8px 0 20px"><a href="${echapper(d.lien)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${echapper(t.bouton)}</a></td></tr>
${t.signature.map((s) => `<tr><td style="font-size:15px;line-height:1.4">${echapper(s)}</td></tr>`).join("\n")}
<tr><td style="font-size:12px;line-height:1.5;color:#71717a;padding-top:24px;border-top:1px solid #e4e4e7">${echapper(pied)} <a href="${echapper(d.lienDesinscription)}" style="color:#71717a">${echapper(t.desinscrire)}</a></td></tr>
</table></td></tr></table></body></html>`;
  const texte = [...paragraphes, `${t.bouton}: ${d.lien}`, "", ...t.signature, "", `${pied} ${t.desinscrire}: ${d.lienDesinscription}`].join("\n\n");
  return { objet, html, texte, langue };
}

/** Le calendrier : J0, J+2, J+5 ; jamais plus de 3 emails. */
export function prochaineEtape(envoyes: number): EtapeEmail | null {
  return envoyes === 0 ? 0 : envoyes === 1 ? 2 : envoyes === 2 ? 5 : null;
}
