import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lire = vi.hoisted(() => vi.fn());
vi.mock("./parcours", async (orig) => ({ ...(await orig<typeof import("./parcours")>()), lireParcoursRuul: lire }));

import type { EtatParcoursRuul } from "./parcours";
import { VueParcoursRuul } from "./VueParcoursRuul";

const base = (x: Partial<EtatParcoursRuul>): EtatParcoursRuul => ({
  poster_id: "p",
  prenom: "Ana",
  login: "anas@sophia.com",
  email: null,
  cohorte_lundi: "2026-11-16",
  cree_at: "2026-11-11T08:00:00Z",
  premiere_connexion_at: null,
  handle: null,
  tiktok_existe: null,
  warmup_started_at: null,
  abonnements: null,
  slack_user_id: null,
  ruul_statut: null,
  ruul_compte: null,
  ruul_email_a_at: null,
  ruul_email_b_at: null,
  relances_stop_at: null,
  posts: 0,
  derniere_activite: null,
  envois: [],
  ...x,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
  lire.mockResolvedValue([
    base({ poster_id: "a", prenom: "Ana", login: "ana@sophia.com" }),
    base({
      poster_id: "b", prenom: "Bea", login: "bea@sophia.com", premiere_connexion_at: "2026-11-11T09:00:00Z",
      tiktok_existe: true, warmup_started_at: "2026-11-11T10:00:00Z", abonnements: 6,
    }),
    base({ poster_id: "c", prenom: "Caro", login: "caro@sophia.com", cohorte_lundi: "2026-11-23" }),
    base({ poster_id: "d", prenom: "Dora", login: "dora@sophia.com", cohorte_lundi: "2026-11-09" }),
  ]);
});
afterEach(() => vi.useRealTimers());

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VueParcoursRuul />
    </QueryClientProvider>,
  );
}

describe("vue parcours Ruul : la cohorte étape par étape", () => {
  it("cohorte du prochain lundi par défaut, étapes, noms, qui manque, autre cohorte", async () => {
    rendu();
    const titre = await screen.findByTestId("titre-cohorte");
    expect(titre.textContent).toBe("Cohorte du lundi 16 novembre 2026 — 2 posteurs");
    expect(screen.getByTestId("vue-parcours-ruul")).toBeTruthy();
    expect(screen.getByTestId("etape-pret").textContent).toContain("1 / 2");
    expect(screen.getByTestId("etape-compte").textContent).toContain("2 / 2");
    expect(screen.getAllByTestId("ligne-parcours")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("etape-pret"));
    const noms = screen.getByTestId("noms-etape");
    expect(within(noms).getByText("Bea")).toBeTruthy();
    expect(within(noms).queryByText("Ana")).toBeNull();
    fireEvent.click(within(noms).getByRole("button", { name: "Qui manque" }));
    expect(within(screen.getByTestId("noms-etape")).getByText("Ana")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pas prêts \(1\)/ }));
    expect(screen.getAllByTestId("ligne-parcours")).toHaveLength(1);

    const menu = screen.getByLabelText("Choisir la cohorte") as HTMLSelectElement;
    expect([...menu.options].map((o) => o.value)).toEqual(["2026-11-23", "2026-11-16", "2026-11-09"]);
    fireEvent.change(menu, { target: { value: "2026-11-23" } });
    expect(screen.getByTestId("titre-cohorte").textContent).toBe("Cohorte du lundi 23 novembre 2026 — 1 posteur");
  });
});
