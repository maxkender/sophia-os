import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { Post } from "@/features/moteur/types";

const listerVideos = vi.fn();
vi.mock("./api", () => ({ listerVideosPost: (...a: unknown[]) => listerVideos(...a) }));

import { PostVideoPoster } from "./PostVideoPoster";

function post(champs: Partial<Post> = {}): Post {
  return {
    id: "post1",
    compte_id: "c1",
    sujet_id: null,
    date_publication_prevue: "2026-11-07",
    type: "video",
    statut: "assigne",
    musique_url: null,
    musique_titre: null,
    musique_plateforme: null,
    hashtags: null,
    publie_at: null,
    publie_url: null,
    pipeline_statut: "done",
    pipeline_etape: null,
    pipeline_erreur: null,
    est_test: false,
    created_at: "2026-11-06T10:00:00Z",
    video_cta_texte: "I could KISS the person who showed me this",
    video_cta_incruste: false,
    video_capture_url: "https://x/cta.jpg",
    ...champs,
  } as Post;
}

function rendre(p: Post) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PostVideoPoster post={p} />
    </QueryClientProvider>,
  );
}

describe("PostVideoPoster", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("shows the videos in order, the CTA to copy and the example screenshot", async () => {
    listerVideos.mockResolvedValue([
      { id: "v1", position: 1, url: "https://x/reaction.mp4", nom: "Emma" },
      { id: "v2", position: 2, url: "https://x/tel.mp4", nom: "Phone part" },
    ]);
    rendre(post());
    expect(await screen.findByText("Video 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Save the 2 videos and put them one after the other, in this order, in TikTok (or CapCut).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save the 2 videos/ })).toBeInTheDocument();
    expect(within(screen.getByTestId("post-video-2")).getByText("Video 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("I could KISS the person who showed me this")).toBeInTheDocument();
    expect(screen.getByAltText("Example: where to put the text")).toHaveAttribute("src", "https://x/cta.jpg");
    // Le nom interne d'une vidéo (persona) n'est pas montré au poster.
    expect(screen.queryByText("Emma")).not.toBeInTheDocument();
    expect(listerVideos).toHaveBeenCalledWith("post1");
  });

  it("says there is nothing to add when the CTA is already in the video", async () => {
    listerVideos.mockResolvedValue([{ id: "v1", position: 1, url: "https://x/a.mp4", nom: null }]);
    rendre(post({ video_cta_incruste: true, video_cta_texte: null, video_capture_url: null }));
    expect(await screen.findByText("The text is already in the video: nothing to add.")).toBeInTheDocument();
    expect(screen.getByText("Save the video, then post it on TikTok.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save the 1 videos/ })).not.toBeInTheDocument();
  });
});
