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
  it_statut: null,
  it_maj_at: null,
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
  listerFaqATraiter: vi.fn(async () => [
    question({}),
    // Pas sûr : sa réponse attend qu'un admin la valide.
    question({
      id: "q5",
      question: "Is the app on Android?",
      etat: "a_valider",
      test: false,
      reponse: "I've passed your question to the team. You'll get the answer right here in this thread.",
      reponse_faq: "Yes, Sophia is on Google Play.",
      section_guide: "Poster Guide › Quick answers",
    }),
  ]),
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
    question({ id: "q3", question: "Dashboard is blank", etat: "bug", it_statut: "pris_en_charge", it_maj_at: "2026-10-21T16:28:00Z" }),
    // Une question de la bulle d'avant le cerveau : l'ancien assistant a répondu.
    question({
      id: "q4",
      source: "os",
      question: "I want to change my password",
      etat: null,
      test: false,
      reponse: "Contact your manager on Slack.",
      slack_canal: null,
      slack_ts: null,
      slack_nom: null,
      slack_user_id: null,
      profiles: { prenom: "Efi", nom: "Tsimaki", email: null },
    }),
  ]),
  traiterQuestionFaq: vi.fn(async () => ({ envoye: false, raison: "mode test" })),
  ignorerQuestionFaq: vi.fn(async () => undefined),
}));

function renderFaq(onAjouterReponse?: (q: QuestionFaq) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FaqAdmin onAjouterReponse={onAjouterReponse} />
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

  it("le journal montre Slack et la bulle, compte les décisions, et pré-remplit une réponse validée", async () => {
    const ajouter = vi.fn();
    renderFaq(ajouter);

    const journal = await screen.findByTestId("faq-journal");
    await within(journal).findByText("Which link should I send her?");
    expect(within(journal).getByRole("button", { name: /bug → it guy · 1/i })).toBeInTheDocument();
    expect(within(journal).getByText(/Someone asks for the app or its link/)).toBeInTheDocument();
    // La bulle d'avant : ancien assistant, et ce que la personne a reçu.
    expect(within(journal).getByText("I want to change my password")).toBeInTheDocument();
    expect(within(journal).getByText("Contact your manager on Slack.")).toBeInTheDocument();
    expect(within(journal).getByText(/(old assistant|ancien assistant)/i)).toBeInTheDocument();

    const ligne = within(journal).getByText("Which link should I send her?").closest("div.space-y-2") as HTMLElement;
    fireEvent.click(within(ligne).getByRole("button", { name: /(add to approved answers|ajouter aux réponses validées)/i }));
    expect(ajouter).toHaveBeenCalledWith(expect.objectContaining({ id: "q2", reponse_humaine: "Use the taap.it link" }));

    fireEvent.change(within(journal).getByRole("combobox"), { target: { value: "slack" } });
    expect(within(journal).queryByText("I want to change my password")).not.toBeInTheDocument();

    fireEvent.click(within(journal).getByRole("button", { name: /bug → it guy/i }));
    expect(within(journal).queryByText("Which link should I send her?")).not.toBeInTheDocument();
    expect(within(journal).getByText("Dashboard is blank")).toBeInTheDocument();
    // Un bug sur Slack : pas de « proposition vide », on dit où en est l'IT guy.
    expect(within(journal).getByText(/(picked up by the it guy|pris en charge par l'it guy)/i)).toBeInTheDocument();
  });

  it("pas sûr : sa réponse est pré-remplie, un clic la valide et l'envoie", async () => {
    const mocks = await import("./api");
    const avant = api.reglages;
    api.reglages = { ...avant, mode_slack: "actif" };
    try {
      renderFaq();
      const ligne = await screen.findByTestId("faq-question-q5");
      expect(within(ligne).getByText(/(wasn't sure|n'était pas sûr)/i)).toBeInTheDocument();
      const texte = within(ligne).getByRole("textbox");
      expect(texte).toHaveValue("Yes, Sophia is on Google Play.");
      fireEvent.click(await within(ligne).findByRole("button", { name: /(approve and send|valider et envoyer)/i }));
      await waitFor(() =>
        expect(mocks.traiterQuestionFaq).toHaveBeenCalledWith("q5", "Yes, Sophia is on Google Play.", true),
      );
    } finally {
      api.reglages = avant;
    }
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
