import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import type { Probleme } from "./api";
import { PageProblemesPosteurs } from "./PageProblemesPosteurs";

const base = {
  contrat_id: null, hm: "HM 1", cohorte: "2026-11-02", actif: true, sources: [{ type: "reponse", ref: "1", at: "2026-11-02T10:00:00Z", texte: "?" }],
  canal_reponse: null, propose_par: null, propose_at: null, statut: "ouvert" as const, ferme_raison: null, ferme_at: null,
  created_at: "2026-11-02T10:00:00Z", maj_at: "2026-11-02T10:00:00Z", slack_relie: true, compte_id: null,
};
const liste: Probleme[] = [
  { ...base, id: "a", poster_id: "p1", nom: "Test A", categorie: "stop", niveau: "urgent", resume: "Asked to stop", proprietaire: "control_bot", proposition_reponse: null, proposition_action: "kill" },
  { ...base, id: "b", poster_id: "p2", nom: "Test B", categorie: "paie", niveau: "urgent", resume: "Not paid", proprietaire: "pay_bot", proposition_reponse: null, proposition_action: "open_payroll" },
  { ...base, id: "c", poster_id: "p3", nom: "Test C", categorie: "login", niveau: "aujourdhui", resume: "Can't log in", proprietaire: "new_cohort_bot", proposition_reponse: "Here is your link", proposition_action: null },
];
const agir = vi.fn(async () => undefined);
const envoyer = vi.fn(async () => undefined);

vi.mock("./api", () => ({
  lireProblemes: vi.fn(async () => liste),
  lireArchives: vi.fn(async () => []),
  lireModeProblemes: vi.fn(async () => "test"),
  agirProbleme: (...a: unknown[]) => agir(...(a as [])),
  validerCategorie: vi.fn(async () => 0),
  passerMaintenant: vi.fn(async () => ({})),
  envoyerUpwork: (...a: unknown[]) => envoyer(...(a as [])),
  dejaEcritAujourdhui: vi.fn(async () => false),
}));

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PageProblemesPosteurs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PageProblemesPosteurs", () => {
  it("3 onglets avec compteurs, mode test affiché, et Valider n'envoie rien en mode test", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    expect(await screen.findByText("Asked to stop")).toBeTruthy();
    expect(screen.getByTestId("mode-test")).toBeTruthy();
    const onglets = screen.getAllByRole("tab");
    expect(onglets.map((o) => o.textContent)).toEqual(["Urgent (2)", "Aujourd'hui (1)", "Samedi (0)"]);
    // La paie : le bouton ouvre Payroll (« Ouvrir »), jamais « Valider ».
    expect(screen.getAllByRole("button", { name: "✅ Ouvrir" })).toHaveLength(2);

    fireEvent.click(onglets[1]!);
    expect(await screen.findByText("Can't log in")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Valider/ }));
    expect(await screen.findByText("Mode test : noté, rien n'est parti.")).toBeTruthy();
    expect(envoyer).not.toHaveBeenCalled();
    expect(agir).toHaveBeenCalledWith("c", "valider", expect.objectContaining({ envoye: false }));
  });
});
