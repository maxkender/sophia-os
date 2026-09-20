import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerSurveillanceComptes = vi.fn();
const lireReglages = vi.fn();
const listerPostsCompte = vi.fn();
const supprimerPost = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  annulerSkipSurveillance: vi.fn(),
  basculerHmDemande: vi.fn(),
  basculerNonRenouveler: vi.fn(),
  definirClassementManuel: vi.fn(),
  deverrouillerClassement: vi.fn(),
  envoyerNudge: vi.fn(),
  lireReglages: () => lireReglages(),
  listerPostsCompte: (compteId: string) => listerPostsCompte(compteId),
  listerSurveillanceComptes: () => listerSurveillanceComptes(),
  skipSurveillance: vi.fn(),
  supprimerPost: (id: string) => supprimerPost(id),
}));

import { AdminSurveillancePage } from "./AdminSurveillancePage";

/** Un compte INACTIF : il tombe dans la file de surveillance. */
const LIGNE = {
  compte_id: "c1",
  poster_id: "p1",
  poster_nom: "Maya L.",
  poster_email: "maya@example.com",
  handle_tiktok: "maya",
  persona_nom: "Maya",
  avatar_url: null,
  langue: "en",
  created_at: "2020-01-01T00:00:00.000Z",
  classement: "inactif" as const,
  classement_calcule: "inactif" as const,
  classement_verrou: false,
  classement_maj_at: null,
  classement_rapport: null,
  surveillance_skip_jusqu: null,
  non_renouveler: false,
  non_renouveler_at: null,
  non_renouveler_hm_demande: false,
  non_renouveler_hm_demande_at: null,
  dernier_nudge_at: null,
  nudges: 0,
};

const POST = {
  id: "post-1",
  date_publication_prevue: "2026-09-18",
  type: "slideshow",
  statut: "prevu",
  pipeline_statut: "done",
  publie_at: null,
  publie_url: null,
  sujet_titre: "Morning routine",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminSurveillancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminSurveillancePage", () => {
  beforeEach(() => {
    listerSurveillanceComptes.mockReset();
    listerSurveillanceComptes.mockResolvedValue([LIGNE]);
    lireReglages.mockReset();
    lireReglages.mockResolvedValue({ nudges: { modeles: [] } });
    listerPostsCompte.mockReset();
    listerPostsCompte.mockResolvedValue([POST]);
    supprimerPost.mockReset();
    supprimerPost.mockResolvedValue(undefined);
  });

  it("ne charge les posts du compte qu'à l'ouverture du panneau", async () => {
    renderPage();
    await screen.findByText("Maya L.");
    expect(listerPostsCompte).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Delete post/i }));
    await waitFor(() => expect(listerPostsCompte).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Morning routine")).toBeInTheDocument();
  });

  it("supprime le post choisi après confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("Maya L.");
    fireEvent.click(screen.getByRole("button", { name: /Delete post/i }));
    await screen.findByText("Morning routine");

    const boutons = screen.getAllByRole("button", { name: /Delete post/i });
    fireEvent.click(boutons[boutons.length - 1]);

    await waitFor(() => expect(supprimerPost).toHaveBeenCalledWith("post-1"));
    confirm.mockRestore();
  });

  it("ne supprime rien si la confirmation est refusée", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await screen.findByText("Maya L.");
    fireEvent.click(screen.getByRole("button", { name: /Delete post/i }));
    await screen.findByText("Morning routine");

    const boutons = screen.getAllByRole("button", { name: /Delete post/i });
    fireEvent.click(boutons[boutons.length - 1]);

    expect(supprimerPost).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
