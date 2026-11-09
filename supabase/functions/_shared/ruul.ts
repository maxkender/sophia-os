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
}

/** Un email simple (Sophia), en anglais : paragraphes, un bouton, le lien « Unsubscribe ». */
export function rendreEmailRuul(e: EmailRuul): { html: string; texte: string } {
  const paragraphes = e.corps.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(e.objet)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">Sophia</td></tr>
${paragraphes.map((p) => `<tr><td style="font-size:15px;line-height:1.55;padding-bottom:12px">${echapper(p).replace(/\n/g, "<br>")}</td></tr>`).join("\n")}
${e.bouton ? `<tr><td style="padding:8px 0 20px"><a href="${echapper(e.bouton.lien)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${echapper(e.bouton.texte)}</a></td></tr>` : ""}
<tr><td style="font-size:15px;line-height:1.4">The Sophia team</td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#71717a;padding-top:24px;border-top:1px solid #e4e4e7">You can also reply STOP. <a href="${echapper(e.lienStop)}" style="color:#71717a">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  const texte = [...paragraphes, ...(e.bouton ? [`${e.bouton.texte}: ${e.bouton.lien}`] : []), "The Sophia team", `Unsubscribe: ${e.lienStop}`].join("\n\n");
  return { html, texte };
}

/** « 26 Oct » : le lundi d'une semaine, pour les messages aux posteurs. */
export function semaineCourte(lundi: string): string {
  const [, m, j] = lundi.split("-").map(Number);
  const mois = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m && j ? `${j} ${mois[m - 1]}` : lundi;
}
