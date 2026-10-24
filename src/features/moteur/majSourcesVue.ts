/**
 * Ce que montre le panneau « Mettre à jour les sources » : quelles sources
 * proposer, où en est chacune dans la séquence serveur, et ce qu'elle a donné.
 *
 * La séquence (`reglages.maj_sources_run`, `_shared/maj_sources.ts`) ne garde
 * qu'un index et un journal. Ce module en déduit un statut PAR SOURCE pour que
 * l'import se lise sans ouvrir le journal : terminé, en cours d'import, en
 * attente. Module pur, testé.
 */
import type { MajCompte, MajSourcesRun } from "./majSequentielle";
import type { CompteReference } from "./types";

/** Une source se met à jour si elle est active, déjà extraite une fois, et a une langue. */
export function sourcesMettables(sources: readonly CompteReference[]): CompteReference[] {
  return sources
    .filter((s) => s.is_active && s.dernier_scrape_at && s.langue)
    .sort((a, b) => (a.dernier_scrape_at ?? "").localeCompare(b.dernier_scrape_at ?? ""));
}

/** Jours entiers depuis une date ISO (0 = aujourd'hui), `null` sans date. */
export function joursDepuis(iso: string | null | undefined, maintenant: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((maintenant - t) / 86_400_000));
}

/** Ce que la mise à jour d'une source a donné, lu dans le journal du serveur. */
export interface ResultatSource {
  /** Slideshows vus sur le profil. */
  profil: number | null;
  /** Déjà en stock, pas réimportés. */
  enStock: number | null;
  manquants: number | null;
  /** Envoyés à l'import. */
  enfilees: number;
  echec: boolean;
}

function nombre(detail: string, motif: RegExp): number | null {
  const m = detail.match(motif);
  return m ? Number(m[1]) : null;
}

/**
 * Le dernier bilan de chaque source dans le journal. Le serveur écrit, après
 * le listing d'un compte, « [i/n] @handle — N slideshow(s) enfilé(s) » (ou
 * « rien à rattraper », « échec ») avec le détail
 * « profil=X · déjà en stock=Y · manquants=Z » puis « enfilées=E ».
 */
export function resultatsDuJournal(run: MajSourcesRun | null): Map<string, ResultatSource> {
  const out = new Map<string, ResultatSource>();
  for (const l of run?.journal ?? []) {
    const m = l.message.match(/@([^\s]+) — (.+)$/);
    if (!m) continue;
    const [, handle, suite] = m;
    const echec = suite.startsWith("échec");
    const rien = suite.startsWith("rien à rattraper");
    const enfile = /slideshow\(s\) enfilé/.test(suite);
    if (!echec && !rien && !enfile) continue;
    const d = l.detail ?? "";
    out.set(handle, {
      profil: nombre(d, /profil=(\d+)/),
      enStock: nombre(d, /déjà en stock=(\d+)/),
      manquants: nombre(d, /manquants=(\d+)/),
      enfilees: nombre(d, /enfilées=(\d+)/) ?? (rien || echec ? 0 : Number(suite.match(/^(\d+)/)?.[1] ?? 0)),
      echec,
    });
  }
  return out;
}

export type StatutSource =
  /** Ses slideshows sont importés (ou il n'y avait rien à rattraper). */
  | "fait"
  /** Ses slideshows manquants sont dans la file d'import, qui se vide. */
  | "file"
  /** Le serveur cherche les slideshows manquants de son profil. */
  | "liste"
  /** Pas encore son tour. */
  | "attente"
  /** La séquence a été arrêtée avant son tour. */
  | "annule"
  /** La file d'import s'est figée pendant son tour : séquence stoppée. */
  | "bloquee";

export interface SuiviSource {
  compte: MajCompte;
  /** Rang dans la séquence, à partir de 1. */
  rang: number;
  statut: StatutSource;
  resultat: ResultatSource | null;
}

/**
 * Statut de chaque source de la séquence. `index` est la prochaine source à
 * enfiler : celles d'avant sont passées, la dernière passée (index − 1) est
 * celle dont la file se vide tant que la phase est « attente ».
 */
export function suiviParSource(run: MajSourcesRun | null): SuiviSource[] {
  if (!run) return [];
  const resultats = resultatsDuJournal(run);
  return run.comptes.map((compte, i): SuiviSource => {
    const base = { compte, rang: i + 1, resultat: resultats.get(compte.handle) ?? null };
    if (run.statut === "done") return { ...base, statut: "fait" };
    const courante = i === run.index - 1;
    if (i < run.index - 1) return { ...base, statut: "fait" };
    if (courante) {
      if (run.statut === "bloquee") return { ...base, statut: "bloquee" };
      if (run.phase === "attente" && run.statut === "running") return { ...base, statut: "file" };
      return { ...base, statut: "fait" };
    }
    // i >= index : pas encore enfilée.
    if (run.statut === "cancelled" || run.statut === "bloquee") return { ...base, statut: "annule" };
    if (i === run.index && run.phase === "import" && run.handle === compte.handle) {
      return { ...base, statut: "liste" };
    }
    return { ...base, statut: "attente" };
  });
}

/**
 * Quand la séquence a bougé pour la dernière fois (dernière ligne du journal).
 * Le panneau garde la dernière séquence affichée, même vieille de deux mois :
 * sans cette date, son bilan se lit comme s'il venait d'arriver.
 */
export function finDuRun(run: MajSourcesRun | null): string | null {
  const journal = run?.journal ?? [];
  const derniere = journal[journal.length - 1]?.at;
  return derniere && Number.isFinite(Date.parse(derniere)) ? derniere : null;
}

/** Slideshows envoyés à l'import sur toute la séquence. */
export function totalEnfilees(suivi: readonly SuiviSource[]): number {
  return suivi.reduce((n, s) => n + (s.resultat?.enfilees ?? 0), 0);
}
