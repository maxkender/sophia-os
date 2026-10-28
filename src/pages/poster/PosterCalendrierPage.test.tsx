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
vi.mock("@/features/onboarding/cinqEtapesApi", () => ({
  lireMaPremiereSemaine: async () => ({ cohorteLundi: null, slackLie: false }),
}));

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
    expect(screen.getAllByText(/Never post/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FIRST POSTS/)).toHaveLength(1);
    // Mardi 20 → dimanche 25 : 6 jours couverts.
    expect(screen.getAllByText("🔥", { exact: false }).length).toBeGreaterThanOrEqual(6);
    // Hors cohorte Ruul : les 5 étapes (28 oct., G), TikTok et warm-up faits.
    expect(await screen.findByText("Your first week, in 5 steps")).toBeInTheDocument();
    const etapes = screen.getByTestId("cinq-etapes");
    expect([...etapes.querySelectorAll("[data-etape]")].map((e) => e.getAttribute("data-etat"))).toEqual([
      "fait",
      "recommande",
      "fait",
      "en_cours",
      "a_venir",
    ]);
    expect(screen.getByText("5. Your first post: Monday 26 October")).toBeInTheDocument();
    expect(screen.queryByText(/First payment/)).not.toBeInTheDocument();
    expect(screen.queryByText("Your first week, step by step")).not.toBeInTheDocument();
  });

  it("pas démarré : la frise dit quel lundi arrivent les posts si on lance aujourd'hui", async () => {
    mesComptes.mockResolvedValue([compte({})]);
    afficher();

    // Les 5 étapes, dans l'ordre (28 oct., G), avec le @ et les dates.
    const etapes = await screen.findByTestId("cinq-etapes");
    expect([...etapes.querySelectorAll("[data-etape]")].map((e) => e.getAttribute("data-etape"))).toEqual([
      "connexion",
      "slack",
      "tiktok",
      "warmup",
      "post",
    ]);
    expect(screen.getByText("1. Log in")).toBeInTheDocument();
    expect(screen.getByText("2. Join Slack")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join Slack" })).toBeInTheDocument();
    expect(screen.getByText("3. Create your TikTok account @lea")).toBeInTheDocument();
    expect(screen.getByText("4. Start warmup + follow 5 accounts, before Sunday 25 October midnight")).toBeInTheDocument();
    expect(screen.getByText("5. Your first post: Monday 26 October")).toBeInTheDocument();
    // La règle du lien sur l'étape 5, et aucun repost demandé.
    expect(etapes.querySelector('[data-regle="lien"]')).not.toBeNull();
    expect(document.body.textContent?.toLowerCase()).not.toContain("repost");
    expect(screen.queryByText(/FIRST POSTS/)).not.toBeInTheDocument();
  });

  it("warm-up fini depuis longtemps : plus de frise", async () => {
    mesComptes.mockResolvedValue([
      compte({ warmup_started_at: "2026-08-01T08:00:00Z", warmup_ends_at: "2026-08-02T08:00:00Z" }),
    ]);
    afficher();

    expect((await screen.findAllByText("Today")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Your first week, step by step")).not.toBeInTheDocument();
  });

  it("cohorte Ruul, pas lancé : leur lundi prévu sur le calendrier", async () => {
    lireCohorteAccueil.mockResolvedValue({ cohorteRuul: true, emailRuul: "a@b.c", debutLe: "2026-11-02" });
    mesComptes.mockResolvedValue([compte({})]);
    afficher();

    expect(await screen.findByText("Your first week, step by step")).toBeInTheDocument();
    expect(screen.getByText("First payment, through Ruul")).toBeInTheDocument();
    expect(screen.queryByText(/through Upwork/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FIRST POSTS/)).not.toBeInTheDocument();
  });

  it("cohorte Ruul, warm-up lancé : mêmes cases que les autres, une seule case de premiers posts", async () => {
    lireCohorteAccueil.mockResolvedValue({ cohorteRuul: true, emailRuul: "a@b.c", debutLe: "2026-10-26" });
    mesComptes.mockResolvedValue([
      compte({ warmup_started_at: "2026-10-20T08:00:00Z", warmup_ends_at: "2026-10-25T23:00:00Z" }),
    ]);
    afficher();

    expect(await screen.findByText(/Warm-up in progress: your first posts arrive on/)).toBeInTheDocument();
    expect(screen.getAllByText(/FIRST POSTS/)).toHaveLength(1);
    expect(screen.queryByText(/First post$/)).not.toBeInTheDocument();
  });
});
