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
  // 0538 : la paie se décide dans Weekly decisions (« À décider maintenant »), pas dans Problèmes.
  { ...base, id: "a", poster_id: "p1", nom: "Test A", categorie: "paie", niveau: "samedi", resume: "Week 45 not funded", proprietaire: "pay_bot",
    proposition_reponse: null, proposition_action: "open_payroll", onglet: "samedi", rituel: "maintenant", diagnostic: "Rien de financé pour la Week 45." },
  { ...base, id: "b", poster_id: "p2", nom: "Test B", categorie: "question_bloquante", niveau: "bots", resume: "Where is the app?",
    proprietaire: "new_cohort_bot", proposition_reponse: "Hi! The app is Sophia, here is the link.", proposition_action: null,
    propose_par: "new_cohort_bot", propose_at: "2026-11-04T09:00:00Z", onglet: "bots", diagnostic: "Elle cherche le lien de l'appli.",
    sans_reponse: { texte: "Where is the app? I can't find it anywhere.", canal: "upwork", at: "2026-11-04T08:00:00Z", depuis_heures: 2.5, question: true, attend: true },
    sujets: [{ categorie: "login", resume: "Can't log in" }] },
  // Un STOP (samedi) dont le message attend une réponse : la carte ne traite que le message ; le Kill est un badge → Weekly decisions.
  { ...base, id: "c", poster_id: "p3", nom: "Test C", categorie: "stop", niveau: "samedi", resume: "STOP", proprietaire: "control_bot",
    proposition_reponse: "Close the card, refund received.", proposition_action: "kill", propose_at: "2026-11-01T09:00:00Z",
    onglet: "samedi", rituel: "samedi", diagnostic: "[SAMEDI] A demandé l'arrêt, contrat 44821542.",
    sans_reponse: { texte: "Can you please end the contract?", canal: "upwork", at: "2026-11-03T08:00:00Z", depuis_heures: 50, question: true, attend: true } },
  // Une décision sans message en attente : seulement dans Weekly decisions.
  { ...base, id: "d", poster_id: "p4", nom: "Test D", categorie: "zero_post", niveau: "samedi", resume: "0 post", proprietaire: "control_bot",
    proposition_reponse: null, proposition_action: "kill", onglet: "samedi", rituel: "samedi", diagnostic: "Zéro post." },
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

describe("PageProblemesPosteurs (5/11 : le quotidien ; les décisions dans Weekly decisions)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
  });

  it("deux onglets (🤖, ⚡) et le lien vers Weekly decisions ; les décisions n'y sont pas", async () => {
    rendre();
    expect(await screen.findByText("Test C")).toBeTruthy();
    expect(screen.getByTestId("mode-test")).toBeTruthy();
    expect(screen.queryByTestId("onglet-samedi")).toBeNull();
    expect(screen.getByTestId("onglet-urgent").textContent).toContain("(1)");
    expect(screen.getByTestId("onglet-bots").textContent).toContain("(1)");
    expect(screen.getByTestId("vers-weekly-decisions").textContent).toContain("Weekly decisions (3)");
    expect(screen.queryByText("Test A")).toBeNull();
    expect(screen.queryByText("Test D")).toBeNull();
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

  it("✅ Faire ça en mode test : noté avec la réponse, rien ne part ; feedback automatique « juste » au bot", async () => {
    rendre();
    fireEvent.click(await screen.findByTestId("onglet-bots"));
    const carte = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test B"))!;
    fireEvent.click(within(carte).getByTestId("faire"));
    await vi.waitFor(() => expect(agir).toHaveBeenCalledWith("b", "valider", expect.objectContaining({ envoye: false, reponse: "Hi! The app is Sophia, here is the link." })));
    expect(envoyer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(feedback).toHaveBeenCalledWith("b", "juste", null));
  });

  it("un message en attente : la carte ne traite que lui ; pas de réponse à jour → ✅ bloqué ; le Kill est un badge → Weekly decisions", async () => {
    rendre();
    const carte = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test C"))!;
    expect(within(carte).getByTestId("bloque").textContent).toContain("Can you please end the contract?");
    // Le 👉 « Close the card, refund received » date d'avant son message : il n'est pas montré.
    expect(within(carte).getByTestId("propose").textContent).not.toContain("refund");
    expect(within(carte).getByTestId("compris").textContent).toContain("Les bots préparent");
    expect((within(carte).getByTestId("faire") as HTMLButtonElement).disabled).toBe(true);
    const badge = within(carte).getByTestId("badge-decision");
    expect(badge.getAttribute("href")).toBe("/admin/auto/decisions?onglet=samedi&carte=c");
    expect(within(carte).queryByText(/Kill samedi/)).toBeNull();
    fireEvent.click(within(carte).getByTestId("faire"));
    expect(agir).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });
});
