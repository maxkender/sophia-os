/**
 * Le Markdown des fiches découpé en blocs : titres, paragraphes, listes,
 * citations et tableaux. Logique pure : MarkdownLeger.tsx les met en page.
 */

export type Bloc =
  | { type: "titre"; niveau: 1 | 2 | 3; texte: string }
  | { type: "paragraphe"; texte: string }
  | { type: "citation"; texte: string }
  | { type: "liste"; ordonnee: boolean; items: string[] }
  | { type: "tableau"; entetes: string[]; lignes: string[][] };

const TITRE = /^(#{1,3})\s+(.*)$/;
const PUCE = /^\s*[-*]\s+(.*)$/;
const NUMERO = /^\s*\d+[.)]\s+(.*)$/;
const SEPARATEUR_TABLEAU = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Le texte découpé en blocs, dans l'ordre. */
export function lireBlocs(md: string): Bloc[] {
  const lignes = md.replace(/\r\n?/g, "\n").split("\n");
  const blocs: Bloc[] = [];
  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i];
    if (!ligne.trim()) {
      i += 1;
      continue;
    }
    const titre = ligne.match(TITRE);
    if (titre) {
      blocs.push({ type: "titre", niveau: titre[1].length as 1 | 2 | 3, texte: titre[2].trim() });
      i += 1;
      continue;
    }
    if (ligne.trimStart().startsWith(">")) {
      const texte: string[] = [];
      while (i < lignes.length && lignes[i].trimStart().startsWith(">")) {
        texte.push(lignes[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocs.push({ type: "citation", texte: texte.join(" ").trim() });
      continue;
    }
    if (ligne.trimStart().startsWith("|") && SEPARATEUR_TABLEAU.test(lignes[i + 1] ?? "")) {
      const entetes = cellules(ligne);
      i += 2;
      const corps: string[][] = [];
      while (i < lignes.length && lignes[i].trimStart().startsWith("|")) {
        corps.push(cellules(lignes[i]));
        i += 1;
      }
      blocs.push({ type: "tableau", entetes, lignes: corps });
      continue;
    }
    const puce = ligne.match(PUCE);
    const numero = ligne.match(NUMERO);
    if (puce || numero) {
      const ordonnee = !puce;
      const motif = ordonnee ? NUMERO : PUCE;
      const items: string[] = [];
      while (i < lignes.length) {
        const m = lignes[i].match(motif);
        if (m) {
          items.push(m[1].trim());
        } else if (items.length && /^\s{2,}\S/.test(lignes[i])) {
          // Suite d'un élément, indentée.
          items[items.length - 1] += ` ${lignes[i].trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      blocs.push({ type: "liste", ordonnee, items });
      continue;
    }
    // Un paragraphe prend toujours sa première ligne (même « | … » sans
    // séparateur de tableau), puis les suivantes jusqu'au prochain bloc.
    const texte: string[] = [ligne.trim()];
    i += 1;
    while (
      i < lignes.length &&
      lignes[i].trim() &&
      !TITRE.test(lignes[i]) &&
      !lignes[i].trimStart().startsWith(">") &&
      !lignes[i].trimStart().startsWith("|") &&
      !PUCE.test(lignes[i]) &&
      !NUMERO.test(lignes[i])
    ) {
      texte.push(lignes[i].trim());
      i += 1;
    }
    blocs.push({ type: "paragraphe", texte: texte.join(" ") });
  }
  return blocs;
}
