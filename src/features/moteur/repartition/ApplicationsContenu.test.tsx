import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerApplicationsMulti = vi.fn();
const listerPertinencesContenu = vi.fn();
const listerDecksApplicationsContenu = vi.fn();
const listerTiersApplicationsContenu = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: vi.fn(),
  listerPertinencesContenu: (id: string) => listerPertinencesContenu(id),
  listerDecksApplicationsContenu: (id: string) => listerDecksApplicationsContenu(id),
  listerTiersApplicationsContenu: (id: string) => listerTiersApplicationsContenu(id),
  majTierContenuApplication: vi.fn(),
  relancerRequalifContenuApplication: vi.fn(),
}));

import {
  DecksApplications,
  PertinencesApplications,
  TiersApplications,
} from "./ApplicationsContenu";

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

/** Ligne de `contenu_application_tier_etat` (0270) — défaut : Unswipe, rang d'entrée B. */
function etatApplication(sur: Record<string, unknown> = {}) {
  return {
    contenu_id: "ct-1",
    application_id: ID_UNSWIPE,
    tier: "B",
    passages_prevus: 2,
    tier_cycle: 0,
    tier_maj_at: null,
    publies: 1,
    en_vol: 1,
    restants: 0,
    moyenne_vues: 4321,
    max_vues: 5000,
    nb_150k: 0,
    mesures: 1,
    introuvables: 0,
    en_attente_mesure: 0,
    dernier_publie_at: null,
    eligible: true,
    materialise: false,
    note: 65,
    tier_rapport: null,
    ...sur,
  };
}

const TIERLIST = { recul_jours: 1, requalif_max_jours: 3 };

describe("TiersApplications (0270)", () => {
  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue([
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
      { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: null, actif: true },
    ]);
    listerTiersApplicationsContenu.mockReset();
  });

  it("affiche le tier, l'avancement de SON cycle et le rang d'entrée paresseux", async () => {
    listerTiersApplicationsContenu.mockResolvedValue([etatApplication()]);
    rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    expect(await screen.findByText("Tier per app")).toBeInTheDocument();
    expect(await screen.findByText("Unswipe")).toBeInTheDocument();
    expect(screen.getByText("1/2 published · 1 in flight")).toBeInTheDocument();
    expect(screen.getByText(/Entry tier \(score 65\), not requalified yet/)).toBeInTheDocument();
    expect(screen.getByText(/4[\s\u202f,.]?321/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Requalify now" })).toBeInTheDocument();
    expect(listerTiersApplicationsContenu).toHaveBeenCalledWith("ct-1");
  });

  it("ligne matérialisée hors réserve : le dit, sans parler de rang d'entrée", async () => {
    listerTiersApplicationsContenu.mockResolvedValue([
      etatApplication({ materialise: true, eligible: false, tier: "A", passages_prevus: 4 }),
    ]);
    rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    expect(await screen.findByText(/Out of the pool \(revoked or ineligible\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Entry tier/)).not.toBeInTheDocument();
  });

  it("schéma 0270 absent : ne rend RIEN", async () => {
    listerTiersApplicationsContenu.mockRejectedValue({
      code: "PGRST205",
      message: "Could not find the table 'public.contenu_application_tier_etat' in the schema cache",
    });
    const { container } = rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    await waitFor(() => expect(listerTiersApplicationsContenu).toHaveBeenCalled());
    await new Promise((ok) => setTimeout(ok, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("pendant le chargement : ne rend RIEN", () => {
    listerTiersApplicationsContenu.mockReturnValue(new Promise(() => {}));
    const { container } = rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("aucune ligne non-Sophia (contenu Sophia seul) : ne rend RIEN", async () => {
    listerTiersApplicationsContenu.mockResolvedValue([]);
    const { container } = rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    await waitFor(() => expect(listerTiersApplicationsContenu).toHaveBeenCalled());
    await new Promise((ok) => setTimeout(ok, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("une autre erreur reste locale au bloc", async () => {
    listerTiersApplicationsContenu.mockRejectedValue(new Error("connexion perdue"));
    rendre(<TiersApplications contenuId="ct-1" tierlist={TIERLIST} />);
    expect(await screen.findByText(/Per-app tiers unavailable: connexion perdue/)).toBeInTheDocument();
  });
});
