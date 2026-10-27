/**
 * « Copier pour Claude » : un bloc texte prêt à coller dans Claude, sans
 * fichier : 5 lignes de contexte, le sens de chaque colonne, puis le tableau
 * en Markdown (300 lignes au plus).
 */
import type { ValeurCsv } from "@/lib/csv";

import { sensColonne, type Niveau } from "./colonnes";
import { MAX_LIGNES_CLAUDE } from "./construire";

function cellule(v: ValeurCsv): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function tableauMarkdown(colonnes: string[], lignes: ValeurCsv[][]): string {
  return [
    `| ${colonnes.join(" | ")} |`,
    `| ${colonnes.map(() => "---").join(" | ")} |`,
    ...lignes.map((l) => `| ${l.map(cellule).join(" | ")} |`),
  ].join("\n");
}

export interface ContexteClaude {
  hm: string;
  zone: string | null;
  debut: string;
  fin: string;
  periode: string;
  bloc: string;
  niveau: Niveau;
  exporteLe: Date;
}

/** null au-delà de 300 lignes : proposer le CSV. */
export function texteClaude(ctx: ContexteClaude, colonnes: string[], lignes: ValeurCsv[][]): string | null {
  if (lignes.length > MAX_LIGNES_CLAUDE) return null;
  const parLigne = ctx.niveau === "resume" ? "one row per TikTok account" : "one row per post";
  const contexte = [
    `- HM: ${ctx.hm}${ctx.zone ? ` (zone: ${ctx.zone})` : ""}. Data exported from the Vik Studios OS dashboard.`,
    `- Period: ${ctx.debut} to ${ctx.fin} (${ctx.periode}); block: ${ctx.bloc}; ${lignes.length} rows, ${parLigne}.`,
    `- Export date: ${ctx.exporteLe.toISOString()}. Dates are YYYY-MM-DD, times ISO UTC, yes/no, empty cell = unknown.`,
    "- Rules: 2 posts per day per account; 1 missed post tolerated per account and per week, then -1 $ per missed post.",
    "- Rules: warm-up must be done before Sunday midnight (Paris), otherwise the start moves one week; a dead post is under 50 views.",
  ];
  return [
    "Context",
    ...contexte,
    "",
    "Columns",
    ...colonnes.map((c) => `- ${c}: ${sensColonne(ctx.niveau, c)}`),
    "",
    tableauMarkdown(colonnes, lignes),
    "",
  ].join("\n");
}
