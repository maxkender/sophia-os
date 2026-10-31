import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lirePaiementsManuels: vi.fn(),
  noterPaiementManuelFait: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { PaiementsManuels } from "./PaiementsManuels";

describe("To pay by hand (0476)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("le détail, le total, et Mark as paid après confirmation", async () => {
    api.lirePaiementsManuels.mockResolvedValue([
      {
        id: "m1", poster_id: "p1", poster_nom: "Ana Silva", contrat_id: "44000001", montant: 86,
        lignes: [{ libelle: "Month 2", montant: 30 }, { libelle: "Week 41", montant: 14 }], note: "Past due",
        semaine: "2026-10-26", cree_at: "2026-10-31T09:00:00Z", fait_at: null, fait_par_nom: null,
        lien: "https://www.upwork.com/nx/wm/workroom/44000001/overview",
      },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PaiementsManuels />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("To pay by hand (1 · 86 $)")).toBeTruthy();
    expect(screen.getByText(/Month 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    await vi.waitFor(() => expect(api.noterPaiementManuelFait).toHaveBeenCalledWith("m1"));
  });
});
