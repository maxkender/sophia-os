import * as React from "react";

import { cn } from "@/lib/utils";

import { lireBlocs } from "./markdown";

/**
 * Le Markdown des fiches (applis, langues, labels), mis en page pour la
 * lecture : titres, paragraphes, listes, citations, tableaux, gras, italique
 * et code. Aucun HTML n'est injecté : chaque bloc devient un élément React,
 * le texte reste du texte.
 */

const EN_LIGNE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

/** Gras, italique et code dans une ligne ; le reste reste du texte. */
function enLigne(texte: string): React.ReactNode[] {
  return texte.split(EN_LIGNE).map((morceau, i) => {
    if (morceau.startsWith("**") && morceau.endsWith("**") && morceau.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {morceau.slice(2, -2)}
        </strong>
      );
    }
    if (morceau.startsWith("`") && morceau.endsWith("`") && morceau.length > 2) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {morceau.slice(1, -1)}
        </code>
      );
    }
    if (morceau.startsWith("*") && morceau.endsWith("*") && morceau.length > 2) {
      return <em key={i}>{morceau.slice(1, -1)}</em>;
    }
    return morceau;
  });
}

export function MarkdownLeger({
  texte,
  className,
  sansTitre = false,
}: {
  texte: string;
  className?: string;
  /** Sans le titre de tête (« # … ») quand la page l'affiche déjà. */
  sansTitre?: boolean;
}) {
  const blocs = React.useMemo(() => {
    const tous = lireBlocs(texte);
    return sansTitre && tous[0]?.type === "titre" && tous[0].niveau === 1 ? tous.slice(1) : tous;
  }, [texte, sansTitre]);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground/90", className)} dir="auto">
      {blocs.map((b, i) => {
        switch (b.type) {
          case "titre":
            return b.niveau === 1 ? (
              <h2 key={i} className="text-lg font-semibold text-foreground">
                {enLigne(b.texte)}
              </h2>
            ) : b.niveau === 2 ? (
              <h3 key={i} className="border-b pb-1.5 pt-4 text-base font-semibold text-foreground first:pt-0">
                {enLigne(b.texte)}
              </h3>
            ) : (
              <h4 key={i} className="pt-2 text-sm font-semibold text-foreground">
                {enLigne(b.texte)}
              </h4>
            );
          case "citation":
            return (
              <blockquote key={i} className="rounded-r-lg border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-muted-foreground">
                {enLigne(b.texte)}
              </blockquote>
            );
          case "liste": {
            const Liste = b.ordonnee ? "ol" : "ul";
            return (
              <Liste key={i} className={cn("space-y-1 pl-5", b.ordonnee ? "list-decimal" : "list-disc")}>
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1 marker:text-muted-foreground">
                    {enLigne(item)}
                  </li>
                ))}
              </Liste>
            );
          }
          case "tableau":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      {b.entetes.map((e, j) => (
                        <th key={j} className="px-3 py-2 text-left font-medium text-muted-foreground">
                          {enLigne(e)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {b.lignes.map((l, j) => (
                      <tr key={j}>
                        {l.map((c, k) => (
                          <td key={k} className="px-3 py-1.5 tabular-nums">
                            {enLigne(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}>{enLigne(b.texte)}</p>;
        }
      })}
    </div>
  );
}
