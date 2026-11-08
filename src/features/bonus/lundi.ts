import type { LigneBonusLundi } from "./api";

/** 0564 : les frais Upwork ajoutés aux bonus (10 %). */
export const FRAIS_UPWORK = 0.1;
/** Le délai des Comment Masters s'affiche à partir de la période qui suit le 9/11. */
export const DEBUT_DELAIS = "2026-11-09";

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Les lignes qui partiront au clic, leur total et le total frais compris. */
export function totaux(lignes: LigneBonusLundi[]) {
  const aEnvoyer = lignes.filter((l) => l.statut === "a_valider" && !l.envoi_at && Number(l.montant) > 0);
  const total = arrondi(aEnvoyer.reduce((s, l) => s + Number(l.montant), 0));
  return { n: aEnvoyer.length, total, frais: arrondi(total * FRAIS_UPWORK), totalFrais: arrondi(total * (1 + FRAIS_UPWORK)) };
}

/** « 9/11 » */
export function jourMois(iso: string): string {
  const [, m, j] = iso.split("-").map(Number);
  return `${j}/${m}`;
}

/** « médiane 4 h 09 · 36 % en moins de 2 h », seulement après le 9/11. */
export function delaiCm(l: Pick<LigneBonusLundi, "type" | "periode_debut" | "delai_median_min" | "part_moins_2h">): string | null {
  if (l.type !== "comment_master" || l.periode_debut < DEBUT_DELAIS || l.delai_median_min === null) return null;
  const h = Math.floor(l.delai_median_min / 60);
  const min = l.delai_median_min % 60;
  const median = h > 0 ? `${h} h ${String(min).padStart(2, "0")}` : `${min} min`;
  return `médiane ${median} · ${Math.round(Number(l.part_moins_2h ?? 0) * 100)} % en moins de 2 h`;
}

export const LIBELLE_TYPE: Record<LigneBonusLundi["type"], string> = {
  comment_master: "Comment Master",
  parrainage: "Parrainage",
  manuel: "Bonus",
};
