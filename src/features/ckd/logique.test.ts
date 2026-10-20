import { describe, expect, it } from "vitest";

import type { PropositionCkd, ReglageCkd } from "./api";
import {
  compterActions,
  defReglage,
  exceptionsLabel,
  formaterValeur,
  grouperParHm,
  lienTiktok,
  lireSaisie,
  pourcentage,
  reglageDuNiveau,
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
