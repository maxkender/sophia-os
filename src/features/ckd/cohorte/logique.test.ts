import { describe, expect, it } from "vitest";

import type { CompteCohorte, ReleveWarmup } from "./api";
import {
  bilanCompte,
  bilanSemaine,
  echelle,
  etatPost,
  etatWarmup,
  garderWarmup,
  jourParDefaut,
  joursDeWarmup,
  libelleCohorte,
  mediane,
  minuitParis,
  paireDuJour,
  resteAvant,
  retardsDuJour,
  serieWarmup,
} from "./logique";

function compte(p: Partial<CompteCohorte>): CompteCohorte {
  return {
    compte_id: "c1",
    poster_id: "p1",
    hm_id: "hm1",
    handle: "lucia.lectura214",
    pays: "ES",
    langue: "es",
    application: "sophia",
    is_active: true,
    cree_le: "2026-10-19T09:00:00Z",
    warmup_lance_le: null,
    warmup_fin: null,
    premier_jour: null,
    glisse_de: null,
    seuil_mort: 50,
    seuil_bon: 3000,
    posts: [],
    releves: [],
    ...p,
  };
}

function releve(at: string, r: Partial<ReleveWarmup>): ReleveWarmup {
  return { at, existe: true, cree_tiktok_at: null, abonnements: 0, likes: 0, abonnes: 0, videos: 0, ...r };
}

