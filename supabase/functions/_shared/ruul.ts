import { envoyerSuivi, type ResultatEnvoi } from "./emails.ts";

/**
 * Ruul (0574) : le calendrier des messages d'invitation et le rendu des
 * emails aux posteurs payés par Ruul. Sans réseau ni base (testé).
 *
 * Calendrier, à partir du clic « Ajouté sur Ruul » (ruul_ajoute_at) :
 * invitation tout de suite, relance J+1, relance J+3 (par email aussi, en
 * secours de Slack), J+5 sans « It's done » → carte Problems. Rien après un
 * STOP, ni une fois le posteur prêt.
 */

export type EtapeRuul = "invite" | "relance1" | "relance3" | "problems";

export interface EtatRuul {
  statut: string | null;
  ajoute_at: string | null;
  relances: number;
  stop_at: string | null;
}

const JOUR = 86_400_000;

export function prochaineEtapeRuul(e: EtatRuul, maintenant = new Date()): EtapeRuul | null {
  if (e.statut !== "invite" || e.stop_at || !e.ajoute_at) return null;
  const age = maintenant.getTime() - new Date(e.ajoute_at).getTime();
  if (e.relances <= 0) return "invite";
  if (e.relances === 1 && age >= JOUR) return "relance1";
  if (e.relances === 2 && age >= 3 * JOUR) return "relance3";
  if (e.relances === 3 && age >= 5 * JOUR) return "problems";
  return null;
}

/**
 * 0681 (Agent Ruul) : l'email à envoyer d'après le dernier statut lu dans Ruul. B (« Active »)
 * une seule fois ; A (« Invited ») une seule fois, et jamais après B. Rien une fois prêt.
 */
export function emailAB(p: {
  compte: string | null;
  a_at: string | null;
  b_at: string | null;
  statut: string | null;
  stop_at: string | null;
}): "A" | "B" | null {
  if (p.stop_at || p.statut === "pret" || p.statut === "paye_1x") return null;
  if (p.compte === "active" && !p.b_at) return "B";
  if (p.compte === "invited" && !p.a_at && !p.b_at) return "A";
  return null;
}

