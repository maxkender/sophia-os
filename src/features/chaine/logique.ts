/**
 * Décisions pures de la page Traduction & placement : quel prompt la
 * traduction lit pour une langue, et l'ordre de la liste des langues.
 * Même règle que le moteur (`traduireBaseDeck`, import_contenu.ts) : le
 * prompt dédié `traduction_<langue>` s'il existe, sinon le prompt générique
 * `traduction` pour le français seul, sinon les règles neutres du code.
 */

export type SourcePrompt = "dedie" | "generique" | "neutre";

/** La clé du prompt que la langue lit, et d'où il vient. */
export function promptDeLangue(langue: string, clesExistantes: ReadonlySet<string>): { cle: string; source: SourcePrompt } {
  const dediee = `traduction_${langue}`;
  if (clesExistantes.has(dediee)) return { cle: dediee, source: "dedie" };
  if (langue === "fr") return { cle: "traduction", source: clesExistantes.has("traduction") ? "generique" : "neutre" };
  return { cle: dediee, source: "neutre" };
}

export interface LigneLangue {
  code: string;
  comptes: number;
  relecteurs: number;
  source: SourcePrompt;
  cle: string;
  maj: string | null;
  longueur: number;
}

/**
 * Les langues de la page : celles qui ont des comptes actifs d'abord, par
 * nombre de comptes décroissant, puis les autres par nom. `recherche` filtre
 * sur le code ou le nom.
 */
export function lignesLangues(
  codes: readonly string[],
  nom: (code: string) => string,
  comptes: Record<string, number>,
  relecteurs: Record<string, number>,
  prompts: ReadonlyArray<{ cle: string; updated_at: string; longueur: number }>,
  recherche = "",
): LigneLangue[] {
  const parCle = new Map(prompts.map((p) => [p.cle, p]));
  const cles = new Set(parCle.keys());
  const q = recherche.trim().toLowerCase();
  return codes
    .map((code) => {
      const { cle, source } = promptDeLangue(code, cles);
      const meta = source === "neutre" ? null : parCle.get(cle) ?? null;
      return {
        code,
        comptes: comptes[code.toLowerCase()] ?? 0,
        relecteurs: relecteurs[code.toLowerCase()] ?? 0,
        source,
        cle,
        maj: meta?.updated_at ?? null,
        longueur: meta?.longueur ?? 0,
      };
    })
    .filter((l) => !q || l.code.toLowerCase().includes(q) || nom(l.code).toLowerCase().includes(q))
    .sort((a, b) => b.comptes - a.comptes || nom(a.code).localeCompare(nom(b.code), "fr"));
}
