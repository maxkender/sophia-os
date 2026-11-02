import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
const api = vi.hoisted(() => ({ lireReglagesPaiementApi: vi.fn(), enregistrerReglagesPaiementApi: vi.fn(async () => undefined) }));
vi.mock("./api", () => api);

import { ReglagesPaiementApi } from "./ReglagesPaiementApi";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReglagesPaiementApi ouvert />
    </QueryClientProvider>,
  );
}

describe("Payroll → paie par l'API (prompt 22, partie 8)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    auth.role = "admin";
    api.lireReglagesPaiementApi.mockResolvedValue({
      mode: "off", contrats_test: [], test_des: "2026-11-02", tous_des: "2026-11-02", plafond_ligne: 30, plafond_jour: 5000,
    });
  });

  it("affiche le mode ; « Tout le monde » demande une confirmation explicite : refusée, rien n'est écrit", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    rendu();
    expect(await screen.findByTestId("mode-paie-api")).toHaveTextContent("Mode actuel : Éteint");
    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), { target: { value: "on" } });
    expect(screen.getByText(/l'OS paiera vraiment tous les contrats/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(confirmer).toHaveBeenCalled());
    expect(await screen.findByText("Rien n'est enregistré : la paie par l'API reste comme avant.")).toBeInTheDocument();
    expect(api.enregistrerReglagesPaiementApi).not.toHaveBeenCalled();
    confirmer.mockRestore();
  });

  it("acceptée, le mode s'écrit ; un autre changement (plafond) ne demande rien", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await screen.findByTestId("mode-paie-api");
    fireEvent.change(screen.getByRole("spinbutton", { name: /ligne/i }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerReglagesPaiementApi).toHaveBeenCalledWith(expect.objectContaining({ mode: "off", plafond_ligne: 25 })));
    expect(confirmer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), { target: { value: "on" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerReglagesPaiementApi).toHaveBeenCalledWith(expect.objectContaining({ mode: "on" })));
    expect(confirmer).toHaveBeenCalledTimes(1);
    confirmer.mockRestore();
  });

  it("le Head of Ops lit le mode sans pouvoir le changer", async () => {
    auth.role = "head_of_ops";
    rendu();
    await screen.findByTestId("mode-paie-api");
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeDisabled();
  });
});
