import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({ lireControle: vi.fn(), regler: vi.fn(), annuler: vi.fn(), lirePropositions: vi.fn(), traiterProposition: vi.fn() }));
vi.mock("./controle", async (orig) => ({ ...(await orig<typeof import("./controle")>()), ...c }));

import { Controle } from "./Controle";
import { listeActions } from "./controle";

const reglage = {
  stop: false,
  agents: { cerveau_support: "agir", new_cohort_bot: "agir", control_bot: "agir", pay_bot: "proposer", ruul_bot: "proposer" },
  canaux: { help: true, slack: true, email: true, upwork: true },
  actions: { lien_mot_de_passe: "agir", pseudo_tiktok: "agir", ticket_os: "proposer", nouvelle: "proposer" },
  pay: { plafond_milestone: 30, plafond_jour: 300 },
};

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Controle /></QueryClientProvider>);
}

describe("Page Contrôle (13/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    c.regler.mockResolvedValue(undefined);
    c.annuler.mockResolvedValue(undefined);
    c.traiterProposition.mockResolvedValue({ ok: true, resultat: "pseudo TikTok : @a → @b" });
    c.lirePropositions.mockResolvedValue([{ id: "p1", at: "2026-11-13T18:00:00Z", qui: "cerveau_support", quoi: "pseudo_tiktok", poster_id: "x", canal: "help", resultat: "proposé", details: { action: "pseudo_tiktok", valeur: "gina.x" } }]);
    c.lireControle.mockResolvedValue({
      reglage, compteurs: { lien_mot_de_passe: 4, reponse: 12 }, propositions: { ticket_os: 2 },
      journal: [{ id: "j1", at: "2026-11-13T18:00:00Z", qui: "cerveau_support", quoi: "pseudo_tiktok", mode: "agir", poster_id: "x", nom: "Gina D.", canal: "help", montant: null, resultat: "@a → @b", annulable: true, annule_at: null, source: "journal" }],
    });
  });

  it("liste des actions : connues d'abord, puis les nouvelles", () => {
    expect(listeActions(reglage as never)).toEqual(["lien_mot_de_passe", "pseudo_tiktok", "ticket_os", "ticket_regle_prevenir", "nouvelle"]);
  });

  it("agents, actions avec compteur, canal, STOP, proposition à faire, annuler au journal", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    const pay = await screen.findByTestId("agent-pay_bot");
    fireEvent.click(within(pay).getByRole("button", { name: "Agir" }));
    await waitFor(() => expect(c.regler).toHaveBeenCalledWith(["agents", "pay_bot"], "agir"));
    expect(screen.getByTestId("action-lien_mot_de_passe")).toHaveTextContent("4 faits");
    expect(screen.getByTestId("action-ticket_os")).toHaveTextContent("0 fait · 2 proposés");
    fireEvent.click(screen.getByLabelText("Le bot répond sur Email"));
    await waitFor(() => expect(c.regler).toHaveBeenCalledWith(["canaux", "email"], false));
    fireEvent.click(screen.getByTestId("stop-general"));
    await waitFor(() => expect(c.regler).toHaveBeenCalledWith(["stop"], true));
    const prop = await screen.findByTestId("proposition");
    fireEvent.click(within(prop).getByRole("button", { name: "Faire" }));
    await waitFor(() => expect(c.traiterProposition).toHaveBeenCalledWith("p1", true));
    const ligne = screen.getByTestId("ligne-journal");
    expect(ligne).toHaveTextContent("Gina D.");
    fireEvent.click(within(ligne).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(c.annuler).toHaveBeenCalledWith("j1"));
  });
});
