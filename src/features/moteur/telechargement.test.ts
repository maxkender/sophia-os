import { afterEach, describe, expect, it, vi } from "vitest";

import { estAndroid, estIos, peutPartager } from "./telechargement";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe("estIos", () => {
  it("reconnaît l'iPhone", () => {
    expect(estIos(IPHONE, 5)).toBe(true);
  });

  it("reconnaît l'iPad qui se déclare Macintosh", () => {
    expect(estIos(MAC, 5)).toBe(true);
  });

  it("écarte le Mac, Android et Windows", () => {
    expect(estIos(MAC, 0)).toBe(false);
    expect(estIos(ANDROID, 5)).toBe(false);
    expect(estIos(WINDOWS, 0)).toBe(false);
  });
});

describe("estAndroid", () => {
  it("ne vise qu'Android", () => {
    expect(estAndroid(ANDROID)).toBe(true);
    expect(estAndroid(IPHONE)).toBe(false);
    expect(estAndroid(WINDOWS)).toBe(false);
  });
});

describe("peutPartager", () => {
  const photo = new File(["x"], "01.jpg", { type: "image/jpeg" });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function navigateur(userAgent: string, maxTouchPoints: number) {
    vi.stubGlobal("navigator", {
      userAgent,
      maxTouchPoints,
      share: vi.fn(),
      canShare: vi.fn(() => true),
    });
  }

  it("garde la feuille de partage sur iPhone", () => {
    navigateur(IPHONE, 5);
    expect(peutPartager([photo])).toBe(true);
  });

  it("la refuse sur Android et Windows, même quand le navigateur sait partager", () => {
    navigateur(ANDROID, 5);
    expect(peutPartager([photo])).toBe(false);
    navigateur(WINDOWS, 0);
    expect(peutPartager([photo])).toBe(false);
  });
});
