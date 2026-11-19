import { describe, expect, it } from "vitest";

import { estPromptBrouillon, promptsBrouillons } from "./logique";
import { applicationPrete, preparationApplication, prochainPoint, type EntreePreparation } from "./preparation";

const BROUILLON = "[BROUILLON À RELIRE : écrit sans le pitch.]\n\nAtala est une application de course à pied.";
const PRET = "Atala est une application de course à pied.";

const atala = (o: Partial<EntreePreparation> = {}): EntreePreparation => ({
  slug: "atala",
  actif: false,
  langues: null,
  logo: true,
  prompts: { pertinence_atala: BROUILLON, placement_atala: BROUILLON },
  lien1000: "taap.it/atala",
  nbLabels: 0,
  ...o,
});

const etats = (e: EntreePreparation) => Object.fromEntries(preparationApplication(e).map((p) => [p.cle, p.etat]));

describe("prompt en brouillon", () => {
  it("reconnaît la ligne [BROUILLON …], où qu'elle soit ; jamais un texte relu", () => {
    expect(estPromptBrouillon(BROUILLON)).toBe(true);
    expect(estPromptBrouillon("texte\n[brouillon]\nsuite")).toBe(true);
    expect(estPromptBrouillon(PRET)).toBe(false);
    expect(estPromptBrouillon("un brouillon de plan de course")).toBe(false);
    expect(estPromptBrouillon(null)).toBe(false);
  });

  it("liste les prompts de l'application encore en brouillon", () => {
    expect(promptsBrouillons("atala", { pertinence_atala: PRET, placement_atala: BROUILLON })).toEqual(["placement_atala"]);
    expect(promptsBrouillons("atala", { pertinence_atala: PRET, placement_atala: PRET })).toEqual([]);
    expect(promptsBrouillons("sophia", { pertinence: PRET, placement_sophia: PRET })).toEqual([]);
  });
});

describe("préparation d'une application", () => {
  it("Atala au 19/11 : déclarée, prompts à relire, lien posé, aucun label, inactive", () => {
    const e = atala();
    expect(etats(e)).toEqual({
      code: "ok",
      pertinence: "a_relire",
      placement: "a_relire",
      lien1000: "ok",
      labels: "a_faire",
      langues: "ok",
      active: "a_faire",
    });
    expect(prochainPoint(preparationApplication(e))?.cle).toBe("pertinence");
    expect(applicationPrete(preparationApplication(e))).toBe(false);
  });

  it("dit ce qui manque, dans l'ordre : code, prompts, lien, labels, langues, interrupteur", () => {
    expect(preparationApplication(atala()).map((p) => p.cle)).toEqual([
      "code", "pertinence", "placement", "lien1000", "labels", "langues", "active",
    ]);
    // Créée à l'écran, pas encore dans le catalogue : le code d'abord.
    const neuve = atala({ slug: "nouvelle", logo: false, prompts: {}, lien1000: "", nbLabels: 0 });
    expect(etats(neuve)).toMatchObject({ code: "a_faire", pertinence: "a_faire", placement: "a_faire", lien1000: "a_faire" });
    expect(preparationApplication(neuve)[1]!.detail).toBe("pertinence_nouvelle");
    expect(prochainPoint(preparationApplication(neuve))?.cle).toBe("code");
    // Au catalogue mais sans logo : toujours « à faire ».
    expect(etats(atala({ logo: false })).code).toBe("a_faire");
    // Aucune langue cochée : servie nulle part.
    expect(etats(atala({ langues: [] })).langues).toBe("a_faire");
    expect(preparationApplication(atala({ langues: ["fr", "en"] })).find((p) => p.cle === "langues")?.detail).toBe("fr · en");
  });

  it("prête quand tout y est ; Sophia l'est toujours côté interrupteur", () => {
    const prete = atala({
      actif: true,
      prompts: { pertinence_atala: PRET, placement_atala: PRET },
      nbLabels: 6,
    });
    expect(applicationPrete(preparationApplication(prete))).toBe(true);
    expect(prochainPoint(preparationApplication(prete))).toBeNull();
    const sophia = preparationApplication({
      slug: "sophia", actif: false, langues: null, logo: true,
      prompts: { pertinence: PRET, placement_sophia: PRET }, lien1000: "taap.it/sophia.culture", nbLabels: 19,
    });
    expect(applicationPrete(sophia)).toBe(true);
  });
});
