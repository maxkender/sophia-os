import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const rapport = {
  samedi: "2026-11-16", cree_at: "2026-11-18T13:00:00Z", slack_at: null,
  contenu: {
    samedi: "2026-11-16", complets: 10, comptes_partiels: 1,
    par_hm: [{ hm: "Hm Test", complets: 10, partiels: 1 }], par_pays: [{ pays: "FR", complets: 10, partiels: 1 }],
    etapes_complets: [
      { etape: "a", libelle: "Comptes désactivés (raison + date)", ok: 10, echec: 0, a_faire: 0, noms: [] },
      { etape: "f", libelle: "Désactivé du Slack", ok: 2, echec: 0, a_faire: 8, noms: [{ nom: "Posteur Un", statut: "main", detail: null }] },
    ],
    etapes_partiels: [], milestones_a_corriger: [],
    controle: [{ type: "slack", libelle: "Killé mais encore dans Slack", nb: 18, lignes: [{ poster_id: "p1", nom: "Posteur Deux", detail: "U1" }] }],
  },
};
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: rapport, error: null })) } }));
vi.mock("@/features/moteur/api", () => ({ invoke: vi.fn() }));

import { PageRapportKills } from "./PageRapportKills";

describe("rapport des kills (partie 3)", () => {
  it("chiffres, étapes, noms des échecs au clic, contrôle de la base", async () => {
    render(<QueryClientProvider client={new QueryClient()}><PageRapportKills /></QueryClientProvider>);
    expect(await screen.findByText("Posteurs killés")).toBeInTheDocument();
    expect(screen.getByText("Désactivé du Slack")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Désactivé du Slack"));
    expect(screen.getByText("Posteur Un")).toBeInTheDocument();
    expect(screen.getByText("Killé mais encore dans Slack")).toBeInTheDocument();
  });
});

describe("0797 : la ligne des inactifs arrêtés automatiquement", () => {
  it("donne les chiffres par catégorie et les alertes", async () => {
    const { ligneInactifs } = await import("./inactifs");
    expect(ligneInactifs({ arretes: 12, jamais_connectes: 8, jamais_postes: 4, en_cours: 0, alertes: 2 }))
      .toBe("Inactifs arrêtés automatiquement : 12 (8 jamais connectés, 4 jamais postés) · 2 alertes bug d'assignation");
    expect(ligneInactifs({ arretes: 0, jamais_connectes: 0, jamais_postes: 0, en_cours: 1, alertes: 0 }))
      .toBe("Inactifs arrêtés automatiquement : 0 (0 jamais connecté, 0 jamais posté) · 1 en cours (reprise demain) · 0 alerte bug d'assignation");
  });
});
