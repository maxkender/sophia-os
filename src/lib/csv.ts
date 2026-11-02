/**
 * CSV de l'OS : UTF-8 avec BOM (Excel lit les accents), virgule, une ligne
 * d'en-tête. Une valeur vide reste vide ; guillemets doublés au besoin.
 */
export type ValeurCsv = string | number | boolean | null | undefined;

function cellule(v: ValeurCsv): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function versCsv(entetes: string[], lignes: ValeurCsv[][]): string {
  return "﻿" + [entetes, ...lignes].map((l) => l.map(cellule).join(",")).join("\r\n") + "\r\n";
}

/** Fait télécharger le fichier au navigateur. */
export function telechargerCsv(nom: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
