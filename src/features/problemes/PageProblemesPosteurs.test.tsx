import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import type { CohorteOnboarding, Probleme } from "./api";
import { PageProblemesPosteurs } from "./PageProblemesPosteurs";

const base = {
  contrat_id: null, hm: "HM 1", cohorte: "2026-11-02", actif: true, sources: [{ type: "reponse", ref: "1", at: "2026-11-02T10:00:00Z", texte: "?" }],
  canal_reponse: null, propose_par: null, propose_at: null, statut: "ouvert" as const, ferme_raison: null, ferme_at: null,
  created_at: "2026-11-02T10:00:00Z", maj_at: "2026-11-02T10:00:00Z", slack_relie: true, compte_id: null,
};
const liste: Probleme[] = [
  { ...base, id: "a", poster_id: "p1", nom: "Test A", categorie: "stop", niveau: "urgent", resume: "Asked to stop", proprietaire: "control_bot", proposition_reponse: null, proposition_action: "kill", groupe: "actifs" },
  { ...base, id: "b", poster_id: "p2", nom: "Test B", categorie: "paie", niveau: "urgent", resume: "Not paid", proprietaire: "pay_bot", proposition_reponse: null, proposition_action: "open_payroll", groupe: "onboarding" },
  { ...base, id: "c", poster_id: "p3", nom: "Test C", categorie: "login", niveau: "aujourdhui", resume: "Can't log in", proprietaire: "new_cohort_bot", proposition_reponse: "Here is your link", proposition_action: null, groupe: "onboarding" },
  { ...base, id: "d", poster_id: "p4", nom: "Test D", categorie: "question_bloquante", niveau: "aujourdhui", resume: "Where is the app?", proprietaire: "new_cohort_bot", proposition_reponse: null, proposition_action: "close", propose_par: "new_cohort_bot", propose_at: "2026-11-03T08:00:00Z", diagnostic: "Already answered in Slack on 2 Nov.", groupe: "onboarding" },
  // Ni diagnostic ni action : pas de carte.
  { ...base, id: "e", poster_id: "p5", nom: "Test E", categorie: "autre", niveau: "samedi", resume: "hello", proprietaire: "control_bot", proposition_reponse: null, proposition_action: null, groupe: "actifs" },
];
const onboarding: CohorteOnboarding[] = [
  {
    lundi: "2026-11-09", total: 3, a_poste: 0, reports: { un: 1, deux_plus: 0 },
    etapes: [
      { cle: "offre", faits: 3, bloques: [] },
      { cle: "accueil", faits: 3, bloques: [] },
      { cle: "login", faits: 2, bloques: [{ poster_id: "p9", nom: "Recrue Neuf", pays: "FR", hm: "HM 2", reports: 1 }] },
      { cle: "slack", faits: 2, bloques: [] },
      { cle: "tiktok", faits: 2, bloques: [] },
      { cle: "warmup", faits: 2, bloques: [] },
      { cle: "abonnements", faits: 2, bloques: [] },
      { cle: "pret", faits: 2, bloques: [] },
    ],
  },
];
const agir = vi.fn(async () => undefined);
const feedback = vi.fn(async (id: string, verdict: string, raison: string | null) => ({
  id: "f1", probleme_id: id, bot: "new_cohort_bot", categorie: "question_bloquante", groupe: "onboarding", verdict, raison,
  diagnostic_du_bot: null, action_du_bot: "close", created_at: "2026-11-03T12:00:00Z", nom: "Test D", en_regle: false,
}));
const envoyer = vi.fn(async () => undefined);

