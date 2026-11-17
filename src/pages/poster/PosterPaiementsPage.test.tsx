import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import "@/locales";

const lire = vi.hoisted(() => vi.fn());
vi.mock("@/features/ruul/api", () => ({ lireMesPaiementsRuul: () => lire() }));

import { MesPaiements } from "./PosterPaiementsPage";

describe("Payments du posteur Ruul (0738)", () => {
  it("chaque semaine : montant, détail, statut ; jamais de mot interdit", async () => {
    lire.mockResolvedValue([
      { semaine: "2026-11-16", total: 24, bonus: 10, faits: 14, prevus: 14, nb_comptes: 1, statut: "processing", paye_at: null },
      { semaine: "2026-11-09", total: 7, bonus: 0, faits: 10, prevus: 14, nb_comptes: 1, statut: "waiting_setup", paye_at: null },
      { semaine: "2026-11-02", total: 14, bonus: 0, faits: 28, prevus: 28, nb_comptes: 2, statut: "paid", paye_at: "2026-11-10T09:00:00Z" },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MesPaiements /></QueryClientProvider>);
    const carte = await screen.findByTestId("mes-paiements-ruul");
    await screen.findByText("24.00 $");
    expect(carte).toHaveTextContent("14 of 14 posts · 1 account(s) + 10 $ bonus");
    expect(carte).toHaveTextContent("On its way");
    expect(carte).toHaveTextContent("On hold: finish your Ruul setup to get it");
    expect(carte).toHaveTextContent("Paid");
    expect(carte.textContent?.toLowerCase()).not.toMatch(/\bbot\b|\bai\b|automat/);
  });
});
