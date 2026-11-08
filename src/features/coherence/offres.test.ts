import { describe, expect, it } from "vitest";

import type { JalonUpwork } from "../../../supabase/functions/_shared/paiement";
import { planCompleterOffre, semainesDepuis } from "../../../supabase/functions/_shared/offres";

const j = (id: string, nom: string, depot: number, etat = "NotFunded", sequence = Number(id)): JalonUpwork =>
  ({ id, nom, etat, sequence, depot, paye: null, echeance: null }) as JalonUpwork;

describe("7/11 : offre HM incomplète corrigée sans financer", () => {
  it("semaines ISO de la cohorte", () => {
    expect(semainesDepuis("2026-11-09")).toEqual([46, 47, 48, 49]);
    expect(semainesDepuis("2026-12-21")).toEqual([52, 53, 1, 2]);
  });

  it("1 seul « Week 46 » : crée Week 47 à 49 au tarif de la zone", () => {
    const p = planCompleterOffre([j("1", "Week 46", 10, "Active")], [46, 47, 48, 49], 10);
    expect(p.refus).toBeNull();
    expect(p.actions).toEqual([
      { type: "creer", nom: "Week 47", montant: 10 },
      { type: "creer", nom: "Week 48", montant: 10 },
      { type: "creer", nom: "Week 49", montant: 10 },
    ]);
  });

  it("« Trial week » financé : compté Week 46 (pas renommé, Upwork refuse), puis 47 à 49 créés", () => {
    const p = planCompleterOffre([j("1", "TikTok Content Posting for Slideshows —Germany", 14, "Active")], [46, 47, 48, 49], 14);
    expect(p.actions[0]).toEqual({ type: "compter", jalon_id: "1", nom: "TikTok Content Posting for Slideshows —Germany", semaine: 46 });
    expect(p.actions.filter((a) => a.type === "creer")).toHaveLength(3);
  });

  it("« Trial week » non financé : renommé en Week 46", () => {
    const p = planCompleterOffre([j("1", "Trial week", 14)], [46, 47, 48, 49], 14);
    expect(p.actions[0]).toEqual({ type: "renommer", jalon_id: "1", de: "Trial week", vers: "Week 46" });
  });

  it("noms « week 46 - TikTok slideshows posting » : le financé reste, les autres renommés", () => {
    const p = planCompleterOffre(
      [j("1", "week 46 - TikTok slideshows posting", 10, "Active"), j("2", "week 47 - x", 10), j("3", "Week 48 - y", 10), j("4", "week 49  - z", 10)],
      [46, 47, 48, 49], 10);
    expect(p.actions.map((a) => (a.type === "renommer" ? a.vers : ""))).toEqual(["Week 47", "Week 48", "Week 49"]);
    expect(p.actions.every((a) => a.type === "renommer")).toBe(true);
  });

  it("offre complète : rien à faire", () => {
    const p = planCompleterOffre([j("1", "Week 46", 7, "Active"), j("2", "Week 47", 7), j("3", "Week 48", 7), j("4", "Week 49", 7)], [46, 47, 48, 49], 7);
    expect(p).toEqual({ actions: [], refus: null });
  });

  it("montant différent de la zone : l'OS ne touche à rien", () => {
    expect(planCompleterOffre([j("1", "Week 46", 12, "Active")], [46, 47, 48, 49], 10).refus).toMatch(/montant 12/);
    expect(planCompleterOffre([j("1", "Week 46", 10, "Active")], [46, 47, 48, 49], null).refus).toMatch(/tarif/);
  });

  it("plusieurs milestones sans semaine : refus", () => {
    expect(planCompleterOffre([j("1", "Trial", 10), j("2", "Bonus", 10)], [46, 47, 48, 49], 10).refus).toMatch(/2 milestones/);
  });
});
