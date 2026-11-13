/**
 * 13/11 (Max) : l'email de rattrapage de la cohorte Ruul du lundi 16/11. Un seul email par
 * personne, personnalisé selon SA situation : les étapes à faire en avant et en gras, celles
 * déjà faites en petit et en gris. Anglais, jamais « bot », « IA », « automatique ».
 */

import { lienArret, PIED_HELP_EMAIL } from "./ruul.ts";

export const FOLLOWS_MIN = 5;

/** Ce que le moteur sait du posteur (ruul_parcours_etat + profil). */
export interface SituationRattrapage {
  prenom: string | null;
  login: string | null;
  handle: string | null;
  ruul_email: string | null;
  connecte: boolean;
  tiktok: boolean;
  warmup_lance: boolean;
  abonnements: number | null;
  slack: boolean;
  /** « It's done » cliqué (ruul_statut pret / paye_1x). */
  ruul_fini: boolean;
  /** Le compte Ruul est « Active » à l'import (connecté, reste la pièce d'identité et la banque). */
  ruul_active: boolean;
}

export interface Etapes {
  connexion: boolean;
  tiktok: boolean;
  warmup: boolean;
  slack: boolean;
  ruul: boolean;
}

export function etapesFaites(s: SituationRattrapage): Etapes {
  return {
    connexion: s.connecte,
    tiktok: s.tiktok,
    warmup: s.warmup_lance && (s.abonnements ?? 0) >= FOLLOWS_MIN,
    slack: s.slack,
    ruul: s.ruul_fini,
  };
}

/** Prêt pour lundi : les 5 étapes faites. Un posteur prêt ne reçoit pas le rattrapage. */
export const estPret = (s: SituationRattrapage) => Object.values(etapesFaites(s)).every(Boolean);

/** « ΚΩΝΣΤΑΝΤΙΝΑ » → « Κωνσταντινα », « ayoub » → « Ayoub » ; un prénom normal ne change pas. */
export function prenomPropre(p: string | null): string {
  const s = (p ?? "").trim().split(/\s+/)[0] ?? "";
  if (!s) return "there";
  const bas = s === s.toLocaleUpperCase() && s !== s.toLocaleLowerCase() ? s.toLocaleLowerCase() : s;
  return bas.charAt(0).toLocaleUpperCase() + bas.slice(1);
}

