/** Prompt 26 : la simulation de la paie du lundi (rien n'est payé). */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({ lireDerniereSimulation: vi.fn(), simulerPaie: vi.fn() }));
vi.mock("@/features/paie/api-upwork/api", () => api);
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));

import { SimulationPaie } from "./SimulationPaie";

const SIM = {
  semaine: "2026-10-26", lignes: 4, par_categorie: { payer: 2, double: 1, a_la_main: 1 },
  total: { approuve: 42, finance: 42, total: 84 }, plafonds: { ligne: 30, jour: 5000 }, depasse_plafond_jour: false,
  milestones_lues_le: "2026-10-29T10:00:00Z",
  needs_you: [{ poster: "Ana", contrat: "123", lien: "https://www.upwork.com/nx/wm/workroom/123/overview", montant: 14, raison: "aucune milestone financée sur Upwork" }],
};

describe("Simulation de la paie", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("lignes par action, total, et ce qui irait dans Needs you avec la raison", async () => {
    api.lireDerniereSimulation.mockResolvedValue(null);
    api.simulerPaie.mockResolvedValue(SIM);
    render(<QueryClientProvider client={new QueryClient()}><SimulationPaie /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Simuler" }));
    expect(await screen.findByText("Payer : 2")).toBeInTheDocument();
    expect(screen.getByText("À la main : 1")).toBeInTheDocument();
    expect(screen.getByTestId("simulation-total")).toHaveTextContent("4 lignes · à approuver 42 $ · à financer 42 $ · total 84 $");
    expect(screen.getByText("aucune milestone financée sur Upwork")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "123" })).toHaveAttribute("href", "https://www.upwork.com/nx/wm/workroom/123/overview");
  });
});
