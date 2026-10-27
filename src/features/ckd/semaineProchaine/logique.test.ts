import { describe, expect, it } from "vitest";

import type { ReleveWarmup } from "../cohorte/api";
import type { CompteSemaine } from "./api";
import { etatSemaine, phrasePosteur, prenom } from "./logique";

// Lundi 2 novembre : la cohorte qui démarre. Le samedi d'avant : 31 octobre.
const LUNDI = "2026-11-02";

function releve(at: string, o: Partial<ReleveWarmup> = {}): ReleveWarmup {
  return { at, existe: true, cree_tiktok_at: null, abonnements: 0, likes: 0, abonnes: 0, videos: 0, ...o };
}

function compte(o: Partial<CompteSemaine> = {}): CompteSemaine {
  return {
    compte_id: "c1",
    poster_id: "p1",
    hm_id: "hm",
    handle: "anna.studies",
    pays: "FR",
    type: "premier",
    ancien_handle: null,
    is_active: true,
    cree_le: "2026-10-26T09:00:00Z",
    warmup_lance_le: null,
    warmup_fin: null,
    reposts_le: null,
    releves: [],
    ...o,
  };
}

const statuts = (c: CompteSemaine, jour: string) =>
  Object.fromEntries(etatSemaine(c, LUNDI, jour).etapes.map((e) => [e.cle, e.statut]));

describe("les 6 étapes", () => {
  it("tout fait : chaque étape a sa date, le compte est prêt", () => {
    const c = compte({
      warmup_lance_le: "2026-10-27T10:00:00Z",
      reposts_le: "2026-10-29T18:00:00Z",
      releves: [
        releve("2026-10-27T06:00:00Z", { cree_tiktok_at: "2026-10-26T20:00:00Z" }),
        releve("2026-10-28T06:00:00Z", { abonnements: 2, likes: 10 }),
        releve("2026-10-29T06:00:00Z", { abonnements: 6, likes: 30 }),
      ],
    });
    const e = etatSemaine(c, LUNDI, "2026-10-30");
    expect(e.pret).toBe(true);
    expect(e.retard).toBeNull();
    expect(e.etapes.map((x) => [x.cle, x.statut, x.le])).toEqual([
      ["compteOs", "fait", "2026-10-26"],
      ["tiktok", "fait", "2026-10-26"],
      ["start", "fait", "2026-10-27"],
      ["warmup", "fait", "2026-10-28"],
      ["exigences", "fait", "2026-10-29"],
      ["pret", "fait", null],
    ]);
    expect([e.follows, e.likes]).toEqual([6, 30]);
  });

  it("compte TikTok et Start : à faire le 1er jour, en retard 2 jours après la création dans l'OS", () => {
    expect(statuts(compte(), "2026-10-27")).toMatchObject({ tiktok: "a_faire", start: "a_faire" });
    expect(statuts(compte(), "2026-10-28")).toMatchObject({ tiktok: "en_retard", start: "en_retard" });
  });

  it("un relevé illisible ne prouve rien : le compte TikTok reste à faire", () => {
    const c = compte({ releves: [releve("2026-10-27T06:00:00Z", { existe: null })] });
    expect(etatSemaine(c, LUNDI, "2026-10-27").etapes[1]!.statut).toBe("a_faire");
  });

  it("warm-up et 5 follows + 2 reposts : en retard à partir du samedi", () => {
    const c = compte({ warmup_lance_le: "2026-10-26T10:00:00Z", releves: [releve("2026-10-27T06:00:00Z")] });
    expect(statuts(c, "2026-10-30")).toMatchObject({ warmup: "a_faire", exigences: "a_faire" });
    expect(statuts(c, "2026-10-31")).toMatchObject({ warmup: "en_retard", exigences: "en_retard" });
  });

  it("5 follows sans les reposts cochés : pas fait", () => {
    const c = compte({ releves: [releve("2026-10-27T06:00:00Z", { abonnements: 8 })] });
    expect(statuts(c, "2026-10-29").exigences).toBe("a_faire");
  });

  it("prêt pour lundi n'est jamais en retard avant la date limite", () => {
    expect(statuts(compte(), "2026-11-01").pret).toBe("a_faire");
  });
});

describe("la phrase au posteur", () => {
  it("aucune quand rien n'est en retard", () => {
    expect(phrasePosteur(etatSemaine(compte(), LUNDI, "2026-10-26"), { prenom: "Anna", handle: "a", reposts: false })).toBeNull();
  });

  it("pour la première étape en retard, en anglais, avec le @ et la date limite", () => {
    const p = phrasePosteur(etatSemaine(compte(), LUNDI, "2026-10-28"), {
      prenom: "Anna",
      handle: "anna.studies",
      reposts: false,
    });
    expect(p).toBe(
      'Hi Anna! @anna.studies isn\'t created on TikTok yet. Please create it today, then press "Start warmup" in the OS. Deadline: Sunday midnight, otherwise your start moves to the following week.',
    );
  });

  it("5 follows + 2 reposts : dit ce qui manque", () => {
    const c = compte({
      warmup_lance_le: "2026-10-26T10:00:00Z",
      releves: [releve("2026-10-27T06:00:00Z", { cree_tiktok_at: "2026-10-26T08:00:00Z", abonnements: 3, likes: 5 })],
    });
    const e = etatSemaine(c, LUNDI, "2026-10-31");
    expect(e.retard).toBe("exigences");
    expect(phrasePosteur(e, { prenom: "Anna", handle: "a", reposts: false })).toContain(
      'follow at least 5 accounts (you have 3), and repost 2 videos and tick "I did 2 reposts" in the OS',
    );
    expect(phrasePosteur(e, { prenom: "Anna", handle: "a", reposts: true })).not.toContain("repost 2");
  });

  it("le prénom : premier mot du nom", () => {
    expect(prenom("Anna Martin")).toBe("Anna");
    expect(prenom("")).toBe("there");
  });
});
