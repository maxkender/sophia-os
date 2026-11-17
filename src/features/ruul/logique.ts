import type { LigneLot } from "./api";

/** Les libellés des statuts Ruul. */
export const LIBELLE_STATUT: Record<string, string> = {
  a_ajouter: "À ajouter sur Ruul",
  invite: "Invité (compte à créer)",
  pret: "Prêt",
  paye_1x: "Payé au moins 1 fois",
  aucun: "Sans statut",
};

/** « 26/10 » */
export function jourMois(iso: string): string {
  const [, m, j] = iso.split("-").map(Number);
  return m && j ? `${j}/${m}` : iso;
}

export const dollars = (n: number) => `${Number(n).toFixed(2)} $`;

const MOIS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** « Vik Studios — week of Nov 16 : 14 posts + 10 $ bonus » (la même phrase que l'envoi par l'API). */
export function descriptionLigneRuul(lundi: string, posts: number, bonus: number): string {
  const [, m, j] = lundi.split("-").map(Number);
  const b = bonus > 0 ? ` + ${Math.round(bonus * 100) / 100} $ bonus` : "";
  return `Vik Studios — week of ${MOIS_EN[(m ?? 1) - 1]} ${j} : ${posts} post${posts === 1 ? "" : "s"}${b}`;
}

/** Le CSV de secours au format Ruul (email, description, amount, currency) : les lignes READY et validées. */
export function lignesCsvRuul(semaine: string, lignes: LigneLot[]): (string | number)[][] {
  return lignes
    .filter((l) => l.ruul_email && l.ruul_onboarding === "READY" && l.valide !== false && Number(l.total) >= 1)
    .map((l) => [
      l.ruul_email!.trim().toLowerCase(),
      descriptionLigneRuul(semaine, l.semaines.reduce((t, s) => t + Number(s.faits ?? 0), 0), Number(l.bonus ?? 0)),
      Number(l.total).toFixed(2),
      "USD",
    ]);
}

/** Le CSV du lot pour Ruul : une ligne par posteur. */
export function lignesCsvLot(lignes: LigneLot[]): (string | number)[][] {
  return lignes.map((l) => [
    l.nom,
    l.ruul_email ?? "",
    l.semaines.map((s) => jourMois(s.semaine) + (s.rattrapage ? " (rattrapage)" : "")).join(" + "),
    Number(l.total).toFixed(2),
  ]);
}

/**
 * L'export Ruul (CSV) : la colonne email et la colonne montant, trouvées par
 * leur en-tête (email / e-mail ; amount / montant / total / paid). Séparateur
 * « , » ou « ; », guillemets gérés.
 */
export function lireExportRuul(texte: string): { email: string; montant: string }[] | { erreur: string } {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return { erreur: "fichier vide" };
  const sep = (lignes[0].match(/;/g) ?? []).length > (lignes[0].match(/,/g) ?? []).length ? ";" : ",";
  const decouper = (l: string) => {
    const cases: string[] = [];
    let cur = "";
    let guill = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (guill && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else guill = !guill;
      } else if (c === sep && !guill) {
        cases.push(cur);
        cur = "";
      } else cur += c;
    }
    cases.push(cur);
    return cases.map((x) => x.trim());
  };
  const entetes = decouper(lignes[0]).map((h) => h.toLowerCase());
  const iEmail = entetes.findIndex((h) => /e-?mail/.test(h));
  const iMontant = entetes.findIndex((h) => /amount|montant|total|paid/.test(h));
  if (iEmail < 0 || iMontant < 0) return { erreur: "colonnes email et montant introuvables" };
  return lignes.slice(1).map(decouper)
    .filter((c) => c[iEmail])
    .map((c) => ({ email: c[iEmail], montant: (c[iMontant] ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".") }));
}

/** Les étapes d'un posteur Ruul, dans l'ordre (page Cohortes Ruul). */
export const ETAPES_RUUL: { cle: string; libelle: string }[] = [
  { cle: "candidature", libelle: "Candidature" },
  { cle: "acceptee", libelle: "Acceptée" },
  { cle: "signee", libelle: "Signée" },
  { cle: "ajoute_ruul", libelle: "Ajouté Ruul" },
  { cle: "pret", libelle: "Prêt Ruul" },
  { cle: "slack", libelle: "Slack" },
  { cle: "os", libelle: "OS connecté" },
  { cle: "warmup", libelle: "Warm-up" },
  { cle: "premier_post", libelle: "1er post" },
  { cle: "premiere_paie", libelle: "1re paie" },
];

/**
 * L'étape bloquée : la première étape pas faite, si la précédente est faite
 * depuis plus de 48 h (en rouge). null : rien de bloqué.
 */
export function etapeBloquee(etapes: Record<string, string | null>, maintenant = new Date()): string | null {
  for (let i = 1; i < ETAPES_RUUL.length; i++) {
    const cle = ETAPES_RUUL[i].cle;
    if (etapes[cle]) continue;
    const avant = etapes[ETAPES_RUUL[i - 1].cle];
    if (avant && maintenant.getTime() - new Date(avant).getTime() > 48 * 3_600_000) return cle;
    return null;
  }
  return null;
}
