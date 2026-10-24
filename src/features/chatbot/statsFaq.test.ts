import { describe, expect, it } from "vitest";

import type { EtatFaq } from "./faq";
import { ilYA, issueDe, jourParis, nomsCourts, statsFaq, sujetCourt } from "./statsFaq";

const MAINTENANT = new Date("2026-10-24T15:00:00Z");

const q = (
  created_at: string,
  etat: EtatFaq | null,
  patch: { section_guide?: string; it_statut?: "pris_en_charge" | "repondu" } = {},
) => ({
  created_at,
  etat,
  section_guide: patch.section_guide ?? null,
  it_statut: patch.it_statut ?? null,
});

describe("issueDe", () => {
  it("range chaque état dans une des cinq issues", () => {
    expect(issueDe("repondu")).toBe("repondu");
    expect(issueDe("a_valider")).toBe("a_traiter");
    expect(issueDe("relance")).toBe("a_traiter");
    expect(issueDe("traite_slack")).toBe("traite");
    expect(issueDe("ignore")).toBe("traite");
    expect(issueDe("bug")).toBe("bug");
    expect(issueDe("hors_sujet")).toBe("hors_sujet");
    // Avant le cerveau : l'ancien assistant, ni réglé ni raté.
    expect(issueDe(null)).toBeNull();
  });
});

describe("statsFaq", () => {
  it("compte la semaine, la semaine d'avant, et le taux réglé par le bot", () => {
    const s = statsFaq(
      [
        q("2026-10-24T09:00:00Z", "repondu"),
        q("2026-10-23T09:00:00Z", "repondu"),
        q("2026-10-22T09:00:00Z", "a_traiter"),
        q("2026-10-21T09:00:00Z", "hors_sujet"),
        q("2026-10-20T09:00:00Z", null),
        q("2026-10-15T09:00:00Z", "repondu"), // semaine d'avant
      ],
      MAINTENANT,
      300,
    );
    expect(s.semaine).toBe(5);
    expect(s.semaineAvant).toBe(1);
    // 2 réglées sur 3 vraies questions : « merci !! » et l'ancien assistant ne comptent pas.
    expect(s.vraiesQuestions).toBe(3);
    expect(s.tauxBot).toBeCloseTo(2 / 3);
    expect(s.parIssue).toMatchObject({ repondu: 2, a_traiter: 1, hors_sujet: 1 });
  });

  it("suit les bugs passés à l'IT guy", () => {
    const s = statsFaq(
      [
        q("2026-10-24T09:00:00Z", "bug", { it_statut: "repondu" }),
        q("2026-10-24T10:00:00Z", "bug", { it_statut: "pris_en_charge" }),
        q("2026-10-24T11:00:00Z", "bug"),
      ],
      MAINTENANT,
      300,
    );
    expect(s.bugs).toEqual({ total: 3, regles: 1, enCours: 1 });
  });

  it("donne 14 jours de questions, trous compris, à l'heure de Paris", () => {
    // 23 h 30 UTC le 23 = 1 h 30 le 24 à Paris.
    const s = statsFaq([q("2026-10-23T23:30:00Z", "repondu")], MAINTENANT, 300);
    expect(s.parJour).toHaveLength(14);
    expect(s.parJour[0]!.jour).toBe("2026-10-11");
    expect(s.parJour[13]).toEqual({ jour: "2026-10-24", n: 1 });
    expect(s.parJour.slice(0, 13).every((j) => j.n === 0)).toBe(true);
  });

  it("classe les sujets du guide sur 30 jours", () => {
    const s = statsFaq(
      [
        q("2026-10-24T09:00:00Z", "repondu", { section_guide: "Guide › Paiements" }),
        q("2026-10-20T09:00:00Z", "repondu", { section_guide: "Guide › Paiements" }),
        q("2026-10-01T09:00:00Z", "repondu", { section_guide: "Guide › Warmup" }),
        q("2026-09-01T09:00:00Z", "repondu", { section_guide: "Guide › Musique" }), // trop vieux
      ],
      MAINTENANT,
      300,
    );
    expect(s.sujets).toEqual([
      { section: "Guide › Paiements", n: 2 },
      { section: "Guide › Warmup", n: 1 },
    ]);
  });

  it("signale un journal plein dont la plus vieille question est récente", () => {
    const pleins = Array.from({ length: 3 }, () => q("2026-10-22T09:00:00Z", "repondu"));
    expect(statsFaq(pleins, MAINTENANT, 3).tronque).toBe(true);
    expect(statsFaq(pleins, MAINTENANT, 300).tronque).toBe(false);
    // Plein, mais il remonte avant la fenêtre : rien ne manque dedans.
    const anciens = [...pleins.slice(0, 2), q("2026-09-01T09:00:00Z", "repondu")];
    expect(statsFaq(anciens, MAINTENANT, 3).tronque).toBe(false);
  });
});

describe("utilitaires", () => {
  it("garde le dernier niveau d'une section du guide", () => {
    expect(sujetCourt("Poster Guide › Quick answers › Musique")).toBe("Musique");
    expect(sujetCourt("Paiements")).toBe("Paiements");
    expect(sujetCourt("Poster Guide › Quick answers › Musique", 2)).toBe("Quick answers › Musique");
  });

  it("garde un niveau de plus quand deux sections finissent pareil", () => {
    const noms = nomsCourts(["Poster Guide › Planning", "Manager Guide › Planning", "Poster Guide › Musique"]);
    expect(noms.get("Poster Guide › Planning")).toBe("Poster Guide › Planning");
    expect(noms.get("Manager Guide › Planning")).toBe("Manager Guide › Planning");
    expect(noms.get("Poster Guide › Musique")).toBe("Musique");
  });

  it("dit l'âge d'une date", () => {
    expect(ilYA("2026-10-24T12:00:00Z", "fr", MAINTENANT).replace(/\s/g, " ")).toBe("il y a 3 h");
    expect(ilYA("2026-10-24T14:59:40Z", "en", MAINTENANT)).toBe("this minute");
    expect(ilYA("2026-10-21T15:00:00Z", "en", MAINTENANT)).toBe("3 days ago");
  });

  it("date à Paris", () => {
    expect(jourParis("2026-10-23T22:30:00Z")).toBe("2026-10-24");
  });
});
