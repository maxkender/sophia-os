import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import "@/locales";

const listerReviewsExemples = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  listerReviewsExemples: () => listerReviewsExemples(),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { SimulerRetourCard } from "./SimulerRetourCard";

describe("SimulerRetourCard", () => {
  it("ouvre un vrai retour en aperçu, sans rien marquer", async () => {
    listerReviewsExemples.mockResolvedValue([
      {
        id: "r1",
        poster_id: "p1",
        body: "On some of your slides, your lines are shorter than in the original.",
        note: null,
        created_at: "2026-10-16T08:00:00Z",
        seen_at: null,
        post_id: "post-1",
        publie_url: "https://www.tiktok.com/@crea/photo/7000000000000000001",
        source_url: "https://www.tiktok.com/@src/photo/7000000000000000002",
        handle_tiktok: "maya",
        compte_label: null,
        date_publication: "2026-10-15",
        videos: [],
        remarques: [],
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SimulerRetourCard />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Ouvrir le retour|Open the feedback/ }));
    expect(screen.getByText(/Aperçu : rien n’est enregistré|Preview: nothing is saved/)).toBeInTheDocument();
    expect(screen.getByText(/Ton post à côté de l’original|Your post next to the original/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voir le retour|See the feedback/ }));
    expect(screen.getByText("On some of your slides, your lines are shorter than in the original.")).toBeInTheDocument();
  });
});
