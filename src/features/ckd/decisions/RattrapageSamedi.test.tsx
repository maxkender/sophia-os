import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/features/moteur/api", () => ({ invoke: m.invoke }));

import { choixInitial, type LigneRattrapage, RattrapageSamedi } from "./RattrapageSamedi";

const base: Omit<LigneRattrapage, "compte_id" | "nom" | "brouillon"> = {
  poster_id: "p", handle: "h", canal_paie: "upwork", regle: "absent", proposition_id: null, brouillon_raison: null,
  posts_semaine: 0, posts_total: 0, stop: false, paie_statut: null, paie_montant: null,
};
const LIGNES: LigneRattrapage[] = [
  { ...base, compte_id: "c1", nom: "Poster Un", brouillon: "kill", regle: null, posts_semaine: 14, paie_statut: "paye", paie_montant: 14 },
  { ...base, compte_id: "c2", nom: "Poster Deux", brouillon: "kill_np", brouillon_raison: { detail: "fraude" } },
  { ...base, compte_id: "c3", nom: "Poster Trois", brouillon: null, stop: true },
  { ...base, compte_id: "c4", nom: "Poster Quatre", brouillon: "keep" },
];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RattrapageSamedi maintenant={new Date("2026-11-16T10:00:00Z")} /></QueryClientProvider>);
}

describe("RattrapageSamedi (16/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === "samedi_rattrapage_lire"
        ? { data: LIGNES, error: null }
        : { data: { kills: 1, kills_sans_paie: 1, gardes: 2, erreurs: [] }, error: null }));
    m.invoke.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("choix d'office : celui du samedi, sinon rien", () => {
    expect(LIGNES.map(choixInitial)).toEqual(["kill", "kill_np", "", "keep"]);
  });

  it("lit la semaine passée, regroupe, et valide avec les choix (le sans-choix reste tel quel)", async () => {
    rendu();
    expect(await screen.findByText(/Samedi du 09\/11/)).toBeTruthy();
    expect(m.rpc).toHaveBeenCalledWith("samedi_rattrapage_lire", { p_lundi: "2026-11-09" });
    expect(screen.getByText("Kills choisis samedi (2)")).toBeTruthy();
    expect(screen.getByText("Propositions sans décision (1)")).toBeTruthy();
    expect(screen.getByText("STOP")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Choix pour Poster Trois"), { target: { value: "keep" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith("upwork", { action: "arrets" }));
    expect(m.rpc).toHaveBeenCalledWith("samedi_rattrapage_valider", {
      p_lundi: "2026-11-09",
      p_choix: [
        { compte_id: "c1", choix: "kill", raison: null },
        { compte_id: "c2", choix: "kill_np", raison: "fraude" },
        { compte_id: "c3", choix: "keep", raison: null },
        { compte_id: "c4", choix: "keep", raison: null },
      ],
    });
  });

  it("rien à rattraper : rien n'est affiché", async () => {
    m.rpc.mockResolvedValue({ data: [], error: null });
    const { container } = rendu();
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
