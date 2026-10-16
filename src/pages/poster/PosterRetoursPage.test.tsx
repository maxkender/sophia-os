import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const mesReviews = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  mesReviews: () => mesReviews(),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { PosterRetoursPage } from "./PosterRetoursPage";

const base = {
  poster_id: "p1",
  note: null,
  post_id: "post-1",
  publie_url: "https://www.tiktok.com/@crea/photo/7000000000000000001",
  source_url: "https://www.tiktok.com/@src/photo/7000000000000000002",
  handle_tiktok: "maya",
  compte_label: null,
  videos: [],
  remarques: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PosterRetoursPage />
    </QueryClientProvider>,
  );
}

describe("PosterRetoursPage", () => {
  beforeEach(() => {
    mesReviews.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("liste ses retours, marque le nouveau, et en rouvre un sans le marquer lu", async () => {
    mesReviews.mockResolvedValue([
      { ...base, id: "r2", body: "On slide 1, the text is centered.", created_at: "2026-10-16T08:00:00Z", seen_at: null, date_publication: "2026-10-15" },
      { ...base, id: "r1", body: "Please use the sound provided.", created_at: "2026-10-10T08:00:00Z", seen_at: "2026-10-10T09:00:00Z", date_publication: "2026-10-09" },
    ]);
    renderPage();
    expect(await screen.findByText("On slide 1, the text is centered.")).toBeInTheDocument();
    expect(screen.getByText("Please use the sound provided.")).toBeInTheDocument();
    expect(screen.getAllByText(/^(Nouveau|New)$/)).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: /^(Revoir|Open)$/ })[1]);
    expect(await screen.findByText(/Ton post à côté de l’original|Your post next to the original/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voir le retour|See the feedback/ }));
    // Le bouton du bas (la croix du dialogue porte aussi « Close »).
    const fermer = screen.getAllByRole("button", { name: /^(Fermer|Close)$/ });
    fireEvent.click(fermer[fermer.length - 1]);
    expect(screen.queryByText(/Ton post à côté de l’original|Your post next to the original/)).not.toBeInTheDocument();
  });

  it("dit qu'il n'y a pas encore de retour", async () => {
    mesReviews.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Pas encore de retour|No feedback yet/)).toBeInTheDocument();
  });
});
