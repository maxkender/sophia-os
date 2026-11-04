import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import type { Probleme } from "./api";
import { PageProblemesPosteurs } from "./PageProblemesPosteurs";

const base = {
  contrat_id: "4001", hm: "HM 1", cohorte: "2026-11-02", actif: true, sources: [{ type: "reponse", ref: "1", at: "2026-11-02T10:00:00Z", texte: "?" }],
  canal_reponse: null, propose_par: null, propose_at: null, statut: "ouvert" as const, ferme_raison: null, ferme_at: null,
  created_at: "2026-11-02T10:00:00Z", maj_at: "2026-11-02T10:00:00Z", slack_relie: true, compte_id: null, groupe: "onboarding" as const,
};
const liste: Probleme[] = [
  { ...base, id: "a", poster_id: "p1", nom: "Test A", categorie: "paie", niveau: "urgent", resume: "Week 45 not funded", proprietaire: "pay_bot",
    proposition_reponse: null, proposition_action: "open_payroll", onglet: "urgent", diagnostic: "Rien de financé pour la Week 45." },
  { ...base, id: "b", poster_id: "p2", nom: "Test B", categorie: "question_bloquante", niveau: "aujourdhui", resume: "Where is the app?",
    proprietaire: "new_cohort_bot", proposition_reponse: "Hi! The app is Sophia, here is the link.", proposition_action: null,
    propose_par: "new_cohort_bot", onglet: "bots", diagnostic: "Elle cherche le lien de l'appli.",
    sans_reponse: { texte: "Where is the app? I can't find it anywhere.", canal: "upwork", at: "2026-11-04T08:00:00Z", depuis_heures: 2.5, question: true },
    sujets: [{ categorie: "login", resume: "Can't log in" }] },
  { ...base, id: "c", poster_id: "p3", nom: "Test C", categorie: "stop", niveau: "urgent", resume: "STOP", proprietaire: "control_bot",
    proposition_reponse: null, proposition_action: "kill", onglet: "samedi", diagnostic: "A demandé l'arrêt." },
];
const agir = vi.fn(async () => undefined);
const feedback = vi.fn(async () => ({}));
const envoyer = vi.fn(async () => undefined);
const kill = vi.fn(async () => ({}));

vi.mock("./api", () => ({
  lireProblemes: vi.fn(async () => liste),
  lireModeProblemes: vi.fn(async () => "test"),
  agirProbleme: (...a: unknown[]) => agir(...(a as [])),
  passerMaintenant: vi.fn(async () => ({})),
  envoyerUpwork: (...a: unknown[]) => envoyer(...(a as [])),
  envoyerSlack: (...a: unknown[]) => envoyer(...(a as [])),
  envoyerLienMotDePasse: (...a: unknown[]) => envoyer(...(a as [])),
  dejaEcritAujourdhui: vi.fn(async () => false),
  donnerFeedback: (...a: unknown[]) => feedback(...(a as [])),
  deciderProbleme: vi.fn(async () => ({})),
  deciderRituel: vi.fn(async () => ({})),
  killSamedi: (...a: unknown[]) => kill(...(a as [])),
  lireStatsBots: vi.fn(async () => []),
  lireAutonomie: vi.fn(async () => "off"),
  reglerAutonomie: vi.fn(async () => undefined),
  lireActionsBots: vi.fn(async () => [
    { id: "x1", bot: "new_cohort_bot", probleme_id: "z", poster_id: "p9", nom: "Bot Done", action: "resend_password_link", canal: "upwork",
      message: "Hi, here is your link.", statut: "fait", raison: null, confiance: 0.9, at: "2026-11-04T07:00:00Z" },
  ]),
  annulerActionBot: vi.fn(async () => undefined),
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

describe("PageProblemesPosteurs (simplification du 4/11)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
  });

  it("trois onglets avec leurs compteurs ; Urgent par défaut ; mode test", async () => {
    rendre();
    expect(await screen.findByText("Test A")).toBeTruthy();
    expect(screen.getByTestId("mode-test")).toBeTruthy();
    expect(screen.getByTestId("onglet-bots").textContent).toContain("(1)");
    expect(screen.getByTestId("onglet-urgent").textContent).toContain("(1)");
    expect(screen.getByTestId("onglet-samedi").textContent).toContain("(1)");
    expect(screen.queryByText("Test B")).toBeNull();
    fireEvent.click(screen.getByTestId("onglet-samedi"));
    expect(await screen.findByText("Test C")).toBeTruthy();
  });

  it("le format de carte : ❓ le message sans réponse en entier, 🧠, 👉 et le message ; sujets fusionnés ; ce que les bots ont fait", async () => {
    rendre();
    fireEvent.click(await screen.findByTestId("onglet-bots"));
    const carte = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test B"))!;
    expect(within(carte).getByTestId("bloque").textContent).toContain("Where is the app? I can't find it anywhere.");
    expect(within(carte).getByTestId("bloque").textContent).toContain("depuis 2.5 h");
    expect(within(carte).getByTestId("compris").textContent).toContain("Elle cherche le lien");
    expect(within(carte).getByTestId("propose").textContent).toContain("Hi! The app is Sophia, here is the link.");
    expect(within(carte).getByTestId("nb-sujets").textContent).toBe("+1 sujet");
    expect(screen.getByTestId("autonomie").textContent).toBe("off");
    expect((await screen.findAllByTestId("action-bot"))[0]!.textContent).toContain("Hi, here is your link.");
  });

  it("✅ Faire ça en mode test : noté, rien ne part ; feedback automatique « juste » au bot", async () => {
    rendre();
    fireEvent.click(await screen.findByTestId("onglet-bots"));
    const carte = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test B"))!;
    fireEvent.click(within(carte).getByTestId("faire"));
    await vi.waitFor(() => expect(agir).toHaveBeenCalledWith("b", "valider", expect.objectContaining({ envoye: false })));
    expect(envoyer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(feedback).toHaveBeenCalledWith("b", "juste", null));
  });

  it("✅ sur un STOP : Kill samedi ; sur la paie : l'OS ne paie pas, il ouvre le contrat", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendre();
    const carteA = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test A"))!;
    fireEvent.click(within(carteA).getByTestId("faire"));
    await vi.waitFor(() => expect(ouvrir).toHaveBeenCalledWith("https://www.upwork.com/nx/wm/workroom/4001/overview", "_blank", "noopener,noreferrer"));
    fireEvent.click(screen.getByTestId("onglet-samedi"));
    const carteC = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test C"))!;
    fireEvent.click(within(carteC).getByTestId("faire"));
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith("c"));
  });
});
