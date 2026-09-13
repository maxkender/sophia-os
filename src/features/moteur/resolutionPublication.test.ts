import { describe, expect, it } from "vitest";

import {
  APPARIEMENT_DEFAUT,
  DELAIS_RESOLUTION_MIN,
  analyserLienTiktok,
  apparierPublications,
  corroborer,
  estLienCourtTiktok,
  hashtagsDe,
  memeHandle,
  nettoyerUrlTiktok,
  prochaineTentative,
  type PassageAResoudre,
  type PostEnLigne,
} from "./resolutionPublication";

const T0 = Date.parse("2026-09-13T10:00:00Z");
const min = (n: number) => n * 60_000;
const h = (n: number) => n * 3_600_000;

describe("cadence des tentatives", () => {
  it("enchaîne 5 · 10 · 20 · 120 minutes puis abandonne", () => {
    expect(DELAIS_RESOLUTION_MIN).toEqual([5, 10, 20, 120]);
    const at = (n: number) => prochaineTentative(n, T0)?.getTime() ?? null;
    expect(at(0)).toBe(T0 + min(5));
    expect(at(1)).toBe(T0 + min(10));
    expect(at(2)).toBe(T0 + min(20));
    expect(at(3)).toBe(T0 + min(120));
    expect(at(4)).toBeNull();
    expect(at(99)).toBeNull();
  });
});

describe("lecture d'un lien TikTok", () => {
  it("lit l'ID et le compte d'une URL de post", () => {
    expect(analyserLienTiktok("https://www.tiktok.com/@ava.mindset178/photo/7684719249159441696"))
      .toEqual({ id: "7684719249159441696", handle: "ava.mindset178" });
    expect(analyserLienTiktok("https://www.tiktok.com/@x/video/123?_r=1&_t=ZS-9"))
      .toEqual({ id: "123", handle: "x" });
  });

  it("refuse ce qui n'est pas un post", () => {
    // Le cas de prod : le créateur colle l'URL de son profil.
    expect(analyserLienTiktok("https://www.tiktok.com/@ava.mindset178?_r=1&_t=ZS-98cr6")).toBeNull();
    expect(analyserLienTiktok("www.tiktok.com/@hannah.wisdom172")).toBeNull();
    expect(analyserLienTiktok("https://vm.tiktok.com/ZGdQB41wd/")).toBeNull();
    expect(analyserLienTiktok("")).toBeNull();
    expect(analyserLienTiktok(null)).toBeNull();
  });

  it("reconnaît les liens courts du bouton Partager", () => {
    expect(estLienCourtTiktok("https://vm.tiktok.com/ZGdQB41wd/")).toBe(true);
    expect(estLienCourtTiktok("https://vt.tiktok.com/ZSqu2kMYQ/")).toBe(true);
    expect(estLienCourtTiktok("https://www.tiktok.com/t/ZTd9xQ/")).toBe(true);
    expect(estLienCourtTiktok("https://www.tiktok.com/@x/photo/1")).toBe(false);
  });

  it("nettoie les paramètres de partage", () => {
    expect(nettoyerUrlTiktok("https://www.tiktok.com/@x/photo/1?_r=1&_t=ZS#z"))
      .toBe("https://www.tiktok.com/@x/photo/1");
  });

  it("compare les pseudos sans arobase ni casse", () => {
    expect(memeHandle("@Ava.Mindset178", "ava.mindset178")).toBe(true);
    expect(memeHandle("ava.mindset178", "autre.compte")).toBe(false);
    expect(memeHandle(null, "x")).toBe(false);
    expect(memeHandle("", "")).toBe(false);
  });
});

