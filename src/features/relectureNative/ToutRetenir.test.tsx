import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const compter = vi.fn();
const retenir = vi.fn();
const boucle = vi.fn();

vi.mock("./apiCorrections", () => ({
  compterProposees: () => compter(),
  retenirProposees: (...a: unknown[]) => retenir(...a),
}));
vi.mock("./apiBoucle", () => ({
  CLE_BOUCLE: ["boucle-etat"],
  etatBoucle: () => boucle(),
}));

import { ToutRetenir } from "./ToutRetenir";

const langue = (code: string, proposees: number) => ({
  langue: code,
  relecteurs: 1,
  envoyes_7j: 15,
  a_relire: 0,
  relus_7j: 15,
  duels_a_voter: 0,
  proposees,
  retenues: 0,
  retenues_7j: 0,
  reprises_pct: null,
  reprises_pct_avant: null,
});

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalider = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ToutRetenir />
    </QueryClientProvider>,
  );
  return { invalider };
}

describe("ToutRetenir", () => {
  beforeEach(() => {
    for (const f of [compter, retenir, boucle]) f.mockReset();
    compter.mockResolvedValue(300);
    boucle.mockResolvedValue([langue("it", 55), langue("de", 243), langue("fr", 0)]);
    retenir.mockResolvedValue(300);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rien à trier : pas de bandeau", async () => {
    compter.mockResolvedValue(0);
    rendre();
    await waitFor(() => expect(compter).toHaveBeenCalled());
    expect(screen.queryByTestId("tout-retenir")).toBeNull();
  });

  it("dit combien attendent, langue par langue, la plus chargée d'abord, et le reste à part", async () => {
    rendre();
    const bandeau = await screen.findByTestId("tout-retenir");
    expect(bandeau.textContent).toMatch(/300 corrections de relecteurs attendent ton tri|300 reviewer corrections are waiting/);
    await waitFor(() =>
      expect(screen.getByTestId("tout-retenir-detail").textContent).toMatch(
        /(Allemand|German) 243 · (Italien|Italian) 55 · (autres langues|other languages) 2\. /,
      ),
    );
    expect(screen.getByRole("button", { name: /Tout retenir \(300\)|Keep all \(300\)/ })).toBeEnabled();
  });

  it("demande confirmation : un refus ne retient rien", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: /Tout retenir|Keep all/ }));
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer.mock.calls[0][0]).toMatch(/300 corrections/);
    expect(retenir).not.toHaveBeenCalled();
  });

  it("retient tout, toutes langues, dit combien et fait relire les compteurs, la boucle et les règles", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // Comme en base : une fois tout retenu, plus rien n'attend.
    retenir.mockImplementation(() => {
      compter.mockResolvedValue(0);
      return Promise.resolve(300);
    });
    const { invalider } = rendre();
    fireEvent.click(await screen.findByRole("button", { name: /Tout retenir|Keep all/ }));
    await waitFor(() => expect(retenir).toHaveBeenCalledWith());
    expect(await screen.findByText(/300 corrections retenues\.|300 corrections kept\./)).toBeInTheDocument();
    expect(invalider.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).toEqual([
      "corrections-natives",
      "boucle-etat",
      "regles-natives",
    ]);
    // Plus rien à trier : le bouton disparaît, le bilan reste.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Tout retenir|Keep all/ })).toBeNull());
    expect(screen.getByText(/300 corrections retenues\.|300 corrections kept\./)).toBeInTheDocument();
  });

  it("un échec s'affiche et laisse le bouton", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    retenir.mockRejectedValue(new Error("refus RLS"));
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: /Tout retenir|Keep all/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("refus RLS");
    expect(screen.getByRole("button", { name: /Tout retenir|Keep all/ })).toBeEnabled();
  });
});
