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
const abandonnerPapier = vi.fn(async () => ({ ok: true, done: true }));
const sauverTopicPapier = vi.fn(async () => undefined);
const regenererPartiePapier = vi.fn(async () => ({ ok: true }));
const regenererPapier = vi.fn(async () => ({ ok: true }));
const validerEtapePapier = vi.fn(async () => ({ ok: true }));
const relancerPapierLangue = vi.fn();
const assignerPapierCm = vi.fn();

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
    validerEtapePapier: (...args: unknown[]) => validerEtapePapier(...args),
    arreterPapier: (...args: unknown[]) => arreterPapier(...args),
    abandonnerPapier: (...args: unknown[]) => abandonnerPapier(...args),
    sauverTopicPapier: (...args: unknown[]) => sauverTopicPapier(...args),
    changerModePapier: vi.fn(),
    changerVoixPapier: vi.fn(),
    relancerPapier: vi.fn(),
    regenererPapier: (...args: unknown[]) => regenererPapier(...args),
    regenererPartiePapier: (...args: unknown[]) => regenererPartiePapier(...args),
    relancerPapierLangue: (...args: unknown[]) => relancerPapierLangue(...args),
    assignerPapierCm: (...args: unknown[]) => assignerPapierCm(...args),
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

function masterScripting(overrides: Record<string, unknown> = {}) {
  return {
    id: "master-1",
    date_publication: "2026-08-31",
    topic: "Pourquoi la mer est-elle salée ?",
    kind: "culture",
    narration_style: "revelation",
    script: {
      title: "Mer",
      hook: "La mer est salée.",
      cta: "Plus d'histoires t'attendent sur l'application Sophia.",
      scenes: [{ index: 1, narration: "La mer est salée.", overlay: "Sel", imagePrompt: "a", videoPrompt: "b" }],
      hashtags: [],
    },
    statut: "scripting",
    etape: "script",
    progression: 0.1,
    erreur: null,
    journal: [],
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    pipeline_mode: "manuel",
    pipeline_hold: "script",
    annule: false,
    papier_scenes: [],
    papier_langues: [],
    papier_posts: [],
    ...overrides,
  };
}

describe("AdminPapierPage", () => {
  beforeEach(() => {
    listerPapierMasters.mockReset();
    listerPapierMasters.mockResolvedValue([]);
    arreterPapier.mockClear();
    proposerTopicPapier.mockClear();
    lancerPapierJourMock.mockClear();
    abandonnerPapier.mockClear();
    sauverTopicPapier.mockClear();
    regenererPartiePapier.mockClear();
    regenererPapier.mockClear();
    validerEtapePapier.mockClear();
    relancerPapierLangue.mockClear();
    abandonnerPapier.mockResolvedValue({ ok: true, done: true });
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
    listerPapierMasters.mockResolvedValue([masterScripting()]);
    renderPage();

    const stop = await screen.findByRole("button", { name: /stop pipeline|arrêter la pipeline/i });
    fireEvent.click(stop);

    await waitFor(() => {
      expect(arreterPapier).toHaveBeenCalledWith("master-1");
    });
  });

  it("propose un sujet et l'écrit sur le master en cours", async () => {
    listerPapierMasters.mockResolvedValue([masterScripting({ topic: "Napoléon à Waterloo" })]);
    renderPage();

    expect(await screen.findByDisplayValue("Napoléon à Waterloo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("papier-proposer"));

    await waitFor(() => {
      expect(proposerTopicPapier).toHaveBeenCalled();
      expect(sauverTopicPapier).toHaveBeenCalledWith("master-1", "Pourquoi la mer est-elle salée ?");
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("Pourquoi la mer est-elle salée ?")).toBeInTheDocument();
    });
  });

  it("regénère le script avec le sujet du formulaire", async () => {
    listerPapierMasters.mockResolvedValue([masterScripting()]);
    renderPage();

    fireEvent.click(await screen.findByTestId("papier-regen-script"));

    await waitFor(() => {
      expect(regenererPartiePapier).toHaveBeenCalledWith(
        "master-1",
        "script",
        "Pourquoi la mer est-elle salée ?",
      );
    });
  });

  it("efface le master en cours et revient à un formulaire vide", async () => {
    listerPapierMasters.mockResolvedValue([masterScripting({ topic: "Napoléon à Waterloo" })]);
    abandonnerPapier.mockImplementation(async () => {
      listerPapierMasters.mockResolvedValue([]);
      return { ok: true, done: true };
    });
    renderPage();

    expect(await screen.findByDisplayValue("Napoléon à Waterloo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("papier-start-over"));

    await waitFor(() => {
      expect(abandonnerPapier).toHaveBeenCalledWith("master-1");
    });
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Napoléon à Waterloo")).not.toBeInTheDocument();
    });
    expect(regenererPapier).not.toHaveBeenCalled();
  });

  it("valide le script du master en cours", async () => {
    listerPapierMasters.mockResolvedValue([masterScripting()]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /approve script|valider le script/i }));

    await waitFor(() => {
      expect(validerEtapePapier).toHaveBeenCalledWith("master-1", "Pourquoi la mer est-elle salée ?");
    });
  });

  it("montre l'aperçu mix-raw sans Exporter, et grise Continue si captions busy", async () => {
    listerPapierMasters.mockResolvedValue([
      masterScripting({
        statut: "clips",
        etape: "fr",
        pipeline_hold: null,
        papier_langues: [
          {
            id: "fr-1",
            master_id: "master-1",
            langue: "fr",
            title: "Chocolat",
            hook: null,
            cta: null,
            hashtags: null,
            statut: "render",
            etape: "cadre",
            progression: 0.72,
            erreur: null,
            busy: true,
            video_url: null,
            video_mix_url: "https://example.com/mix-raw.mp4",
            video_mix_path: "papiers/m/fr/mix-raw.mp4",
          },
        ],
      }),
    ]);
    renderPage();

    expect(await screen.findByTestId("papier-continuer")).toBeDisabled();
    expect(screen.getByText(/captions in progress|captions en cours/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/captions not burned|captions pas encore|preview has no captions|l’aperçu n’a pas/i)
        .length,
    ).toBeGreaterThan(0);
    expect(relancerPapierLangue).not.toHaveBeenCalled();
  });

  it("affiche Exporter seulement quand la vidéo finale captions est prête", async () => {
    listerPapierMasters.mockResolvedValue([
      masterScripting({
        statut: "clips",
        etape: "fr",
        pipeline_hold: null,
        video_url: "https://example.com/final.mp4",
        papier_langues: [
          {
            id: "fr-1",
            master_id: "master-1",
            langue: "fr",
            title: "Chocolat",
            hook: null,
            cta: null,
            hashtags: null,
            statut: "ready",
            etape: "ready",
            progression: 1,
            erreur: null,
            busy: false,
            video_url: "https://example.com/final.mp4",
            video_mix_url: "https://example.com/mix.mp4",
            video_mix_path: "papiers/m/fr/mix.mp4",
          },
        ],
      }),
    ]);
    renderPage();

    expect((await screen.findAllByRole("button", { name: /export/i })).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("papier-continuer")).not.toBeInTheDocument();
  });
});
