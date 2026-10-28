import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireInactifs: vi.fn(),
  recalculerInactifs: vi.fn(),
  lireReglagesInactifs: vi.fn(),
  enregistrerReglagesInactifs: vi.fn(),
}));
vi.mock("./api", () => api);

import { PageInactifs } from "./PageInactifs";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PageInactifs />
    </QueryClientProvider>,
  );
}

const inactif = {
  poster_id: "p1", poster_nom: "Ina Ctive", hm_prenom: "Kris", depuis: "2026-10-26T06:00:00Z", jours_sans_post: 4,
  nudges_sans_reponse: 2, dernier_post_at: "2026-10-22T10:00:00Z", maj_at: "2026-10-27T06:00:00Z",
  upwork_contrat_url: "https://upwork/c/9", kill_propose: false, kill_decide: null,
};

describe("PageInactifs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireReglagesInactifs.mockResolvedValue({ inactif_jours_sans_post: 2, inactif_nudges_sans_reponse: 2 });
  });

  it("liste : jours sans post, nudges, statut du Kill, contrat", async () => {
    api.lireInactifs.mockResolvedValue([inactif, { ...inactif, poster_id: "p2", poster_nom: "Bo", kill_propose: true }]);
    rendu();
    const liste = await screen.findByTestId("liste-inactifs");
    expect(within(liste).getByText("Proposé en Kill samedi")).toBeInTheDocument();
    expect(within(liste).getByText("Kill proposé, à décider")).toBeInTheDocument();
    expect(within(liste).getAllByText(/4 jour\(s\) sans post/)).toHaveLength(2);
    expect(within(liste).queryByText(/nudge\(s\) sans réponse/)).toBeNull();
    expect(within(liste).getAllByRole("link", { name: /Contrat Upwork/ })[0]).toHaveAttribute("href", "https://upwork/c/9");
  });

  it("recalculer maintenant", async () => {
    api.lireInactifs.mockResolvedValue([]);
    api.recalculerInactifs.mockResolvedValue({ inactifs: 3, nouveaux: 1, sortis: 2 });
    rendu();
    expect(await screen.findByText("Aucun posteur inactif.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recalculer maintenant/ }));
    expect(await screen.findByTestId("bilan-inactifs")).toHaveTextContent("3 inactif(s), dont 1 nouveau(x) ; 2 sorti(s)");
  });
});
