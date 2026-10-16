import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const mesReviewsNonVues = vi.fn();
const marquerReviewVue = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  mesReviewsNonVues: () => mesReviewsNonVues(),
  marquerReviewVue: (id: string) => marquerReviewVue(id),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { ReviewPopup } from "./ReviewPopup";

const REVIEW = {
  id: "rev-1",
  poster_id: "p1",
  body: "The hook is too slow.",
  note: null,
  created_at: "2026-09-10T10:00:00.000Z",
  seen_at: null,
  post_id: "post-1",
  publie_url: "https://www.tiktok.com/@crea/photo/7000000000000000001",
  source_url: "https://www.tiktok.com/@src/photo/7000000000000000002",
  handle_tiktok: "maya",
  compte_label: "@maya",
  date_publication: "2026-09-10",
  videos: [
    { url: "https://cdn.example/hook.mp4", titre: "Hook trop lent" },
    { url: "https://cdn.example/timing.mp4", titre: "Timing" },
  ],
  remarques: [],
};

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
    marquerReviewVue.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("montre d'abord son post à côté de l'original, puis le message et les vidéos", async () => {
    mesReviewsNonVues.mockResolvedValue([REVIEW]);
    renderPopup();
    expect(await screen.findByText(/Ton post à côté de l’original|Your post next to the original/)).toBeInTheDocument();
    expect(screen.getByTitle("Original")).toHaveAttribute("src", expect.stringContaining("7000000000000000002"));
    expect(screen.getByTitle(/^(Ton post|Your post)$/)).toHaveAttribute("src", expect.stringContaining("7000000000000000001"));
    expect(screen.queryByText("The hook is too slow.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Voir le retour|See the feedback/ }));
    expect(screen.getByText("The hook is too slow.")).toBeInTheDocument();
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "https://cdn.example/hook.mp4");
    fireEvent.ended(video!);
    expect(document.querySelector("video")).toHaveAttribute("src", "https://cdn.example/timing.mp4");
    expect(screen.getByText(/Vidéo 2 \/ 2|Video 2 \/ 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Compris, merci|Got it, thanks/ }));
    await waitFor(() => expect(marquerReviewVue).toHaveBeenCalledWith("rev-1"));
  });

  it("sans lien vers les posts, va droit au message", async () => {
    mesReviewsNonVues.mockResolvedValue([{ ...REVIEW, publie_url: null, source_url: null, videos: [] }]);
    renderPopup();
    expect(await screen.findByText("The hook is too slow.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Voir le retour|See the feedback/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compris, merci|Got it, thanks/ })).toBeInTheDocument();
  });
});
