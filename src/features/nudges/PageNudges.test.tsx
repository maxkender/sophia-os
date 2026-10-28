import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import { etatNudge, statsRelances } from "./logique";

const api = vi.hoisted(() => ({
  lireNudges: vi.fn(),
  marquerNudge: vi.fn(),
  lireRelancesPrevues: vi.fn(),
  lireReglagesRelances: vi.fn(),
  enregistrerReglagesRelances: vi.fn(),
  lireRougesDepuis: vi.fn(async () => []),
  ETAPES_RELANCE: ["connexion", "tiktok", "warmup_lance", "warmup_bien_fait", "mercredi"],
  DELAIS_ETAPES: ["connexion_message_h", "tiktok_message_h", "warmup_lance_message_h", "warmup_bien_fait_heure", "kill_h", "kill_annulation_h"],
}));
vi.mock("./api", () => api);

import { PageNudges } from "./PageNudges";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PageNudges />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const REGLAGES = {
  mode: "simulation",
  delais: { connexion_message_h: 24, tiktok_message_h: 48, warmup_lance_message_h: 24, warmup_bien_fait_heure: 12, kill_h: 48, kill_annulation_h: 12 },
  textes: { connexion: "a", tiktok: "b", warmup_lance: "c", warmup_bien_fait: "e", mercredi: "d" },
  slack: "",
  lienEtapes: "https://guide",
};

describe("etatNudge", () => {
  it("résolu > répondu > pas encore fait", () => {
    expect(etatNudge({ reponse_at: "x", resolu_at: "y" })).toBe("resolu");
    expect(etatNudge({ reponse_at: "x", resolu_at: null })).toBe("repondu");
    expect(etatNudge({ reponse_at: null, resolu_at: null })).toBe("sans_reponse");
  });
});

describe("les 3 chiffres sur 7 jours (28 oct., partie E)", () => {
  it("relances envoyées, faites dans les 48 h, passées en rouge, par étape", () => {
    const s = statsRelances(
      [
        { type: "acces", envoye_at: "2026-10-27T10:00:00Z", resolu_at: "2026-10-28T09:00:00Z" },
        { type: "acces", envoye_at: "2026-10-27T10:00:00Z", resolu_at: "2026-10-30T09:00:00Z" },
        { type: "acces", envoye_at: "2026-10-27T10:00:00Z", resolu_at: null },
        { type: "warmup", envoye_at: "2026-10-31T11:00:00Z", resolu_at: null },
      ],
      [{ etape: "acces" }, { etape: "warmup" }, { etape: "warmup" }],
    );
    // Les anciens noms comptent pour l'étape qui les remplace.
    expect(s.connexion).toEqual({ envoyees: 3, faites48h: 33, rouges: 1 });
    expect(s.warmup_bien_fait).toEqual({ envoyees: 1, faites48h: 0, rouges: 2 });
    expect(s.tiktok).toEqual({ envoyees: 0, faites48h: null, rouges: 0 });
  });
});

describe("PageNudges → Relances (prompt 17)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireNudges.mockResolvedValue([]);
    api.lireRelancesPrevues.mockResolvedValue([]);
    api.lireReglagesRelances.mockResolvedValue(REGLAGES);
    api.enregistrerReglagesRelances.mockResolvedValue(undefined);
  });

  it("plus de « Nudge all », d'escalade ni de liste « À relancer sur Upwork »", async () => {
    rendu();
    await screen.findByTestId("reglages-relances");
    expect(screen.queryByText("Nudge all")).toBeNull();
    expect(screen.queryByText("À relancer sur Upwork")).toBeNull();
    expect(screen.getByRole("heading", { name: "Relances", level: 1 })).toBeInTheDocument();
  });

  it("prévues : le texte et le canal en simulation, « contrat non relié » bloqué", async () => {
    api.lireRelancesPrevues.mockResolvedValue([
      { poster_id: "p1", poster_nom: "Ana Silva", type: "warmup", periode: "2026-11-02", statut: "prevu", canal: "slack", texte: "Hi Ana, your warm-up isn't finished", raison: "simulation", maj_at: "2026-10-31T11:10:00Z" },
      { poster_id: "p2", poster_nom: "Bo Lee", type: "acces", periode: "2026-11-02", statut: "bloque", canal: null, texte: null, raison: "contrat_non_relie", maj_at: "2026-10-27T10:10:00Z" },
    ]);
    rendu();
    const bloc = await screen.findByTestId("relances-prevues");
    expect(await within(bloc).findByText("✉ prévu")).toBeInTheDocument();
    expect(within(bloc).getByText("Hi Ana, your warm-up isn't finished")).toBeInTheDocument();
    expect(within(bloc).getByText(/contrat non relié/)).toBeInTheDocument();
  });

  it("activer demande confirmation ; refusée, le mode ne change pas", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendu();
    const bloc = await screen.findByTestId("reglages-relances");
    fireEvent.click(within(bloc).getByRole("button", { name: "Activé" }));
    expect(confirmer).toHaveBeenCalled();
    expect(api.enregistrerReglagesRelances).not.toHaveBeenCalled();
    fireEvent.click(within(bloc).getByRole("button", { name: "Activé" }));
    await waitFor(() =>
      expect(api.enregistrerReglagesRelances).toHaveBeenCalledWith(expect.objectContaining({ mode: "on" })),
    );
    confirmer.mockRestore();
  });

  it("journal : l'étape, le canal ; « A répondu » sur une relance pas encore faite", async () => {
    api.lireNudges.mockResolvedValue([
      { id: "n1", poster_id: "p1", poster_nom: "Ana Silva", hm_prenom: null, handle: "ana.tt", type: "tiktok", periode: "2026-11-02", canal: "upwork", texte: "x", envoye_at: "2026-10-27T10:00:00Z", reponse_at: null, resolu_at: null, slack_erreur: null },
    ]);
    api.marquerNudge.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("historique-nudges");
    expect(await within(bloc).findByText("2. Compte TikTok")).toBeInTheDocument();
    expect(within(bloc).getByText(/Upwork/)).toBeInTheDocument();
    fireEvent.click(within(bloc).getByRole("button", { name: "A répondu" }));
    await waitFor(() => expect(api.marquerNudge).toHaveBeenCalledWith("n1", "repondu"));
  });
});
