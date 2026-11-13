import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const e = vi.hoisted(() => ({
  lireQuestionsTypes: vi.fn(),
  decider: vi.fn(),
  lireActions: vi.fn(),
  activerAction: vi.fn(),
  lireDirect: vi.fn(),
  regrouper: vi.fn(),
}));
vi.mock("./entrainement", async (orig) => ({ ...(await orig<typeof import("./entrainement")>()), ...e }));

import { Entrainer } from "./Entrainer";
import { aEntrainer, type QuestionType } from "./entrainement";

const type = (o: Partial<QuestionType>): QuestionType => ({
  id: "x", question: "When am I paid?", categorie: "paie", priorite: null, nb: 1, upwork: true, ruul: false, exemples: [],
  reponse_actuelle: null, statut: "sans_reponse", choix: null, reponse_upwork: null, reponse_ruul: null, action: null, action_bot: null,
  escalade_vers: null, entraine_at: null, regroupe_at: null, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Entrainer /></QueryClientProvider>);
}

describe("Entraîner le bot (0707)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    e.decider.mockResolvedValue({ ok: true, entrees: ["r1"] });
    e.activerAction.mockResolvedValue({ ok: true });
  });

  it("l'ordre des cartes : les 4 cas de Max, puis à revoir, puis le plus fréquent ; les réponses sûres ou entraînées sortent", () => {
    const l = aEntrainer([
      type({ id: "freq", nb: 40, statut: "pas_sur" }),
      type({ id: "p2", priorite: 2, nb: 1 }),
      type({ id: "revoir", nb: 2, statut: "a_revoir", entraine_at: "2026-11-12" }),
      type({ id: "p1", priorite: 1, nb: 3 }),
      type({ id: "sur", nb: 90, statut: "sur" }),
      type({ id: "fait", nb: 9, statut: "ok", entraine_at: "2026-11-13" }),
      type({ id: "p3fait", priorite: 3, statut: "ok", entraine_at: "2026-11-13" }),
    ]);
    expect(l.map((x) => x.id)).toEqual(["p1", "p2", "revoir", "freq"]);
  });

  it("une carte : exemples, ⚡ Action (le @ TikTok) puis ✏️ Corriger en 2 versions", async () => {
    e.lireQuestionsTypes.mockResolvedValue([
      type({ id: "t2", priorite: 2, question: "Can I change my TikTok username?", nb: 14, ruul: true,
        exemples: [{ qui: "Ana", at: "2026-11-13T09:42:00Z", source: "Slack", texte: "my @ is taken, can I use another one?" }],
        reponse_actuelle: "We're checking, you'll get an answer today." }),
    ]);
    rendu();
    const carte = await screen.findByTestId("carte-entrainement");
    expect(carte).toHaveTextContent("Can I change my TikTok username?");
    expect(carte).toHaveTextContent("Ana");
    expect(carte).toHaveTextContent("posée 14 fois");
    fireEvent.click(within(carte).getByTestId("choix-action"));
    const action = within(carte).getByTestId("panneau-action");
    fireEvent.click(within(action).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(e.decider).toHaveBeenCalledWith("t2", "action", {
      action: "pseudo_tiktok", bot: "cerveau support", reponse: "Done! Your TikTok username is now updated on your dashboard.",
    }));
    fireEvent.click(within(carte).getByTestId("choix-corriger"));
    fireEvent.change(within(carte).getByLabelText("Version Upwork"), { target: { value: "Upwork answer" } });
    fireEvent.change(within(carte).getByLabelText("Version Ruul"), { target: { value: "Ruul answer" } });
    fireEvent.click(within(within(carte).getByTestId("panneau-corriger")).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(e.decider).toHaveBeenCalledWith("t2", "corriger", { reponse_upwork: "Upwork answer", reponse_ruul: "Ruul answer", meme: false }));
  });

  it("actions possibles : désactiver une action ; en direct : compteurs et fil", async () => {
    e.lireQuestionsTypes.mockResolvedValue([]);
    e.lireActions.mockResolvedValue([{ action: "arret", libelle: "Transmettre un arrêt (STOP)", bot: "cerveau support · control_bot", actif: true, fois_7j: 3 }]);
    e.lireDirect.mockResolvedValue({
      compteurs: { repondu: 8, action: 1, escalade: 2, bloque: 0 },
      fil: [{ id: "d", cree_at: "2026-11-13T13:58:00Z", source: "help", texte: "milestone not paid", nom: "Leo M.", issue: "escalade", action_faite: null, niveau: "max", ticket_at: null, remonte_par: null, regle_par_bot: null, bot_responsable: "max" }],
    });
    rendu();
    fireEvent.click(await screen.findByRole("button", { name: "⚡ Actions possibles" }));
    fireEvent.click(await screen.findByLabelText("Activer : Transmettre un arrêt (STOP)"));
    await waitFor(() => expect(e.activerAction).toHaveBeenCalledWith("arret", false));
    fireEvent.click(screen.getByRole("button", { name: "🔴 En direct" }));
    const direct = await screen.findByTestId("en-direct");
    expect(direct).toHaveTextContent("8Répondu seul");
    expect(direct).toHaveTextContent("Leo M. — « milestone not paid » → ↗ vers Max");
  });
});
