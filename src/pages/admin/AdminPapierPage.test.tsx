import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import { REGLAGES_PAPIER_DEFAUT } from "@/features/moteur/papierReglages";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({ applicationId: "app-1", slug: "sophia" }),
}));

vi.mock("@/features/moteur/TesterAssignationPapierCard", () => ({
  TesterAssignationPapierCard: () => null,
}));

const lireReglages = vi.fn(async () => ({
  papier: REGLAGES_PAPIER_DEFAUT,
  papier_fal_usage: { date: null, appels: 0 },
}));
const listerPapierMasters = vi.fn(async () => []);
const proposerTopicPapier = vi.fn(async () => ({
  ok: true,
  topic: "Pourquoi la mer est-elle salée ?",
}));
const lancerPapierJourMock = vi.fn();
const arreterPapier = vi.fn(async () => ({ ok: true, done: true, statut: "stopped" }));

vi.mock("@/features/moteur/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/moteur/api")>();
  return {
    ...actual,
    aujourdhuiParis: () => "2026-08-31",
    lireReglages: () => lireReglages(),
    ecrireReglage: vi.fn(),
    listerPapierMasters: () => listerPapierMasters(),
    lancerPapierJour: (...args: unknown[]) => lancerPapierJourMock(...args),
    proposerTopicPapier: () => proposerTopicPapier(),
    validerEtapePapier: vi.fn(),
    arreterPapier: (...args: unknown[]) => arreterPapier(...args),
    changerModePapier: vi.fn(),
    changerVoixPapier: vi.fn(),
    relancerPapier: vi.fn(),
    regenererPapier: vi.fn(),
    relancerPapierLangue: vi.fn(),
    assignerPapierCm: vi.fn(),
    listerVoixPapier: vi.fn(async () => ({
      hasKey: true,
      langue: "fr",
      voix: [
        {
          id: "abcCM123",
          name: "locuteur-cm",
          languages: ["fr"],
          previewUrl: "https://example.com/cm.mp3",
          category: "cloned",
          gender: null,
          accent: null,
          source: "library",
          custom: true,
        },
      ],
    })),
    previewVoixPapier: vi.fn(),
  };
});

import { AdminPapierPage } from "./AdminPapierPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPapierPage />
    </QueryClientProvider>,
  );
}

describe("AdminPapierPage", () => {
  beforeEach(() => {
    listerPapierMasters.mockReset();
    listerPapierMasters.mockResolvedValue([]);
    arreterPapier.mockClear();
    proposerTopicPapier.mockClear();
    lancerPapierJourMock.mockClear();
  });

  it("affiche durée, catégories, styles, mode manuel et propose un sujet", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/catégorie|category/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("option", { name: /mythes|myths/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/style/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manuel|manual/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/durée|duration/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /manuel|manual/i }));
    fireEvent.click(screen.getByRole("button", { name: /proposer|propose/i }));

    await waitFor(() => {
      expect(proposerTopicPapier).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("Pourquoi la mer est-elle salée ?")).toBeInTheDocument();
    });
    expect(lancerPapierJourMock).not.toHaveBeenCalled();
  });

  it("arrête la pipeline en cours", async () => {
    listerPapierMasters.mockResolvedValue([
      {
        id: "master-1",
        date_publication: "2026-08-31",
        topic: "Pourquoi la mer est-elle salée ?",
        kind: "culture",
        narration_style: "revelation",
        script: null,
        statut: "scripting",
        etape: "script",
        progression: 0.1,
        erreur: null,
        journal: [],
        created_at: "2026-08-31T00:00:00Z",
        updated_at: "2026-08-31T00:00:00Z",
        pipeline_mode: "auto",
        pipeline_hold: null,
        annule: false,
        papier_scenes: [],
        papier_langues: [],
        papier_posts: [],
      },
    ]);
    renderPage();

    const stop = await screen.findByRole("button", { name: /stop pipeline|arrêter la pipeline/i });
    fireEvent.click(stop);

    await waitFor(() => {
      expect(arreterPapier).toHaveBeenCalledWith("master-1");
    });
  });
});
