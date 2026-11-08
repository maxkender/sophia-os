import { describe, expect, it } from "vitest";
import { premiereCapture } from "./capture";

const f = (name: string, type: string) => new File(["x"], name, { type });

describe("premiereCapture", () => {
  it("garde la première image PNG, JPEG ou WebP", () => {
    expect(premiereCapture([f("notes.txt", "text/plain"), f("accueil.png", "image/png")])?.name).toBe("accueil.png");
    expect(premiereCapture([f("IMG_1.JPG", "")])?.name).toBe("IMG_1.JPG");
  });
  it("refuse le reste", () => {
    expect(premiereCapture([f("clip.mp4", "video/mp4"), f("a.gif", "image/gif")])).toBeNull();
    expect(premiereCapture(null)).toBeNull();
  });
});
