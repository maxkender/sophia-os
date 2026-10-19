import * as React from "react";

/**
 * Un tableau où les chiffres sont forcément sous leur titre.
 *
 * La première version de la page Répartition posait l'en-tête et les lignes
 * dans DEUX grilles CSS séparées, avec les mêmes largeurs écrites à la main.
 * Deux grilles ne s'alignent pas : dès qu'une cellule était plus large que son
 * titre, toute la ligne glissait. Ici les colonnes sont déclarées une fois et
 * le navigateur aligne lui-même, parce que c'est un vrai `<table>`.
 *
 * `align` porte sur la colonne entière, titre compris : un nombre aligné à
 * droite sous un titre aligné à gauche se lit aussi mal qu'un décalage.
 */
export interface ColonneTableau<L> {
  cle: string;
  titre: React.ReactNode;
  align?: "gauche" | "droite";
  /** Classe appliquée à la cellule (pas au titre, qui garde son style). */
  classe?: string;
  rendu: (ligne: L, index: number) => React.ReactNode;
}

export function Tableau<L>({
  colonnes,
  lignes,
  cleLigne,
  onLigne,
  ligneActive,
  detail,
  vide,
}: {
  colonnes: Array<ColonneTableau<L>>;
  lignes: L[];
  cleLigne: (ligne: L, index: number) => string;
  /** Rend la ligne cliquable. */
  onLigne?: (ligne: L) => void;
  ligneActive?: (ligne: L) => boolean;
  /** Bloc déplié sous la ligne active, sur toute la largeur. */
  detail?: (ligne: L) => React.ReactNode;
  vide?: React.ReactNode;
}) {
  if (lignes.length === 0 && vide) {
    return <p className="py-2 text-sm text-muted-foreground">{vide}</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b">
          {colonnes.map((c) => (
            <th
              key={c.cle}
              scope="col"
              className={`pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${
                c.align === "droite" ? "text-right" : "text-left"
              }`}
            >
              {c.titre}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => {
          const actif = ligneActive?.(l) ?? false;
          const bloc = actif && detail ? detail(l) : null;
          return (
            <React.Fragment key={cleLigne(l, i)}>
              <tr
                className={`border-b border-border/40 ${onLigne ? "cursor-pointer hover:bg-muted/50" : ""} ${
                  actif ? "bg-muted/40" : ""
                }`}
                onClick={onLigne ? () => onLigne(l) : undefined}
              >
                {colonnes.map((c) => (
                  <td
                    key={c.cle}
                    className={`py-2 pr-4 last:pr-0 ${c.align === "droite" ? "text-right tabular-nums" : "text-left"} ${c.classe ?? ""}`}
                  >
                    {c.rendu(l, i)}
                  </td>
                ))}
              </tr>
              {bloc && (
                <tr>
                  <td colSpan={colonnes.length} className="pb-3">
                    {bloc}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
