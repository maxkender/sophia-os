import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ADecider } from "./api";

const api = vi.hoisted(() => ({ lireADecider: vi.fn() }));
vi.mock("./api", () => api);
const ckd = vi.hoisted(() => ({ deciderCkd: vi.fn() }));
vi.mock("../api", () => ckd);

import { ADeciderCarte } from "./ADeciderCarte";

function p(o: Partial<ADecider>): ADecider {
  return {
    id: "x",
    type: "samedi",
    jour: "2026-10-31",
    regle: "inactif",
    action: "ne_pas_renouveler",
    compte_id: "c",
    handle: "ana.tt",
    poster_id: "ana",
    poster_nom: "Ana Silva",
    hm_prenom: "Lucia",
    pays: "BR",
    donnees: {},
    mercredi_at: "2026-10-28T11:00:00Z",
    ...o,
  };
}

describe("À décider maintenant (28 oct.)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireADecider.mockResolvedValue([
      p({ id: "k1" }),
      p({ id: "d1", regle: "doubler", action: "doubler", poster_nom: "Bo Lee", handle: "bo", donnees: { periode: { bons: 4 }, seuil_bon_post: { valeur: 3000 } } }),
      p({ id: "r1", type: "jeudi", regle: "jeudi", action: "recreer", poster_nom: "Cy Moss", handle: "cy", donnees: { motifs: ["reveil"] } }),
    ]);
    ckd.deciderCkd.mockResolvedValue(undefined);
  });

  it("trois groupes, une raison par ligne, tout coché ; « Tout valider » envoie les cochées et les exceptions", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ADeciderCarte />
      </QueryClientProvider>,
    );
    const bloc = await screen.findByTestId("a-decider");
    await within(bloc).findByText("Ana Silva");
    expect(bloc.querySelectorAll("[data-groupe]")).toHaveLength(3);
    expect(within(bloc).getByText("aucun post depuis lundi · message du mercredi 28 oct. · rien depuis")).toBeInTheDocument();
    expect(within(bloc).getByText("4 bons posts (≥ 3 000 vues)".replace(" ", " "))).toBeInTheDocument();
    expect(within(bloc).getByText("pas de réveil depuis les premiers posts")).toBeInTheDocument();
    for (const c of within(bloc).getAllByRole("checkbox")) expect(c).toBeChecked();

    // Exception : Double décoché → Pas maintenant.
    fireEvent.click(within(bloc).getByLabelText("Valider la proposition pour Bo Lee"));
    fireEvent.click(within(bloc).getByRole("button", { name: "Tout valider (3)" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("1 Kill, 0 Double, 1 Recréer. 1 exception(s)"));
    await waitFor(() => expect(ckd.deciderCkd).toHaveBeenCalledTimes(3));
    expect(ckd.deciderCkd).toHaveBeenCalledWith("k1", "ne_pas_renouveler", null);
    expect(ckd.deciderCkd).toHaveBeenCalledWith("d1", "pas_maintenant", null);
    expect(ckd.deciderCkd).toHaveBeenCalledWith("r1", "recreer", null);
    confirmer.mockRestore();
  });
});
