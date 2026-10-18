import { describe, expect, it } from "vitest";

import { lireCibleApplications, type MarcheApplications } from "./scoreApplication";
import { REGLAGES_CHOIX_LABEL_DEFAUT, type StatLabel } from "./scoreLabel";
import { simulerTirages } from "./tirages";

const SOPHIA = { id: "id-sophia", slug: "sophia", langues: null };
const UNSWIPE = { id: "id-unswipe", slug: "unswipe", langues: ["fr", "de"] };
const APPS = [SOPHIA, UNSWIPE];
const R = REGLAGES_CHOIX_LABEL_DEFAUT;

function stat(label_id: string, over: Partial<StatLabel> = {}): StatLabel {
  return {
    label_id,
    label_nom: label_id,
    comptes_langue: 0,
    comptes_pays: 0,
    comptes_total: 0,
    passages_restants: 2000,
    demande_jour: 10,
    passages: 500,
    perf_label: 1,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
    ...over,
  };
}

function marche(langue: string, parts: Record<string, number> = {}): MarcheApplications {
  return {
    langue,
    pays: langue === "fr" ? "FR" : "PL",
    parts: Object.entries(parts).map(([slug, comptes]) => ({
      application_id: APPS.find((a) => a.slug === slug)!.id,
      slug,
      comptes,
    })),
  };
}

describe("projection des prochains tirages", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, ["sophia", "unswipe"]);
  const stats = {
    "id-sophia": [stat("a"), stat("b")],
    "id-unswipe": [stat("c")],
  };

  it("les parts somment à 100", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(Math.round(t.reduce((a, x) => a + x.part, 0))).toBe(100);
  });

  it("la projection couvre bien n comptes", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(20);
  });

  it("en polonais, Unswipe ne sert pas : tout va à Sophia", () => {
    const t = simulerTirages(marche("pl"), stats, cible, APPS, R, 10);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(10);
  });

  it("en français, les deux applications servent, dans l'ordre de la cible", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    const parApp = new Map<string, number>();
    for (const x of t) parApp.set(x.app, (parApp.get(x.app) ?? 0) + x.comptes);
    expect(parApp.get("sophia")).toBe(6);
    expect(parApp.get("unswipe")).toBe(4);
  });

  it("les deux labels d'une application se partagent ses tirages", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    const sophia = t.filter((x) => x.app === "sophia");
    expect(sophia).toHaveLength(2);
    expect(sophia[0].comptes).toBe(3);
    expect(sophia[1].comptes).toBe(3);
  });

  it("un label déjà installé passe derrière celui qui est libre", () => {
    const charge = {
      "id-sophia": [stat("a", { comptes_pays: 10, comptes_langue: 10 }), stat("b")],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    // Sur 6 tirages, « a » (20 de présence) ne repasse jamais devant « b »,
    // qui part de 0 et plafonne à 12 de présence au dernier tour.
    const six = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 6);
    expect(six.map((x) => x.label_nom)).toEqual(["b"]);

    // Il revient quand « b » s'est assez rempli pour le rattraper.
    const trente = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 30);
    const a = trente.find((x) => x.label_nom === "a");
    const b = trente.find((x) => x.label_nom === "b")!;
    expect(a, "« a » finit par revenir").toBeDefined();
    expect(b.comptes).toBeGreaterThan(a!.comptes);
  });

  it("une application sans label utilisable est sautée, pas de compte perdu", () => {
    const sansLabels = { "id-sophia": [stat("a")], "id-unswipe": [] };
    const t = simulerTirages(marche("fr"), sansLabels, cible, APPS, R, 8);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(8);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
  });

  it("aucune donnée du tout : projection vide, pas de boucle infinie", () => {
    expect(simulerTirages(marche("fr"), {}, cible, APPS, R, 20)).toEqual([]);
  });

  it("un label fermé n'apparaît jamais dans la projection", () => {
    const ferme = { ...R, fermes: ["a"] };
    const t = simulerTirages(marche("pl"), { "id-sophia": [stat("a"), stat("b")] },
      lireCibleApplications(null, ["sophia"]), [SOPHIA], ferme, 6);
    expect(t.map((x) => x.label_nom)).toEqual(["b"]);
  });

  it("n = 0 ne rend rien", () => {
    expect(simulerTirages(marche("fr"), stats, cible, APPS, R, 0)).toEqual([]);
  });

  it("la projection est stable : deux appels donnent le même résultat", () => {
    const a = simulerTirages(marche("fr"), stats, cible, APPS, R, 15);
    const b = simulerTirages(marche("fr"), stats, cible, APPS, R, 15);
    expect(a).toEqual(b);
  });

  it("elle ne modifie pas les statistiques qu'on lui passe", () => {
    const copie = JSON.parse(JSON.stringify(stats));
    simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(stats).toEqual(copie);
  });
});
