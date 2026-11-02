/**
 * Prompt 21, ajout : la fréquence des passages Upwork. Trois réglages (15 min,
 * 30 min, 1 h, 2 h), l'intervalle réellement utilisé après un 429, et la carte
 * Health (appels du jour, alerte au-dessus de 30 000).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({ lireEtatFrequences: vi.fn(), enregistrerFrequences: vi.fn(async () => undefined) }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { CarteSante, FrequencesUpwork } from "./Frequences";

const ETAT = {
  taches: [
    { tache: "accueil", reglee: 30, effective: 30, dernier_at: "2026-10-29T10:30:00Z", dernier_429_at: null },
    { tache: "reponses", reglee: 30, effective: 60, dernier_at: null, dernier_429_at: "2026-10-29T10:00:00Z" },
    { tache: "etapes", reglee: 60, effective: 60, dernier_at: null, dernier_429_at: null },
  ],
  appels_jour: 31_500,
  limite: 40_000,
  alerte: 30_000,
};

function rendu(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

describe("fréquence des passages Upwork", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    api.lireEtatFrequences.mockResolvedValue(ETAT);
  });

  it("l'admin passe « Step checks » à 2 h ; les autres gardent leur réglage", async () => {
    rendu(<FrequencesUpwork admin />);
    await screen.findByText("Step checks");
    const ligne = document.querySelector('[data-frequence="etapes"]') as HTMLElement;
    fireEvent.click(within(ligne).getByRole("button", { name: "2 h" }));
    await waitFor(() => expect(api.enregistrerFrequences).toHaveBeenCalledWith({ accueil: 30, reponses: 30, etapes: 120 }));
  });

  it("après un 429, l'intervalle réellement utilisé est affiché ; le HO ne peut rien changer", async () => {
    rendu(<FrequencesUpwork admin={false} />);
    expect(await screen.findByTestId("effective-reponses")).toHaveTextContent("1 h");
    expect(screen.queryByTestId("effective-accueil")).toBeNull();
    expect(screen.getAllByRole("button", { name: "30 min" })[0]).toBeDisabled();
  });

  it("Health : appels du jour sur 40 000, alerte au-dessus de 30 000", async () => {
    rendu(<CarteSante />);
    expect(await screen.findByTestId("appels-upwork")).toHaveTextContent(/31\s?500/);
    expect(screen.getByText(/Au-dessus de 30/)).toBeInTheDocument();
  });
});
