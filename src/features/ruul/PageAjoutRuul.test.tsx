import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireAjoutsRuul: vi.fn(),
  marquerAjoutesRuul: vi.fn(),
  lireCandidaturesRuul: vi.fn(),
  lireCohortesRuul: vi.fn(),
  deciderCandidatureRuul: vi.fn(),
}));
vi.mock("./api", () => api);

import { PageAjoutRuul } from "./PagesRuul";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PageAjoutRuul /></QueryClientProvider>);
}

const ligne = (o: Record<string, unknown>) => ({ poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", pays: "ES", zone: "B", tarif: 10, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  api.lireAjoutsRuul.mockResolvedValue([ligne({}), ligne({ poster_id: "p2", nom: "Bo Test", ruul_email: "bo@test.zz", pays: null, zone: null, tarif: null })]);
  api.marquerAjoutesRuul.mockResolvedValue(1);
});

describe("PageAjoutRuul (0591)", () => {
  it("liste nom, email Ruul, pays, zone et tarif", async () => {
    rendu();
    expect(await screen.findByText("Ana Test")).toBeInTheDocument();
    expect(screen.getByText("ana@test.zz")).toBeInTheDocument();
    expect(screen.getByText("10 $")).toBeInTheDocument();
    expect(screen.getByText(/2 posteurs avec un email Ruul/)).toBeInTheDocument();
  });

  it("marque un posteur ajouté d'un clic", async () => {
    rendu();
    await screen.findByText("Ana Test");
    fireEvent.click(screen.getAllByRole("button", { name: "Marquer ajouté" })[0]);
    await waitFor(() => expect(api.marquerAjoutesRuul).toHaveBeenCalledWith(["p1"]));
    expect(await screen.findByText("1 posteur marqué ajouté dans Ruul.")).toBeInTheDocument();
  });

  it("tout cocher puis marquer tous ensemble", async () => {
    api.marquerAjoutesRuul.mockResolvedValue(2);
    rendu();
    await screen.findByText("Ana Test");
    fireEvent.click(screen.getByLabelText("Tout cocher"));
    fireEvent.click(screen.getByRole("button", { name: "Marquer ajouté dans Ruul (2)" }));
    await waitFor(() => expect(api.marquerAjoutesRuul).toHaveBeenCalledWith(["p1", "p2"]));
    expect(await screen.findByText("2 posteurs marqués ajoutés dans Ruul.")).toBeInTheDocument();
  });

  it("personne à ajouter", async () => {
    api.lireAjoutsRuul.mockResolvedValue([]);
    rendu();
    expect(await screen.findByText("Personne à ajouter.")).toBeInTheDocument();
  });
});