export interface LiensRattrapage {
  dashboard: string;
  slack: string;
  /** « Get a new password » (page de confirmation, puis le mot de passe s'affiche). */
  motDePasse: string;
  /** [It's done] (Ruul prêt). */
  pret: string;
  /** Lien d'arrêt des relances (?stop=) : le bas de l'email en déduit « I do not wish to continue ». */
  stop: string;
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lien = (url: string, texte: string) => `<a href="${echapper(url)}" style="color:#18181b;font-weight:600">${echapper(texte)}</a>`;
const bouton = (url: string, texte: string) =>
  `<a href="${echapper(url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:8px 14px;border-radius:8px">${echapper(texte)}</a>`;

interface Etape {
  fait: boolean;
  titre: string;
  /** Le détail en HTML (seulement si l'étape est à faire). */
  html: string;
  texte: string;
}

/**
 * L'email. Le mot de passe (toujours 12345678) est écrit en clair à l'étape 1 ; « Get a new
 * password » le remet à 12345678 s'il ne marche pas.
 */
export function emailRattrapage(
  s: SituationRattrapage,
  l: LiensRattrapage,
  o: { motDePasse: string; debut: string; echeance: string },
): { objet: string; html: string; texte: string } {
  const prenom = prenomPropre(s.prenom);
  const f = etapesFaites(s);
  const login = s.login ?? "your @sophia.com login";
  // Max (13/11) : le mot de passe est toujours 12345678 ; le lien ne sert que s'il ne marche pas.
  const mdpHtml = `Your password: <b>${echapper(o.motDePasse)}</b><br><span style="font-size:13px">Doesn't work? ${lien(l.motDePasse, "Get a new password")}</span>`;
  const mdpTexte = `Your password: ${o.motDePasse}\nDoesn't work? Get a new password: ${l.motDePasse}`;
  const ruulHtml = s.ruul_active
    ? `Your Ruul account is connected: just make sure your ID and bank account are done, then click<br><br>${bouton(l.pret, "It's done")}`
    : `Open the invitation email from Ruul (check spam), create your account with <b>${echapper(s.ruul_email ?? "your email")}</b>, verify your ID, add your bank account, then click<br><br>${bouton(l.pret, "It's done")}`;
  const ruulTexte = s.ruul_active
    ? `Your Ruul account is connected: just make sure your ID and bank account are done, then click It's done: ${l.pret}`
    : `Open the invitation email from Ruul (check spam), create your account with ${s.ruul_email ?? "your email"}, verify your ID, add your bank account, then click It's done: ${l.pret}`;
  const handle = s.handle ? `@${s.handle}` : "the exact name shown on your dashboard";

  const etapes: Etape[] = [
    {
      fait: f.connexion,
      titre: "Log in to your dashboard",
      html: `${lien(l.dashboard, l.dashboard)}<br>Your login: <b>${echapper(login)}</b><br>${mdpHtml}`,
      texte: `${l.dashboard}\nYour login: ${login}\n${mdpTexte}`,
    },
    {
      fait: f.tiktok,
      titre: `Create your TikTok account: ${handle}`,
      html: "Use exactly this name.",
      texte: "Use exactly this name.",
    },
    {
      fait: f.warmup,
      titre: "Click “Start warmup” on your dashboard and follow at least 5 accounts",
      html: "Then use TikTok normally (scroll, like) without posting.",
      texte: "Then use TikTok normally (scroll, like) without posting.",
    },
    {
      fait: f.slack,
      titre: "Join Slack",
      html: `${lien(l.slack, "Join Slack")} — use your personal email and your full name.`,
      texte: `${l.slack} — use your personal email and your full name.`,
    },
    { fait: f.ruul, titre: "Get paid through Ruul", html: ruulHtml, texte: ruulTexte },
  ];

  const ligneHtml = (e: Etape, i: number) =>
    e.fait
      ? `<tr><td style="font-size:13px;line-height:1.5;color:#a1a1aa;padding:2px 0 6px">✅ ${i + 1}. ${echapper(e.titre)}</td></tr>`
      : `<tr><td style="font-size:15px;line-height:1.55;padding:6px 0 12px"><b>⬜ ${i + 1}. ${echapper(e.titre)}</b><br><span style="color:#3f3f46">${e.html}</span></td></tr>`;
  const ligneTexte = (e: Etape, i: number) => (e.fait ? `✅ ${i + 1}. ${e.titre} (done)` : `⬜ ${i + 1}. ${e.titre}\n${e.texte}`);

  const objet = `${prenom}, here's what's left before you start on Monday`;
  const intro = `You start posting on ${o.debut}. Here's exactly where you are:`;
  const fin1 = `Deadline: ${o.echeance}. If you're not ready by then, you'll simply start one week later.`;
  const fin2 = "You're paid every Monday for the week you posted (Monday to Sunday).";
  const arret = lienArret(l.stop);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(objet)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">Sophia</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">Hi ${echapper(prenom)},</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(intro)}</td></tr>
${etapes.map(ligneHtml).join("\n")}
<tr><td style="font-size:15px;line-height:1.55;padding:8px 0 12px">${echapper(fin1)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(fin2)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(PIED_HELP_EMAIL)}</td></tr>
<tr><td style="font-size:15px;line-height:1.4">The Vik Studios team</td></tr>
${arret ? `<tr><td style="font-size:12px;line-height:1.5;color:#a1a1aa;padding-top:24px;border-top:1px solid #e4e4e7"><a href="${echapper(arret)}" style="color:#a1a1aa">I do not wish to continue</a></td></tr>` : ""}
</table></td></tr></table></body></html>`;

  const texte = [`Hi ${prenom},`, intro, ...etapes.map(ligneTexte), fin1, fin2, PIED_HELP_EMAIL, "The Vik Studios team",
    ...(arret ? [`I do not wish to continue: ${arret}`] : [])].join("\n\n");
  return { objet, html, texte };
}
