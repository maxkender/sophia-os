import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import { BoutonKillSamedi, BoutonRituel } from "./KillSamedi";
import { jourRituel, samediDe } from "./logique";

const kill = vi.fn<(id: string, annuler: boolean) => Promise<object>>(async () => ({}));
const rituel = vi.fn<(id: string, choix: string, annuler: boolean) => Promise<object>>(async () => ({}));
vi.mock("./api", () => ({
  killSamedi: (id: string, annuler: boolean) => kill(id, annuler),
  deciderRituel: (id: string, choix: string, annuler: boolean) => rituel(id, choix, annuler),
}));

function rendre(kill_samedi_lundi: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BoutonKillSamedi p={{ id: "pb1", kill_samedi_lundi }} libelle="Kill samedi" /></QueryClientProvider>);
}

describe("BoutonKillSamedi (0530)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    kill.mockClear();
  });

  it("le clic n'exécute rien : il prépare la décision du samedi", async () => {
    rendre(null);
    fireEvent.click(screen.getByTestId("kill-samedi"));
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith("pb1", false));
  });

  it("« Kill prévu samedi 07/11 » et Annuler", async () => {
    expect(samediDe("2026-11-02")).toBe("07/11");
    rendre("2026-11-02");
    expect(screen.getByTestId("kill-prevu").textContent).toContain("Kill prévu samedi 07/11");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith("pb1", true));
  });
});

describe("BoutonRituel (0531)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    rituel.mockClear();
  });

  it("Recréer → jeudi, Doubler → samedi ; prévu + Annuler", async () => {
    expect(jourRituel("2026-11-02", "recreate")).toBe("05/11");
    expect(jourRituel("2026-11-02", "double")).toBe("07/11");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(<QueryClientProvider client={qc}><BoutonRituel p={{ id: "pb2", rituel_choix: null, rituel_lundi: null }} choix="recreate" libelle="Recréer (jeudi)" /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId("rituel-recreate"));
    await vi.waitFor(() => expect(rituel).toHaveBeenCalledWith("pb2", "recreate", false));
    unmount();
    render(<QueryClientProvider client={qc}><BoutonRituel p={{ id: "pb2", rituel_choix: "double", rituel_lundi: "2026-11-02" }} choix="double" libelle="Doubler" /></QueryClientProvider>);
    expect(screen.getByTestId("rituel-prevu").textContent).toContain("Doubler prévu samedi 07/11");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await vi.waitFor(() => expect(rituel).toHaveBeenCalledWith("pb2", "double", true));
  });
});
