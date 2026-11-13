import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lirePosteursRuul: vi.fn(),
  lireTableauRuul: vi.fn(),
  lireLotRuul: vi.fn(),
  preparerLotRuul: vi.fn(),
  saisirLotRuul: vi.fn(),
  payerLotRuul: vi.fn(),
  rapprocherLotRuul: vi.fn(),
  changerStatutRuul: vi.fn(),
}));
vi.mock("./api", () => api);

import { lignesCsvLot, lireExportRuul } from "./logique";
import { PaieRuul } from "./PaieRuul";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PaieRuul /></QueryClientProvider>);
}

const posteur = (o: Record<string, unknown>) => ({
  poster_id: "p1", nom: "Ana Test", prenom_legal: "Ana", nom_legal: "Test", ruul_email: "ana@test.zz", ruul_statut: "a_ajouter",
  pays: "IT", cohorte: "2026-10-26", actif: true, ajoute_at: null, pret_at: null, premier_paiement_at: null,
  relances: 0, relance_at: null, stop_at: null, du: 14, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.lireTableauRuul.mockResolvedValue({
    mode: "manuel", statuts: { a_ajouter: 1, invite: 1 }, semaine: "2026-11-02", lot: null, rattrapages: { nb: 2, total: 14 }, reportes: 2,
  });
  api.lirePosteursRuul.mockResolvedValue([posteur({}), posteur({ poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", ajoute_at: "2026-11-09T10:00:00Z", relances: 1 })]);
  api.changerStatutRuul.mockResolvedValue({ ok: true });
  api.preparerLotRuul.mockResolvedValue({ ok: true });
  api.saisirLotRuul.mockResolvedValue({ ok: true });
});

describe("Paie Ruul", () => {
  it("à ajouter : email modifiable, « Ajouté sur Ruul » ; invités : « Marquer prêt »", async () => {
    api.lireLotRuul.mockResolvedValue({ semaine: "2026-11-02", lot: null, rapprochement: null, lignes: [], reportes: [] });
    rendu();
    const carte = await screen.findByTestId("ajouter-ruul");
    fireEvent.change(within(carte).getByLabelText("Email Ruul de Ana Test"), { target: { value: "ana.ruul@test.zz" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Ajouté sur Ruul" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p1", "invite", "ana.ruul@test.zz"));
    fireEvent.click(within(screen.getByTestId("invites-ruul")).getByRole("button", { name: "Marquer prêt" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p2", "pret", undefined));
    expect(screen.getByTestId("tableau-ruul")).toHaveTextContent("14.00 $");
  });

  it("le lot : alertes, saisie de la facture, reportés", async () => {
    api.lireLotRuul.mockResolvedValue({
      semaine: "2026-11-02",
      lot: { id: "l", statut: "prepare", facture: null, total: 20, nb: 2, paye_at: null },
      rapprochement: null,
      lignes: [{
        poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", pays: "IT", total: 20, alertes: ["1er paiement", "rattrapage"],
        semaines: [
          { id: "a", semaine: "2026-10-26", montant: 10, rattrapage: true, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
          { id: "b", semaine: "2026-11-02", montant: 10, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
        ],
      }],
      reportes: [
        { poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", ruul_compte: "invited", semaine: "2026-11-02", montant: 7, raison: "x" },
        { poster_id: "p3", nom: "Cy Test", ruul_statut: "invite", ruul_compte: "invited", semaine: "2026-11-02", montant: 0, raison: "0 post" },
      ],
      totaux: { payable: 20, nb_payable: 1, en_attente: 7, nb_en_attente: 1 },
    });
    rendu();
    const lot = await screen.findByTestId("lot-ruul");
    expect(within(lot).getByTestId("alertes-ruul")).toHaveTextContent("Ana Test : rattrapage");
    // 0705 : 2 totaux, et la liste « en attente » (Invited qui ont posté) avec le montant dû.
    expect(within(lot).getByTestId("total-payable")).toHaveTextContent("20.00 $");
    expect(within(lot).getByTestId("total-attente")).toHaveTextContent("7.00 $");
    expect(within(lot).getByTestId("totaux-ruul")).toHaveTextContent("Payable maintenant (Active) · 1 posteur(s)");
    const attente = within(lot).getByTestId("reportes-ruul");
    expect(attente).toHaveTextContent("En attente : pas encore Active (7.00 $)");
    expect(attente).toHaveTextContent("Bo Test · semaine du 2/11 · 7.00 $ · Invited");
    expect(attente).not.toHaveTextContent("Cy Test");
    fireEvent.change(within(lot).getByLabelText("Numéro de facture Ruul"), { target: { value: "INV-1" } });
    fireEvent.click(within(lot).getByRole("button", { name: "Saisi" }));
    await waitFor(() => expect(api.saisirLotRuul).toHaveBeenCalledWith("2026-11-02", "INV-1"));
    expect(api.payerLotRuul).not.toHaveBeenCalled();
  });

  it("CSV du lot et lecture de l'export Ruul", () => {
    expect(lignesCsvLot([{ poster_id: "p", nom: "Ana", ruul_email: "a@b.cc", pays: "IT", total: 20, alertes: [], semaines: [
      { id: "1", semaine: "2026-10-26", montant: 10, rattrapage: true, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 1, paye_at: null, ecart: null },
      { id: "2", semaine: "2026-11-02", montant: 10, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 1, paye_at: null, ecart: null },
    ] }])).toEqual([["Ana", "a@b.cc", "26/10 (rattrapage) + 2/11", "20.00"]]);
    expect(lireExportRuul('Name;E-mail;Amount (USD)\n"Ana";a@b.cc;"$20,00"\n')).toEqual([{ email: "a@b.cc", montant: "20.00" }]);
    expect(lireExportRuul("a,b\n1,2")).toEqual({ erreur: "colonnes email et montant introuvables" });
  });
});

describe("Étapes Ruul", () => {
  it("bloqué en rouge après 48 h sur la même étape", async () => {
    const { etapeBloquee } = await import("./logique");
    const m = new Date("2026-11-09T12:00:00Z");
    expect(etapeBloquee({ candidature: "2026-11-01T10:00:00Z", acceptee: "2026-11-02T10:00:00Z" }, m)).toBe("signee");
    expect(etapeBloquee({ candidature: "2026-11-09T10:00:00Z" }, m)).toBeNull();
    expect(etapeBloquee({}, m)).toBeNull();
  });
});