describe("paire de cohortes", () => {
  it("le samedi et le dimanche : S43 poste, S44 fait son warm-up ; le lundi, S44 prend la place", () => {
    expect(paireDuJour("2026-10-24")).toEqual({ poste: "2026-10-19", warmup: "2026-10-26" });
    expect(paireDuJour("2026-10-25")).toEqual({ poste: "2026-10-19", warmup: "2026-10-26" });
    expect(paireDuJour("2026-10-26")).toEqual({ poste: "2026-10-26", warmup: "2026-11-02" });
    expect(libelleCohorte("2026-10-19")).toBe("S43");
    expect(libelleCohorte("2026-10-26")).toBe("S44");
  });

  it("le warm-up de S44 va du lundi 19 au dimanche 25", () => {
    expect(joursDeWarmup("2026-10-26")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
  });

  it("minuit à Paris, en heure d'été comme d'hiver (changement d'heure le 25/10)", () => {
    expect(minuitParis("2026-10-19").toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(minuitParis("2026-10-26").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("le compte à rebours jusqu'aux premiers posts", () => {
    const cible = minuitParis("2026-10-26");
    expect(resteAvant(cible, new Date("2026-10-24T08:00:00Z"))).toEqual({ jours: 1, heures: 15, minutes: 0 });
    expect(resteAvant(cible, new Date("2026-10-26T08:00:00Z"))).toBeNull();
  });

  it("les axes des graphes : des paliers entiers, quatre au plus", () => {
    expect(echelle(12)).toEqual({ haut: 15, ticks: [0, 5, 10, 15] });
    expect(echelle(24)).toEqual({ haut: 30, ticks: [0, 10, 20, 30] });
    expect(echelle(82)).toEqual({ haut: 100, ticks: [0, 25, 50, 75, 100] });
    expect(echelle(3)).toEqual({ haut: 3, ticks: [0, 1, 2, 3] });
    expect(echelle(0)).toEqual({ haut: 1, ticks: [0, 1] });
  });

  it("le jour mis en avant : aujourd'hui, ramené entre le lundi et le samedi", () => {
    expect(jourParDefaut("2026-10-19", "2026-10-22")).toBe(3);
    expect(jourParDefaut("2026-10-19", "2026-10-25")).toBe(5);
    expect(jourParDefaut("2026-10-19", "2026-10-12")).toBe(0);
  });
});

describe("warm-up", () => {
  const AUJ = "2026-10-24";

  it("prêt : compte TikTok créé, au moins un abonnement ou un like, Start warmup cliqué", () => {
    const e = etatWarmup(
      compte({
        warmup_lance_le: "2026-10-20T10:00:00Z",
        releves: [
          releve("2026-10-24T06:00:00Z", { cree_tiktok_at: "2026-10-20T08:00:00Z", abonnements: 0, likes: 3 }),
        ],
      }),
      AUJ,
    );
    expect(e).toMatchObject({ tiktok: "cree", warmup: true, start: true, statut: "pret", likes: 3, creeTiktokLe: "2026-10-20T08:00:00Z" });
  });

  it("à relancer : 2 jours ou plus sans compte TikTok ; nouveau avant", () => {
    const introuvable = [releve("2026-10-24T06:00:00Z", { existe: false })];
    expect(etatWarmup(compte({ cree_le: "2026-10-21T09:00:00Z", releves: introuvable }), AUJ).statut).toBe("a_relancer");
    expect(etatWarmup(compte({ cree_le: "2026-10-23T09:00:00Z", releves: introuvable }), AUJ).statut).toBe("nouveau");
  });

  it("une page illisible ne compte pas : on garde le dernier relevé lisible", () => {
    const e = etatWarmup(
      compte({
        releves: [
          releve("2026-10-23T18:00:00Z", { abonnements: 4 }),
          releve("2026-10-24T06:00:00Z", { existe: null, abonnements: null, likes: null }),
        ],
      }),
      AUJ,
    );
    expect(e).toMatchObject({ tiktok: "cree", abonnements: 4, warmup: true, statut: "en_cours" });
    expect(e.dernierReleve).toBe("2026-10-23T18:00:00Z");
  });

  it("jamais relevé : statut inconnu, en cours après 2 jours", () => {
    const e = etatWarmup(compte({ cree_le: "2026-10-19T09:00:00Z" }), AUJ);
    expect(e).toMatchObject({ tiktok: "inconnu", warmup: false, statut: "en_cours", ageJours: 5 });
  });

  it("les filtres", () => {
    const c = compte({ glisse_de: "2026-10-19" });
    const e = etatWarmup(c, AUJ);
    expect(garderWarmup("glisses", c, e)).toBe(true);
    expect(garderWarmup("sans_start", c, e)).toBe(true);
    expect(garderWarmup("prets", c, e)).toBe(false);
  });

  it("le cumul de la semaine : un trou avant le premier relevé et pour les jours à venir", () => {
    const comptes = [
      compte({
        cree_le: "2026-10-19T09:00:00Z",
        warmup_lance_le: "2026-10-21T09:00:00Z",
        releves: [
          releve("2026-10-23T18:00:00Z", { cree_tiktok_at: "2026-10-20T08:00:00Z", abonnements: 0 }),
          releve("2026-10-24T06:00:00Z", { cree_tiktok_at: "2026-10-20T08:00:00Z", abonnements: 5 }),
        ],
      }),
      compte({ compte_id: "c2", cree_le: "2026-10-22T09:00:00Z" }),
    ];
    const serie = serieWarmup(comptes, "2026-10-26", AUJ);
    expect(serie.map((p) => p.crees)).toEqual([1, 1, 1, 2, 2, 2, null]);
    expect(serie.map((p) => p.tiktok)).toEqual([0, 1, 1, 1, 1, 1, null]);
    expect(serie.map((p) => p.start)).toEqual([0, 0, 1, 1, 1, 1, null]);
    expect(serie.map((p) => p.warmup)).toEqual([null, null, null, null, 0, 1, null]);
  });
});

describe("première semaine de posts", () => {
  const AUJ = "2026-10-22";
  const posts = [
    { jour: "2026-10-19", vues: 6200, url: "u1", mesure: true },
    { jour: "2026-10-19", vues: 31, url: "u2", mesure: true },
    { jour: "2026-10-20", vues: 400, url: "u3", mesure: true },
    { jour: "2026-10-20", vues: null, url: null, mesure: false },
    { jour: "2026-10-21", vues: 120, url: "u5", mesure: false },
    { jour: "2026-10-22", vues: null, url: null, mesure: false },
    { jour: "2026-10-23", vues: null, url: null, mesure: false },
  ];

  it("chaque post : bon, mort, normal, manqué, en attente du relevé, pas encore posté, à venir", () => {
    expect(posts.map((p) => etatPost(p, AUJ, 50, 3000))).toEqual([
      "bon", "mort", "normal", "manque", "attente", "pas_encore", "a_venir",
    ]);
  });

  it("le bilan d'un compte : jusqu'à aujourd'hui compris", () => {
    expect(bilanCompte(compte({ posts }), AUJ)).toEqual({ prevus: 6, publies: 4, manques: 1, morts: 1, bons: 1, mediane: 400 });
  });

  it("le bilan de la semaine : par jour, la répartition, les comptes à jour", () => {
    const b = bilanSemaine([compte({ posts }), compte({ compte_id: "c2", posts: [{ jour: "2026-10-19", vues: 90, url: "x", mesure: true }] })], "2026-10-19", AUJ);
    expect(b.parJour.map((j) => [j.prevus, j.publies, j.aVenir])).toEqual([
      [3, 3, false], [2, 1, false], [1, 1, false], [1, 0, false], [1, 0, true],
    ]);
    expect(b.prevus).toBe(7);
    expect(b.publies).toBe(5);
    expect(b.repartition).toMatchObject({ bon: 1, mort: 1, normal: 2, manque: 1, attente: 1, pas_encore: 1, a_venir: 1 });
    expect([b.aJour, b.avecManque]).toEqual([1, 1]);
    expect(b.mediane).toBe(245);
  });

  it("les retards du jour, les plus en retard d'abord", () => {
    const comptes = [
      compte({ handle: "b", posts: [{ jour: "2026-10-20", vues: 1, url: "x", mesure: true }, { jour: "2026-10-20", vues: null, url: null, mesure: false }] }),
      compte({ compte_id: "c2", handle: "a", posts: [{ jour: "2026-10-20", vues: null, url: null, mesure: false }] }),
      compte({ compte_id: "c3", handle: "c", posts: [{ jour: "2026-10-20", vues: 1, url: "x", mesure: true }] }),
    ];
    expect(retardsDuJour(comptes, "2026-10-20").map((r) => [r.compte.handle, r.publies, r.prevus])).toEqual([
      ["a", 0, 1],
      ["b", 1, 2],
    ]);
  });

  it("la médiane", () => {
    expect(mediane([])).toBeNull();
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([1, 2, 3, 10])).toBe(3);
  });
});
