import { describe, expect, it } from "vitest";

import { mediane, resumerLabel, SEUIL_PERCEE, type CompteDuLabel, type PostMesure } from "./detailLabel";

const maintenant = new Date("2026-11-20T12:00:00Z");
const compte = (id: string, plus: Partial<CompteDuLabel> = {}): CompteDuLabel => ({
  id, handle: id, langue: "fr", pays: "FR", classement: "passable", created_at: null, warmup_ends_at: null, posteur: null, ...plus,
});
const post = (compte_id: string, vues: number, url: string | null = null): PostMesure => ({ compte_id, vues, publie_at: "2026-11-10T10:00:00Z", publie_url: url });

describe("détail d'un label", () => {
  it("la médiane", () => {
    expect(mediane([])).toBeNull();
    expect(mediane([5])).toBe(5);
    expect(mediane([1, 100, 3])).toBe(3);
    expect(mediane([1, 2, 3, 10])).toBe(3);
  });

  it("un compte a percé dès qu'un de ses posts atteint le seuil ; les autres : pas encore, warm-up ou aucun post", () => {
    const r = resumerLabel(
      [
        compte("calme", { classement: "mauvaises_vues" }),
        compte("star", { classement: "star" }),
        compte("neuf", { warmup_ends_at: "2026-11-23T00:00:00Z" }),
        compte("muet", { classement: "inactif", warmup_ends_at: "2026-11-01T00:00:00Z" }),
      ],
      [post("calme", 400), post("calme", 900), post("star", SEUIL_PERCEE, "https://t/1"), post("star", 2_000), post("star", 80_000, "https://t/2")],
      maintenant,
    );
    // Les comptes qui ont percé d'abord.
    expect(r.comptes.map((c) => [c.handle, c.etat])).toEqual([["star", "perce"], ["calme", "pas_perce"], ["neuf", "warmup"], ["muet", "sans_post"]]);
    const star = r.comptes[0]!;
    expect(star).toMatchObject({ posts: 3, percees: 2, meilleure: 80_000, meilleureUrl: "https://t/2", mediane: SEUIL_PERCEE });
    expect(r).toMatchObject({ nbComptes: 4, nbPerces: 1, nbPasPerces: 1, nbWarmup: 1, nbSansPost: 1, posts: 5, percees: 2, meilleure: 80_000 });
    expect(r.mediane).toBe(2_000);
    expect(r.vuesTotales).toBe(400 + 900 + SEUIL_PERCEE + 2_000 + 80_000);
    expect(r.parCase).toEqual({ star: 1, bien: 0, passable: 1, mauvaises_vues: 1, inactif: 1 });
  });

  it("un label sans compte, et les posts d'un compte qui n'est pas du label ne comptent pas", () => {
    expect(resumerLabel([], [post("ailleurs", 50_000)], maintenant)).toMatchObject({ nbComptes: 0, posts: 0, mediane: null, meilleure: null, percees: 0 });
  });
});
