import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  baseDeTraduction,
  contientFrancaisResiduel,
  estDeckPret,
  fusionnerDeckTraduit,
  peutSauverBase,
  variantesSansFrancaisResiduel,
  type SlideDeck,
} from "./deckLangue";

const slide = (
  position: number,
  texte_overlay: string | null,
  position_sophia = false,
): SlideDeck => ({ position, texte_overlay, position_sophia });

describe("estDeckPret", () => {
  it("exige du texte ET un placement", () => {
    expect(estDeckPret([])).toBe(false);
    expect(estDeckPret([slide(1, "hook"), slide(2, "conseil")])).toBe(false);
    expect(estDeckPret([slide(1, "hook"), slide(2, "pub", true)])).toBe(true);
  });

  it("un deck dont SEULE la pub est textée passe pour prêt — d'où le garde-fou amont", () => {
    // C'est exactement l'état des 29 decks cassés trouvés en base : une fois
    // persistés ils ne repassaient plus jamais par la traduction.
    expect(estDeckPret([slide(1, ""), slide(2, ""), slide(3, "pub", true)])).toBe(true);
  });
});

describe("baseDeTraduction", () => {
  it("préfère la base mise à l'abri", () => {
    const ligne = {
      slides: [slide(1, "pub Sophia", true)],
      slides_base: [slide(1, "texte d'origine")],
    };
    expect(baseDeTraduction(ligne)[0]?.texte_overlay).toBe("texte d'origine");
  });

  it("retombe sur `slides` quand aucune base n'a été sauvée", () => {
    expect(baseDeTraduction({ slides: [slide(1, "ocr")] })[0]?.texte_overlay).toBe("ocr");
    expect(baseDeTraduction({ slides: [slide(1, "ocr")], slides_base: [] })).toHaveLength(1);
    expect(baseDeTraduction(null)).toEqual([]);
  });

  it("rend une copie : muter le résultat ne touche pas la ligne", () => {
    const ligne = { slides: [slide(1, "ocr")] };
    baseDeTraduction(ligne).pop();
    expect(ligne.slides).toHaveLength(1);
  });
});

describe("peutSauverBase", () => {
  it("sauve une ligne source encore vierge", () => {
    expect(peutSauverBase({ slides: [slide(1, "ocr")] })).toBe(true);
  });

  it("ne sauve pas une ligne déjà polluée : le texte d'origine est perdu", () => {
    expect(peutSauverBase({ slides: [slide(1, "ocr"), slide(2, "pub", true)] })).toBe(false);
  });

  it("ne réécrit pas une base déjà sauvée, ni une ligne vide", () => {
    expect(peutSauverBase({ slides: [slide(1, "ocr")], slides_base: [slide(1, "x")] })).toBe(false);
    expect(peutSauverBase({ slides: [] })).toBe(false);
    expect(peutSauverBase(null)).toBe(false);
  });
});

describe("fusionnerDeckTraduit", () => {
  const source = [slide(1, "hook"), slide(2, "conseil"), slide(3, "fin")];

  it("traduit chaque position", () => {
    const { slides, traduits } = fusionnerDeckTraduit(source, [
      { position: 1, translated: "Haken" },
      { position: 2, translated: "Tipp" },
      { position: 3, translated: "Ende" },
    ]);
    expect(traduits).toBe(3);
    expect(slides.map((s) => s.texte_overlay)).toEqual(["Haken", "Tipp", "Ende"]);
  });

  it("garde le texte source sur une position sautée par le modèle", () => {
    const { slides, traduits } = fusionnerDeckTraduit(source, [
      { position: 1, translated: "Haken" },
      { position: 3, translated: "   " },
    ]);
    expect(traduits).toBe(1);
    expect(slides.map((s) => s.texte_overlay)).toEqual(["Haken", "conseil", "fin"]);
  });

  it("signale une traduction totalement vide au lieu de rendre un deck muet", () => {
    expect(fusionnerDeckTraduit(source, []).traduits).toBe(0);
    expect(
      fusionnerDeckTraduit(source, [{ position: 1, translated: "" }]).traduits,
    ).toBe(0);
  });

  it("REPORTE le placement d'une base polluée — jamais deux pubs dans un carrousel", () => {
    const polluee = [slide(1, "hook"), slide(2, "try the Sophia app", true)];
    const { slides } = fusionnerDeckTraduit(polluee, [
      { position: 1, translated: "Haken" },
      { position: 2, translated: "nimm die Sophia-App" },
    ]);
    expect(slides[1]?.position_sophia).toBe(true);
    // Le deck est déjà « pourvu » : l'appelant ne replacera pas de seconde pub.
    expect(slides.some((s) => s.position_sophia)).toBe(true);
  });

  it("une base saine ne porte aucun placement hérité", () => {
    const { slides } = fusionnerDeckTraduit(source, [{ position: 1, translated: "Haken" }]);
    expect(slides.every((s) => !s.position_sophia)).toBe(true);
  });
});

