import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({ applicationId: "app-1", slug: "sophia" }),
}));

const listerFileReviewsJour = vi.fn();
const listerReviewRemarques = vi.fn();
const compterRemarquesParCreateur = vi.fn();
const envoyerReview = vi.fn();
const ameliorerReview = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  aujourdhuiParis: () => "2026-09-09",
  listerFileReviewsJour: () => listerFileReviewsJour(),
  listerReviewRemarques: () => listerReviewRemarques(),
  compterRemarquesParCreateur: (ids: string[]) => compterRemarquesParCreateur(ids),
  resoudreTiktok: vi.fn(),
  uploaderVideoRemarque: vi.fn(),
  retirerVideoRemarque: vi.fn(),
  envoyerReview: (...args: unknown[]) => envoyerReview(...args),
  passerPostReview: vi.fn(),
  ameliorerReview: (texte: string) => ameliorerReview(texte),
  creerReviewRemarque: vi.fn(),
  majReviewRemarque: vi.fn(),
  supprimerReviewRemarque: vi.fn(),
}));

import { AdminFileReviewsPage } from "./AdminFileReviewsPage";

const POST = {
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
};

const REMARQUE = {
  id: "r1",
  titre: "Hook trop lent",
  corps: "The hook is too slow.",
  ordre: 10,
  video_url: "https://cdn.example/hook.mp4",
  video_path: "reviews/remarques/r1/a.mp4",
};

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
    compterRemarquesParCreateur.mockReset();
    compterRemarquesParCreateur.mockResolvedValue({});
    envoyerReview.mockReset();
    envoyerReview.mockResolvedValue(undefined);
    ameliorerReview.mockReset();
    ameliorerReview.mockResolvedValue({ texte: "The hook is too slow, rewritten." });
  });
  it("affiche l'état vide quand la file est soldée", async () => {
    listerFileReviewsJour.mockResolvedValue([]);
    listerReviewRemarques.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/File du jour vide|Today's queue is empty/)).toBeInTheDocument();
  });

  it("insère le corps au clic sur le titre de la remarque", async () => {
    listerFileReviewsJour.mockResolvedValue([POST]);
    listerReviewRemarques.mockResolvedValue([REMARQUE]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Hook trop lent" })).toBeInTheDocument();
    expect(screen.getByText(/TikTok du créateur|Creator's TikTok/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hook trop lent" }));
    expect(screen.getByPlaceholderText(/Ton retour|Your feedback/)).toHaveValue(
      "The hook is too slow.",
    );
    expect(screen.getByText(/Vidéos jouées à la suite|Videos that will play in sequence/)).toBeInTheDocument();
  });

  it("compte les remarques déjà envoyées au créateur, pas au compte", async () => {
    // Deux comptes du même créateur dans la file : un seul appel, un seul poster.
    listerFileReviewsJour.mockResolvedValue([
      { ...POST, id: "post-1", compte_id: "c1", handle_tiktok: "maya" },
      { ...POST, id: "post-2", compte_id: "c2", handle_tiktok: "maya.bis" },
    ]);
    listerReviewRemarques.mockResolvedValue([]);
    compterRemarquesParCreateur.mockResolvedValue({
      "poster-1": [
        { id: "r1", titre: "Texte pas le même", n: 3 },
        { id: "r2", titre: "Timing", n: 1 },
      ],
    });
    renderPage();
    expect(await screen.findByText("3× Texte pas le même")).toBeInTheDocument();
    expect(screen.getByText("1× Timing")).toBeInTheDocument();
    expect(compterRemarquesParCreateur).toHaveBeenCalledWith(["poster-1"]);
  });

  it("annonce le créateur sans remarque générique", async () => {
    listerFileReviewsJour.mockResolvedValue([POST]);
    listerReviewRemarques.mockResolvedValue([]);
    compterRemarquesParCreateur.mockResolvedValue({});
    renderPage();
    expect(
      await screen.findByText(
        /Aucune remarque générique envoyée à ce créateur|No generic remark sent to this creator yet/,
      ),
    ).toBeInTheDocument();
  });

  it("joint la remarque cliquée à la review envoyée", async () => {
    listerFileReviewsJour.mockResolvedValue([POST]);
    listerReviewRemarques.mockResolvedValue([REMARQUE]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Hook trop lent" }));
    expect(
      screen.getByText(/Remarques comptées pour ce créateur|Remarks counted for this creator/),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Envoyer|Send/ }));
    await waitFor(() => {
      expect(envoyerReview).toHaveBeenCalledWith(
        "poster-1",
        "The hook is too slow, rewritten.",
        expect.objectContaining({ remarques: [{ id: "r1", titre: "Hook trop lent" }] }),
      );
    });
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
