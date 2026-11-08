/**
 * 0564 : les bonus du lundi. La note Upwork de chaque ligne (en anglais, vue
 * par le posteur) et le « bonus en une phrase » (champ « Donner un bonus » de
 * la carte, commande Slack /bonus), partagés par le front et les fonctions.
 */

const MOIS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface LigneNote {
  type: string;
  quantite: number | null;
  periode_fin: string | null;
  raison: string | null;
  prenom_filleul?: string | null;
}

/** « Comment Masters bonus (until Nov 8): 49 comments ». */
export function noteBonus(b: LigneNote): string {
  if (b.type === "comment_master") {
    const [, m, j] = String(b.periode_fin ?? "").split("-").map(Number);
    const jusqua = m && j ? ` (until ${MOIS_EN[m - 1]} ${j})` : "";
    return `Comment Masters bonus${jusqua}: ${b.quantite ?? 0} comments`;
  }
  if (b.type === "parrainage") {
    return `Referral bonus: thank you for bringing ${String(b.prenom_filleul ?? "").trim() || "your friend"} to the team!`;
  }
  return `Bonus: ${String(b.raison ?? "").trim() || "thank you"}`;
}

export interface BonusPhrase {
  montant: number;
  nom: string;
  /** Un lundi précis (AAAA-MM-JJ), ou null : le prochain lundi. */
  lundi: string | null;
  raison: string;
}

const DATE_COURTE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

/**
 * « donne 2 $ de bonus à Martin Befeld lundi, raison test »,
 * « give $5 bonus to Martin Befeld monday 16/11 reason great week ».
 * `annee` : l'année d'une date sans année.
 */
export function lirePhraseBonus(phrase: string, annee: number): BonusPhrase | { erreur: string } {
  const p = phrase.replace(/\s+/g, " ").trim();
  const m = p.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:\$|usd|dollars?)/i) ?? p.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return { erreur: "montant introuvable (ex. « 2 $ »)" };
  const montant = Number(m[1].replace(",", "."));
  if (!(montant > 0)) return { erreur: "montant introuvable (ex. « 2 $ »)" };

  const r = p.match(/(?:,|\s)\s*(?:raison|reason|motif|pour|for)\b\s*[:：]?\s*(.+)$/i);
  const raison = r ? r[1].trim() : "";
  const avantRaison = r ? p.slice(0, r.index) : p;

  // Le dernier « à » / « to » de la phrase (« give a bonus of $5 to X » : pas le « a »).
  const reperes = [...avantRaison.matchAll(/(?:^|\s)(?:à|a|to)\s+/gi)];
  const dernier = reperes[reperes.length - 1];
  if (!dernier || dernier.index === undefined) return { erreur: "nom introuvable (ex. « à Martin Befeld »)" };
  let nom = avantRaison.slice(dernier.index + dernier[0].length);
  const coupe = nom.search(/\s+(?:lundi|monday|le\s+\d|on\s+\d|\d{1,2}\/\d{1,2})|,/i);
  if (coupe >= 0) nom = nom.slice(0, coupe);
  nom = nom.replace(/[.,;:!?]+$/, "").trim();
  if (nom.length < 3) return { erreur: "nom introuvable (ex. « à Martin Befeld »)" };

  // Une date « 16/11 » : ce lundi-là ; sinon (« lundi », rien) : le prochain lundi.
  let lundi: string | null = null;
  const d = avantRaison.match(DATE_COURTE);
  if (d) {
    const a = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : annee;
    lundi = `${a}-${String(Number(d[2])).padStart(2, "0")}-${String(Number(d[1])).padStart(2, "0")}`;
  }
  return { montant: Math.round(montant * 100) / 100, nom, lundi, raison: raison || "bonus" };
}
