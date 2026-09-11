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
  resoudreTiktok: vi.fn(),
  uploaderVideoRemarque: vi.fn(),
  retirerVideoRemarque: vi.fn(),
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
      {
        id: "r1",
        titre: "Hook trop lent",
        corps: "The hook is too slow.",
        ordre: 10,
        video_url: "https://cdn.example/hook.mp4",
        video_path: "reviews/remarques/r1/a.mp4",
      },
    ]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Hook trop lent" })).toBeInTheDocument();
    expect(screen.getByText(/TikTok du créateur|Creator's TikTok/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hook trop lent" }));
    expect(screen.getByPlaceholderText(/Ton retour|Your feedback/)).toHaveValue(
      "The hook is too slow.",
    );
    expect(screen.getByText(/Vidéos jouées à la suite|Videos that will play in sequence/)).toBeInTheDocument();
  });

  it("affiche le formulaire d'ajout une fois déplié", async () => {
    listerFileReviewsJour.mockResolvedValue([]);
    listerReviewRemarques.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Remarques|Remarks/ }));
    expect(await screen.findByRole("button", { name: /Nouvelle remarque|New remark/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Titre \(bouton\)|Title \(button\)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle remarque|New remark/ }));
    expect(await screen.findByPlaceholderText(/Titre \(bouton\)|Title \(button\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ajouter|Add/ })).toBeInTheDocument();
  });

  it("laisse défiler la liste des remarques sous le formulaire d'ajout", async () => {
    listerFileReviewsJour.mockResolvedValue([]);
    listerReviewRemarques.mockResolvedValue([
      {
        id: "r1",
        titre: "Hook trop lent",
        corps: "The hook is too slow.",
        ordre: 10,
        video_url: null,
        video_path: null,
      },
      {
        id: "r2",
        titre: "Timing",
        corps: "Publish on time.",
        ordre: 20,
        video_url: null,
        video_path: null,
      },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Remarques|Remarks/ }));
    expect(await screen.findByDisplayValue("Hook trop lent")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Timing")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Titre \(bouton\)|Title \(button\)/)).not.toBeInTheDocument();
    expect(screen.getByTestId("liste-remarques")).toHaveClass("overflow-y-auto");
  });
});
