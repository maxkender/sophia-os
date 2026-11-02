import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { lireBlocs } from "./markdown";
import { MarkdownLeger } from "./MarkdownLeger";

describe("lireBlocs", () => {
  it("lit titres, citation, listes, tableau et paragraphes, dans l'ordre", () => {
    const blocs = lireBlocs(
      [
        "# Fiche label : smart_girl",
        "",
        "> Calculée le 02/11.",
        "> Effet à contenu égal.",
        "",
        "## Sophia · 812 posts",
        "- **Prouvée** : Un point de la liste 80 %",
        "- **Essai** : Mon habitude 20 %,",
        "  suite de la ligne",
        "",
        "| Forme | Posts |",
        "| --- | --- |",
        "| Un point de la liste | 120 |",
        "",
        "1. première règle",
        "2. seconde règle",
        "Un paragraphe",
        "sur deux lignes.",
      ].join("\n"),
    );
    expect(blocs.map((b) => b.type)).toEqual(["titre", "citation", "titre", "liste", "tableau", "liste", "paragraphe"]);
    expect(blocs[1]).toEqual({ type: "citation", texte: "Calculée le 02/11. Effet à contenu égal." });
    expect(blocs[3]).toEqual({
      type: "liste",
      ordonnee: false,
      items: ["**Prouvée** : Un point de la liste 80 %", "**Essai** : Mon habitude 20 %, suite de la ligne"],
    });
    expect(blocs[4]).toEqual({ type: "tableau", entetes: ["Forme", "Posts"], lignes: [["Un point de la liste", "120"]] });
    expect(blocs[5]).toMatchObject({ type: "liste", ordonnee: true, items: ["première règle", "seconde règle"] });
    expect(blocs[6]).toEqual({ type: "paragraphe", texte: "Un paragraphe sur deux lignes." });
  });

  it("une ligne qui commence par | sans séparateur n'est pas un tableau", () => {
    expect(lireBlocs("| pas un tableau |")).toEqual([{ type: "paragraphe", texte: "| pas un tableau |" }]);
  });
});

describe("MarkdownLeger", () => {
  it("met en forme sans jamais interpréter de HTML", () => {
    render(<MarkdownLeger texte={"## Règles\n- **gras** et *italique* et `code_snake`\n- <b>pas du html</b>"} />);
    expect(screen.getByRole("heading", { name: "Règles" })).toBeInTheDocument();
    expect(screen.getByText("gras").tagName).toBe("STRONG");
    expect(screen.getByText("italique").tagName).toBe("EM");
    expect(screen.getByText("code_snake").tagName).toBe("CODE");
    expect(screen.getByText("<b>pas du html</b>")).toBeInTheDocument();
  });
});
