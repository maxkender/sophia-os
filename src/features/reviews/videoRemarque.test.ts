import { describe, expect, it } from "vitest";

import { controlerFichierVideo, extensionVideo, TAILLE_MAX_VIDEO_REMARQUE } from "./videoRemarque";

describe("videoRemarque", () => {
  it("accepte mp4 / webm / mov et refuse le reste", () => {
    expect(controlerFichierVideo(new File(["x"], "clip.mp4", { type: "video/mp4" }))).toBeNull();
    expect(controlerFichierVideo(new File(["x"], "clip.webm", { type: "video/webm" }))).toBeNull();
    expect(controlerFichierVideo(new File(["x"], "clip.mov", { type: "" }))).toBeNull();
    expect(controlerFichierVideo(new File(["x"], "notes.pdf", { type: "application/pdf" }))).toBe(
      "type",
    );
  });

  it("refuse un fichier trop lourd", () => {
    const gros = new File(["x"], "clip.mp4", { type: "video/mp4" });
    Object.defineProperty(gros, "size", { value: TAILLE_MAX_VIDEO_REMARQUE + 1 });
    expect(controlerFichierVideo(gros)).toBe("taille");
  });

  it("choisit l'extension de stockage", () => {
    expect(extensionVideo({ name: "a.webm", type: "video/webm" })).toBe("webm");
    expect(extensionVideo({ name: "a.mov", type: "video/quicktime" })).toBe("mov");
    expect(extensionVideo({ name: "capture", type: "video/mp4" })).toBe("mp4");
  });
});
