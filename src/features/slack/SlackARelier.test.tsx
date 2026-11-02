import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import { filtrerMembres, suggestions } from "./logique";

const api = vi.hoisted(() => ({
  lireEtatSlack: vi.fn(),
  lireMembresLibres: vi.fn(),
  lirePosteursARelier: vi.fn(),
  relierSlack: vi.fn(),
  synchroniserSlackPosteurs: vi.fn(),
  lireDeclarationsEtapes: vi.fn(),
  deciderDeclaration: vi.fn(),
}));
vi.mock("./api", () => api);
const auth = vi.hoisted(() => ({ role: "hiring_manager" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { SlackARelier } from "./SlackARelier";

const membres = [
  { slack_user_id: "UAAAAAA1", nom_reel: "José Pérez", nom_affiche: "jose", email: null },
  { slack_user_id: "UBBBBBB1", nom_reel: "Ana Silva", nom_affiche: null, email: null },
  { slack_user_id: "UCCCCCC1", nom_reel: "Anna Kowalska", nom_affiche: "anna.k", email: null },
];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SlackARelier />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("logique de recherche", () => {
  it("cherche sans accents ni casse, tous les mots", () => {
    expect(filtrerMembres(membres, "PEREZ jo").map((m) => m.slack_user_id)).toEqual(["UAAAAAA1"]);
    expect(filtrerMembres(membres, "anna.k").map((m) => m.slack_user_id)).toEqual(["UCCCCCC1"]);
    expect(filtrerMembres(membres, "  ")).toEqual([]);
  });

  it("propose les membres qui partagent un mot du nom", () => {
    expect(suggestions(membres, "Jose Perez Garcia").map((m) => m.slack_user_id)).toEqual(["UAAAAAA1"]);
    expect(suggestions(membres, "Al")).toEqual([]);
  });
});

describe("SlackARelier", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    auth.role = "hiring_manager";
    api.lireEtatSlack.mockResolvedValue({ relies: 40, a_relier: 1, derniere_synchro: null });
    api.lireMembresLibres.mockResolvedValue(membres);
    api.lirePosteursARelier.mockResolvedValue([
      { id: "p1", nom: "José Perez", email_perso: null, email: null, hm_id: "hm", hm_prenom: "Kris", created_at: "2026-10-01" },
    ]);
    api.relierSlack.mockResolvedValue(undefined);
    api.lireDeclarationsEtapes.mockResolvedValue([]);
    api.deciderDeclaration.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("une HM relie son posteur d'un clic sur la suggestion, sans bouton de synchro", async () => {
    rendu();
    const suggestion = await screen.findByRole("button", { name: /José Pérez/ });
    expect(screen.queryByRole("button", { name: /Synchroniser Slack/ })).toBeNull();
    fireEvent.click(suggestion);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Relier José Perez à José Pérez/));
    await waitFor(() => expect(api.relierSlack).toHaveBeenCalledWith("p1", "UAAAAAA1"));
  });

  it("prompt 15 : confirmation refusée, rien n'est relié", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    rendu();
    fireEvent.click(await screen.findByRole("button", { name: /José Pérez/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.relierSlack).not.toHaveBeenCalled();
  });

  it("un ID Slack collé peut être relié tel quel", async () => {
    rendu();
    const champ = await screen.findByRole("searchbox");
    fireEvent.change(champ, { target: { value: "u0xyz1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Relier l'ID U0XYZ1234/ }));
    await waitFor(() => expect(api.relierSlack).toHaveBeenCalledWith("p1", "U0XYZ1234"));
  });

  it("l'admin simule la synchro et voit les compteurs", async () => {
    auth.role = "admin";
    api.synchroniserSlackPosteurs.mockResolvedValue({
      membres: 300, posteurs: 250, deja_relies: 10, par_email: 150, par_nom: 40, poses: 0, ambigus: 5, restants: 50,
    });
    rendu();
    fireEvent.click(await screen.findByRole("button", { name: "Simuler" }));
    expect(await screen.findByTestId("resultat-synchro")).toHaveTextContent("150 seraient reliés par email, 40 par nom");
    expect(api.synchroniserSlackPosteurs).toHaveBeenCalledWith(true);
  });

  it("une erreur de liaison s'affiche", async () => {
    api.relierSlack.mockRejectedValue(new Error("Ce compte Slack est déjà relié à un autre posteur"));
    rendu();
    fireEvent.click(await screen.findByRole("button", { name: /José Pérez/ }));
    expect(await screen.findByText(/déjà relié/)).toBeInTheDocument();
  });

  it("0497 : les étapes déclarées par les recrues : Slack relié au membre choisi, warm-up confirmé", async () => {
    api.lireDeclarationsEtapes.mockResolvedValue([
      {
        poster_id: "p2", nom: "Mary Example", cohorte_lundi: "2026-11-02", etape: "slack", note: null,
        declare_at: "2026-11-01T17:00:00Z", statut: "en_attente",
        candidats: [
          { slack_user_id: "UZZZZZZ1", nom: "Someone Else", vu: null },
          { slack_user_id: "UMMMMMM1", nom: "Maria Example", vu: null },
        ],
      },
      {
        poster_id: "p3", nom: "Ken Test", cohorte_lundi: "2026-11-02", etape: "warmup", note: null,
        declare_at: "2026-11-01T17:00:00Z", statut: "en_attente", candidats: null,
      },
    ]);
    rendu();
    const bloc = await screen.findByTestId("declarations-etapes");
    // Le membre le plus proche du nom vient en premier.
    const boutons = bloc.querySelectorAll('[data-declaration="slack"] button');
    expect(boutons[0]?.textContent).toContain("Maria Example");
    fireEvent.click(boutons[0]!);
    await waitFor(() => expect(api.deciderDeclaration).toHaveBeenCalledWith("p2", "slack", true, "UMMMMMM1"));
    fireEvent.click(screen.getByRole("button", { name: /Confirmer/ }));
    await waitFor(() => expect(api.deciderDeclaration).toHaveBeenCalledWith("p3", "warmup", true, undefined));
  });
});
