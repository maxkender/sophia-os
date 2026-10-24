import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PilotageDashboard } from "@/features/moteur/api";

const compte = (id: string, nom: string) => ({ compte_id: id, nom, handle: nom.toLowerCase() });

const DASH: PilotageDashboard = {
  vuesSerie: [
    { jour: "2026-10-22", vues_totales: 1000, vues_delta: 100, nb_comptes: 3 },
    { jour: "2026-10-23", vues_totales: 1150, vues_delta: 150, nb_comptes: 3 },
  ],
  recruteurs: [{ id: "r1", nom: "Camille Roux", partBien: 0.5, nbCreateurs: 4 }],
  postsVeille: [
    {
      id: "p1",
      titre: "Study hacks",
      handle: "emma",
      vues: 90_900,
      publie_url: null,
      compte_id: "c1",
      application_id: "app-unswipe",
    },
  ],
  classementTop: [],
  classementBas: [],
  alertes: {
    niveau1: [compte("c4", "Léa")],
    niveau2: [{ ...compte("c2", "Zoé"), joursSansPost: 4 }],
  },
  parCase: [
    { classement: "star", comptes: [compte("c1", "Emma")] },
    { classement: "bien", comptes: [] },
    { classement: "passable", comptes: [compte("c4", "Léa")] },
    { classement: "mauvaises_vues", comptes: [] },
    { classement: "inactif", comptes: [compte("c2", "Zoé")] },
  ],
  postsJours: [
    { jour: "2026-10-22", prevus: 3, publies: 3 },
    { jour: "2026-10-23", prevus: 4, publies: 3 },
  ],
};

vi.mock("@/features/moteur/api", () => ({
  chargerPilotageDashboard: async () => DASH,
  compterContestationsAVerifier: async () => 1,
  listerLabels: async () => [{ id: "l1", nom: "RH" }, { id: "l2", nom: "white_bg" }],
}));

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applicationId: "app-sophia",
    application: { slug: "sophia", nom: "Sophia" },
    slug: "sophia",
    applications: [
      { id: "app-sophia", slug: "sophia", nom: "Sophia" },
      { id: "app-unswipe", slug: "unswipe", nom: "UnSwipe" },
    ],
  }),
}));

vi.mock("@/features/moteur/multiapp/useLabelsApplications", () => ({
  useLabelsApplications: () => ({
    reservesHistoriques: null,
    reservesParLabel: new Map([
      ["l1", new Map([["app-sophia", { label_id: "l1", nom: "RH", comptes: 2, reserve_jours: 2 }]])],
      ["l2", new Map([["app-sophia", { label_id: "l2", nom: "white_bg", comptes: 3, reserve_jours: 12 }]])],
    ]),
  }),
}));

import { AdminPilotagePage } from "./AdminPilotagePage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <AdminPilotagePage />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminPilotagePage", () => {
  it("affiche les chiffres clés et ce qu'il y a à faire", async () => {
    await i18n.changeLanguage("fr");
    renderPage();

    // Posts d'hier : 3 publiés sur 4 prévus.
    expect(await screen.findByText("75 % du prévu")).toBeInTheDocument();
    expect(screen.getByText("/ 4")).toBeInTheDocument();

    // Les alertes calculées par le chargeur sont enfin affichées.
    const aFaire = screen.getByText("À faire aujourd’hui").closest("[data-slot=card]") as HTMLElement;
    expect(within(aFaire).getByText("Comptes sans post depuis 2 jours ou plus")).toBeInTheDocument();
    expect(within(aFaire).getByText("Labels sous 7 jours de stock")).toBeInTheDocument();
    expect(within(aFaire).getByText("Retours contestés à vérifier")).toBeInTheDocument();

    // Une ligne se déplie sur les comptes concernés.
    fireEvent.click(within(aFaire).getByText("Comptes sans post depuis 2 jours ou plus"));
    expect(within(aFaire).getByRole("link", { name: /Zoé/ })).toHaveAttribute("href", "/admin/createurs/c2");
    expect(within(aFaire).getByText("4 j")).toBeInTheDocument();
  });

  it("met en rouge le stock sous 7 jours et renvoie vers Labels & applications", async () => {
    await i18n.changeLanguage("fr");
    renderPage();

    const stock = (await screen.findByText("Stock des labels")).closest("[data-slot=card]") as HTMLElement;
    // Le logo de l'application à la place de son nom.
    expect(within(stock).getByRole("img", { name: "Sophia" })).toBeInTheDocument();
    expect(within(stock).getByText("2,0")).toHaveClass("text-destructive");
    expect(within(stock).getByText("12,0")).not.toHaveClass("text-destructive");
    expect(screen.getByRole("link", { name: /Labels & applications/ })).toHaveAttribute("href", "/admin/labels");

    // Chaque post d'hier montre le logo de l'application qu'il promeut.
    const posts = screen.getByText("Top posts d’hier").closest("[data-slot=card]") as HTMLElement;
    expect(within(posts).getByRole("img", { name: "Unswipe" })).toBeInTheDocument();
  });
});
