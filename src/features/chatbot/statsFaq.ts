/**
 * Les chiffres de la page Assistant, calculés sur le journal des questions
 * (`listerFaqJournal`). Purs, pour être testés sans rendu.
 */
import type { EtatFaq } from "./faq";

/** Ce que le bot a fait d'une question, en cinq issues lisibles. */
export const ISSUES = ["repondu", "traite", "a_traiter", "bug", "hors_sujet"] as const;
export type Issue = (typeof ISSUES)[number];

/** L'issue d'un état ; `null` pour une question d'avant le cerveau (ancien assistant). */
export function issueDe(etat: EtatFaq | null): Issue | null {
  switch (etat) {
    case "repondu":
      return "repondu";
    case "a_valider":
    case "a_traiter":
    case "relance":
      return "a_traiter";
    case "bug":
      return "bug";
    case "traite_admin":
    case "traite_slack":
    case "ignore":
      return "traite";
    case "hors_sujet":
      return "hors_sujet";
    default:
      return null;
  }
}

/** Le jour d'une date, à Paris (YYYY-MM-DD), comme le reste de l'OS. */
export function jourParis(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

function decalerJour(jour: string, delta: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface QuestionStat {
  etat: EtatFaq | null;
  created_at: string;
  section_guide: string | null;
  it_statut: "pris_en_charge" | "repondu" | null;
}

export interface StatsFaq {
  /** Questions des 7 derniers jours (aujourd'hui compris), puis des 7 d'avant. */
  semaine: number;
  semaineAvant: number;
  /** Les issues des 7 derniers jours. */
  parIssue: Record<Issue, number>;
  /** Part réglée par le bot seul, hors « pas une question » et hors ancien assistant ; `null` sans question. */
  tauxBot: number | null;
  /** Les vraies questions de la semaine : la base du taux. */
  vraiesQuestions: number;
  bugs: { total: number; regles: number; enCours: number };
  /** Questions par jour sur 14 jours, aujourd'hui compris. */
  parJour: Array<{ jour: string; n: number }>;
  /** Sections du guide citées sur 30 jours, de la plus demandée à la moins demandée. */
  sujets: Array<{ section: string; n: number }>;
  /**
   * Le journal est plafonné : s'il est plein et que sa plus vieille question
   * tombe dans la fenêtre des 14 jours, les chiffres en sous-estiment le volume.
   */
  tronque: boolean;
}

export function statsFaq(
  questions: ReadonlyArray<QuestionStat>,
  maintenant: Date,
  plafond: number,
): StatsFaq {
  const auj = jourParis(maintenant);
  const debutSemaine = decalerJour(auj, -6);
  const debutAvant = decalerJour(auj, -13);
  const debutSujets = decalerJour(auj, -29);

  const parIssue = Object.fromEntries(ISSUES.map((i) => [i, 0])) as Record<Issue, number>;
  const parJour = new Map<string, number>();
  for (let j = debutAvant; j <= auj; j = decalerJour(j, 1)) parJour.set(j, 0);
  const sujets = new Map<string, number>();
  let semaine = 0;
  let semaineAvant = 0;
  const bugs = { total: 0, regles: 0, enCours: 0 };
  let plusVieux: string | null = null;

  for (const q of questions) {
    const jour = jourParis(q.created_at);
    if (!plusVieux || jour < plusVieux) plusVieux = jour;
    if (parJour.has(jour)) parJour.set(jour, parJour.get(jour)! + 1);
    if (jour >= debutSujets && q.section_guide) {
      sujets.set(q.section_guide, (sujets.get(q.section_guide) ?? 0) + 1);
    }
    if (jour < debutAvant) continue;
    if (jour < debutSemaine) {
      semaineAvant += 1;
      continue;
    }
    semaine += 1;
    const issue = issueDe(q.etat);
    if (issue) parIssue[issue] += 1;
    if (issue === "bug") {
      bugs.total += 1;
      if (q.it_statut === "repondu") bugs.regles += 1;
      else if (q.it_statut === "pris_en_charge") bugs.enCours += 1;
    }
  }

  const vraiesQuestions = ISSUES.filter((i) => i !== "hors_sujet").reduce((n, i) => n + parIssue[i], 0);
  return {
    semaine,
    semaineAvant,
    parIssue,
    tauxBot: vraiesQuestions > 0 ? parIssue.repondu / vraiesQuestions : null,
    vraiesQuestions,
    bugs,
    parJour: [...parJour.entries()].map(([jour, n]) => ({ jour, n })),
    sujets: [...sujets.entries()]
      .map(([section, n]) => ({ section, n }))
      .sort((a, b) => b.n - a.n || a.section.localeCompare(b.section)),
    tronque: questions.length >= plafond && plusVieux !== null && plusVieux >= debutAvant,
  };
}

/** « Poster Guide › Quick answers › Musique » → « Musique » : les derniers niveaux disent le sujet. */
export function sujetCourt(section: string, niveaux = 1): string {
  const morceaux = section.split("›").map((m) => m.trim()).filter(Boolean);
  return morceaux.length ? morceaux.slice(-niveaux).join(" › ") : section;
}

/**
 * Le nom court de chaque section d'une liste. Deux sections de guides
 * différents peuvent finir pareil (« Planning » côté poster et côté manager) :
 * celles-là gardent un niveau de plus pour qu'on les distingue.
 */
export function nomsCourts(sections: readonly string[]): Map<string, string> {
  const parFeuille = new Map<string, number>();
  for (const s of new Set(sections)) parFeuille.set(sujetCourt(s), (parFeuille.get(sujetCourt(s)) ?? 0) + 1);
  return new Map(
    sections.map((s) => [s, (parFeuille.get(sujetCourt(s)) ?? 0) > 1 ? sujetCourt(s, 2) : sujetCourt(s)]),
  );
}

/** « il y a 3 h », « il y a 2 j » : l'âge d'une date, dans la langue de l'interface. */
export function ilYA(iso: string, langue: string, maintenant: Date = new Date()): string {
  const secondes = Math.round((new Date(iso).getTime() - maintenant.getTime()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(langue.startsWith("en") ? "en" : langue, { numeric: "auto", style: "short" });
  const abs = Math.abs(secondes);
  if (abs < 60) return fmt.format(0, "minute");
  if (abs < 3_600) return fmt.format(Math.round(secondes / 60), "minute");
  if (abs < 86_400) return fmt.format(Math.round(secondes / 3_600), "hour");
  return fmt.format(Math.round(secondes / 86_400), "day");
}
