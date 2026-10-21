import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { HistoriqueCkd, PropositionCkd, ReglageCkd } from "./api";
import {
  aEnvoyer,
  annulable,
  BOUTONS_PAR_REGLE,
  compterActions,
  DECISION_DU_BOUTON,
  enRetard,
  defReglage,
  exceptionsLabel,
  formaterValeur,
  grouperParHm,
  lienTiktok,
  lireSaisie,
  pourcentage,
  reglageDuNiveau,
  resumerHistorique,
  tendance,
  tendanceDecision,
  valeurEffective,
  valeurEnSaisie,
} from "./logique";

const LABEL_A = "11111111-0000-4000-8000-00000000000a";
const LABEL_B = "11111111-0000-4000-8000-00000000000b";

function reglage(cle: string, pays: string | null, label_id: string | null, valeur: unknown): ReglageCkd {
  return { id: `${cle}-${pays}-${label_id}`, cle, pays, label_id, valeur, maj_at: "2026-10-20T00:00:00Z" };
}

const REGLAGES: ReglageCkd[] = [
  reglage("vues_min_j2", null, null, 200),
  reglage("vues_min_j2", "DE", null, 1000),
  reglage("vues_min_j2", null, LABEL_A, 300),
  reglage("vues_min_j2", "DE", LABEL_A, 400),
  reglage("doublement_autorise", null, null, true),
  reglage("doublement_autorise", "PT", null, false),
];

describe("valeurEffective", () => {
  it("prend le niveau le plus précis, comme la base", () => {
    expect(valeurEffective(REGLAGES, "vues_min_j2", "DE", LABEL_A)).toEqual({ valeur: 400, source: "pays_label" });
    expect(valeurEffective(REGLAGES, "vues_min_j2", "FR", LABEL_A)).toEqual({ valeur: 300, source: "label" });
    expect(valeurEffective(REGLAGES, "vues_min_j2", "DE", LABEL_B)).toEqual({ valeur: 1000, source: "pays" });
    expect(valeurEffective(REGLAGES, "vues_min_j2", "FR", LABEL_B)).toEqual({ valeur: 200, source: "defaut" });
    expect(valeurEffective(REGLAGES, "doublement_autorise", "PT", null)).toEqual({ valeur: false, source: "pays" });
    expect(valeurEffective(REGLAGES, "inconnu", "PT", null)).toBeNull();
  });

  it("trouve le réglage exact d'un niveau, sans héritage", () => {
    expect(reglageDuNiveau(REGLAGES, "vues_min_j2", "DE", null)?.valeur).toBe(1000);
    expect(reglageDuNiveau(REGLAGES, "vues_min_j2", "FR", null)).toBeUndefined();
  });

  it("liste les exceptions par label", () => {
    expect(exceptionsLabel(REGLAGES).map((r) => [r.pays, r.label_id])).toEqual([
      [null, LABEL_A],
      ["DE", LABEL_A],
    ]);
  });
});

describe("saisie des réglages", () => {
  const part = defReglage("part_mediane_pays")!;
  const nombre = defReglage("seuil_mort")!;
  const ouiNon = defReglage("doublement_autorise")!;

  it("affiche une part en pourcentage, un oui/non en mots", () => {
    expect(formaterValeur(part, 0.6)).toBe("60 %");
    expect(formaterValeur(ouiNon, false)).toBe("non");
    expect(formaterValeur(nombre, null)).toBe("—");
    expect(formaterValeur(nombre, 8000).replace(/\s/g, " ")).toBe("8 000");
  });

  it("lit une saisie : part en %, vide = retirer, erreurs", () => {
    expect(lireSaisie(part, "60")).toEqual({ valeur: 0.6 });
    expect(lireSaisie(part, "62,5 %")).toEqual({ valeur: 0.625 });
    expect(lireSaisie(part, "150")).toEqual({ erreur: "part" });
    expect(lireSaisie(nombre, " ")).toEqual({ valeur: null });
    expect(lireSaisie(nombre, "8 000")).toEqual({ valeur: 8000 });
    expect(lireSaisie(nombre, "-3")).toEqual({ erreur: "nombre" });
    expect(lireSaisie(ouiNon, "Non")).toEqual({ valeur: false });
    expect(lireSaisie(ouiNon, "peut-être")).toEqual({ erreur: "oui_non" });
  });

  it("pré-remplit une saisie depuis la valeur enregistrée", () => {
    expect(valeurEnSaisie(part, 0.6)).toBe("60");
    expect(valeurEnSaisie(ouiNon, true)).toBe("oui");
    expect(valeurEnSaisie(nombre, null)).toBe("");
  });
});

