import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import type { Probleme } from "./api";
import { ADeciderMaintenant } from "./ADeciderMaintenant";

const base = {
  contrat_id: "4001", hm: "HM 1", cohorte: "2026-11-02", actif: true, sources: [{ type: "reponse", ref: "1", at: "2026-11-02T10:00:00Z", texte: "?" }],
  canal_reponse: null, propose_par: null, propose_at: null, statut: "ouvert" as const, ferme_raison: null, ferme_at: null,
  created_at: "2026-11-02T10:00:00Z", maj_at: "2026-11-02T10:00:00Z", slack_relie: true, compte_id: null, groupe: "actifs" as const,
};
const liste: Probleme[] = [
  { ...base, id: "a", poster_id: "p1", nom: "Test A", categorie: "paie", niveau: "samedi", resume: "Week 45 not funded", proprietaire: "pay_bot",
    proposition_reponse: null, proposition_action: "open_payroll", onglet: "samedi", rituel: "maintenant", diagnostic: "Rien de financé pour la Week 45." },
  { ...base, id: "d", poster_id: "p4", nom: "Test D", categorie: "zero_post", niveau: "samedi", resume: "0 post", proprietaire: "control_bot",
    proposition_reponse: null, proposition_action: "kill", onglet: "samedi", rituel: "samedi", diagnostic: "Zéro post." },
];

vi.mock("./api", () => ({
  lireProblemes: vi.fn(async () => liste),
  lireModeProblemes: vi.fn(async () => "test"),
  agirProbleme: vi.fn(async () => undefined),
  deciderProbleme: vi.fn(async () => ({})),
  deciderRituel: vi.fn(async () => ({})),
  killSamedi: vi.fn(async () => ({})),
  donnerFeedback: vi.fn(async () => ({})),
  envoyerUpwork: vi.fn(async () => undefined),
  envoyerSlack: vi.fn(async () => undefined),
  envoyerLienMotDePasse: vi.fn(async () => undefined),
  dejaEcritAujourdhui: vi.fn(async () => false),
}));

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ADeciderMaintenant />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ADeciderMaintenant (Weekly decisions, 5/11)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
  });

  it("l'argent se décide maintenant (✅ ouvre le contrat, l'OS ne paie pas) ; les décisions du samedi restent sur les lignes", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendre();
    const carte = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test A"))!;
    expect(screen.queryByText("Test D")).toBeNull();
    expect(screen.getByTestId("sujets-rituels").textContent).toContain("Samedi : 1 carte sur les lignes");
    fireEvent.click(within(carte).getByTestId("faire"));
    await vi.waitFor(() => expect(ouvrir).toHaveBeenCalledWith("https://www.upwork.com/nx/wm/workroom/4001/overview", "_blank", "noopener,noreferrer"));
  });
});
