import { describe, expect, it } from "vitest";

import { assemblerBase, assemblerOfficielles, construirePromptFaq } from "../../../supabase/functions/_shared/faq";
import { reponsesVisibles, type ReponseOfficielle } from "./api";

const r = (o: Partial<ReponseOfficielle>): ReponseOfficielle => ({
  id: "x", question: "When to post", reponse: "Any time of the day.", ordre: 30, actif: true,
  valide_at: "2026-11-06T10:00:00Z", maj_at: "2026-11-06T10:00:00Z", ...o,
});

describe("6/11 : réponses officielles", () => {
  it("un posteur ne voit que les réponses validées et actives", () => {
    const liste = [r({ id: "a" }), r({ id: "b", valide_at: null }), r({ id: "c", actif: false })];
    expect(reponsesVisibles(liste).map((x) => x.id)).toEqual(["a"]);
  });

  it("le bot FAQ les lit en premier et elles priment sur le guide", () => {
    const base = assemblerBase([{ guide: "poster", chemin: "Poster Guide", texte: "Post twice a day.", ordre: 1 }], [], "poster", {},
      [{ question: "Ad label", reponse: "No need to add any ad label." }]);
    expect(base.officielles).toContain("[Réponse officielle › Ad label]");
    const prompt = construirePromptFaq({ canal: "slack", role: "poster", question: "Do I need an ad label?", base });
    expect(prompt.indexOf("RÉPONSES OFFICIELLES (validées par Max")).toBeLessThan(prompt.indexOf("BASE — GUIDE"));
    expect(prompt).toContain("Une RÉPONSE OFFICIELLE gagne toujours");
    expect(assemblerOfficielles([{ question: " ", reponse: "x" }])).toBe("");
  });
});
