/**
 * Checklist avant le premier post : réponses, écran rouge, mémoire locale.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  checklistFaite,
  manquants,
  marquerChecklistFaite,
  QUESTIONS_PREMIER_POST,
  sansLesNon,
  toutRepondu,
  type Reponses,
} from "./premierPost";

const TOUT_OUI: Reponses = { warmup: "oui", follow: "oui", scroll: "oui", commentaires: "oui" };

describe("checklist avant le premier post", () => {
  it("les quatre questions, dans l'ordre demandé (plus de repost, 28 oct.)", () => {
    expect(QUESTIONS_PREMIER_POST.map((q) => q.cle)).toEqual(["warmup", "follow", "scroll", "commentaires"]);
  });

  it("Continue seulement quand les quatre ont une réponse", () => {
    expect(toutRepondu({})).toBe(false);
    expect(toutRepondu({ ...TOUT_OUI, commentaires: undefined })).toBe(false);
    expect(toutRepondu({ ...TOUT_OUI, scroll: "non" })).toBe(true);
  });

  it("l'écran rouge liste ce qui manque ; le retour ne garde que les Yes", () => {
    const r: Reponses = { ...TOUT_OUI, follow: "non", commentaires: "non" };
    expect(manquants(r).map((q) => q.action)).toEqual([
      "Follow at least 5 people on this account",
      "Comment on at least 3 posts in the niche you're going to post in",
    ]);
    expect(manquants(TOUT_OUI)).toEqual([]);
    expect(sansLesNon(r)).toEqual({ warmup: "oui", scroll: "oui" });
  });

  describe("mémoire du navigateur", () => {
    beforeEach(() => window.localStorage.clear());

    it("par utilisateur", () => {
      expect(checklistFaite("u1")).toBe(false);
      marquerChecklistFaite("u1");
      expect(checklistFaite("u1")).toBe(true);
      expect(checklistFaite("u2")).toBe(false);
    });
  });
});
