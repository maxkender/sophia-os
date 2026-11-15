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
  /** Le nom tel qu'écrit après « à » / « to » (indicatif : la personne est cherchée dans `texteNom`). */
  nom: string;
  /** Le texte où chercher la personne : la phrase sans la raison explicite (0571). */
  texteNom: string;
  /** Un lundi précis (AAAA-MM-JJ), ou null : le prochain lundi. */
  lundi: string | null;
  /** La raison écrite après « raison », « reason », « car »… (vide sinon). */
  raison: string;
  /** Le texte après le dernier « pour » / « for » : la raison, sauf si c'est la personne. */
  apresPour: string | null;
}

const cle = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "");

/** Les mots qui ne sont jamais un nom (la même liste que bonus_personnes_proches, 0571). */
const MOTS_COURANTS = new Set(
  ("donne donner donnez ajoute ajouter mets mettre envoie envoyer paye payer give send add pay bonus bonuses prime de du des le la les un une " +
    "au aux et en pour par sur avec ce cette son sa ses lui elle il to for of the an and on his her their lundi monday prochain prochaine " +
    "next semaine week raison reason motif because car parce que dollar dollars usd euro euros merci thanks svp please stp bravo super top " +
    "balles bucks").split(" "),
);

const DATE_COURTE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const DEVISE = "(?:\\$|usd|dollars?|balles|bucks|€|euros?)";

/** Le montant : « 15 $ », « $15 », « 15 dollars », « 15 balles », ou le seul nombre de la phrase. */
function lireMontant(p: string): number | null {
  const avec = p.match(new RegExp(`(\\d+(?:[.,]\\d{1,2})?)\\s*${DEVISE}`, "i")) ?? p.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
  if (avec) return Number(avec[1].replace(",", "."));
  const sansDate = p.replace(new RegExp(DATE_COURTE.source, "g"), " ");
  const nombres = [...sansDate.matchAll(/(?:^|[^\d.,])(\d+(?:[.,]\d{1,2})?)(?![\d/])/g)].map((m) => m[1]);
  return nombres.length === 1 ? Number(nombres[0].replace(",", ".")) : null;
}

/**
 * N'importe quelle phrase : « donne 2 $ de bonus à Martin Befeld lundi, raison test »,
 * « 15$ à bogdan kugcas », « Bogdan a bien bossé, mets lui 15 balles »,
 * « give $5 to Jane monday 16/11 because great week ». La personne n'est pas
 * décidée ici : la page (ou /bonus) cherche les plus proches dans `texteNom`
 * (bonus_personnes_proches, 0571). `annee` : l'année d'une date sans année.
 */
export function lirePhraseBonus(phrase: string, annee: number): BonusPhrase | { erreur: string } {
  const p = phrase.replace(/\s+/g, " ").trim();
  const montant = lireMontant(p);
  if (montant === null || !(montant > 0)) return { erreur: "montant introuvable (ex. « 15 $ »)" };

  const r = p.match(/(?:^|[\s,;.])(?:raison|reason|motif|because|parce qu['e]|car|vu qu['e])\s*[:：]?\s*(.+)$/i);
  const raison = r ? r[1].trim() : "";
  const texteNom = (r ? p.slice(0, r.index) : p).trim();
  const motsNom = texteNom.split(/[\s,;:!?()«»"/]+/).map(cle).filter((m) => m.length >= 2 && !MOTS_COURANTS.has(m));
  if (motsNom.length === 0) return { erreur: "nom introuvable (ex. « à Martin Befeld »)" };

  const pours = [...texteNom.matchAll(/(?:^|\s)(?:pour|for)\s+/gi)];
  const pour = pours[pours.length - 1];
  const apresPour = pour && pour.index !== undefined
    ? texteNom.slice(pour.index + pour[0].length).replace(/[.,;:!?]+$/, "").trim() || null
    : null;

  // Le dernier « à » / « to » (indicatif ; « give a bonus of $5 to X » : pas le « a »).
  const reperes = [...texteNom.matchAll(/(?:^|\s)(?:à|a|to)\s+/gi)];
  const dernier = reperes[reperes.length - 1];
  let nom = dernier && dernier.index !== undefined ? texteNom.slice(dernier.index + dernier[0].length) : "";
  const coupe = nom.search(/\s+(?:lundi|monday|le\s+\d|on\s+\d|\d{1,2}\/\d{1,2}|pour|for)\b|,/i);
  if (coupe >= 0) nom = nom.slice(0, coupe);
  nom = nom.replace(/[.,;:!?]+$/, "").trim();

  // Une date « 16/11 » : ce lundi-là ; sinon (« lundi », rien) : le prochain lundi.
  let lundi: string | null = null;
  const d = texteNom.match(DATE_COURTE);
  if (d) {
    const a = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : annee;
    lundi = `${a}-${String(Number(d[2])).padStart(2, "0")}-${String(Number(d[1])).padStart(2, "0")}`;
  }
  return { montant: Math.round(montant * 100) / 100, nom, texteNom, lundi, raison, apresPour };
}

/**
 * La raison retenue, une fois la personne choisie : la raison explicite, sinon
 * le texte après « pour » s'il ne désigne pas la personne (« 15 $ pour Bogdan »),
 * sinon « bonus ».
 */
export function raisonBonus(lu: Pick<BonusPhrase, "raison" | "apresPour">, nomPersonne: string): string {
  if (lu.raison) return lu.raison;
  if (lu.apresPour) {
    const mots = nomPersonne.split(/\s+/).map(cle).filter((m) => m.length >= 2);
    const designe = lu.apresPour.split(/\s+/).map(cle).some((m) => m.length >= 3 && mots.some((n) => n.startsWith(m) || m.startsWith(n)));
    if (!designe) return lu.apresPour;
  }
  return "bonus";
}

/** Une personne proposée par bonus_personnes_proches (0571). */
export interface PersonneProche {
  id: string;
  nom: string;
  actif: boolean;
  score: number;
  exact: boolean;
}

/** La personne prise sans demander : un seul nom exact. Sinon null (la page propose les plus proches). */
export function personneSure(liste: PersonneProche[]): PersonneProche | null {
  const exacts = liste.filter((x) => x.exact);
  return exacts.length === 1 ? exacts[0] : null;
}
