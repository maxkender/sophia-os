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

const TOUT_OUI: Reponses = { warmup: "oui", follow: "oui", scroll: "oui", commentaires: "oui", repost: "oui" };

describe("checklist avant le premier post", () => {
  it("les cinq questions, dans l'ordre demandé", () => {
    expect(QUESTIONS_PREMIER_POST.map((q) => q.cle)).toEqual(["warmup", "follow", "scroll", "commentaires", "repost"]);
  });

  it("Continue seulement quand les cinq ont une réponse", () => {
    expect(toutRepondu({})).toBe(false);
    expect(toutRepondu({ ...TOUT_OUI, repost: undefined })).toBe(false);
    expect(toutRepondu({ ...TOUT_OUI, scroll: "non" })).toBe(true);
  });

  it("l'écran rouge liste ce qui manque ; le retour ne garde que les Yes", () => {
    const r: Reponses = { ...TOUT_OUI, follow: "non", repost: "non" };
    expect(manquants(r).map((q) => q.action)).toEqual([
      "Follow at least 5 people on this account",
      "Repost at least 1 post",
    ]);
    expect(manquants(TOUT_OUI)).toEqual([]);
    expect(sansLesNon(r)).toEqual({ warmup: "oui", scroll: "oui", commentaires: "oui" });
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
