import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { QuestionFaq } from "@/features/chatbot/api";

/** Des dates relatives à maintenant : les chiffres « 7 jours » ne vieillissent pas avec le test. */
const ilYa = (heures: number) => new Date(Date.now() - heures * 3_600_000).toISOString();

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
  created_at: ilYa(3),
  profiles: null,
  ...patch,
});

const api = vi.hoisted(() => ({
  reglages: { mode_slack: "test", mode_os: "test", canaux_slack: ["C0BL56RJH7T"], message_attente: true },
}));

vi.mock("@/features/chatbot/api", () => ({
  PLAFOND_JOURNAL: 300,
  lireReglagesFaqAdmin: vi.fn(async () => api.reglages),
  ecrireReglagesFaq: vi.fn(async () => undefined),
  listerGuidesCopies: vi.fn(async () => []),
  recopierGuides: vi.fn(async () => ({ ok: true, guides: [] })),
  listerChatbotContexte: vi.fn(async () => []),
  creerChatbotContexte: vi.fn(async () => undefined),
  majChatbotContexte: vi.fn(async () => undefined),
  supprimerChatbotContexte: vi.fn(async () => undefined),
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
    question({ id: "q3", question: "Dashboard is blank", etat: "bug", it_statut: "pris_en_charge", it_maj_at: ilYa(1) }),
    question({ id: "q6", question: "merci !!", etat: "hors_sujet" }),
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

import { AdminChatbotPage } from "./AdminChatbotPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <AdminChatbotPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const onglet = (nom: RegExp) => screen.getByRole("tab", { name: nom });

describe("AdminChatbotPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("résume la semaine : questions, part réglée par le bot, file à traiter", async () => {
    renderPage();
    // 3 vraies questions dans la semaine (« merci !! » et l'ancien assistant à part) :
    // une réglée par le bot, donc 33 %.
    expect(await screen.findByText("33 %")).toBeInTheDocument();
    expect(screen.getByText("1 sur 3 questions")).toBeInTheDocument();
    // L'onglet « À traiter » porte le nombre de la file.
    expect(within(onglet(/Questions à traiter/)).getByText("2")).toBeInTheDocument();
    // Prompt 22, partie 9 : 3 onglets et la phrase en haut.
    expect(screen.getAllByRole("tab").map((o) => o.textContent?.replace(/\d+$/, ""))).toEqual(["Questions à traiter", "Réponses validées", "Sources"]);
    expect(screen.getByTestId("faq-phrase")).toHaveTextContent(/guides Notion/);
    // L'état du bot dans l'en-tête.
    expect(screen.getByText("Slack · Test")).toBeInTheDocument();
  });

  it("en mode test, la réponse est gardée et ajoutée à la base, rien ne part", async () => {
    const mocks = await import("@/features/chatbot/api");
    renderPage();

    const detail = await screen.findByTestId("faq-question-q1");
    expect(within(detail).getByText("Meltem")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /slack/i })).toHaveAttribute(
      "href",
      "https://sophia-system.slack.com/archives/C0BL56RJH7T/p1792000000000100",
    );

    const bouton = within(detail).getByRole("button", { name: /mode test/i });
    expect(bouton).toBeDisabled();
    fireEvent.change(within(detail).getByRole("textbox"), { target: { value: "No, never delete them." } });
    fireEvent.click(bouton);

    await waitFor(() => expect(mocks.traiterQuestionFaq).toHaveBeenCalledWith("q1", "No, never delete them.", true));
  });

  it("pas sûr : sa réponse est pré-remplie, un clic la valide et l'envoie", async () => {
    const mocks = await import("@/features/chatbot/api");
    const avant = api.reglages;
    api.reglages = { ...avant, mode_slack: "actif" };
    try {
      renderPage();
      // La file à gauche : on choisit la question, son détail s'ouvre à droite.
      fireEvent.click(await screen.findByRole("button", { name: /Is the app on Android\?/ }));
      const detail = screen.getByTestId("faq-question-q5");
      expect(within(detail).getByText(/n'était pas sûr/i)).toBeInTheDocument();
      expect(within(detail).getByRole("textbox")).toHaveValue("Yes, Sophia is on Google Play.");
      fireEvent.click(await within(detail).findByRole("button", { name: /valider et envoyer/i }));
      await waitFor(() =>
        expect(mocks.traiterQuestionFaq).toHaveBeenCalledWith("q5", "Yes, Sophia is on Google Play.", true),
      );
    } finally {
      api.reglages = avant;
    }
  });

  it("le journal montre Slack et la bulle, compte les décisions, et pré-remplit une réponse validée", async () => {
    renderPage();
    await screen.findByText("33 %");
    // Prompt 22 : le journal est replié sous la file à traiter.

    const journal = screen.getByTestId("faq-journal");
    expect(within(journal).getByText("Which link should I send her?")).toBeInTheDocument();
    expect(within(journal).getByRole("button", { name: /bug → it guy · 1/i })).toBeInTheDocument();
    expect(within(journal).getByText("Someone asks for the app or its link")).toBeInTheDocument();
    // La bulle d'avant : ancien assistant, et ce que la personne a reçu en dépliant.
    expect(within(journal).getByText(/ancien assistant/i)).toBeInTheDocument();
    fireEvent.click(within(journal).getByText("I want to change my password"));
    expect(within(journal).getByText("Contact your manager on Slack.")).toBeInTheDocument();

    // Déplier une réponse de l'équipe et la ranger dans les réponses validées.
    fireEvent.click(within(journal).getByText("Which link should I send her?"));
    fireEvent.click(within(journal).getByRole("button", { name: /ajouter aux réponses validées/i }));
    expect(onglet(/Réponses validées/)).toHaveAttribute("aria-selected", "true");
    expect((screen.getByPlaceholderText(/L'explication/) as HTMLTextAreaElement).value).toContain("Use the taap.it link");

    // Retour au journal : filtres par source, puis par décision.
    fireEvent.click(onglet(/Questions à traiter/));
    const journal2 = screen.getByTestId("faq-journal");
    fireEvent.change(within(journal2).getByRole("combobox", { name: "Source" }), { target: { value: "slack" } });
    expect(within(journal2).queryByText("I want to change my password")).not.toBeInTheDocument();
    fireEvent.click(within(journal2).getByRole("button", { name: /bug → it guy/i }));
    expect(within(journal2).queryByText("Which link should I send her?")).not.toBeInTheDocument();
    // Un bug sur Slack : pas de « proposition vide », on dit où en est l'IT guy.
    fireEvent.click(within(journal2).getByText("Dashboard is blank"));
    expect(within(journal2).getByText(/pris en charge par l'it guy/i)).toBeInTheDocument();
  });

  it("passer Slack en actif demande confirmation : refusée, rien ne change", async () => {
    const mocks = await import("@/features/chatbot/api");
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    // Les réglages sont repliés : on les déplie d'abord.
    fireEvent.click(await screen.findByRole("button", { name: /Réglages du bot/ }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Slack" }), { target: { value: "actif" } });
    expect(confirmer).toHaveBeenCalled();
    expect(mocks.ecrireReglagesFaq).not.toHaveBeenCalled();
    confirmer.mockRestore();
  });

  it("passer Slack en actif demande confirmation : acceptée, le réglage s'écrit", async () => {
    const mocks = await import("@/features/chatbot/api");
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Réglages du bot/ }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Slack" }), { target: { value: "actif" } });
    await waitFor(() =>
      expect(mocks.ecrireReglagesFaq).toHaveBeenCalledWith(expect.objectContaining({ mode_slack: "actif" })),
    );
    confirmer.mockRestore();
  });

  it("prompt 22 : l'onglet Sources liste les pages Notion recopiées, leur date et « Recopier maintenant »", async () => {
    const mocks = await import("@/features/chatbot/api");
    vi.mocked(mocks.listerGuidesCopies).mockResolvedValue([
      { page_id: "g1", guide: "poster", chemin: "Poster Guide / Pay", url: "https://notion.so/g1", copie_at: "2026-10-29T08:00:00Z", notion_modifie_at: null },
      { page_id: "g2", guide: "manager", chemin: "Manager Guide / Kill", url: "https://notion.so/g2", copie_at: "2026-10-29T09:00:00Z", notion_modifie_at: null },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Sources/ }));
    const sources = await screen.findByTestId("faq-sources");
    expect(await within(sources).findByRole("link", { name: "Poster Guide / Pay" })).toHaveAttribute("href", "https://notion.so/g1");
    expect(within(sources).getByText("Manager Guide / Kill")).toBeInTheDocument();
    expect(within(sources).getAllByRole("link", { name: /Ouvrir dans Notion/ })).toHaveLength(2);
    fireEvent.click(within(sources).getByRole("button", { name: /Recopier/ }));
    await waitFor(() => expect(mocks.recopierGuides).toHaveBeenCalled());
  });
});
