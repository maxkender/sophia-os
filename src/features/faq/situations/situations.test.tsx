import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

/**
 * Prompt 21, Q : l'onglet Test n'envoie jamais rien (seul « tester » est
 * appelé), montre la situation, l'entrée et la réponse ; « Corriger » ouvre
 * la réponse de cette situation. « Add to FAQ » : sa situation seulement, ou
 * pour tous (réponse par défaut).
 */

const api = vi.hoisted(() => ({
  CLE_SITUATIONS: ["faq", "situations"],
  VARIABLES_FAQ: ["prenom", "lundi_debut"],
  listerSituations: vi.fn(),
  listerEntrees: vi.fn(),
  testerQuestion: vi.fn(),
  ecrireReponse: vi.fn(async () => undefined),
  creerEntree: vi.fn(async () => "nouvelle"),
  forcerSituation: vi.fn(async () => undefined),
  chercherPosteurs: vi.fn(async () => []),
}));
vi.mock("./api", () => api);

import { AjouterAFaqSituation } from "./AjouterAFaq";
import { OngletTestFaq } from "./OngletTest";

const SITUATIONS = [
  { cle: "candidat", libelle: "Candidate", description: null, ordre: 10, actif: true, auto: true },
  { cle: "warmup", libelle: "Warm-up in progress, not ready", description: null, ordre: 50, actif: true, auto: true },
  { cle: "hm", libelle: "Hiring manager", description: null, ordre: 140, actif: false, auto: true },
];

const ENTREE = {
  id: "e1",
  cle: "when_start",
  question: "When do I start?",
  formulations: [],
  actif: true,
  updated_at: "2026-10-29T00:00:00Z",
  reponses: [
    {
      id: "r1",
      entree_id: "e1",
      situation: "warmup",
      texte: "You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}.",
      actif: true,
      updated_at: "2026-10-29T00:00:00Z",
    },
  ],
};

function rendu(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("FAQ par situation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    api.listerSituations.mockResolvedValue(SITUATIONS);
    api.listerEntrees.mockResolvedValue([ENTREE]);
  });

  it("Test : la réponse exacte, la situation, l'entrée, et rien n'est envoyé", async () => {
    api.testerQuestion.mockResolvedValue({
      situation: "warmup",
      situations: ["warmup"],
      entree: { id: "e1", question: "When do I start?" },
      correspondance: "locale",
      reponse: {
        situation: "warmup",
        texte: "You start on Monday 2 November if by Sunday midnight you have: 3 more accounts followed.",
        modele: ENTREE.reponses[0]!.texte,
      },
      variables: { prenom: "Alex", lundi_debut: "2 November" },
      sautees: [],
      cerveau: null,
    });
    rendu(<OngletTestFaq />);
    // Seules les situations actives se choisissent.
    const choix = await screen.findByRole("combobox", { name: "Situation" });
    await waitFor(() => expect(choix.querySelectorAll("option")).toHaveLength(2));
    fireEvent.change(choix, { target: { value: "warmup" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "When do I start?" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(await screen.findByTestId("faq-test-reponse")).toHaveTextContent(
      "You start on Monday 2 November if by Sunday midnight you have: 3 more accounts followed.",
    );
    expect(api.testerQuestion).toHaveBeenCalledWith("When do I start?", { situation: "warmup" });
    expect(screen.getByTestId("faq-test-resultat")).toHaveTextContent("When do I start?");
    expect(screen.getByTestId("faq-test-resultat")).toHaveTextContent("Warm-up in progress, not ready");
    expect(screen.getByText("Test only: nothing was sent and nothing was saved.")).toBeInTheDocument();
    expect(api.ecrireReponse).not.toHaveBeenCalled();
    expect(api.forcerSituation).not.toHaveBeenCalled();

    // « Corriger » : la réponse de cette situation, prête à changer.
    fireEvent.click(screen.getByRole("button", { name: "Fix" }));
    const editeur = await screen.findByRole("textbox", { name: "Answer" });
    expect(editeur).toHaveValue(ENTREE.reponses[0]!.texte);
    fireEvent.change(editeur, { target: { value: "You start on Monday {lundi_debut}." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.ecrireReponse).toHaveBeenCalledWith("e1", "warmup", "You start on Monday {lundi_debut}."));
  });

  it("Test : sans réponse pour la situation, ce que le bot du guide dirait", async () => {
    api.testerQuestion.mockResolvedValue({
      situation: "candidat",
      situations: ["candidat"],
      entree: null,
      correspondance: null,
      reponse: null,
      variables: {},
      sautees: [],
      cerveau: { decision: "inconnu", reponse: "", section: null },
    });
    rendu(<OngletTestFaq />);
    await screen.findByRole("combobox", { name: "Situation" });
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "Can I post twice?" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("No FAQ question recognised: the guide bot would answer:")).toBeInTheDocument();
    expect(screen.getByText("(nothing would be sent)")).toBeInTheDocument();
  });

  it("Add to FAQ : pour sa situation seulement, ou pour tous", async () => {
    rendu(<AjouterAFaqSituation question="When do I start?" situation="warmup" entreeId="e1" reponse="On Monday." />);
    fireEvent.click(screen.getByRole("button", { name: "Add to FAQ by situation" }));
    await screen.findByRole("combobox", { name: "FAQ question" });
    // Par défaut : sa situation seulement.
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.ecrireReponse).toHaveBeenCalledWith("e1", "warmup", "On Monday."));
  });

  it("Add to FAQ : « pour tous » écrit la réponse par défaut", async () => {
    rendu(<AjouterAFaqSituation question="When do I start?" situation="warmup" entreeId="e1" reponse="On Monday." />);
    fireEvent.click(screen.getByRole("button", { name: "Add to FAQ by situation" }));
    await screen.findByRole("combobox", { name: "FAQ question" });
    fireEvent.click(screen.getByRole("radio", { name: "For everyone" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.ecrireReponse).toHaveBeenCalledWith("e1", null, "On Monday."));
  });
});
