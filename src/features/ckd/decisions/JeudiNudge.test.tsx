import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const nudges = vi.hoisted(() => ({ lireNudges: vi.fn(), lireRelancesPrevues: vi.fn() }));
vi.mock("@/features/nudges/api", () => nudges);

import { JeudiNudge } from "./JeudiNudge";

describe("Weekly decisions → Thursday (prompt 22, partie 5)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("le nudge de la semaine : ce qui est parti, ce qui est prévu ; rien d'autre que le jeudi", async () => {
    nudges.lireNudges.mockResolvedValue([
      { id: "n1", poster_id: "p1", poster_nom: "Ana", hm_prenom: null, handle: null, type: "jeudi", periode: "2026-10-26", canal: "slack",
        texte: "Hi Ana, you have 2 posts with link this week.", envoye_at: "2026-10-29T11:00:00Z", reponse_at: null, resolu_at: null, slack_erreur: null },
      { id: "n2", poster_id: "p2", poster_nom: "Bruno", hm_prenom: null, handle: null, type: "connexion", periode: "2026-10-26", canal: "slack",
        texte: "Hi", envoye_at: "2026-10-29T11:00:00Z", reponse_at: null, resolu_at: null, slack_erreur: null },
    ]);
    nudges.lireRelancesPrevues.mockResolvedValue([
      { poster_id: "p3", poster_nom: "Chloé", type: "jeudi_recrue", periode: "2026-10-26", statut: "prevu", canal: "upwork",
        texte: "Hi Chloé, you start on Monday 2 November only if…", raison: "simulation", maj_at: "2026-10-29T11:00:00Z" },
      { poster_id: "p4", poster_nom: "Dan", type: "jeudi", periode: "2026-10-19", statut: "prevu", canal: "slack",
        texte: "old", raison: null, maj_at: "2026-10-22T11:00:00Z" },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <JeudiNudge maintenant={new Date("2026-10-29T14:00:00Z")} />
      </QueryClientProvider>,
    );
    const carte = await screen.findByTestId("jeudi-nudge");
    expect(nudges.lireNudges).toHaveBeenCalledWith("2026-10-26");
    const lignes = await within(carte).findAllByRole("listitem");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveTextContent(/Ana.*Posteur : posts ou liens manquants.*Parti/);
    expect(lignes[1]).toHaveTextContent(/Chloé.*Recrue pas prête.*Prévu/);
    expect(within(carte).getByText(/aucun compte à rebours de Kill/)).toBeInTheDocument();
  });
});
