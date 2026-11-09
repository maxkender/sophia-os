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
