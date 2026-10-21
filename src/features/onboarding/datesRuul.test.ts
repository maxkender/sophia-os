import { describe, expect, it } from "vitest";

import { ajouterJours, conseilWarmupRuul, friseRuul, partiesParis, premierPaiementRuul } from "./datesRuul";

// Lundi de démarrage du 26/10/2026 (heure d'hiver à Paris depuis le 25/10 : UTC+1).
const DEBUT = "2026-10-26";

describe("dates de la cohorte Ruul", () => {
  it("premier paiement : le lundi qui suit la première semaine de posts", () => {
    expect(premierPaiementRuul(DEBUT)).toBe("2026-11-02");
    expect(ajouterJours(DEBUT, -1)).toBe("2026-10-25");
  });

  it("heure de Paris, changement d'heure compris", () => {
    expect(partiesParis(new Date("2026-10-25T23:00:00Z"))).toEqual({ date: "2026-10-26", heure: "00:00" });
    expect(partiesParis(new Date("2026-10-17T22:00:00Z"))).toEqual({ date: "2026-10-18", heure: "00:00" });
  });

  it("pas lancé, jeudi d'avant : à lancer, posts le lundi", () => {
    expect(
      conseilWarmupRuul({ debutLe: DEBUT, warmupStartedAt: null, warmupEndsAt: null, maintenant: new Date("2026-10-22T10:00:00Z") }),
    ).toEqual({ cas: "a_lancer" });
  });

  it("pas lancé, le dimanche d'avant : encore à temps, posts le lundi (plus de minimum de 24 h)", () => {
    expect(
      conseilWarmupRuul({ debutLe: DEBUT, warmupStartedAt: null, warmupEndsAt: null, maintenant: new Date("2026-10-25T09:00:00Z") }),
    ).toEqual({ cas: "a_lancer" });
  });

  it("pas lancé, lundi passé : en retard", () => {
    expect(
      conseilWarmupRuul({ debutLe: DEBUT, warmupStartedAt: null, warmupEndsAt: null, maintenant: new Date("2026-10-27T09:00:00Z") }),
    ).toEqual({ cas: "a_lancer_en_retard" });
  });

  it("lancé jeudi : se termine pile au lundi 00:00 de Paris, posts ce matin-là", () => {
    expect(
      conseilWarmupRuul({
        debutLe: DEBUT,
        warmupStartedAt: "2026-10-22T10:00:00Z",
        warmupEndsAt: "2026-10-25T23:00:00Z",
        maintenant: new Date("2026-10-23T10:00:00Z"),
      }),
    ).toEqual({ cas: "en_cours", fin: "2026-10-25T23:00:00Z", finAuLundi: true });
  });

  it("fin hors minuit (ancien minuteur de 24 h) : pas « ce matin-là »", () => {
    const c = conseilWarmupRuul({
      debutLe: DEBUT,
      warmupStartedAt: "2026-10-25T09:00:00Z",
      warmupEndsAt: "2026-10-26T09:00:00Z",
      maintenant: new Date("2026-10-25T12:00:00Z"),
    });
    expect(c).toEqual({ cas: "en_cours", fin: "2026-10-26T09:00:00Z", finAuLundi: false });
  });

  it("warm-up fini : plus de conseil", () => {
    expect(
      conseilWarmupRuul({
        debutLe: DEBUT,
        warmupStartedAt: "2026-10-22T10:00:00Z",
        warmupEndsAt: "2026-10-25T23:00:00Z",
        maintenant: new Date("2026-10-26T08:00:00Z"),
      }),
    ).toEqual({ cas: "termine" });
  });
});

describe("frise de la première semaine (cohorte Ruul)", () => {
  const base = { debutLe: DEBUT, warmupStartedAt: null, warmupEndsAt: null };

  it("jeudi d'avant, pas lancé : tout reste à faire, l'étape en cours est le clic", () => {
    const f = friseRuul({ ...base, maintenant: new Date("2026-10-22T10:00:00Z") });
    expect(f.etats).toEqual({ lancer: "en_cours", warmup: "a_venir", posts: "a_venir", paiement: "a_venir" });
    expect(f.terminee).toBe(false);
  });

  it("warm-up en cours : le clic est fait", () => {
    const f = friseRuul({
      debutLe: DEBUT,
      warmupStartedAt: "2026-10-22T10:00:00Z",
      warmupEndsAt: "2026-10-25T23:00:00Z",
      maintenant: new Date("2026-10-23T10:00:00Z"),
    });
    expect(f.etats).toEqual({ lancer: "fait", warmup: "en_cours", posts: "a_venir", paiement: "a_venir" });
  });

  it("semaine de posts, puis le lundi du premier paiement, puis plus de frise", () => {
    const lance = { debutLe: DEBUT, warmupStartedAt: "2026-10-22T10:00:00Z", warmupEndsAt: "2026-10-25T23:00:00Z" };
    expect(friseRuul({ ...lance, maintenant: new Date("2026-10-28T10:00:00Z") }).etats.posts).toBe("en_cours");
    expect(friseRuul({ ...lance, maintenant: new Date("2026-11-01T10:00:00Z") }).etats.paiement).toBe("a_venir");
    expect(friseRuul({ ...lance, maintenant: new Date("2026-11-02T10:00:00Z") }).etats.paiement).toBe("en_cours");
    expect(friseRuul({ ...lance, maintenant: new Date("2026-11-03T10:00:00Z") }).terminee).toBe(true);
  });
});
