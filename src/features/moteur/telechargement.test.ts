import { afterEach, describe, expect, it, vi } from "vitest";

import {
  estAndroid,
  estIncomplet,
  estIos,
  MESSAGE_VISUEL_INCOMPLET,
  peutPartager,
  recupererFichier,
} from "./telechargement";

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

describe("estIncomplet", () => {
  const JPEG_DEBUT = [0xff, 0xd8, 0xff, 0xe0];
  const PNG_DEBUT = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const IEND = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  const corps = new Array(200).fill(0x11);
  const blob = (octets: number[], type = "image/jpeg") => new Blob([new Uint8Array(octets)], { type });

  it("accepte un JPEG complet, même suivi d'un peu de remplissage", async () => {
    expect(await estIncomplet(blob([...JPEG_DEBUT, ...corps, 0xff, 0xd9]), null)).toBe(false);
    expect(await estIncomplet(blob([...JPEG_DEBUT, ...corps, 0xff, 0xd9, 0, 0, 0]), null)).toBe(false);
  });

  it("refuse un JPEG coupé avant sa marque de fin", async () => {
    expect(await estIncomplet(blob([...JPEG_DEBUT, ...corps]), null)).toBe(true);
  });

  it("refuse un fichier plus court qu'annoncé, pas un plus long", async () => {
    const complet = [...JPEG_DEBUT, ...corps, 0xff, 0xd9];
    expect(await estIncomplet(blob(complet), complet.length + 500)).toBe(true);
    expect(await estIncomplet(blob(complet), complet.length - 10)).toBe(false);
  });

  it("vérifie la fin d'un PNG", async () => {
    expect(await estIncomplet(blob([...PNG_DEBUT, ...corps, 0, 0, 0, 0, ...IEND], "image/png"), null)).toBe(false);
    expect(await estIncomplet(blob([...PNG_DEBUT, ...corps], "image/png"), null)).toBe(true);
  });

  it("laisse passer un autre format", async () => {
    expect(await estIncomplet(blob([0x52, 0x49, 0x46, 0x46, ...corps], "image/webp"), null)).toBe(false);
  });
});

describe("recupererFichier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const complet = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const coupe = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
  // Blob de l'environnement (jsdom), comme celui que rend `fetch` au navigateur.
  const reponse = (octets: Uint8Array) => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/jpeg" }),
    blob: async () => new Blob([octets], { type: "image/jpeg" }),
  });

  it("reprend une fois sans cache un fichier tronqué", async () => {
    const appels: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        appels.push(init);
        return reponse(appels.length === 1 ? coupe : complet);
      }),
    );
    const fichier = await recupererFichier("https://x/1.jpg", "01.jpg");
    expect(fichier.size).toBe(complet.length);
    expect(appels.map((a) => a.cache)).toEqual(["default", "reload"]);
  });

  it("refuse d'enregistrer un fichier encore tronqué après la reprise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse(coupe)));
    await expect(recupererFichier("https://x/1.jpg", "01.jpg")).rejects.toThrow(MESSAGE_VISUEL_INCOMPLET);
  });
});