vi.mock("./api", () => ({
  lireProblemes: vi.fn(async () => liste),
  lireArchives: vi.fn(async () => []),
  lireModeProblemes: vi.fn(async () => "test"),
  lireOnboarding: vi.fn(async () => onboarding),
  agirProbleme: (...a: unknown[]) => agir(...(a as [])),
  validerCategorie: vi.fn(async () => 0),
  passerMaintenant: vi.fn(async () => ({})),
  envoyerUpwork: (...a: unknown[]) => envoyer(...(a as [])),
  envoyerLienMotDePasse: (...a: unknown[]) => envoyer(...(a as [])),
  dejaEcritAujourdhui: vi.fn(async () => false),
  lireFeedbacks: vi.fn(async () => []),
  lireStatsBots: vi.fn(async () => [
    { bot: "new_cohort_bot", total: 4, justes: 3, erreurs: [{ categorie: "slack", n: 1 }] },
    { bot: "control_bot", total: 0, justes: 0, erreurs: [] },
  ]),
  donnerFeedback: (...a: unknown[]) => feedback(...(a as [string, string, string | null])),
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
  it("groupes et niveaux avec compteurs, barre d'onboarding, cartes sans diagnostic masquées, mode test", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    expect(await screen.findByText("Test B")).toBeTruthy();
    expect(screen.getByTestId("mode-test")).toBeTruthy();
    const textes = screen.getAllByRole("tab").map((o) => o.textContent);
    expect(textes).toEqual([
      "Onboarding (jamais posté) (3)", "Nouveaux actifs (0)", "Actifs (1)", "Paie (1)",
      "Urgent (1)", "Aujourd'hui (2)", "Samedi (0)",
    ]);
    expect(screen.getByText("1 carte sans diagnostic ni action masquée.")).toBeTruthy();
    // La paie : le bouton ouvre Payroll (« Ouvrir »), jamais « Valider ».
    expect(screen.getByRole("button", { name: "✅ Ouvrir" })).toBeTruthy();

    // La barre d'onboarding : un clic sur une étape montre qui y est bloqué.
    const barre = await screen.findByTestId("barre-onboarding");
    fireEvent.click(within(barre).getByTestId("etape-login"));
    expect(within(screen.getByTestId("bloques")).getByText("Recrue Neuf")).toBeTruthy();

    // Le filtre Paie, transversal.
    fireEvent.click(screen.getByTestId("groupe-paie"));
    expect(screen.queryByTestId("barre-onboarding")).toBeNull();
    expect(screen.getByText("Test B")).toBeTruthy();
  });

  it("Valider n'envoie rien en mode test ; ✔️ Fermer quand le bot propose « close » ; le diagnostic du bot passe en premier", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    expect(await screen.findByText("Test B")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Aujourd'hui/ }));
    expect(await screen.findByText("Test C")).toBeTruthy();
    expect(screen.getByText("Already answered in Slack on 2 Nov.")).toBeTruthy();

    const carteC = screen.getAllByTestId("carte-probleme").find((c) => within(c).queryByText("Test C"))!;
    fireEvent.click(within(carteC).getByRole("button", { name: /Valider/ }));
    expect(await screen.findByText("Mode test : noté, rien n'est parti.")).toBeTruthy();
    expect(envoyer).not.toHaveBeenCalled();
    expect(agir).toHaveBeenCalledWith("c", "valider", expect.objectContaining({ envoye: false }));

    fireEvent.click(screen.getByTestId("fermer"));
    await vi.waitFor(() => expect(agir).toHaveBeenCalledWith("d", "fermer"));
  });

  it("feedback au bot : seulement sur une carte proposée par un bot ; « Pourquoi » obligatoire sauf 👍 ; compteur par bot", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    expect(await screen.findByText("Test B")).toBeTruthy();
    expect((await screen.findByTestId("stats-bots")).textContent).toContain("75 % 👍 sur 7 j (4)");
    fireEvent.click(screen.getByRole("tab", { name: /Aujourd'hui/ }));
    const carteD = (await screen.findAllByTestId("carte-probleme")).find((c) => within(c).queryByText("Test D"))!;
    const carteC = screen.getAllByTestId("carte-probleme").find((c) => within(c).queryByText("Test C"))!;
    expect(within(carteC).queryByTestId("feedback-bot")).toBeNull();
    const ligne = within(carteD).getByTestId("feedback-bot");
    fireEvent.click(within(ligne).getByTestId("verdict-pas_un_probleme"));
    const envoyerBtn = within(ligne).getByRole("button", { name: "Envoyer le feedback" });
    expect((envoyerBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(ligne).getByLabelText("Pourquoi"), { target: { value: "Un lien de post sur Slack = il montre son travail" } });
    fireEvent.click(envoyerBtn);
    await vi.waitFor(() => expect(feedback).toHaveBeenCalledWith("d", "pas_un_probleme", "Un lien de post sur Slack = il montre son travail"));
    expect(await within(ligne).findByText("En faire une règle")).toBeTruthy();
    // Le feedback ne change rien à la carte.
    expect(agir).not.toHaveBeenCalledWith("d", expect.anything(), expect.anything());
  });
});
