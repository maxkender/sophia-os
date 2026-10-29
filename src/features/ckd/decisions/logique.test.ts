import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { SemaineDecisions } from "./api";
import { decisionDe, etatMoment, groupe, heureMoment, lundiAffiche, lundiDeLaSemaine, MOMENTS, raison } from "./logique";

const S: SemaineDecisions = {
  mercredi: { envoyes: 3 },
  jeudi: { calcule: true, propositions: 2, a_decider: 1 },
  samedi: { calcule: true, propositions: 5, a_decider: 0 },
  dimanche: { prevus: 4, faits: 0 },
  lundi: { lignes: 10, payees: 10 },
};

describe("Decisions (28 oct., partie C)", () => {
  it("trois groupes : Kill, Double, Recréer", () => {
    expect(groupe({ action: "ne_pas_renouveler" })).toBe("kill");
    expect(groupe({ action: "doubler" })).toBe("double");
    expect(groupe({ action: "recreer" })).toBe("recreate");
  });

  it("cochée : l'action proposée ; décochée : l'exception permise", () => {
    expect(decisionDe({ action: "ne_pas_renouveler", regle: "inactif" }, true)).toBe("ne_pas_renouveler");
    expect(decisionDe({ action: "ne_pas_renouveler", regle: "absent" }, false)).toBe("garder");
    expect(decisionDe({ action: "doubler", regle: "doubler" }, false)).toBe("pas_maintenant");
    expect(decisionDe({ action: "recreer", regle: "jeudi" }, false)).toBe("rien");
    expect(decisionDe({ action: "recreer", regle: "anciens" }, false)).toBe("garder");
  });

  it("la raison en une ligne, avec ses nombres", () => {
    expect(raison({ regle: "inactif", donnees: {}, mercredi_at: "2026-10-28T11:00:00Z" })).toEqual({
      cle: "inactif",
      mercredi: "2026-10-28T11:00:00Z",
    });
    expect(
      raison({ regle: "premiere_semaine", donnees: { periode: { publies: 6, haut: { vues: 180 } } }, mercredi_at: null }),
    ).toEqual({ cle: "premiere_semaine", publies: 6, haut: 180 });
    expect(raison({ regle: "absent", donnees: { periode: { attendus: 10, publies: 3 } }, mercredi_at: null })).toEqual({
      cle: "absent",
      manques: 7,
      attendus: 10,
    });
    expect(raison({ regle: "jeudi", donnees: { motifs: ["reveil"] }, mercredi_at: null })).toEqual({ cle: "reveil" });
  });

  it("la semaine affichée : le lundi montre encore la semaine d'avant (sa paie)", () => {
    expect(lundiAffiche("2026-10-28")).toBe("2026-10-26");
    expect(lundiAffiche("2026-11-01")).toBe("2026-10-26");
    expect(lundiAffiche("2026-11-02")).toBe("2026-10-26");
    expect(lundiAffiche("2026-11-03")).toBe("2026-11-02");
  });

  it("prompt 22 : le lundi de la semaine du jeudi (le lundi lui-même compris)", () => {
    expect(lundiDeLaSemaine("2026-10-29")).toBe("2026-10-26");
    expect(lundiDeLaSemaine("2026-10-26")).toBe("2026-10-26");
    expect(lundiDeLaSemaine("2026-11-01")).toBe("2026-10-26");
  });

  it("Done / Your turn / Upcoming", () => {
    const lundi = "2026-10-26";
    // Jeudi 6 h (Paris, heure d'hiver) = 5 h UTC.
    expect(heureMoment(lundi, "jeudi").toISOString()).toBe("2026-10-29T05:00:00.000Z");
    const mercredi = new Date("2026-10-28T12:00:00Z");
    // Prompt 22, partie 5 : plus de moment « mercredi ».
    expect(MOMENTS).toEqual(["jeudi", "samedi", "dimanche", "lundi"]);
    expect(etatMoment("jeudi", S, lundi, mercredi)).toBe("a_venir");
    const vendredi = new Date("2026-10-30T12:00:00Z");
    expect(etatMoment("jeudi", S, lundi, vendredi)).toBe("a_toi");
    const dimanche = new Date("2026-11-01T12:00:00Z");
    expect(etatMoment("samedi", S, lundi, dimanche)).toBe("fait");
    expect(etatMoment("dimanche", S, lundi, dimanche)).toBe("a_venir");
    expect(etatMoment("lundi", S, lundi, new Date("2026-11-02T12:00:00Z"))).toBe("fait");
  });

  it("la base : le jeudi ne propose plus de Nudge (0396)", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0396_decisions.sql"), "utf8");
    expect(sql).toContain("where not (p_type = 'jeudi' and c.action = 'nudge')");
  });
});
