import { describe, expect, it } from "vitest";

import {
  cheminStorageTestFaceSwap,
  estSourceWebm,
  parserPayloadTestFaceSwap,
} from "../../../supabase/functions/_shared/test_ugc_face_swap";

describe("parserPayloadTestFaceSwap", () => {
  it("accepte personaId + reactionId", () => {
    expect(
      parserPayloadTestFaceSwap({
        personaId: " p1 ",
        reactionId: "r1",
      }),
    ).toEqual({ personaId: "p1", reactionId: "r1" });
  });

  it("accepte les clés snake_case", () => {
    expect(
      parserPayloadTestFaceSwap({
        persona_id: "p2",
        reaction_id: "r2",
      }),
    ).toEqual({ personaId: "p2", reactionId: "r2" });
  });

  it("refuse un payload incomplet", () => {
    expect(() => parserPayloadTestFaceSwap({})).toThrow("personaId requis");
    expect(() => parserPayloadTestFaceSwap({ personaId: "p" })).toThrow(
      "reactionId requis",
    );
  });
});

describe("cheminStorageTestFaceSwap", () => {
  it("reste sous ugc/test-runs et hors chemins prod", () => {
    const path = cheminStorageTestFaceSwap("abc-123");
    expect(path).toBe("ugc/test-runs/abc-123/swap.mp4");
    expect(path.startsWith("ugc/test-runs/")).toBe(true);
    expect(path.includes("ugc_video_posts")).toBe(false);
    expect(path.includes("assignation")).toBe(false);
  });

  it("refuse un runId vide / dangereux", () => {
    expect(() => cheminStorageTestFaceSwap("")).toThrow("runId invalide");
    expect(() => cheminStorageTestFaceSwap("../posts")).toThrow("runId invalide");
  });
});

describe("estSourceWebm", () => {
  it("détecte webm via path, url ou mime", () => {
    expect(estSourceWebm({ path: "ugc/reactions/a/clip.webm" })).toBe(true);
    expect(estSourceWebm({ url: "https://x/v.webm?token=1" })).toBe(true);
    expect(estSourceWebm({ mime: "video/webm" })).toBe(true);
    expect(estSourceWebm({ path: "ugc/reactions/a/clip.mp4" })).toBe(false);
  });
});
