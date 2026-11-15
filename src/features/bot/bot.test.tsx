import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  simuler: vi.fn(),
  chercherPosteurs: vi.fn(),
  garderCommeTest: vi.fn(),
  proposerAuCatalogue: vi.fn(),
  lireCatalogue: vi.fn(),
  enregistrerEntree: vi.fn(),
  lireHistorique: vi.fn(),
  restaurer: vi.fn(),
  lireInfos: vi.fn(),
  modifierInfo: vi.fn(),
  lireTests: vi.fn(),
  lancerTests: vi.fn(),
  ajouterTest: vi.fn(),
  activerTest: vi.fn(),
  lireSuivi: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { compteurs, type DemandeSuivi, type EntreeCatalogue, filtrerCatalogue, regressions, repetees } from "./api";
import { Catalogue, Suivi, Tester } from "./PageBot";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
}

const entree = (x: Partial<EntreeCatalogue>): EntreeCatalogue => ({
  id: "e", question: "Is the warm-up paid?", formulations: [], reponse: "No.", action: null, niveau: "bot", portee: "tous",
  categorie: "paie", actif: true, valide_at: "2026-11-12T00:00:00Z", ordre: 100, maj_at: "2026-11-12T00:00:00Z", ...x,
});
const demande = (x: Partial<DemandeSuivi>): DemandeSuivi => ({
  id: "d", poster_id: "p", type: "question", categorie: "paie", plateforme: "upwork", source: "help", texte: "When am I paid?",
  bot_reponse: null, statut: "bot", niveau: "bot", risque: [], action_faite: null, regle: null, raison: null, cree_at: "2026-11-12T08:00:00Z", ...x,
});

beforeEach(() => vi.clearAllMocks());

describe("Bot du support, logique", () => {
  it("catalogue : recherche dans les formulations, plateforme (« tous » visible partout), inactives cachées", () => {
    const l = [
      entree({ id: "a", formulations: ["is warmup paid"] }),
      entree({ id: "b", portee: "ruul", question: "When is Ruul pay?" }),
      entree({ id: "c", actif: false }),
    ];
    const f = { q: "", portee: "" as const, categorie: "", inactifs: false };
    expect(filtrerCatalogue(l, f).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filtrerCatalogue(l, { ...f, q: "warmup" }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrerCatalogue(l, { ...f, portee: "upwork" }).map((e) => e.id)).toEqual(["a"]);
    expect(filtrerCatalogue(l, { ...f, portee: "ruul" }).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filtrerCatalogue(l, { ...f, inactifs: true }).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("régressions : seuls les tests verts avant et rouges après", () => {
    const avant = [{ id: "1", dernier_ok: true }, { id: "2", dernier_ok: false }, { id: "3", dernier_ok: true }];
    const apres = { total: 3, verts: 1, resultats: [{ id: "1", ok: false, niveau: "bot", reponse: "", action: null }, { id: "2", ok: false, niveau: "bot", reponse: "", action: null }, { id: "3", ok: true, niveau: "bot", reponse: "", action: null }] };
    expect(regressions(avant, apres)).toEqual(["1"]);
  });

  it("suivi : compteurs par niveau (sans niveau = Adrien) et questions répétées", () => {
    const l = [demande({ id: "1" }), demande({ id: "2" }), demande({ id: "3", poster_id: "q", niveau: "max" }), demande({ id: "4", poster_id: "r", niveau: null, risque: ["repetition"] })];
    expect(compteurs(l)).toEqual({ bot: 2, adrien: 1, max: 1 });
    expect([...repetees(l)].sort()).toEqual(["1", "2", "4"]);
  });
});

describe("PageBot", () => {
  it("Catalogue : modifier une réponse validée la garde validée (nouvelle heure de validation)", async () => {
    api.lireInfos.mockResolvedValue([]);
    api.lireTests.mockResolvedValue([]);
    api.lireHistorique.mockResolvedValue([]);
    api.lireCatalogue.mockResolvedValue([entree({ id: "a" })]);
    api.enregistrerEntree.mockResolvedValue("a");
    api.lancerTests.mockResolvedValue({ total: 0, verts: 0, resultats: [] });
    rendu(<Catalogue />);
    fireEvent.click(await screen.findByTestId("catalogue-ligne"));
    const ed = screen.getByTestId("catalogue-edition");
    fireEvent.change(within(ed).getByLabelText(/Réponse/), { target: { value: "No, the warm-up is not paid." } });
    fireEvent.click(within(ed).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerEntree).toHaveBeenCalledWith("a", expect.objectContaining({ reponse: "No, the warm-up is not paid.", valide: true })));
  });

  it("Tester : simulation sur un faux posteur, détails sous la réponse, « Bonne réponse » ajoute un test", async () => {
    api.simuler.mockResolvedValue({
      decision: { langue: "en", categorie: "paie", personnel: false, reponse: "You are paid on Monday.", action: null, action_valeur: null, niveau: "bot", regle: "x", risque: [], raison: "Règle de paie." },
      texte: "You are paid on Monday.\n— the Vik Studios team", regle_utilisee: "When am I paid?", plateforme: "upwork", action_prevue: null,
    });
    api.garderCommeTest.mockResolvedValue(undefined);
    rendu(<Tester />);
    fireEvent.change(screen.getByLabelText("Message du posteur"), { target: { value: "When do I get paid?" } });
    fireEvent.click(screen.getByTestId("bot-simuler"));
    const r = screen.getByTestId("bot-resultat");
    await within(r).findByText(/You are paid on Monday/);
    expect(api.simuler).toHaveBeenCalledWith(expect.objectContaining({ message: "When do I get paid?", source: "help", poster_id: null }));
    expect(r).toHaveTextContent("When am I paid?");
    expect(within(r).getByTestId("niveau-bot")).toBeInTheDocument();
    fireEvent.click(within(r).getByRole("button", { name: /Bonne réponse/ }));
    await waitFor(() => expect(api.garderCommeTest).toHaveBeenCalled());
  });

  it("Suivi : compteurs de la semaine et objectif de Max", async () => {
    api.lireSuivi.mockResolvedValue([demande({ id: "1" }), demande({ id: "2", niveau: "max", poster_id: "z" })]);
    rendu(<Suivi />);
    const c = await screen.findByTestId("suivi-compteurs");
    await waitFor(() => expect(c).toHaveTextContent("Max · 7 jours1"));
    expect(c).toHaveTextContent("objectif : moins de 10");
    expect(await screen.findAllByTestId("suivi-ligne")).toHaveLength(2);
  });
});
