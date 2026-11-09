import { describe, expect, it } from "vitest";

import {
  choisirFormat,
  deplacerVers,
  dureePassages,
  dureeSegments,
  erreurPassages,
  extensionDe,
  nouveauPassage,
  placerContain,
  segmentReaction,
  segmentsDemo,
} from "./rendu";
import type { DemoUgcIa, GenerationUgcIa } from "./api";

describe("rendu dans le navigateur", () => {
  it("place une vidéo dans le 9:16 sans la déformer", () => {
    expect(placerContain(720, 1280, 720, 1280)).toEqual({ x: 0, y: 0, w: 720, h: 1280 });
    // Démo paysage : bandes noires en haut et en bas.
    expect(placerContain(1280, 720, 720, 1280)).toEqual({ x: 0, y: 437.5, w: 720, h: 405 });
  });

  it("calcule la durée des passages à la vitesse choisie", () => {
    expect(dureePassages([{ debut: 0, fin: 4 }, { debut: 10, fin: 13 }], 1.5)).toBe(4.7);
    const durees = new Map([["a", 10]]);
    expect(dureeSegments([{ url: "a", debut: 2, fin: null, vitesse: 2 }, { url: "b", debut: 0, fin: 3, vitesse: 1 }], durees)).toBe(7);
  });

  it("refuse des passages vides, à l'envers ou hors de la vidéo", () => {
    expect(erreurPassages([], 10)).toBe("aucun");
    expect(erreurPassages([{ debut: 3, fin: 3.1 }], 10)).toBe("ordre");
    expect(erreurPassages([{ debut: 3, fin: 11 }], 10)).toBe("auDela");
    expect(erreurPassages([{ debut: 3, fin: 6 }], 10)).toBeNull();
  });

  it("ajoute un passage de 3 s au temps du lecteur, sans dépasser la vidéo", () => {
    expect(nouveauPassage(2.34, 20)).toEqual({ debut: 2.3, fin: 5.3 });
    expect(nouveauPassage(19.9, 20)).toEqual({ debut: 17, fin: 20 });
  });

  it("enregistre en MP4 si le navigateur sait, sinon en WebM", () => {
    expect(choisirFormat((m) => m.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1.42E01E");
    expect(choisirFormat((m) => m === "video/webm;codecs=vp8")).toBe("video/webm;codecs=vp8");
    expect(choisirFormat(() => false)).toBeNull();
    expect(extensionDe("video/webm;codecs=vp9")).toBe("webm");
  });

  it("déplace un passage par glisser-déposer", () => {
    expect(deplacerVers(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(deplacerVers(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(deplacerVers(["a"], 0, 3)).toEqual(["a"]);
  });

  it("assemble la réaction sans son bandeau, puis la démo montée (ou ses passages)", () => {
    const g = { video_url: "https://x/g-monte.mp4", video_brute_url: "https://x/g.mp4", montage_debut_s: 1, montage_fin_s: 4 } as GenerationUgcIa;
    expect(segmentReaction(g)).toEqual({ url: "https://x/g.mp4", debut: 1, fin: 4, vitesse: 1 });
    const d = { brut_url: "https://x/d.mp4", video_url: null, passages: [{ debut: 2, fin: 5 }], vitesse: 1.5 } as unknown as DemoUgcIa;
    expect(segmentsDemo(d)).toEqual([{ url: "https://x/d.mp4", debut: 2, fin: 5, vitesse: 1.5 }]);
    expect(segmentsDemo({ ...d, video_url: "https://x/d-monte.mp4" })).toEqual([{ url: "https://x/d-monte.mp4", debut: 0, fin: null, vitesse: 1 }]);
    expect(segmentsDemo({ ...d, passages: [] })).toEqual([{ url: "https://x/d.mp4", debut: 0, fin: null, vitesse: 1 }]);
  });
});
