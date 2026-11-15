/** 6/11 : le bandeau « Cohérence : ✅ X/12 », le même sur Problèmes et Weekly decisions. */
export interface ResumeCoherence {
  at: string | null;
  par_regle: Record<string, number>;
  ok: number;
  corriges: number;
  groupes: Record<string, { problemes: number; decisions: number }>;
}

export const TITRES_REGLES: Record<number, string> = {
  1: "Posteur tué ou kill prévu encore relancé, avec des posts ou dans le financement",
  2: "Posteur reporté qui reçoit déjà des messages ou des posts",
  3: "Plusieurs cartes ou décisions sur le même sujet",
  4: "Décision rangée ailleurs que dans Weekly decisions",
  5: "Message sans réponse ni carte depuis plus de 24 h",
  6: "Compte actif sans post aujourd'hui, ou 0 post à 19 h sans carte",
  7: "Contrat VIk : posteur, HM, tarif ou jalon manquant",
  8: "Contrat fermé avec fiche active (ou l'inverse)",
  9: "Action sur Calyra",
  10: "STOP sans décision de kill dans l'heure",
  11: "Doubles comptes : décisions incohérentes",
  12: "Message attribué au mauvais auteur",
};

export const GROUPES_COHERENCE: { cle: string; nom: string }[] = [
  { cle: "onboarding", nom: "Onboarding" },
  { cle: "nouveaux_actifs", nom: "Nouveaux actifs" },
  { cle: "actifs", nom: "Actifs" },
];

/** Les règles en défaut, de la plus grave (le plus de cas) à la moins grave. */
export function reglesEnDefaut(r: Pick<ResumeCoherence, "par_regle"> | null | undefined): { regle: number; n: number; titre: string }[] {
  return Object.entries(r?.par_regle ?? {})
    .map(([k, n]) => ({ regle: Number(k), n: Number(n) || 0, titre: TITRES_REGLES[Number(k)] ?? `Règle ${k}` }))
    .filter((x) => x.n > 0 && x.regle >= 1 && x.regle <= 12)
    .sort((a, b) => b.n - a.n || a.regle - b.regle);
}

/** « Cohérence : ✅ 12/12 » ou « Cohérence : ⚠️ 3/12 ». */
export function texteBandeau(r: Pick<ResumeCoherence, "ok"> | null | undefined): string {
  const ok = Math.max(0, Math.min(12, r?.ok ?? 0));
  return `Cohérence : ${ok === 12 ? "✅" : "⚠️"} ${ok}/12`;
}

/** Le dernier contrôle a plus de 2 h : le cron ne tourne plus. */
export function controleEnRetard(at: string | null | undefined, maintenant = Date.now()): boolean {
  if (!at) return true;
  return maintenant - new Date(at).getTime() > 2 * 3600_000;
}
