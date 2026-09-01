import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

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
    arreterPapier: vi.fn(),
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
});
