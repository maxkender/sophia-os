import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SujetRecherche } from "./sujets";

const api = vi.hoisted(() => ({ lireSujets: vi.fn(), lireBudgetEclaireurs: vi.fn(), ajouterSujet: vi.fn(), annulerSujet: vi.fn() }));
vi.mock("./sujets", async (orig) => ({ ...(await orig<typeof import("./sujets")>()), ...api }));

import { PanneauSujets } from "./PanneauSujets";

const sujet = (o: Partial<SujetRecherche>): SujetRecherche => ({
  id: "s1", sujet: "l'art : tableaux, sculptures", consigne: "le format tableau décodé", langues: [], labelNom: null, budgetUsd: 12, cartesMax: 15, jour: "2026-11-24",
  statut: "en_attente", agent: null, prisLe: null, faitLe: null, compteRendu: null, creeLe: "2026-11-24T08:00:00Z", depenseUsd: 0, cartes: 0, ...o,
});
const rendre = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PanneauSujets /></QueryClientProvider>);

describe("le panneau des sujets de recherche", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.lireBudgetEclaireurs.mockResolvedValue({ plafondUsd: 50, depenseUsd: 6.5, resteUsd: 43.5, sujetsEnAttente: 1 });
    api.ajouterSujet.mockResolvedValue(undefined);
    api.annulerSujet.mockResolvedValue(undefined);
  });

  it("sans sujet, dit que les agents cherchent librement, et montre le budget du jour", async () => {
    api.lireSujets.mockResolvedValue([]);
    rendre();
    expect(await screen.findByTestId("sujets-vide")).toHaveTextContent("les agents cherchent librement");
    expect(await screen.findByTestId("budget-eclaireurs")).toHaveTextContent("6,50 $ dépensés sur 50 $");
  });

  it("montre qui cherche quoi, ce que ça a coûté, et le compte rendu d'un sujet rendu", async () => {
    api.lireSujets.mockResolvedValue([
      sujet({ id: "a", sujet: "l'histoire en polonais", langues: ["pl"], statut: "pris", agent: "eclaireur-2", depenseUsd: 4.25, cartes: 3 }),
      sujet({ id: "b" }),
      sujet({ id: "c", sujet: "le running pour hommes", statut: "fait", agent: "eclaireur-1", faitLe: "2026-11-23T10:00:00Z", compteRendu: "9 cartes, 8,10 $.", depenseUsd: 8.1, cartes: 9 }),
    ]);
    rendre();
    const ouverts = await screen.findByTestId("sujets-ouverts");
    const lignes = [...ouverts.querySelectorAll("[data-sujet]")] as HTMLElement[];
    expect(lignes.map((l) => l.dataset.sujet)).toEqual(["a", "b"]);
    expect(lignes[0]).toHaveTextContent("en cours · eclaireur-2");
    expect(lignes[0]).toHaveTextContent("pl · 4,25 $ sur 12 $ · 3 cartes sur 15");
    expect(lignes[1]).toHaveTextContent("en attente");
    expect(lignes[1]).toHaveTextContent("toutes langues · 0 $ sur 12 $ · 0 carte sur 15");
    // 7,75 $ restent au sujet en cours, 12 $ à celui en attente.
    expect(screen.getByTestId("budget-eclaireurs")).toHaveTextContent("19,75 $ réservés par les sujets ouverts");

    const rendu = within(screen.getByTestId("sujets-rendus")).getByText("le running pour hommes").closest("[data-sujet]") as HTMLElement;
    fireEvent.click(within(rendu).getByRole("button", { name: "Compte rendu" }));
    expect(rendu).toHaveTextContent("9 cartes, 8,10 $.");
  });

  it("donne un sujet : les champs partent tels quels, le formulaire se vide", async () => {
    api.lireSujets.mockResolvedValue([]);
    rendre();
    await screen.findByTestId("sujets-vide");
    const bouton = screen.getByRole("button", { name: "Donner le sujet" });
    expect(bouton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sujet"), { target: { value: "l'art : tableaux" } });
    fireEvent.change(screen.getByLabelText("Langues"), { target: { value: "de, it" } });
    fireEvent.change(screen.getByLabelText("Budget en dollars"), { target: { value: "60" } });
    fireEvent.click(bouton);
    expect(await screen.findByRole("alert")).toHaveTextContent("de 1 à 50 $");
    expect(api.ajouterSujet).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Budget en dollars"), { target: { value: "20" } });
    fireEvent.click(bouton);
    await waitFor(() => expect(api.ajouterSujet).toHaveBeenCalledWith({ sujet: "l'art : tableaux", consigne: "", langues: "de, it", budgetUsd: 20, cartesMax: null }));
    await waitFor(() => expect(screen.getByLabelText("Sujet")).toHaveValue(""));
    expect(api.lireSujets).toHaveBeenCalledTimes(2);
  });

  it("annule un sujet après confirmation", async () => {
    api.lireSujets.mockResolvedValue([sujet({ id: "b" })]);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendre();
    const ligne = (await screen.findByText("l'art : tableaux, sculptures")).closest("[data-sujet]") as HTMLElement;
    fireEvent.click(within(ligne).getByRole("button", { name: /Annuler/ }));
    expect(api.annulerSujet).not.toHaveBeenCalled();
    fireEvent.click(within(ligne).getByRole("button", { name: /Annuler/ }));
    await waitFor(() => expect(api.annulerSujet).toHaveBeenCalledWith("b"));
    confirmer.mockRestore();
  });
});
