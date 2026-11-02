import { describe, expect, it } from "vitest";

import {
  baseline,
  ciblesParHm,
  type InfoPays,
  lignesPays,
  nomVersCode,
  objectifSuggere,
  paysDeTitre,
  paysDeZone,
  type SemainePays,
  semainesCompletes,
  type TableauPays,
  totaux,
  marcheDe,
  regrouperParLangue,
  aFaireSemaine,
  annoncesActives,
  drapeau,
  statutCompte,
  tableauHm,
  topFlopRoi,
  totauxPeriode,
  variation,
} from "./logique";

const sem = (pays: string, semaine: string, o: Partial<SemainePays> = {}): SemainePays => ({
  pays, semaine, vues: 0, comptes: 0, sous_seuil: 0, proceeds: 0, proceeds_new: null, transactions: 0, incomplet: false,
  cout_reel: null, cout_estime: null, comptes_publies: 0, ...o,
});
const info = (pays: string, o: Partial<InfoPays> = {}): InfoPays => ({
  pays, zone: "A", zone_retiree: false, tarif: 14, objectif: null, note: null, premier_post: "2026-08-20",
  posteurs_actifs: 0, comptes_actifs: 0, cohorte_en_cours: 0, cohorte_suivante: 0, start_tuesday: 0, postpone: 0, ...o,
});
const tableau = (o: Partial<TableauPays>): TableauPays => ({
  aujourdhui: "2026-11-02", lundi: "2026-11-02", semaines: [], pays: [], offres: [], hms: [], reglages: { taux_usd_eur: 1 },
  devise: "EUR", lecture: null, ...o,
});