function proposition(p: Partial<PropositionCkd> & Pick<PropositionCkd, "action">): PropositionCkd {
  return {
    id: Math.random().toString(36).slice(2),
    controle_id: "c",
    type: "samedi",
    jour: "2026-10-24",
    regle: "anciens",
    compte_id: "x",
    poster_id: "p",
    hm_id: null,
    pays: "DE",
    langue: "de",
    label_id: null,
    application: "sophia",
    decision: null,
    decision_par: null,
    decision_at: null,
    note: null,
    nouveau_compte_id: null,
    envoye_at: null,
    fait_at: null,
    erreur: null,
    ...p,
    donnees: { handle: "h", ...(p.donnees ?? {}) } as PropositionCkd["donnees"],
  };
}

describe("propositions", () => {
  it("compte les actions", () => {
    const n = compterActions([proposition({ action: "recreer" }), proposition({ action: "recreer" }), proposition({ action: "doubler" })]);
    expect(n).toEqual({ ne_pas_renouveler: 0, recreer: 2, doubler: 1, nudge: 0 });
  });

  it("groupe par HM : le plus chargé d'abord, sans HM en dernier, kills avant doublements", () => {
    const groupes = grouperParHm([
      proposition({ action: "doubler", hm_id: "lucia", donnees: { handle: "a" } as never }),
      proposition({ action: "recreer", hm_id: "lucia", donnees: { handle: "b" } as never }),
      proposition({ action: "recreer", hm_id: null }),
      proposition({ action: "ne_pas_renouveler", hm_id: "lucia", donnees: { handle: "c" } as never }),
      proposition({ action: "doubler", hm_id: "regina" }),
    ]);
    expect(groupes.map((g) => g.hmId)).toEqual(["lucia", "regina", null]);
    expect(groupes[0].propositions.map((p) => p.action)).toEqual(["ne_pas_renouveler", "recreer", "doubler"]);
  });

  it("donne le lien TikTok et des pourcentages lisibles", () => {
    expect(lienTiktok("@clara.eclaire390")).toBe("https://www.tiktok.com/@clara.eclaire390");
    expect(lienTiktok(null)).toBeNull();
    expect(pourcentage(54, 833)).toBe(6.5);
    expect(pourcentage(1, 0)).toBe(0);
  });
});

describe("décisions", () => {
  it("les boutons de chaque règle sont exactement les décisions permises en base (0328)", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0328_ckd_decisions.sql"), "utf8");
    for (const [regle, boutons] of Object.entries(BOUTONS_PAR_REGLE)) {
      const ligne = sql.match(new RegExp(`when '${regle}'\\s+then array\\[([^\\]]*)\\]`))?.[1] ?? "";
      const permises = [...ligne.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      expect(boutons.map((b) => DECISION_DU_BOUTON[b]), regle).toEqual(permises);
    }
  });

  it("à envoyer : décidé, pas encore parti, et le compte créé pour Recréer / Doubler", () => {
    expect(aEnvoyer(proposition({ action: "ne_pas_renouveler", decision: "ne_pas_renouveler" }))).toBe(true);
    expect(aEnvoyer(proposition({ action: "recreer", decision: "recreer" }))).toBe(false);
    expect(aEnvoyer(proposition({ action: "recreer", decision: "recreer", nouveau_compte_id: "n" }))).toBe(true);
    expect(aEnvoyer(proposition({ action: "recreer", decision: "garder" }))).toBe(false);
    expect(aEnvoyer(proposition({ action: "nudge", decision: "nudge", envoye_at: "2026-10-24T10:00:00Z" }))).toBe(false);
    expect(aEnvoyer(proposition({ action: "nudge" }))).toBe(false);
  });

  it("annulable : comme ckd_annuler", () => {
    const kill = proposition({ action: "ne_pas_renouveler", decision: "ne_pas_renouveler" });
    const arret = { compte_id: "x", raison: "ne_pas_renouveler" as const, prevu_at: "", fait_at: null, annule_at: null };
    expect(annulable(kill, arret)).toBe(true);
    expect(annulable(kill, { ...arret, fait_at: "2026-10-25T21:30:00Z" })).toBe(false);
    expect(annulable({ ...kill, envoye_at: "2026-10-24T10:00:00Z" })).toBe(false);
    expect(annulable(proposition({ action: "recreer", decision: "recreer", nouveau_compte_id: "n" }))).toBe(false);
    expect(annulable(proposition({ action: "nudge", decision: "nudge" }))).toBe(false);
    expect(annulable(proposition({ action: "recreer", decision: "garder" }))).toBe(true);
  });

  it("en retard : sans décision après le dimanche 12 h de Paris", () => {
    const p = proposition({ action: "recreer", jour: "2026-10-24" });
    expect(enRetard(p, "samedi", new Date("2026-10-25T10:59:00Z"))).toBe(false);
    expect(enRetard(p, "samedi", new Date("2026-10-25T11:00:00Z"))).toBe(true);
    expect(enRetard(p, "samedi", new Date("2026-10-26T08:00:00Z"))).toBe(true);
    expect(enRetard({ ...p, decision: "garder" }, "samedi", new Date("2026-10-26T08:00:00Z"))).toBe(false);
    expect(enRetard(p, "jeudi", new Date("2026-10-26T08:00:00Z"))).toBe(false);
  });
});

