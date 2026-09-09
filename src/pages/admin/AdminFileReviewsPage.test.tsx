import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({ applicationId: "app-1", slug: "sophia" }),
}));

const listerFileReviewsJour = vi.fn();
const listerReviewRemarques = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  aujourdhuiParis: () => "2026-09-09",
  listerFileReviewsJour: () => listerFileReviewsJour(),
  listerReviewRemarques: () => listerReviewRemarques(),
  envoyerReview: vi.fn(),
  passerPostReview: vi.fn(),
  ameliorerReview: vi.fn(),
  creerReviewRemarque: vi.fn(),
  majReviewRemarque: vi.fn(),
  supprimerReviewRemarque: vi.fn(),
}));

import { AdminFileReviewsPage } from "./AdminFileReviewsPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminFileReviewsPage />
    </QueryClientProvider>,
  );
}

describe("AdminFileReviewsPage", () => {
  beforeEach(() => {
    listerFileReviewsJour.mockReset();
    listerReviewRemarques.mockReset();
  });
  it("affiche l'état vide quand la file est soldée", async () => {
    listerFileReviewsJour.mockResolvedValue([]);
    listerReviewRemarques.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/File du jour vide|Today's queue is empty/)).toBeInTheDocument();
  });

  it("insère le corps au clic sur le titre de la remarque", async () => {
    listerFileReviewsJour.mockResolvedValue([
      {
        id: "post-1",
        poster_id: "poster-1",
        compte_id: "c1",
        date_publication_prevue: "2026-09-09",
        publie_at: "2026-09-09T10:00:00.000Z",
        publie_url: "https://www.tiktok.com/@crea/photo/1",
        source_url: "https://www.tiktok.com/@src/photo/2",
        persona_nom: "Maya",
        handle_tiktok: "maya",
        avatar_url: null,
        poster_prenom: "Maya",
        poster_nom: "L.",
        langue: "en",
      },
    ]);
    listerReviewRemarques.mockResolvedValue([
      { id: "r1", titre: "Hook trop lent", corps: "The hook is too slow.", ordre: 10 },
    ]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Hook trop lent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hook trop lent" }));
    expect(screen.getByPlaceholderText(/Ton retour|Your feedback/)).toHaveValue(
      "The hook is too slow.",
    );
  });
});