/** Les {variables} d'un texte modifiable ; une variable inconnue reste telle quelle. */
export function remplirRuul(texte: string, v: Record<string, string | number | null | undefined>): string {
  return texte.replace(/\{(\w+)\}/g, (tout, cle) => {
    const x = v[cle];
    return x === null || x === undefined || x === "" ? tout : String(x);
  });
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmailRuul {
  objet: string;
  corps: string;
  bouton?: { texte: string; lien: string } | null;
  lienStop: string;
  /** Email de fermeture du compte : ni phrase Help ni « I do not wish to continue ». */
  sansPied?: boolean;
  /** 13/11 (Réparer Ruul, v2) : le titre en haut (« Vik Studios ») et le lien « I do not wish to continue » (/r/stop). */
  titre?: string;
  arret?: string | null;
}

/** 12/11 (Max) : la dernière ligne de chaque email aux posteurs. */
export const PIED_HELP_EMAIL = "Have a question or a problem? Don't reply to this email: click Help on your dashboard, you'll get an answer there.";

/** Le lien « I do not wish to continue » (page de confirmation) déduit du lien d'arrêt des relances. */
export function lienArret(lienStop: string): string | null {
  return /[?&]stop=/.test(lienStop) ? lienStop.replace(/([?&])stop=/, "$1arreter=") : null;
}

/**
 * Un email simple (Sophia), en anglais : paragraphes, un bouton, la phrase Help, puis en petit
 * « I do not wish to continue » (12/11, Max : plus de « reply STOP »). Le lien d'arrêt des relances
 * reste dans l'en-tête List-Unsubscribe (envoi).
 */
export function rendreEmailRuul(e: EmailRuul): { html: string; texte: string } {
  const paragraphes = e.corps.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // La phrase Help vient après le bouton, juste avant la signature (sauf si le texte la dit déjà).
  const help = e.sansPied || /click Help on your dashboard/i.test(e.corps) ? null : PIED_HELP_EMAIL;
  const arret = e.sansPied ? null : (e.arret ?? lienArret(e.lienStop));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(e.objet)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">${echapper(e.titre ?? "Sophia")}</td></tr>
${paragraphes.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(p).replace(/\n/g, "<br>")}</td></tr>`).join("\n")}
${e.bouton ? `<tr><td style="padding:8px 0 20px"><a href="${echapper(e.bouton.lien)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${echapper(e.bouton.texte)}</a></td></tr>` : ""}
${help ? `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(help)}</td></tr>` : ""}
<tr><td style="font-size:15px;line-height:1.4">The Vik Studios team</td></tr>
${arret ? `<tr><td style="font-size:12px;line-height:1.5;color:#a1a1aa;padding-top:24px;border-top:1px solid #e4e4e7"><a href="${echapper(arret)}" style="color:#a1a1aa">I do not wish to continue</a></td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const texte = [...paragraphes, ...(e.bouton ? [`${e.bouton.texte}: ${e.bouton.lien}`] : []), ...(help ? [help] : []), "The Vik Studios team",
    ...(arret ? [`I do not wish to continue: ${arret}`] : [])].join("\n\n");
  return { html, texte };
}

/** « 26 Oct » : le lundi d'une semaine, pour les messages aux posteurs. */
export function semaineCourte(lundi: string): string {
  const [, m, j] = lundi.split("-").map(Number);
  const mois = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m && j ? `${j} ${mois[m - 1]}` : lundi;
}

/** Une candidature du site, telle que la copie de l'OS la garde (0577). */
export interface CandidatureRuul {
  adulte: boolean | null;
  pays: string | null;
  deux_telephones: boolean | null;
  a_telephone: boolean | null;
  nom: string | null;
  email: string | null;
  reponses: Record<string, string | null | undefined>;
  desinscrit_at: string | null;
}

/**
 * Ce qui manque pour l'acceptation automatique : majeur, pays ouvert,
 * 2 téléphones, réponses complètes. Vide : acceptée sans HM.
 */
export function manquesCandidature(c: CandidatureRuul, paysOuverts: Set<string>): string[] {
  const m: string[] = [];
  if (c.adulte !== true) m.push("majorité non confirmée");
  if (!c.pays) m.push("pays inconnu");
  else if (!paysOuverts.has(c.pays)) m.push(`pays fermé (${c.pays})`);
  if (c.deux_telephones !== true) m.push("pas 2 téléphones");
  const vides = ["pays_actuel", "heures", "tiktok", "contenu"].filter((k) => !String(c.reponses?.[k] ?? "").trim());
  if (!c.nom?.trim() || !c.email?.trim() || c.a_telephone !== true || vides.length) m.push("réponses incomplètes");
  if (c.desinscrit_at) m.push("désinscrit");
  return m;
}

/** Le lundi qui suit une date (AAAA-MM-JJ) : la cohorte d'une candidature acceptée ce jour-là. */
export function lundiSuivant(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  const iso = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - iso));
  return d.toISOString().slice(0, 10);
}

/** Relances de signature : J+1, J+3, J+6 après l'acceptation ; J+7 sans signature : expirée. */
export function etapeSignature(accepteAt: string, relances: number, maintenant = new Date()): 1 | 3 | 6 | "expirer" | null {
  const jours = (maintenant.getTime() - new Date(accepteAt).getTime()) / JOUR;
  if (relances <= 0 && jours >= 1) return jours >= 7 ? "expirer" : 1;
  if (relances === 1 && jours >= 3) return jours >= 7 ? "expirer" : 3;
  if (relances === 2 && jours >= 6) return jours >= 7 ? "expirer" : 6;
  if (relances >= 3 && jours >= 7) return "expirer";
  return null;
}

/** Un texte Slack lisible dans un email : <url|libellé> → « libellé: url », *gras* et _italique_ sans marques. */
export function texteSansSlack(t: string): string {
  return t
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2: $1")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, "$1$2")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, "$1$2")
    .trim();
}

/** 0591 : un posteur Ruul à ajouter dans Ruul (la liste du soir). */
export interface LigneAAjouter {
  poster_id: string;
  nom: string;
  ruul_email: string;
  pays: string | null;
  zone: string | null;
  tarif: number | null;
  /** 0592 : signé (compte OS créé par le site) le… */
  signe_at?: string | null;
}

/**
 * 0592 : l'email du soir (18 h Paris, en français, interne) : les nouveaux
 * signés depuis la veille (nom, email Ruul, pays, tarif), et en bas combien
 * restent à ajouter des jours précédents.
 */
export function emailListeSoir(
  nouveaux: LigneAAjouter[],
  anciens: number,
  lienPage = "https://sophia-marketing-orga.vercel.app/admin/auto/ruul",
): { objet: string; html: string; texte: string } {
  const n = nouveaux.length;
  const objet = `Ruul : ${n} nouveau${n > 1 ? "x" : ""} posteur${n > 1 ? "s" : ""} à ajouter`;
  const cellule = (v: string) => `<td style="padding:6px 10px;border-bottom:1px solid #e4e4e7">${echapper(v)}</td>`;
  const tarif = (l: LigneAAjouter) => (l.tarif != null ? `${l.tarif} $ / semaine` : "?");
  const reste = anciens > 0 ? `Encore à ajouter : ${anciens} des jours précédents.` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(objet)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b;font-size:14px">
<p>Nouveaux posteurs Ruul signés depuis hier, à ajouter dans Ruul (${n}) :</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
<tr style="text-align:left;color:#71717a">${["Nom", "Email Ruul", "Pays", "Tarif"].map((t) => `<th style="padding:6px 10px">${t}</th>`).join("")}</tr>
${nouveaux.map((l) => `<tr>${[l.nom, l.ruul_email, l.pays ?? "?", tarif(l)].map(cellule).join("")}</tr>`).join("\n")}
</table>
${reste ? `<p>${echapper(reste)}</p>\n` : ""}<p>Puis dans l'OS : <a href="${echapper(lienPage)}">Recruitment automation → Ruul</a> → « Marquer ajouté dans Ruul ».</p>
</body></html>`;
  const texte = [
    `Nouveaux posteurs Ruul signés depuis hier, à ajouter dans Ruul (${n}) :`,
    ...nouveaux.map((l) => `- ${l.nom} — ${l.ruul_email} — ${l.pays ?? "?"} — ${tarif(l)}`),
    ...(reste ? [reste] : []),
    `Puis dans l'OS : ${lienPage} → « Marquer ajouté dans Ruul ».`,
  ].join("\n");
  return { objet, html, texte };
}

/**
 * 10/11 : un email envoyé par le site vik-studios-creators.com (os-email, en-tête x-hub-secret).
 * 13/11 : par l'envoi suivi (journal emails_envois, file de réessai si Brevo refuse ou n'a plus de crédit).
 */
export function envoyerEmailSite(
  to: string, objet: string, html: string, texte: string, stop: string, tags: string[], fetchFn: typeof fetch = fetch,
): Promise<ResultatEnvoi> {
  return envoyerSuivi({ to, objet, html, texte, stop, tags }, fetchFn);
}
