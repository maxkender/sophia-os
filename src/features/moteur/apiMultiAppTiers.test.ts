/**
 * Tiers PAR APPLICATION (0270) côté admin : changement manuel gardé par le
 * cycle, et sonde de la migration (une panne n'est jamais une absence).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Appel {
  table: string;
  op: string;
  valeurs?: unknown;
  options?: unknown;
  filtres: Array<[string, unknown]>;
}

const appels: Appel[] = [];
/** Réponse de chaque table, selon l'opération. */
let reponses: Record<string, (a: Appel) => { data?: unknown; error?: unknown; status?: number }> = {};

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const appel: Appel = { table, op: "select", filtres: [] };
      const maillon = {
        select: () => maillon,
        update: (v: unknown) => ((appel.op = "update"), (appel.valeurs = v), maillon),
        upsert: (v: unknown, o?: unknown) => (
          (appel.op = "upsert"), (appel.valeurs = v), (appel.options = o), maillon
        ),
        eq: (c: string, v: unknown) => (appel.filtres.push([c, v]), maillon),
        limit: () => maillon,
        maybeSingle: () => maillon,
        then: (ok: (v: unknown) => unknown) => {
          appels.push(appel);
          const r = reponses[`${table}:${appel.op}`]?.(appel) ?? { data: null, error: null, status: 200 };
          return Promise.resolve({ data: null, error: null, status: 200, ...r }).then(ok);
        },
      };
      return maillon;
    },
  },
}));
vi.mock("./api", () => ({ invoke: vi.fn() }));

import { majTierContenuApplication, sonderTiersApplication } from "./apiMultiApp";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const VUE = "contenu_application_tier_etat";
const TABLE = "contenu_tiers_application";

function ligneParesseuse() {
  return {
    contenu_id: "c1",
    application_id: UNSWIPE,
    tier: "B",
    passages_prevus: 2,
    tier_cycle: 0,
    materialise: false,
    note: 65,
  };
}

describe("majTierContenuApplication", () => {
  beforeEach(() => {
    appels.length = 0;
    reponses = {};
  });

  it("ligne paresseuse : écrite telle quelle (cycle 0, ignoreDuplicates), puis UPDATE gardé par le cycle lu", async () => {
    reponses[`${VUE}:select`] = () => ({ data: ligneParesseuse() });
    reponses[`${TABLE}:update`] = () => ({ data: [{ contenu_id: "c1" }] });

    await majTierContenuApplication("c1", UNSWIPE, "S");

    const upsert = appels.find((a) => a.table === TABLE && a.op === "upsert")!;
    expect(upsert.options).toEqual({ onConflict: "contenu_id,application_id", ignoreDuplicates: true });
    expect(upsert.valeurs).toMatchObject({ tier: "B", passages_prevus: 2, tier_cycle: 0 });
    const update = appels.find((a) => a.table === TABLE && a.op === "update")!;
    expect(update.filtres).toContainEqual(["tier_cycle", 0]);
    expect(update.filtres).toContainEqual(["application_id", UNSWIPE]);
    expect(update.valeurs).toMatchObject({ tier: "S", passages_prevus: 8, tier_cycle: 1 });
    expect(appels.some((a) => a.table === "contenus")).toBe(false);
  });

  it("0 ligne touchée (requalifiée entre-temps) : erreur, rien n'est écrasé", async () => {
    reponses[`${VUE}:select`] = () => ({ data: { ...ligneParesseuse(), materialise: true, tier_cycle: 3 } });
    reponses[`${TABLE}:update`] = () => ({ data: [] });

    await expect(majTierContenuApplication("c1", UNSWIPE, "A")).rejects.toThrow(/modifié entre-temps/);
    expect(appels.some((a) => a.op === "upsert")).toBe(false);
    const update = appels.find((a) => a.op === "update")!;
    expect(update.filtres).toContainEqual(["tier_cycle", 3]);
  });

  it("Sophia : refusé (son rang vit dans contenus)", async () => {
    await expect(
      majTierContenuApplication("c1", "00000000-0000-4000-8000-000000000001", "A"),
    ).rejects.toThrow();
    expect(appels).toEqual([]);
  });
});

describe("sonderTiersApplication", () => {
  beforeEach(() => {
    appels.length = 0;
    reponses = {};
  });

  it("vue présente : « pret »", async () => {
    expect(await sonderTiersApplication()).toBe("pret");
  });

  it("vue absente (PGRST205 / 42P01) : « absent »", async () => {
    reponses[`${VUE}:select`] = () => ({
      error: { code: "PGRST205", message: "Could not find the table 'public.contenu_application_tier_etat'" },
      status: 404,
    });
    expect(await sonderTiersApplication()).toBe("absent");
    reponses[`${VUE}:select`] = () => ({ error: { code: "42P01", message: "relation does not exist" }, status: 400 });
    expect(await sonderTiersApplication()).toBe("absent");
  });

  it("panne (503 PGRST002) : lève, jamais « absent »", async () => {
    reponses[`${VUE}:select`] = () => ({
      error: { code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." },
      status: 503,
    });
    await expect(sonderTiersApplication()).rejects.toMatchObject({ code: "PGRST002" });
  });
});
