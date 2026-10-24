import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const api = vi.hoisted(() => ({
  listerLabels: vi.fn(),
  majLabel: vi.fn(),
  creerLabel: vi.fn(),
  supprimerLabel: vi.fn(),
  definirApplicationsLabel: vi.fn(),
}));

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () => api.listerLabels(),
  majLabel: (id: string, patch: unknown) => api.majLabel(id, patch),
  creerLabel: (nom: string, couleur: string, opts: unknown) => api.creerLabel(nom, couleur, opts),
  supprimerLabel: (id: string) => api.supprimerLabel(id),
}));
vi.mock("@/features/moteur/apiMultiApp", () => ({
  definirApplicationsLabel: (id: string, apps: string[]) => api.definirApplicationsLabel(id, apps),
  definirSeuilPertinenceLabel: vi.fn(),
}));
vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applicationId: ID_SOPHIA,
    application: { id: ID_SOPHIA, slug: "sophia", nom: "Sophia" },
    slug: "sophia",
    applications: [
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", actif: true },
      { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", actif: true },
    ],
  }),
}));
const reserve = (label_id: string, reserve_jours: number | null) => ({
  label_id,
  nom: label_id,
  slug: label_id,
  application_id: ID_SOPHIA,
  application_slug: "sophia",
  contenus_prets: 10,
  passages_restants: 10,
  comptes: 2,
  demande_jour: 2,
  reserve_jours,
});
vi.mock("@/features/moteur/multiapp/useLabelsApplications", () => ({
  useLabelsApplications: () => ({
    multiDispo: true,
    schemaAbsent: false,
    erreurLiens: null,
    reservesHistoriques: null,
    liens: [
      { label_id: "l1", application_id: ID_SOPHIA, pertinence_min: 50 },
      { label_id: "l1", application_id: ID_UNSWIPE, pertinence_min: 60 },
      { label_id: "l2", application_id: ID_SOPHIA, pertinence_min: 50 },
    ],
    reservesParLabel: new Map([
      ["l1", new Map([[ID_SOPHIA, reserve("l1", 2)]])],
      ["l2", new Map([[ID_SOPHIA, reserve("l2", 18)]])],
    ]),
  }),
}));
// Ces deux cartes ont leurs propres tests.
vi.mock("@/features/moteur/multiapp/ApplicationsCard", () => ({ ApplicationsCard: () => null }));
vi.mock("@/features/moteur/multiapp/ReplisCard", () => ({ ReplisCard: () => null }));

import { AdminLabelsPage } from "./AdminLabelsPage";

const LABELS = [
  { id: "l1", nom: "RH", couleur: "#8b5cf6", genre: "femme", style_theme: "Ton direct", prompt_creation: null, exemples_feed: [] },
  { id: "l2", nom: "white_bg", couleur: "#64748b", genre: "femme", style_theme: null, prompt_creation: null, exemples_feed: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <AdminLabelsPage />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ligne = (nom: string) => screen.getByText(nom).closest("tr") as HTMLElement;

describe("AdminLabelsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    Object.values(api).forEach((f) => f.mockReset());
    api.listerLabels.mockResolvedValue(LABELS);
    api.majLabel.mockResolvedValue(undefined);
    api.creerLabel.mockResolvedValue({ id: "l3", nom: "neuf" });
    api.definirApplicationsLabel.mockResolvedValue(undefined);
  });

  it("montre chaque label avec les logos des applis qu'il sert et son stock", async () => {
    renderPage();
    await screen.findByText("RH");
    expect(within(ligne("RH")).getByRole("img", { name: "Unswipe" })).toBeInTheDocument();
    expect(within(ligne("white_bg")).queryByRole("img", { name: "Unswipe" })).not.toBeInTheDocument();
    // Sous 7 jours, en rouge, comme sur la page Allocation.
    expect(within(ligne("RH")).getByText("2,0")).toHaveClass("text-destructive");
    expect(within(ligne("white_bg")).getByText("18,0")).not.toHaveClass("text-destructive");
  });

  it("une ligne se déplie sur le style d'écriture, qui s'enregistre", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("RH"));
    const theme = screen.getByLabelText("Thème / style");
    expect(theme).toHaveValue("Ton direct");
    fireEvent.change(theme, { target: { value: "Ton direct et chiffré" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le style" }));
    await waitFor(() =>
      expect(api.majLabel).toHaveBeenCalledWith("l1", {
        style_theme: "Ton direct et chiffré",
        prompt_creation: null,
        exemples_feed: [],
      }),
    );
  });

  it("changer le genre écrit le label sans déplier la ligne", async () => {
    renderPage();
    await screen.findByText("RH");
    fireEvent.change(within(ligne("RH")).getByRole("combobox", { name: "Genre" }), { target: { value: "homme" } });
    await waitFor(() => expect(api.majLabel).toHaveBeenCalledWith("l1", { genre: "homme" }));
    expect(screen.queryByLabelText("Thème / style")).not.toBeInTheDocument();
  });

  it("crée un label depuis le bouton, servi par Sophia par défaut", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nouveau label/ }));
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "neuf" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(api.creerLabel).toHaveBeenCalledWith("neuf", "#2f6f4e", { genre: "femme" }));
    await waitFor(() => expect(api.definirApplicationsLabel).toHaveBeenCalledWith("l3", [ID_SOPHIA]));
  });
});