describe("Page Pays : périodes", () => {
  it("les semaines complètes, sans la semaine en cours", () => {
    expect(semainesCompletes("2026-11-02", 1)).toEqual(["2026-10-26"]);
    expect(semainesCompletes("2026-11-02", 4)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});

describe("Page Pays : baseline", () => {
  it("proceeds moyens par semaine avant la semaine du 1er post (depuis le 3 août)", () => {
    const s = [sem("MX", "2026-08-03", { proceeds: 100 }), sem("MX", "2026-08-10", { proceeds: 300 }), sem("MX", "2026-08-17", { proceeds: 900 })];
    // 1er post le 19/08 : semaines du 3 et du 10 août → (100 + 300) / 2.
    expect(baseline(s, "2026-08-19")).toBe(200);
    // Une semaine sans ligne compte pour 0.
    expect(baseline([sem("MX", "2026-08-10", { proceeds: 300 })], "2026-08-19")).toBe(150);
  });
  it("pas de baseline si le pays postait dès le début, ou jamais", () => {
    expect(baseline([], "2026-07-27")).toBeNull();
    expect(baseline([], null)).toBeNull();
  });
});

describe("Page Pays : objectif suggéré selon le ROI", () => {
  it("> 3 : +30 % ; 1 à 3 : stable ; < 1 : −30 % ; < 0,5 sur 4 semaines : 0", () => {
    expect(objectifSuggere(10, 4, 4)).toBe(13);
    expect(objectifSuggere(10, 2, 2)).toBe(10);
    expect(objectifSuggere(10, 0.8, 0.8)).toBe(7);
    expect(objectifSuggere(10, 0.8, 0.4)).toBe(0);
    expect(objectifSuggere(10, null, null)).toBe(10);
  });
});

describe("Page Pays : offres et zones", () => {
  it("le pays d'une offre d'après son titre", () => {
    expect(paysDeTitre("TikTok slideshow creator (based in Hungary)")).toBe("HU");
    expect(paysDeTitre("TikTok Content Posting for Slideshows - Israel (ISRAEL)")).toBe("IL");
    expect(paysDeTitre("TikTok Content Posting for Slideshows — [Finnish] [Finland]")).toBe("FI");
    expect(paysDeTitre("🌍📱 Turn 10 Minutes a Day Into Weekly Pay: Post Ready-Made TikToks")).toBeNull();
  });
  it("noms anglais → codes ISO, sans les codes historiques (DD, FX)", () => {
    expect(nomVersCode("Germany")).toBe("DE");
    expect(nomVersCode("France")).toBe("FR");
    expect(nomVersCode("UK")).toBe("GB");
  });
  it("les pays d'une zone de recrutement", () => {
    expect(paysDeZone("US + UK + Netherlands", nomVersCode)).toEqual(["US", "GB", "NL"]);
    expect(paysDeZone("Hungary + Poland + UAE", nomVersCode)).toEqual(["HU", "PL", "AE"]);
  });
});

describe("Page Pays : lignes, ROI et recommandation", () => {
  const semaines = (pays: string, proceeds: number, cout: number, vues: number) =>
    semainesCompletes("2026-11-02", 8).map((w) => sem(pays, w, { proceeds, cout_reel: cout, vues, comptes: 10, sous_seuil: 2 }));

  it("ROI > 3 : recruter jusqu'à +30 %", () => {
    const t = tableau({ semaines: semaines("DE", 400, 100, 100_000), pays: [info("DE", { comptes_actifs: 10, premier_post: "2026-07-27" })] });
    const [l] = lignesPays(t, "28j");
    expect(l.roi).toBe(4);
    expect(l.objectif_suggere).toBe(13);
    expect(l.manque).toBe(3);
    expect(l.recommandation).toBe("recruter");
    expect(l.rpm).toBe(4);
    expect(l.vues_par_compte).toBe(10_000);
    expect(l.pct_sous_seuil).toBe(20);
    expect(l.sparkline).toHaveLength(8);
  });

  it("ROI < 0,5 sur 4 semaines : arrêter", () => {
    const t = tableau({ semaines: semaines("TR", 20, 100, 100_000), pays: [info("TR", { comptes_actifs: 10, premier_post: "2026-07-27" })] });
    const [l] = lignesPays(t, "8s");
    expect(l.recommandation).toBe("arreter");
    expect(l.objectif).toBe(0);
  });

  it("l'objectif réglé à la main remplace la suggestion ; la file compte cohortes et offres", () => {
    const t = tableau({
      semaines: semaines("HU", 200, 100, 100_000),
      pays: [info("HU", { comptes_actifs: 5, cohorte_en_cours: 2, cohorte_suivante: 1, objectif: 12, premier_post: "2026-07-27" })],
      offres: [{ titre: "TikTok slideshow creator (based in Hungary)", freelancer: "X", debut_at: null }],
    });
    const [l] = lignesPays(t, "28j");
    expect(l.pipeline).toBe(9);
    expect(l.manque).toBe(3);
    expect(l.objectif_manuel).toBe(true);
  });

  it("revenu sans posteurs : hors décision et hors ROI global", () => {
    const t = tableau({
      semaines: [...semaines("MX", 300, 0, 0).map((s) => ({ ...s, cout_reel: null, comptes: 0, sous_seuil: 0 })), ...semaines("DE", 400, 100, 100_000)],
      pays: [info("MX", { premier_post: null }), info("DE", { comptes_actifs: 10, premier_post: "2026-07-27" })],
    });
    const lignes = lignesPays(t, "28j");
    const mx = lignes.find((l) => l.pays === "MX")!;
    expect(mx.revenu_sans_posteurs).toBe(true);
    expect(mx.recommandation).toBe("exclu");
    const tot = totaux(lignes);
    expect(tot.roi).toBe(4);
    expect(tot.proceeds).toBe(2800);
  });

  it("les objectifs préparés par HM, selon les zones", () => {
    const t = tableau({ semaines: semaines("DE", 400, 100, 100_000), pays: [info("DE", { comptes_actifs: 10, premier_post: "2026-07-27" })] });
    const { cibles, sansHm } = ciblesParHm(lignesPays(t, "28j"), [{ id: "h1", nom: "Regina", zone: "Germany + Norway" }]);
    expect(cibles).toHaveLength(1);
    expect(cibles[0].total).toBe(3);
    expect(sansHm).toEqual([]);
  });
});

describe("Page Pays : un marché par langue (Espagne et LATAM à part)", () => {
  it("regroupe DE/AT/CH, sépare ES et LATAM, laisse un pays seul tel quel", () => {
    expect([marcheDe("DE"), marcheDe("AT"), marcheDe("CH")]).toEqual(["de", "de", "de"]);
    expect([marcheDe("ES"), marcheDe("MX"), marcheDe("CO")]).toEqual(["es", "es-419", "es-419"]);
    expect(marcheDe("TR")).toBe("TR");
    const t = regrouperParLangue(tableau({
      semaines: [sem("DE", "2026-10-26", { vues: 100, proceeds: 10, cout_reel: 5 }), sem("AT", "2026-10-26", { vues: 50, proceeds: 30, cout_reel: null }),
        sem("MX", "2026-10-26", { proceeds: 40 }), sem("ES", "2026-10-26", { proceeds: 7 })],
      pays: [info("DE", { comptes_actifs: 20, premier_post: "2026-07-27" }), info("AT", { comptes_actifs: 1, zone: "A", premier_post: "2026-10-20" }),
        info("MX", { premier_post: null, zone: "C" }), info("CO", { comptes_actifs: 5, zone: "C" }), info("ES", { comptes_actifs: 17, zone: "B" }),
        info("de", { objectif: 30, zone: null, premier_post: null })],
    }));
    const de = t.pays.find((p) => p.pays === "de")!;
    expect([de.comptes_actifs, de.objectif, de.premier_post, de.membres]).toEqual([21, 30, "2026-07-27", ["AT", "DE"]]);
    const s = t.semaines.find((x) => x.pays === "de")!;
    expect([s.vues, s.proceeds, s.cout_reel]).toEqual([150, 40, 5]);
    expect(t.pays.find((p) => p.pays === "es-419")!.membres).toEqual(["CO", "MX"]);
    expect(t.pays.find((p) => p.pays === "es")!.comptes_actifs).toBe(17);
  });
});

describe("Page Pays (refonte) : un pays par ligne, cartes, à faire, recrutement", () => {
  it("ROI élevé avec assez de recrues en route : maintenir, pas réduire", () => {
    const t0 = tableau({
      semaines: semainesCompletes("2026-11-02", 8).map((w) => sem("NO", w, { proceeds: 400, cout_reel: 100, vues: 100_000, comptes: 3 })),
      pays: [info("NO", { comptes_actifs: 3, cohorte_en_cours: 2, premier_post: "2026-07-27" })],
    });
    const [l] = lignesPays(t0, "28j");
    expect(l.objectif).toBe(4);
    expect(l.manque).toBe(-1);
    expect(l.recommandation).toBe("maintenir");
  });

  const semaines = (pays: string, proceeds: number, cout: number, vues: number) =>
    semainesCompletes("2026-11-02", 8).map((w) => sem(pays, w, { proceeds, cout_reel: cout, vues, comptes: 10, sous_seuil: 2 }));
  const t = tableau({
    semaines: [
      ...semaines("DE", 400, 100, 100_000),
      ...semaines("TR", 20, 100, 100_000),
      ...semaines("MX", 300, 0, 0).map((s) => ({ ...s, cout_reel: null, comptes: 0, sous_seuil: 0 })),
    ],
    pays: [
      info("DE", { comptes_actifs: 10, premier_post: "2026-07-27" }),
      info("TR", { comptes_actifs: 10, premier_post: "2026-07-27" }),
      info("MX", { premier_post: null }),
    ],
  });
  const lignes = lignesPays(t, "28j");

  it("ROI global = Σ incrémental ÷ Σ paie, sans les pays sans posteur", () => {
    const tot = totauxPeriode(lignes);
    expect(tot.cout).toBe(800);
    expect(tot.incremental).toBe(1680);
    expect(tot.roi).toBe(2.1);
    expect(tot.sans_posteurs).toBe(1200);
    expect(tot.proceeds).toBe(2880);
  });

  it("variation en % vs la période d'avant", () => {
    expect(variation(120, 100)).toBe(20);
    expect(variation(80, 100)).toBe(-20);
    expect(variation(10, 0)).toBeNull();
  });

  it("à faire : arrêter le pays à ROI < 0,5, recruter ailleurs ; top / flop par ROI", () => {
    const faire = aFaireSemaine(lignes, lignes);
    expect(faire[0]).toEqual({ type: "arreter", pays: "TR" });
    expect(faire.find((a) => a.type === "recruter")?.pays).toBe("DE");
    expect(faire.length).toBeLessThanOrEqual(5);
    const { top, flop } = topFlopRoi(lignes);
    expect(top[0].pays).toBe("DE");
    expect(flop[0].pays).toBe("TR");
    expect(top.some((l) => l.pays === "MX")).toBe(false);
  });

  it("annonce active si elle a amené un contrat dans les 21 jours ; tableau par HM", () => {
    const actives = annoncesActives(
      [
        { titre: "TikTok poster (Germany)", pays: "DE", generique: false, vue_at: "2026-10-28T10:00:00Z", contrats_21j: 2 },
        { titre: "TikTok poster (Turkey)", pays: "TR", generique: false, vue_at: "2026-10-28T10:00:00Z", contrats_21j: 0 },
      ],
    );
    expect([...actives]).toEqual(["DE"]);
    const hm = tableauHm(lignes, [{ id: "h1", nom: "Regina", zone: "Germany + Turkey" }], actives);
    expect(hm.map((h) => [h.pays, h.manque > 0, h.annonce])).toEqual([["DE", true, true], ["TR", false, false]]);
  });

  it("statut d'un compte et drapeau", () => {
    expect(statutCompte(2000, 1000)).toBe("bon");
    expect(statutCompte(1000, 1000)).toBe("moyen");
    expect(statutCompte(999, 1000)).toBe("sous_seuil");
    expect(drapeau("DE")).toBe("🇩🇪");
    expect(drapeau("de")).toBe("");
  });
});
