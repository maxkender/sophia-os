import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CarteBonusLundi, LigneBonusLundi } from "./api";

const api = vi.hoisted(() => ({
  lireCarteBonus: vi.fn(),
  retirerBonus: vi.fn(),
  donnerBonus: vi.fn(),
  envoyerBonus: vi.fn(),
  lireHistoriqueBonus: vi.fn(),
}));
vi.mock("./api", () => api);

import { BonusLundi } from "./BonusLundi";
import { PageBonus } from "./PageBonus";

const ligne = (o: Partial<LigneBonusLundi>): LigneBonusLundi => ({
  id: "l1", type: "comment_master", nom: "Ana Test", detail: "40 commentaires", quantite: 40, a_verifier: 0,
  tarif: 0.25, zone: "A", montant: 10, statut: "a_valider", erreur: null, raison: null,
  periode_debut: "2026-11-02", periode_fin: "2026-11-08", delai_median_min: null, part_moins_2h: null,
  contrat_ok: true, envoi_at: null, paye_at: null, ...o,
});
const CARTE: CarteBonusLundi = {
  lundi: "2026-11-09",
  lignes: [ligne({}), ligne({ id: "l2", type: "parrainage", nom: "Bo Test", detail: "parrainage de Cy", montant: 10 })],
  total: 20, paye: 0, parrainages_a_confirmer: 0, test_valide: true,
};

function rendu(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lireCarteBonus.mockResolvedValue(CARTE);
  api.lireHistoriqueBonus.mockResolvedValue([
    { id: "h1", type: "manuel", nom: "Dee Test", detail: "bonus", montant: 2, statut: "paye", lundi: "2026-11-02", envoi_at: "2026-11-02T10:00:00Z", paye_at: "2026-11-02T10:01:00Z", erreur: null, facture: "T1" },
    { id: "h2", type: "parrainage", nom: "Eve Test", detail: "parrainage", montant: 10, statut: "echec", lundi: "2026-11-02", envoi_at: "2026-11-02T10:00:00Z", paye_at: null, erreur: "contrat fermé", facture: null },
  ]);
});

describe("Page Bonus", () => {
  it("donner (récap → Confirmer), lundi avec total + 10 %, Retirer, historique", async () => {
    api.donnerBonus.mockResolvedValue({ ok: true, nom: "Martin Test", montant: 2, lundi: "2026-11-09" });
    api.retirerBonus.mockResolvedValue(undefined);
    rendu(<PageBonus />);

    // Lundi : 20 $ + 10 % = 22 $
    const carte = await screen.findByTestId("bonus-lundi");
    expect(carte).toHaveTextContent("22.00 $");
    expect(screen.queryByTestId("lien-page-bonus")).toBeNull();
    // un seul champ « Donner un bonus » sur la page
    expect(screen.getAllByTestId("donner-bonus")).toHaveLength(1);

    // Historique
    const h = await screen.findByTestId("historique-bonus");
    expect(h).toHaveTextContent("2 envoi(s) · 2.00 $ payés");
    expect(within(h).getByText("contrat fermé")).toBeInTheDocument();

    // Donner en une phrase
    fireEvent.change(screen.getByLabelText("Donner un bonus"), { target: { value: "donne 2 $ de bonus à Martin Test lundi, raison super semaine" } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer" }));
    const recap = await screen.findByTestId("recap-bonus");
    expect(recap).toHaveTextContent("Martin Test");
    expect(recap).toHaveTextContent("2 $");
    fireEvent.click(within(recap).getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(api.donnerBonus).toHaveBeenCalledWith(expect.objectContaining({ nom: "Martin Test", montant: 2 })));
    expect(await screen.findByText(/Ajouté : 2 \$ à Martin Test/)).toBeInTheDocument();

    // Retirer une ligne
    fireEvent.click(within(carte).getAllByRole("button", { name: /Retirer/ })[0]);
    await waitFor(() => expect(api.retirerBonus).toHaveBeenCalledWith("l1", true));
    expect(api.envoyerBonus).not.toHaveBeenCalled();
  });

  it("Weekly decisions : la carte a le lien vers la page", async () => {
    rendu(<BonusLundi lienPage />);
    const lien = await screen.findByTestId("lien-page-bonus");
    expect(lien).toHaveAttribute("href", "/admin/auto/bonus");
  });
});
