/**
 * Les bonus (0374) : lundis bonus, totaux, « Bonus à venir », et la recrue la
 * plus probable d'un parrainage. Rien ici ne touche la base.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { BonusAVenir, LigneBonus } from "./api";

/** Le premier lundi bonus à partir de `jour` (compris) : toutes les 4 semaines depuis le premier. */
export function prochainLundiBonus(jour: string, premierLundi: string): string {
  const ecart = Math.round((Date.parse(`${jour}T12:00:00Z`) - Date.parse(`${premierLundi}T12:00:00Z`)) / 86_400_000);
  return ajouterJours(premierLundi, 28 * Math.max(0, Math.ceil(ecart / 28)));
}

/**
 * Les lundis bonus au choix, celui à payer d'abord : le dernier lundi bonus
 * passé (ou aujourd'hui), puis le prochain, puis les précédents. Avant le
 * premier lundi bonus, seulement lui.
 */
export function lundisBonus(aujourdhui: string, premierLundi: string, precedents = 4): string[] {
  const prochain = prochainLundiBonus(aujourdhui, premierLundi);
  const dernier = prochain === aujourdhui ? prochain : ajouterJours(prochain, -28);
  if (dernier < premierLundi) return [prochain];
  const passes = Array.from({ length: precedents + 1 }, (_, i) => ajouterJours(dernier, -28 * i)).filter(
    (l) => l >= premierLundi,
  );
  return [...new Set([passes[0]!, prochain, ...passes.slice(1)])];
}

export function totauxBonus(lignes: LigneBonus[]) {
  const somme = (f: (l: LigneBonus) => boolean) =>
    Math.round(lignes.filter(f).reduce((n, l) => n + l.montant, 0) * 100) / 100;
  return {
    total: somme(() => true),
    aPayer: somme((l) => l.statut === "a_payer"),
    aVoir: lignes.filter((l) => l.statut === "a_voir").length,
    payes: lignes.filter((l) => l.statut === "paye").length,
  };
}

export interface GroupeAVenir {
  lundi: string;
  lignes: BonusAVenir[];
  total: number;
}

/** « Bonus à venir », par lundi bonus : les lignes à payer puis l'estimation de la période en cours. */
export function grouperAVenir(b: BonusAVenir[]): GroupeAVenir[] {
  const parLundi = new Map<string, BonusAVenir[]>();
  for (const x of b) parLundi.set(x.lundi_bonus, [...(parLundi.get(x.lundi_bonus) ?? []), x]);
  return [...parLundi.entries()]
    .sort(([a], [z]) => a.localeCompare(z))
    .map(([lundi, lignes]) => ({
      lundi,
      lignes: [...lignes].sort((a, z) => z.montant - a.montant),
      total: Math.round(lignes.reduce((n, l) => n + l.montant, 0) * 100) / 100,
    }));
}

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La recrue proposée pour un parrainage : le posteur qui porte le même prénom
 * et nom (sans accents ni majuscules). L'admin confirme : rien n'est relié
 * tout seul.
 */
export function recrueProbable<T extends { id: string; prenom: string | null; nom: string | null }>(
  r: { prenom: string; nom: string | null },
  posteurs: T[],
): T | null {
  const cible = normaliser([r.prenom, r.nom].filter(Boolean).join(" "));
  if (!cible) return null;
  const memes = posteurs.filter((p) => normaliser([p.prenom, p.nom].filter(Boolean).join(" ")) === cible);
  return memes.length === 1 ? memes[0]! : null;
}