describe("corroboration", () => {
  const passage: PassageAResoudre = {
    id: "p",
    publieAt: "2026-09-13T10:00:00Z",
    hashtags: "#autoestima #desarrollopersonal #confianza",
    nbSlides: 6,
    musiqueTitre: "Take Me (To The Moon)",
  };
  const post = (over: Partial<PostEnLigne> = {}): PostEnLigne => ({
    id: "1",
    url: "u",
    createTimeMs: T0,
    texte: "",
    nbImages: 6,
    musiqueTitre: null,
    ...over,
  });

  it("oppose un veto sur un nombre d'images différent", () => {
    expect(corroborer(passage, post({ nbImages: 3 })).refuse).toBe(true);
  });

  it("ne dit rien quand le nombre d'images est inconnu", () => {
    const c = corroborer(passage, post({ nbImages: null }));
    expect(c.refuse).toBe(false);
    expect(c.confirme).not.toContain("slides");
  });

  it("confirme sur les hashtags, le son et les slides", () => {
    const c = corroborer(
      passage,
      post({ texte: "mi rutina #confianza y más", musiqueTitre: "take me (to the moon)" }),
    );
    expect(c.refuse).toBe(false);
    expect(c.confirme.sort()).toEqual(["hashtags", "slides", "son"]);
  });

  it("ne refuse pas une légende réécrite sans nos hashtags", () => {
    const c = corroborer(passage, post({ texte: "otra cosa #random" }));
    expect(c.refuse).toBe(false);
    expect(c.confirme).toEqual(["slides"]);
  });

  it("lit les hashtags accentués et underscorés", () => {
    expect([...hashtagsDe("#Été #dev_perso #123 rien")].sort())
      .toEqual(["123", "dev_perso", "été"]);
    expect(hashtagsDe(null).size).toBe(0);
  });
});

describe("appariement chronologique", () => {
  const passage = (id: string, clicMs: number, over: Partial<PassageAResoudre> = {}) => ({
    id,
    publieAt: new Date(clicMs).toISOString(),
    ...over,
  });
  const post = (id: string, creeMs: number, over: Partial<PostEnLigne> = {}): PostEnLigne => ({
    id,
    url: `https://www.tiktok.com/@c/photo/${id}`,
    createTimeMs: creeMs,
    ...over,
  });

  it("apparie le créneau au post publié juste avant", () => {
    const r = apparierPublications([passage("p1", T0)], [post("a", T0 - min(3))]);
    expect(r).toHaveLength(1);
    expect(r[0].post.id).toBe("a");
  });

  it("respecte l'ordre : premier coché ↔ premier posté", () => {
    const r = apparierPublications(
      [passage("soir", T0 + h(9)), passage("matin", T0)],
      [post("b", T0 + h(8)), post("a", T0 - min(5))],
    );
    expect(r.map((x) => [x.passageId, x.post.id])).toEqual([
      ["matin", "a"],
      ["soir", "b"],
    ]);
  });

  it("n'attribue jamais deux fois le même post", () => {
    const r = apparierPublications(
      [passage("p1", T0), passage("p2", T0 + min(2))],
      [post("a", T0 - min(5))],
    );
    expect(r).toHaveLength(1);
    expect(r[0].passageId).toBe("p1");
  });

  it("ignore un post déjà attaché à un autre créneau", () => {
    const r = apparierPublications([passage("p1", T0)], [post("a", T0 - min(5))], {
      pris: ["a"],
    });
    expect(r).toEqual([]);
  });

  it("ignore un post hors fenêtre", () => {
    const vieux = apparierPublications([passage("p1", T0)], [post("a", T0 - h(25))]);
    expect(vieux).toEqual([]);
    const futur = apparierPublications([passage("p1", T0)], [post("a", T0 + min(20))]);
    expect(futur).toEqual([]);
    // La tolérance après le clic couvre un horodatage TikTok en avance.
    const limite = apparierPublications([passage("p1", T0)], [post("a", T0 + min(10))]);
    expect(limite).toHaveLength(1);
  });

  it("saute un post que le nombre d'images disqualifie", () => {
    const r = apparierPublications(
      [passage("p1", T0, { nbSlides: 6 })],
      [post("perso", T0 - min(30), { nbImages: 1 }), post("notre", T0 - min(10), { nbImages: 6 })],
    );
    expect(r.map((x) => x.post.id)).toEqual(["notre"]);
    expect(r[0].signaux).toContain("slides");
  });

  it("ignore un post sans horodatage", () => {
    expect(apparierPublications([passage("p1", T0)], [post("a", T0)], { reglages: APPARIEMENT_DEFAUT }))
      .toHaveLength(1);
    expect(apparierPublications([passage("p1", T0)], [{ id: "a", url: "u", createTimeMs: null }]))
      .toEqual([]);
  });

  it("ne rend rien quand il n'y a rien à apparier", () => {
    expect(apparierPublications([], [post("a", T0)])).toEqual([]);
    expect(apparierPublications([passage("p1", T0)], [])).toEqual([]);
    // Horodatage illisible : le créneau est sauté, pas d'appariement au hasard.
    expect(apparierPublications([{ id: "p1", publieAt: "jamais" }], [post("a", T0)])).toEqual([]);
  });
});
