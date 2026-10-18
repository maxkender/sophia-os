import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { MonCompte } from "@/features/moteur/api";

const mesComptes = vi.fn();
const lireCohorteAccueil = vi.fn();

vi.mock("@/features/auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/AuthContext")>()),
  useAuth: () => ({ user: { id: "poster-1" }, role: "poster" }),
}));

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  mesComptes: () => mesComptes(),
  lireCohorteAccueil: () => lireCohorteAccueil(),
}));

vi.mock("@/features/pods/VideosAPoster", () => ({ VideosAPoster: () => null }));

vi.mock("@/lib/supabase/client", () => {
  const requete = { select: () => requete, order: () => requete, limit: async () => ({ data: [], error: null }) };
  return { supabase: { from: () => requete } };
});

import { PosterCalendrierPage } from "./PosterCalendrierPage";

function compte(over: Partial<MonCompte>): MonCompte {
  return {
    id: "c1",
    type_compte: "perso",
    persona_nom: null,
    persona_bio: null,
    handle_tiktok: "lea",
    handle_instagram: null,
    videos_uniquement: false,
    avatar_url: null,
    langue: "en",
    warmup_started_at: null,
    warmup_ends_at: null,
    ...over,
  } as MonCompte;
}

function afficher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PosterCalendrierPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("calendrier poster : warm-up jusqu'au lundi", () => {
  beforeEach(async () => {
    // Mercredi 21/10/2026, midi à Paris.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    await i18n.changeLanguage("en");
    lireCohorteAccueil.mockResolvedValue({ cohorteRuul: false, emailRuul: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warm-up en cours : la date des premiers posts, les jours couverts et la case FIRST POSTS", async () => {
    mesComptes.mockResolvedValue([
      compte({ warmup_started_at: "2026-10-20T08:00:00Z", warmup_ends_at: "2026-10-25T23:00:00Z" }),
    ]);
    afficher();

    expect(await screen.findByText(/Warm-up in progress: your first posts arrive on/)).toBeInTheDocument();
    expect(screen.getByText(/Never post/)).toBeInTheDocument();
    expect(screen.getAllByText(/FIRST POSTS/)).toHaveLength(1);
    // Mardi 20 → dimanche 25 : 6 jours couverts.
    expect(screen.getAllByText("🔥", { exact: false }).length).toBeGreaterThanOrEqual(6);
  });

  it("pas démarré : dit quel lundi arrivent les posts si on lance aujourd'hui", async () => {
    mesComptes.mockResolvedValue([compte({})]);
    afficher();

    expect(await screen.findByText(/Start today → first posts on .*26/)).toBeInTheDocument();
    expect(screen.queryByText(/FIRST POSTS/)).not.toBeInTheDocument();
  });

  it("cohorte Ruul : ses propres dates, pas les cases du warm-up au lundi", async () => {
    lireCohorteAccueil.mockResolvedValue({ cohorteRuul: true, emailRuul: "a@b.c", debutLe: "2026-10-26" });
    mesComptes.mockResolvedValue([
      compte({ warmup_started_at: "2026-10-20T08:00:00Z", warmup_ends_at: "2026-10-25T23:00:00Z" }),
    ]);
    afficher();

    expect(await screen.findAllByText(/First post/)).not.toHaveLength(0);
    expect(screen.queryByText(/FIRST POSTS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Warm-up in progress/)).not.toBeInTheDocument();
  });
});