function historique(h: Partial<HistoriqueCkd>): HistoriqueCkd {
  return {
    id: Math.random().toString(36).slice(2),
    type: "samedi",
    jour: "2026-10-24",
    regle: "anciens",
    action: "recreer",
    decision: "garder",
    decision_par: null,
    decision_at: "2026-10-24T09:00:00Z",
    note: null,
    compte_id: "c",
    poster_id: "p",
    hm_id: null,
    pays: "FR",
    handle: "h",
    nouveau_compte_id: null,
    nouveau_handle: null,
    avant: { mediane: 600, publies: 10, attendus: 10 },
    mediane_ref: 1300,
    du: "2026-10-26",
    au: "2026-11-08",
    complet: true,
    apres: null,
    apres_nouveau: null,
    arrete_at: null,
    ...h,
  };
}

describe("historique", () => {
  it("tendance : la médiane ±20 %, sinon la part des posts publiés", () => {
    expect(tendance({ mediane: 600 }, { mediane: 1250 })).toBe("hausse");
    expect(tendance({ mediane: 600 }, { mediane: 650 })).toBe("stable");
    expect(tendance({ mediane: 600 }, { mediane: 400 })).toBe("baisse");
    // Absent : pas de vues avant, on compare la part publiée.
    expect(tendance({ mediane: null, publies: 0, attendus: 10 }, { mediane: null, publies: 9, attendus: 14 })).toBe("hausse");
    expect(tendance({ mediane: null, publies: 0, attendus: 10 }, { publies: 1, attendus: 14 })).toBe("stable");
    expect(tendance({ mediane: 600 }, null)).toBeNull();
    expect(tendance({}, { attendus: 0 })).toBeNull();
  });

  it("Recréer compare le nouveau compte à l'ancien ; Kill n'a pas de tendance", () => {
    expect(tendanceDecision(historique({ decision: "recreer", apres_nouveau: { mediane: 1100 } }))).toBe("hausse");
    expect(tendanceDecision(historique({ decision: "doubler", apres: { mediane: 400 }, apres_nouveau: { mediane: 5000 } }))).toBe("baisse");
    expect(tendanceDecision(historique({ decision: "ne_pas_renouveler", apres: { mediane: 5000 } }))).toBeNull();
  });

  it("résume par décision : seules les 2 semaines complètes comptent", () => {
    const r = resumerHistorique([
      historique({ decision: "doubler", apres: { mediane: 900 } }),
      historique({ decision: "garder", apres: { mediane: 1250 } }),
      historique({ decision: "garder", apres: { mediane: 300 } }),
      historique({ decision: "garder", apres: { mediane: 1250 }, complet: false }),
    ]);
    expect(r.map((x) => x.decision)).toEqual(["garder", "doubler"]);
    expect(r[0]).toEqual({ decision: "garder", total: 3, complets: 2, hausse: 1, stable: 0, baisse: 1 });
    expect(r[1]).toMatchObject({ total: 1, complets: 1, hausse: 1 });
  });
});
