/**
 * 0848 (24/11) : l'indicateur « Pont Hub ↔ OS » de la carte Health : vert sans
 * incident, rouge avec l'action en échec, depuis quand et la dernière erreur.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { EtatPontHub } from "./pontHubApi";

const api = vi.hoisted(() => ({ lireEtatPontHub: vi.fn() }));
vi.mock("./pontHubApi", () => api);

import { PontHub } from "./PontHub";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PontHub />
    </QueryClientProvider>,
  );
}

const ETAT: EtatPontHub = {
  dernier_succes_at: "2026-11-24T08:05:00Z",
  dernier_echec: { at: "2026-11-24T07:59:00Z", action: "zones", code: 500, erreur: "lecture tronquée" },
  appels_24h: 120,
  echecs_24h: 80,
  incidents: [],
};

describe("PontHub", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    api.lireEtatPontHub.mockReset();
  });

  it("vert : dernière réussite et dernier échec", async () => {
    api.lireEtatPontHub.mockResolvedValue(ETAT);
    rendu();
    expect(await screen.findByText("OK")).toBeInTheDocument();
    expect(screen.getByTestId("pont-hub")).not.toHaveAttribute("data-rouge");
    expect(screen.getByText(/Dernière réussite/)).toBeInTheDocument();
    expect(screen.getByText(/Dernier échec : .*« zones » · HTTP 500 · lecture tronquée/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rouge : l'incident ouvert, avec l'action, depuis quand et la dernière erreur", async () => {
    api.lireEtatPontHub.mockResolvedValue({
      ...ETAT,
      incidents: [{ action: "zones", depuis: "2026-11-24T01:17:00Z", derniere_erreur: "lecture tronquée", echecs: 42 }],
    });
    rendu();
    expect(await screen.findByText("En panne")).toBeInTheDocument();
    expect(screen.getByTestId("pont-hub")).toHaveAttribute("data-rouge", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/« zones » échoue sans interruption depuis le 24 nov\., 02:17 \(42 échec\(s\)\)\. Dernière erreur : lecture tronquée/);
  });

  it("sans échec", async () => {
    api.lireEtatPontHub.mockResolvedValue({ ...ETAT, dernier_echec: null });
    rendu();
    expect(await screen.findByText("Aucun échec ces 7 derniers jours")).toBeInTheDocument();
  });
});
