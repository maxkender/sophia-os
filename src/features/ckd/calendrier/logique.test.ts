import { describe, expect, it } from "vitest";

import type { LigneCalendrier, PostCalendrier } from "./api";
import { aUnProbleme, caseDuJour, casesSemaine, filtrerLignes, joursSemaine, paysPresents, semainesChoix } from "./logique";

const LUNDI = "2026-10-26";
const MERCREDI = "2026-10-28";

function post(jour: string, rang: number, publie: boolean): PostCalendrier {
  return { jour, rang, url: publie ? `https://t/${jour}/${rang}` : null, vues: publie ? 100 : null, publie_at: null, mesure: publie };
}

function ligne(o: Partial<LigneCalendrier> = {}): LigneCalendrier {
  return {
    compte_id: "c1",
    poster_id: "p1",
    hm_id: "hm1",
    handle: "h1",
    pays: "FR",
    langue: "fr",
    is_active: true,
    warmup_lance: true,
    seuil_mort: 50,
    mediane_pays: 500,
    posts: [],
    diagnostic: {
      badge: "ok",
      attendus: 0,
      publies: 0,
      liens_manquants: [],
      mediane: null,
      mediane_ref: 500,
      morts: 0,
      seuil_mort: 50,
      shadowban: false,
    },
    ...o,
  };
}

describe("couleur des cases", () => {
  it("2/2 publiés : vert", () => {
    expect(caseDuJour([post(LUNDI, 1, true), post(LUNDI, 2, true)], LUNDI, MERCREDI).etat).toBe("ok");
  });
  it("1/2 un jour passé : orange", () => {
    const c = caseDuJour([post(LUNDI, 1, true), post(LUNDI, 2, false)], LUNDI, MERCREDI);
    expect(c).toMatchObject({ etat: "partiel", publies: 1, prevus: 2 });
  });
  it("0/2 un jour passé : rouge", () => {
    expect(caseDuJour([post(LUNDI, 1, false), post(LUNDI, 2, false)], LUNDI, MERCREDI).etat).toBe("rate");
  });
  it("jour à venir : gris", () => {
    expect(caseDuJour([post("2026-10-30", 1, false)], "2026-10-30", MERCREDI).etat).toBe("a_venir");
  });
  it("aujourd'hui pas encore tout publié : en cours (gris encadré), jamais rouge", () => {
    const c = caseDuJour([post(MERCREDI, 1, false), post(MERCREDI, 2, false)], MERCREDI, MERCREDI);
    expect(c).toMatchObject({ etat: "en_cours", aujourdhui: true });
  });
  it("aujourd'hui tout publié : vert", () => {
    expect(caseDuJour([post(MERCREDI, 1, true)], MERCREDI, MERCREDI).etat).toBe("ok");
  });
  it("aucun post prévu : vide", () => {
    expect(caseDuJour([], LUNDI, MERCREDI).etat).toBe("vide");
  });
  it("un compte à 1 ou 3 posts par jour : 1/1 et 3/3 sont verts", () => {
    expect(caseDuJour([post(LUNDI, 1, true)], LUNDI, MERCREDI).etat).toBe("ok");
    expect(caseDuJour([1, 2, 3].map((r) => post(LUNDI, r, true)), LUNDI, MERCREDI).etat).toBe("ok");
  });
  it("les posts du jour sont rangés par rang", () => {
    expect(caseDuJour([post(LUNDI, 2, true), post(LUNDI, 1, true)], LUNDI, MERCREDI).posts.map((p) => p.rang)).toEqual([1, 2]);
  });
});

describe("la semaine", () => {
  it("7 colonnes, du lundi au dimanche", () => {
    expect(joursSemaine(LUNDI)).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
    expect(casesSemaine(ligne(), LUNDI, MERCREDI)).toHaveLength(7);
  });
  it("au choix : cette semaine puis la semaine dernière, jamais la suivante", () => {
    expect(semainesChoix(LUNDI)).toEqual([LUNDI, "2026-10-19"]);
  });
});

describe("Problèmes seulement", () => {
  const bon = ligne({ compte_id: "bon", posts: [post(LUNDI, 1, true), post(LUNDI, 2, true)] });
  const rate = ligne({ compte_id: "rate", posts: [post(LUNDI, 1, false), post(LUNDI, 2, true)] });
  const shadow = ligne({
    compte_id: "shadow",
    posts: [post(LUNDI, 1, true)],
    diagnostic: { ...bon.diagnostic, badge: "shadowban", shadowban: true },
  });
  const aujourdhuiVide = ligne({ compte_id: "auj", posts: [post(MERCREDI, 1, false)] });

  it("un jour passé incomplet ou un diagnostic pas OK est un problème ; aujourd'hui en cours n'en est pas un", () => {
    expect(aUnProbleme(bon, LUNDI, MERCREDI)).toBe(false);
    expect(aUnProbleme(rate, LUNDI, MERCREDI)).toBe(true);
    expect(aUnProbleme(shadow, LUNDI, MERCREDI)).toBe(true);
    expect(aUnProbleme(aujourdhuiVide, LUNDI, MERCREDI)).toBe(false);
  });
  it("le filtre ne garde que les comptes à problème", () => {
    const f = { problemesSeulement: true, pays: "", hm: "" };
    expect(filtrerLignes([bon, rate, shadow, aujourdhuiVide], f, LUNDI, MERCREDI).map((l) => l.compte_id)).toEqual([
      "rate",
      "shadow",
    ]);
  });
});

describe("filtres pays et HM", () => {
  const fr = ligne({ compte_id: "fr", pays: "FR", hm_id: "a" });
  const de = ligne({ compte_id: "de", pays: "DE", hm_id: "b" });
  it("par pays", () => {
    expect(filtrerLignes([fr, de], { problemesSeulement: false, pays: "DE", hm: "" }, LUNDI, MERCREDI)).toEqual([de]);
    expect(paysPresents([fr, de, ligne({ pays: null })])).toEqual(["DE", "FR"]);
  });
  it("par HM (admin et Head of Ops)", () => {
    expect(filtrerLignes([fr, de], { problemesSeulement: false, pays: "", hm: "a" }, LUNDI, MERCREDI)).toEqual([fr]);
  });
});
