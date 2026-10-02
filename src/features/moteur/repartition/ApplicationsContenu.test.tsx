import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerApplicationsMulti = vi.fn();
const listerPertinencesContenu = vi.fn();
const listerDecksApplicationsContenu = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: vi.fn(),
  listerPertinencesContenu: (id: string) => listerPertinencesContenu(id),
  listerDecksApplicationsContenu: (id: string) => listerDecksApplicationsContenu(id),
}));

import { DecksApplications, PertinencesApplications } from "./ApplicationsContenu";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ApplicationsContenu", () => {
  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue([
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
      { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: null, actif: true },
    ]);
    listerPertinencesContenu.mockReset();
    listerDecksApplicationsContenu.mockReset();
  });

  it("liste la pertinence de chaque application", async () => {
    listerPertinencesContenu.mockResolvedValue([
      {
        application_id: ID_UNSWIPE,
        score: 8,
        raison: "Parle du temps d'écran",
        note: 1234.6,
        eligible: true,
        angles: null,
        prompt_cle: "pertinence_unswipe",
        updated_at: "",
      },
    ]);
    rendre(<PertinencesApplications contenuId="ct-1" />);
    expect(await screen.findByText("Parle du temps d'écran")).toBeInTheDocument();
    expect(await screen.findByText("Unswipe")).toBeInTheDocument();
    expect(screen.getByText("1235")).toBeInTheDocument();
    expect(listerPertinencesContenu).toHaveBeenCalledWith("ct-1");
  });

  it("marque la slide pub d'un deck avec le nom de l'application", async () => {
    listerDecksApplicationsContenu.mockResolvedValue([
      {
        id: "d1",
        langue: "fr",
        application_id: ID_UNSWIPE,
        variante: "unswipe",
        statut: "pret",
        raison: null,
        slides: [
          { position: 2, texte_overlay: "pose ton téléphone", position_sophia: true },
          { position: 1, texte_overlay: "hook", position_sophia: false },
        ],
        placement: null,
        updated_at: "",
      },
    ]);
    rendre(<DecksApplications contenuId="ct-1" />);
    expect(await screen.findByText("pose ton téléphone")).toBeInTheDocument();
    // Nom de l'application deux fois : en-tête du deck + badge de la slide pub.
    expect(await screen.findAllByText("Unswipe")).toHaveLength(2);
  });

  it("avant 0256 : chaque bloc affiche sa propre erreur", async () => {
    listerPertinencesContenu.mockRejectedValue(new Error("contenu_pertinences absente"));
    listerDecksApplicationsContenu.mockRejectedValue(new Error("contenu_langue_decks absente"));
    rendre(
      <>
        <PertinencesApplications contenuId="ct-1" />
        <DecksApplications contenuId="ct-1" />
      </>,
    );
    expect(await screen.findByText(/contenu_pertinences absente/)).toBeInTheDocument();
    expect(await screen.findByText(/contenu_langue_decks absente/)).toBeInTheDocument();
  });
});
