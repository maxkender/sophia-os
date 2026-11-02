import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireEtatPause: vi.fn(),
  ecrirePause: vi.fn(async () => undefined),
}));
vi.mock("./pauseApi", () => api);
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { BandePause } from "./BandePause";
import { GrandInterrupteur } from "./GrandInterrupteur";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

const EN_PAUSE = { actif: true, depuis: "2026-10-29T10:00:00Z", par_nom: "Max Kender" };
const EN_MARCHE = { actif: false, depuis: null, par_nom: null };

describe("prompt 22, partie 2 : le grand interrupteur", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
  });

  it("la bande rouge s'affiche quand la pause est active, avec qui et depuis quand", async () => {
    api.lireEtatPause.mockResolvedValue(EN_PAUSE);
    rendu(<BandePause />);
    const bande = await screen.findByTestId("bande-pause");
    expect(bande.textContent).toMatch(/^Automatic actions are paused since .+ by Max Kender$/);
  });

  it("pas de bande quand l'automatisation tourne", async () => {
    api.lireEtatPause.mockResolvedValue(EN_MARCHE);
    rendu(<BandePause />);
    await screen.findByTestId("bande-pause").catch(() => null);
    expect(screen.queryByTestId("bande-pause")).toBeNull();
  });

  it("le bouton rouge demande confirmation : refusée, rien n'est écrit ; acceptée, la pause est écrite", async () => {
    api.lireEtatPause.mockResolvedValue(EN_MARCHE);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendu(<GrandInterrupteur />);
    const bouton = await screen.findByRole("button", { name: /Deactivate automatic actions/ });
    await vi.waitFor(() => expect(bouton).not.toBeDisabled());
    fireEvent.click(bouton);
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(api.ecrirePause).not.toHaveBeenCalled();
    fireEvent.click(bouton);
    await vi.waitFor(() => expect(api.ecrirePause).toHaveBeenCalledWith(true));
    confirmer.mockRestore();
  });

  it("en pause, le bouton reprend", async () => {
    api.lireEtatPause.mockResolvedValue(EN_PAUSE);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    rendu(<GrandInterrupteur />);
    const bouton = await screen.findByRole("button", { name: /Resume automatic actions/ });
    await vi.waitFor(() => expect(bouton).not.toBeDisabled());
    fireEvent.click(bouton);
    await vi.waitFor(() => expect(api.ecrirePause).toHaveBeenCalledWith(false));
  });

  it("la Head of Ops voit l'état mais n'a pas de bouton", async () => {
    auth.role = "head_of_ops";
    api.lireEtatPause.mockResolvedValue(EN_PAUSE);
    rendu(<GrandInterrupteur />);
    expect(await screen.findByText(/Paused since .+ by Max Kender/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
