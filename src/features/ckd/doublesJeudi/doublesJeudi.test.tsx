import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lirePropositions: vi.fn(), preparerPropositions: vi.fn(), lireLabelsPossibles: vi.fn(), decider: vi.fn(),
  toutRefuser: vi.fn(), lireLundi: vi.fn(), creerDeuxieme: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { compteurs, jeudiDeLaSemaine, type PropositionDouble } from "./api";
import { DoublesJeudi } from "./DoublesJeudi";

const prop = (o: Partial<PropositionDouble>): PropositionDouble => ({
  id: "d1", compte_id: "c1", poster_id: "p1", poster_nom: "Ana Test", hm_nom: "Hm Test", pays: "FR", langue: "fr", handle: "ana.test",
  label_nom: "clean_girl", app_nom: "Sophia", star: true, vues_med: 5282, bons: 9, posts: 14, meilleur_url: "https://www.tiktok.com/@ana.test/video/1",
  meilleur_vues: 41000, label_propose_id: "l2", label_choisi_id: null, decision: null, statut: "propose", erreur: null, nouveau_compte_id: null, rang: 1, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DoublesJeudi jeudi="2026-11-19" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lireLundi.mockResolvedValue([{ pays: "FR", nouveaux: 4, doubles: 1, total: 5 }]);
  api.lireLabelsPossibles.mockResolvedValue([{ label_id: "l2", nom: "running_girl", app_nom: "Runvik", autre_app: true, vues_med: 3100 }]);
});

describe("doublement du jeudi", () => {
  it("le jeudi de la semaine, les compteurs", () => {
    expect(jeudiDeLaSemaine("2026-11-18")).toBe("2026-11-19");
    expect(jeudiDeLaSemaine("2026-11-22")).toBe("2026-11-19");
    expect(compteurs([prop({}), prop({ id: "d2", decision: "oui" }), prop({ id: "d3", decision: "non" })])).toEqual({ total: 3, oui: 1, non: 1, reste: 1 });
  });

  it("une proposition : star, vues, label proposé ; OUI décide puis crée le 2e compte", async () => {
    api.lirePropositions.mockResolvedValue([prop({})]);
    api.decider.mockResolvedValue(undefined);
    api.creerDeuxieme.mockResolvedValue({ ok: true });
    rendu();
    expect(await screen.findByText("Ana Test")).toBeInTheDocument();
    expect(screen.getByText("star")).toBeInTheDocument();
    expect(screen.getByText("5.3 k")).toBeInTheDocument();
    expect(screen.getByTestId("resume-lundi")).toHaveTextContent("FR");
    fireEvent.click(screen.getByRole("button", { name: /OUI/ }));
    await waitFor(() => expect(api.creerDeuxieme).toHaveBeenCalledWith("d1"));
    expect(api.decider).toHaveBeenCalledWith("d1", "oui", "l2");
  });

  it("NON ne crée rien", async () => {
    api.lirePropositions.mockResolvedValue([prop({})]);
    api.decider.mockResolvedValue(undefined);
    rendu();
    fireEvent.click(await screen.findByRole("button", { name: "NON" }));
    await waitFor(() => expect(api.decider).toHaveBeenCalledWith("d1", "non", null));
    expect(api.creerDeuxieme).not.toHaveBeenCalled();
  });
});
