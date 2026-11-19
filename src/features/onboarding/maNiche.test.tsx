/**
 * La niche du warm-up d'un compte, lue par son posteur (19/11) : la lecture
 * des labels du compte, et les deux hooks qui la servent aux écrans.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  /** Les labels par compte ; `Error` : la lecture échoue ; absent : aucun label. */
  labels: {} as Record<string, { nom: string | null; slug: string | null }[] | Error>,
  demandes: [] as string[],
  comptes: [] as { id: string; type_compte: string }[],
  mesComptes: 0,
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (colonnes: string) => ({
        eq: async (colonne: string, compteId: string) => {
          if (table !== "compte_labels" || colonnes !== "labels(nom, slug)" || colonne !== "compte_id") throw new Error("requête inattendue");
          base.demandes.push(compteId);
          const l = base.labels[compteId];
          if (l instanceof Error) return { data: null, error: { message: l.message } };
          return { data: (l ?? []).map((labels) => ({ labels })), error: null };
        },
      }),
    }),
  },
}));
vi.mock("@/features/moteur/api", () => ({
  mesComptes: async () => {
    base.mesComptes++;
    return base.comptes;
  },
}));

import { lireMaNiche, useMaNiche, useNicheComptePrincipal } from "./maNiche";

function enveloppe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  base.labels = {};
  base.demandes = [];
  base.comptes = [];
  base.mesComptes = 0;
});

describe("lireMaNiche", () => {
  it("la niche du label du compte ; le slug quand le nom manque", async () => {
    base.labels = {
      c1: [{ nom: "male_run", slug: "male_run" }],
      c2: [{ nom: null, slug: "clean_study" }],
      c3: [{ nom: "white_bg", slug: "white_bg" }],
    };
    expect(await lireMaNiche("c1")).toBe("running");
    expect(await lireMaNiche("c2")).toBe("study");
    // Un label sans thème à lui : la culture générale, nommée.
    expect(await lireMaNiche("c3")).toBe("general knowledge");
  });

  it("aucun label lisible, ou lecture en échec : null (le texte reste « your niche »), jamais d'exception", async () => {
    base.labels = { c2: new Error("panne"), c3: [{ nom: null, slug: null }] };
    expect(await lireMaNiche("c1")).toBeNull();
    expect(await lireMaNiche("c2")).toBeNull();
    expect(await lireMaNiche("c3")).toBeNull();
  });
});

describe("useMaNiche", () => {
  it("la niche du compte donné ; sans compte, ou désactivé : rien n'est lu", async () => {
    base.labels = { c1: [{ nom: "male_run", slug: "male_run" }] };
    const wrapper = enveloppe();
    const { result } = renderHook(() => useMaNiche("c1"), { wrapper });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("running"));

    const sans = renderHook(() => [useMaNiche(null), useMaNiche(undefined), useMaNiche("c1", false)], { wrapper: enveloppe() });
    await new Promise((r) => setTimeout(r, 0));
    expect(sans.result.current).toEqual([null, null, null]);
    expect(base.demandes).toEqual(["c1"]);
  });
});

describe("useNicheComptePrincipal", () => {
  it("la niche du 1er compte perso du posteur, pas celle d'un compte CM ni d'un 2e compte", async () => {
    base.comptes = [
      { id: "cm", type_compte: "cm" },
      { id: "perso1", type_compte: "perso" },
      { id: "perso2", type_compte: "perso" },
    ];
    base.labels = {
      cm: [{ nom: "smart_girl", slug: "smart_girl" }],
      perso1: [{ nom: "clean_study", slug: "clean_study" }],
      perso2: [{ nom: "male_run", slug: "male_run" }],
    };
    const { result } = renderHook(() => useNicheComptePrincipal(), { wrapper: enveloppe() });
    await waitFor(() => expect(result.current).toBe("study"));
    expect(base.demandes).toEqual(["perso1"]);
  });

  it("désactivé : ni les comptes ni les labels ne sont lus", async () => {
    base.comptes = [{ id: "perso1", type_compte: "perso" }];
    const { result } = renderHook(() => useNicheComptePrincipal(false), { wrapper: enveloppe() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
    expect(base.mesComptes).toBe(0);
    expect(base.demandes).toEqual([]);
  });
});
