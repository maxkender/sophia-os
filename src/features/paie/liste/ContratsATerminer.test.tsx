import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ContratATerminer } from "./contratsATerminer";

const api = vi.hoisted(() => ({ lireContratsATerminer: vi.fn(), marquerContratTermine: vi.fn() }));
vi.mock("./contratsATerminer", () => api);
vi.mock("@/features/paie/api", () => ({ enregistrerContrat: vi.fn() }));

import { ContratsATerminer } from "./ContratsATerminer";

function contrat(o: Partial<ContratATerminer>): ContratATerminer {
  return {
    poster_id: "p1",
    poster_nom: "Natalia K",
    hm_prenom: "Margherita",
    contrat_url: "https://www.upwork.com/nx/wm/workroom/123/overview",
    contrat_id: "123",
    source: "kill",
    decide_at: "2026-10-25T19:00:00Z",
    handles: ["natalia.k"],
    autres_actifs: 0,
    termine_at: null,
    termine_par: null,
    ...o,
  };
}

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContratsATerminer lundi="2026-10-19" />
    </QueryClientProvider>,
  );
}

describe("ContratsATerminer", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  it("rien quand aucun contrat n'est à terminer", async () => {
    api.lireContratsATerminer.mockResolvedValue([]);
    rendu();
    await vi.waitFor(() => expect(api.lireContratsATerminer).toHaveBeenCalledWith("2026-10-19"));
    expect(screen.queryByTestId("paie-contrats-a-terminer")).toBeNull();
  });

  it("liste les Kills et les Stops, avec le lien du contrat et « Ended »", async () => {
    api.lireContratsATerminer.mockResolvedValue([
      contrat({ autres_actifs: 1 }),
      contrat({
        poster_id: "p2",
        poster_nom: "Joao S",
        source: "stop",
        handles: [],
        contrat_url: null,
        contrat_id: null,
        decide_at: "2026-10-21T10:00:00Z",
      }),
      contrat({ poster_id: "p3", poster_nom: "Ana M", termine_at: "2026-10-26T09:00:00Z", termine_par: "Lucia R" }),
    ]);
    api.marquerContratTermine.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("paie-contrats-a-terminer");
    expect(within(bloc).getByText("Contracts to end (2 / 3)")).toBeTruthy();

    const kill = bloc.querySelector('[data-contrat-fin="Natalia K"]') as HTMLElement;
    expect(within(kill).getByText("Sunday Kill")).toBeTruthy();
    expect(within(kill).getByText("Killed account(s): @natalia.k")).toBeTruthy();
    expect(within(kill).getByText(/Still has 1 other active account/)).toBeTruthy();
    expect(within(kill).getByRole("link", { name: /Contract/ }).getAttribute("href")).toContain("workroom/123");

    const stop = bloc.querySelector('[data-contrat-fin="Joao S"]') as HTMLElement;
    expect(within(stop).getByText("Stop (Cohorts)")).toBeTruthy();
    expect(within(stop).getByText(/link missing/)).toBeTruthy();

    const fini = bloc.querySelector('[data-contrat-fin="Ana M"]') as HTMLElement;
    expect(within(fini).getByText(/Ended by Lucia R/)).toBeTruthy();

    fireEvent.click(within(kill).getByRole("button", { name: "Ended" }));
    await vi.waitFor(() => expect(api.marquerContratTermine).toHaveBeenCalledWith("p1", "2026-10-19", true));

    fireEvent.click(within(fini).getByRole("button", { name: "Undo" }));
    await vi.waitFor(() => expect(api.marquerContratTermine).toHaveBeenCalledWith("p3", "2026-10-19", false));
  });
});