describe("français résiduel dans la slide publicitaire", () => {
  it("repère les formes qui sont parties en production", () => {
    // Extraits réels : tr, el, cs, sv, de, en.
    const reels = [
      "kaydırmak yerine l'appli sophia gibi bir platformla günde 5 dakika",
      "μέσα από την l'appli Sophia μαθαίνεις τέχνη",
      "pro svůj mozek využij l'appli sophia, kde najdeš krátké lekce",
      "jag använder l'appli Sophia för att lära mig nya saker",
      "lern mit der l'appli sophia jeden tag 5 minuten",
      "use a micro learning app like l'appli sophia",
    ];
    for (const texte of reels) expect(contientFrancaisResiduel(texte), texte).toBe(true);
  });

  it("attrape aussi l'apostrophe typographique, le pluriel et « l'application »", () => {
    expect(contientFrancaisResiduel("nimm die l’appli Sophia")).toBe(true);
    expect(contientFrancaisResiduel("prova le l'applis Sophia")).toBe(true);
    expect(contientFrancaisResiduel("usa l'application Sophia")).toBe(true);
    expect(contientFrancaisResiduel("l ' appli Sophia")).toBe(true);
  });

  it("ne se déclenche pas sur une formulation locale correcte", () => {
    for (const texte of [
      "use the Sophia app for quick daily lessons",
      "lern mit der Sophia-App jeden Tag 5 Minuten",
      "Sophia uygulaması ile günde 5 dakika öğren",
      "usa la app Sophia para aprender algo nuevo",
      "prova l'app Sophia per imparare ogni giorno",
      "η εφαρμογή Sophia σου μαθαίνει κάτι νέο",
    ]) {
      expect(contientFrancaisResiduel(texte), texte).toBe(false);
    }
    expect(contientFrancaisResiduel(null)).toBe(false);
  });

  it("écarte les variantes fautives hors français", () => {
    const variantes = [
      "use l'appli sophia every day",
      "use the Sophia app every day",
      "the Sophia app teaches you something new",
    ];
    expect(variantesSansFrancaisResiduel(variantes, "en")).toEqual([
      "use the Sophia app every day",
      "the Sophia app teaches you something new",
    ]);
  });

  it("rend une liste vide quand tout est fautif — signal de relance", () => {
    expect(variantesSansFrancaisResiduel(["l'appli Sophia rules"], "tr")).toEqual([]);
  });

  it("laisse le français intact : « l'appli Sophia » y est la formule attendue", () => {
    const fr = ["utilise l'appli Sophia pour ça", "j'utilise l'appli Sophia"];
    expect(variantesSansFrancaisResiduel(fr, "fr")).toEqual(fr);
    expect(variantesSansFrancaisResiduel(fr, null)).toEqual(fr);
  });
});

describe("copie Deno", () => {
  it("`deck_langue.ts` est identique au module front (hors en-tête)", () => {
    const corps = (chemin: string) =>
      readFileSync(chemin, "utf8").split("*/").slice(1).join("*/").trim();
    expect(corps("supabase/functions/_shared/deck_langue.ts")).toBe(
      corps("src/features/moteur/deckLangue.ts"),
    );
  });
});
