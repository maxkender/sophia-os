import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const mesReviewsNonVues = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  mesReviewsNonVues: () => mesReviewsNonVues(),
  marquerReviewVue: vi.fn(),
}));

import { ReviewPopup } from "./ReviewPopup";

function renderPopup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewPopup />
    </QueryClientProvider>,
  );
}

describe("ReviewPopup", () => {
  beforeEach(() => {
    mesReviewsNonVues.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("enchaîne les vidéos d'explication dans l'ordre", async () => {
    mesReviewsNonVues.mockResolvedValue([
      {
        id: "rev-1",
        poster_id: "p1",
        body: "The hook is too slow.",
        note: null,
        created_at: "2026-09-10T10:00:00.000Z",
        seen_at: null,
        post_id: "post-1",
        publie_url: "https://www.tiktok.com/@crea/photo/1",
        source_url: null,
        handle_tiktok: "maya",
        compte_label: "@maya",
        date_publication: "2026-09-10",
        videos: [
          { url: "https://cdn.example/hook.mp4", titre: "Hook trop lent" },
          { url: "https://cdn.example/timing.mp4", titre: "Timing" },
        ],
      },
    ]);
    renderPopup();
    expect(await screen.findByText("The hook is too slow.")).toBeInTheDocument();
    const lecteur = screen.getByText(/Vidéo 1 \/ 2|Video 1 \/ 2/);
    expect(lecteur).toBeInTheDocument();
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "https://cdn.example/hook.mp4");
    fireEvent.ended(video!);
    expect(document.querySelector("video")).toHaveAttribute("src", "https://cdn.example/timing.mp4");
    expect(screen.getByText(/Vidéo 2 \/ 2|Video 2 \/ 2/)).toBeInTheDocument();
  });
});
