import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { PostCalendrierAdmin } from "@/features/moteur/api";

const postsCalendrierAdmin = vi.fn();

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  postsCalendrierAdmin: (options: unknown) => postsCalendrierAdmin(options),
}));

import { HiringCalendrierPage } from "./HiringCalendrierPage";

function post(over: Partial<PostCalendrierAdmin>): PostCalendrierAdmin {
  return {
    id: "p1",
    compte_id: "c1",
    date_publication_prevue: "2026-10-19",
    type: "slideshow",
    statut: "assigne",
    pipeline_statut: "done",
    publie_at: null,
    publie_url: null,
    persona_nom: null,
    handle_tiktok: null,
    avatar_url: null,
    classement: null,
    poster_prenom: "Lea",
    poster_nom: null,
    sujet_titre: null,
    langue: "fr",
    ugc_ai: false,
    ugc_ai_video: false,
    nb_slides: 5,
    nb_media: 5,
    slideshow_vide: false,
    application_id: null,
    pays: "FR",
    miniature_url: "https://x.supabase.co/storage/v1/object/public/medias/a/1.png",
    ...over,
  };
}

describe("calendrier HM", () => {
  beforeEach(async () => {
    // Mercredi 21/10/2026, midi à Paris.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    await i18n.changeLanguage("en");
  });
  afterEach(() => vi.useRealTimers());

  it("deux semaines, miniatures, et les posts manqués en ✗", async () => {
    postsCalendrierAdmin.mockResolvedValue([
      post({ id: "manque", poster_prenom: "Lea" }),
      post({ id: "publie", poster_prenom: "Tom", compte_id: "c2", publie_at: "2026-10-19T18:00:00Z" }),
      post({ id: "ajour", poster_prenom: "Ana", compte_id: "c3", date_publication_prevue: "2026-10-21" }),
    ]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <HiringCalendrierPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("✗ Lea")).toBeInTheDocument();
    expect(screen.getByText("✓ Tom")).toBeInTheDocument();
    // Aujourd'hui : pas encore manqué.
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.queryByText("✗ Ana")).not.toBeInTheDocument();
    // Semaine passée + semaine en cours.
    expect(postsCalendrierAdmin).toHaveBeenCalledWith({ du: "2026-10-12", au: "2026-10-25", miniatures: true });
    const imgs = document.querySelectorAll("img");
    expect(imgs[0]?.getAttribute("src")).toContain("/storage/v1/render/image/public/medias/a/1.png?width=96");
  });
});
