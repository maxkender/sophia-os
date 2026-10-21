import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import { FaqAdmin } from "./FaqAdmin";
import type { QuestionFaq } from "./api";

const question = (patch: Partial<QuestionFaq>): QuestionFaq => ({
  id: "q1",
  source: "slack",
  role: "poster",
  question: "Should we delete negative comments on our posts?",
  reponse: null,
  reponse_faq: null,
  section_guide: null,
  etat: "a_traiter",
  test: true,
  envoye_at: null,
  slack_canal: "C0BL56RJH7T",
  slack_ts: "1792000000.000100",
  slack_nom: "Meltem",
  slack_user_id: "U0C93MT8PSR",
  reponse_humaine: null,
  reponse_humaine_par: null,
  reponse_admin: null,
  ajoute_base_at: null,
  erreur: null,
  created_at: "2026-10-21T08:00:00Z",
  profiles: null,
  ...patch,
});

const api = vi.hoisted(() => ({
  reglages: { mode_slack: "test", mode_os: "test", canaux_slack: ["C0BL56RJH7T"], message_attente: true },
}));

vi.mock("./api", () => ({
  lireReglagesFaqAdmin: vi.fn(async () => api.reglages),
  ecrireReglagesFaq: vi.fn(async () => undefined),
  listerGuidesCopies: vi.fn(async () => []),
  recopierGuides: vi.fn(async () => ({ ok: true, guides: [] })),
  listerFaqATraiter: vi.fn(async () => [question({})]),
  listerFaqJournal: vi.fn(async () => [
    question({}),
    question({
      id: "q2",
      question: "Which link should I send her?",
      etat: "repondu",
      reponse_faq: "Reply with the app's link, your manager gives it to you.",
      section_guide: "Poster Guide › Quick answers › Someone asks for the app or its link",
      reponse_humaine: "Use the taap.it link",
      reponse_humaine_par: "Aram",
    }),
    question({ id: "q3", question: "Dashboard is blank", etat: "bug" }),
  ]),
  traiterQuestionFaq: vi.fn(async () => ({ envoye: false, raison: "mode test" })),
  ignorerQuestionFaq: vi.fn(async () => undefined),
  ajouterBaseFaq: vi.fn(async () => undefined),
}));

function renderFaq() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FaqAdmin />
    </QueryClientProvider>,
  );
}

describe("FaqAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("en mode test, la réponse est gardée et ajoutée à la base, rien ne part", async () => {
    const mocks = await import("./api");
    renderFaq();

    const ligne = await screen.findByTestId("faq-question-q1");
    expect(within(ligne).getByText("Meltem")).toBeInTheDocument();
    expect(within(ligne).getByRole("link", { name: /slack/i })).toHaveAttribute(
      "href",
      "https://sophia-system.slack.com/archives/C0BL56RJH7T/p1792000000000100",
    );

    const bouton = within(ligne).getByRole("button", { name: /(mode test|test mode)/i });
    expect(bouton).toBeDisabled();
    fireEvent.change(within(ligne).getByRole("textbox"), { target: { value: "No, never delete them." } });
    fireEvent.click(bouton);

    await waitFor(() => expect(mocks.traiterQuestionFaq).toHaveBeenCalledWith("q1", "No, never delete them.", true));
  });

  it("le journal compte les décisions et propose d'ajouter la réponse de l'équipe", async () => {
    const mocks = await import("./api");
    renderFaq();

    const journal = await screen.findByTestId("faq-journal");
    await within(journal).findByText("Which link should I send her?");
    expect(within(journal).getByRole("button", { name: /bug → it guy · 1/i })).toBeInTheDocument();
    expect(within(journal).getByText(/Someone asks for the app or its link/)).toBeInTheDocument();

    fireEvent.click(within(journal).getByRole("button", { name: /(add this answer|ajouter cette réponse)/i }));
    await waitFor(() => expect(mocks.ajouterBaseFaq).toHaveBeenCalledWith("q2", "Use the taap.it link"));

    fireEvent.click(within(journal).getByRole("button", { name: /bug → it guy/i }));
    expect(within(journal).queryByText("Which link should I send her?")).not.toBeInTheDocument();
    expect(within(journal).getByText("Dashboard is blank")).toBeInTheDocument();
  });

  it("passer Slack en actif demande confirmation : refusée, rien ne change", async () => {
    const mocks = await import("./api");
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderFaq();

    fireEvent.change(await screen.findByRole("combobox", { name: "Slack" }), { target: { value: "actif" } });
    expect(confirmer).toHaveBeenCalled();
    expect(mocks.ecrireReglagesFaq).not.toHaveBeenCalled();
    confirmer.mockRestore();
  });

  it("passer Slack en actif demande confirmation : acceptée, le réglage s'écrit", async () => {
    const mocks = await import("./api");
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFaq();

    fireEvent.change(await screen.findByRole("combobox", { name: "Slack" }), { target: { value: "actif" } });
    await waitFor(() =>
      expect(mocks.ecrireReglagesFaq).toHaveBeenCalledWith(expect.objectContaining({ mode_slack: "actif" })),
    );
    confirmer.mockRestore();
  });
});
