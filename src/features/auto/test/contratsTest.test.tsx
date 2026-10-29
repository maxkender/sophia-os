import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ContratTest } from "./api";

const api = vi.hoisted(() => ({
  lireContratsTest: vi.fn<() => Promise<ContratTest[]>>(async () => []),
  ajouterContratTest: vi.fn<(c: string) => Promise<string>>(async () => "4242424242"),
  retirerContratTest: vi.fn<(c: string) => Promise<void>>(async () => undefined),
  creerPosteurTest: vi.fn<(c: string, p: string) => Promise<{ poster_id: string; email: string | null; nom: string }>>(async () => ({
    poster_id: "t1", email: "test@x", nom: "TEST Max",
  })),
  lancerTest: vi.fn<(p: string, q: string) => Promise<{ ok: boolean; partis?: string[] }>>(async () => ({ ok: true, partis: ["slack", "upwork"] })),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { ContratsTest } from "./ContratsTest";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContratsTest />
    </QueryClientProvider>,
  );
}

const contrat = (o: Partial<ContratTest>): ContratTest => ({
  contrat_id: "4242424242", ajoute_at: "2026-10-29T10:00:00Z", poster_id: null, poster_nom: null, poster_actif: null,
  cohorte_lundi: null, slack: null, email: null, ...o,
});

describe("Overview → Test contracts (prompt 25 v4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("ajouter un contrat, puis créer « TEST {prénom} »", async () => {
    api.lireContratsTest.mockResolvedValue([contrat({})]);
    rendu();
    const carte = await screen.findByTestId("contrats-test");
    fireEvent.change(within(carte).getByRole("textbox", { name: "Contract ID or Upwork link" }), { target: { value: "https://www.upwork.com/nx/wm/workroom/555555555/overview" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.ajouterContratTest).toHaveBeenCalledWith("https://www.upwork.com/nx/wm/workroom/555555555/overview"));
    const ligne = await within(carte).findByText("No test poster yet");
    fireEvent.change(within(carte).getByRole("textbox", { name: "First name" }), { target: { value: "Max" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Create test poster" }));
    await waitFor(() => expect(api.creerPosteurTest).toHaveBeenCalledWith("4242424242", "Max"));
    expect(ligne).toBeTruthy();
  });

  it("le posteur de test : « Run now » demande une confirmation, puis part", async () => {
    api.lireContratsTest.mockResolvedValue([contrat({ poster_id: "t1", poster_nom: "TEST Max", poster_actif: true, cohorte_lundi: "2026-11-09", slack: false })]);
    rendu();
    const boutons = await screen.findByTestId("boutons-test");
    expect([...boutons.querySelectorAll("[data-lancer]")].map((b) => b.textContent)).toEqual([
      "Welcome", "Step 0 (Slack)", "Step 1 (login)", "Step 2 (TikTok)", "Step 3 (warm-up started)", "Step 4 (warm-up done)", "Monday 8 pm",
      "Reset test poster",
    ]);
    fireEvent.click(within(boutons).getByRole("button", { name: "Step 2 (TikTok)" }));
    await waitFor(() => expect(api.lancerTest).toHaveBeenCalledWith("t1", "etape2"));
    expect(await within(boutons).findByText("Step 2 (TikTok): sent (slack + upwork).")).toBeTruthy();
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(within(boutons).getByRole("button", { name: "Welcome" }));
    expect(api.lancerTest).toHaveBeenCalledTimes(1);
  });

  it("le Head of Ops ne voit pas la carte", () => {
    auth.role = "head_of_ops";
    rendu();
    expect(screen.queryByTestId("contrats-test")).toBeNull();
  });
});
