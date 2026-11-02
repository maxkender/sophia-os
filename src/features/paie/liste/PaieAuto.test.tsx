import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireEtatPaieAuto: vi.fn(),
  lireReglagesPaiementApi: vi.fn(),
  lancerPaieAuto: vi.fn(async () => ({})),
}));
vi.mock("@/features/paie/api-upwork/api", () => api);
const auth = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { PaieAuto } from "./PaieAuto";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PaieAuto semaine="2026-10-26" />
    </QueryClientProvider>,
  );
}

describe("Prompt 21, B3 : la paie automatique dans Payroll", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    auth.role = "admin";
    api.lireEtatPaieAuto.mockResolvedValue(null);
  });

  it("paie_api pas sur « on » : rien ne part, Pay now grisé", async () => {
    api.lireReglagesPaiementApi.mockResolvedValue({ mode: "test" });
    rendu();
    await screen.findByText(/test/);
    expect(screen.getByTestId("paie-auto-lancer")).toBeDisabled();
  });

  it("« on » : Pay now demande confirmation puis lance", async () => {
    api.lireReglagesPaiementApi.mockResolvedValue({ mode: "on" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await waitFor(() => expect(screen.getByTestId("paie-auto-lancer")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("paie-auto-lancer"));
    await waitFor(() => expect(api.lancerPaieAuto).toHaveBeenCalledTimes(1));
  });

  it("arrêtée au canari : l'écart est affiché ; un HM ne voit pas Pay now", async () => {
    api.lireReglagesPaiementApi.mockResolvedValue({ mode: "on" });
    api.lireEtatPaieAuto.mockResolvedValue({ semaine: "2026-10-26", statut: "arrete", arret_raison: "Week 45 : 1400 $, attendu 14 $", canari_ok: false });
    auth.role = "hiring_manager";
    rendu();
    expect(await screen.findByTestId("paie-auto-arret")).toHaveTextContent("1400");
    expect(screen.queryByTestId("paie-auto-lancer")).toBeNull();
  });
});
