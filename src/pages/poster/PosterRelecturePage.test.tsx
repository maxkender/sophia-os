import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const espace = vi.fn();
const mesDuelsRelecteur = vi.fn();
const voterDuelRelecteur = vi.fn();

vi.mock("@/features/relectureNative/useEspaceRelecteur", () => ({
  useEspaceRelecteur: () => espace(),
}));
vi.mock("@/features/relectureNative/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/relectureNative/api")>()),
  mesDuelsRelecteur: () => mesDuelsRelecteur(),
  voterDuelRelecteur: (...a: unknown[]) => voterDuelRelecteur(...a),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { PosterRelecturePage } from "./PosterRelecturePage";

const RELECTEUR = {
  id: "r1",
  profile_id: "p1",
  langue: "de",
  statut: "invite",
  note: null,
  created_at: "2026-10-27T10:00:00Z",
};

const slide = (texte: string) => [{ position: 1, texte_overlay: texte, position_sophia: false }];

const DUEL = {
  duel_id: "d1",
  langue: "de",
  envoye_le: "2026-10-30T10:00:00Z",
  slides_source: slide("5 rules for men"),
  deck_gauche: slide("5 Regeln für Männer"),
  deck_droite: slide("5 Regeln, die jeder Mann kennen sollte"),
  mon_cote: null,
  ma_note_gauche: null,
  ma_note_droite: null,
  ma_remarque: null,
  ma_remarque_sur: null,
  mon_type_erreur: null,
  vote_le: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PosterRelecturePage />
    </QueryClientProvider>,
  );
}

describe("PosterRelecturePage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    espace.mockReset();
    mesDuelsRelecteur.mockReset();
    voterDuelRelecteur.mockReset();
    mesDuelsRelecteur.mockResolvedValue([]);
    voterDuelRelecteur.mockResolvedValue(undefined);
  });

  it("dit que l'espace n'est pas ouvert quand le posteur n'y a pas accès", () => {
    espace.mockReturnValue({ relecteurs: [], isPending: false, error: null });
    renderPage();
    expect(screen.getByText("This space is not open yet.")).toBeInTheDocument();
  });

  it("l'accueil, la règle d'or, et aucun duel en attente", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    renderPage();
    expect(screen.getByText("Welcome to native review 👋")).toBeInTheDocument();
    expect(screen.getByText(/The golden rule/)).toBeInTheDocument();
    expect(await screen.findByTestId("duels-vide")).toHaveTextContent(/No duel waiting/);
    expect(screen.getByTestId("relecture-bientot")).toHaveTextContent("German");
    expect(screen.queryByText(/Your country, part by part/)).not.toBeInTheDocument();
  });

  it("un duel envoyé : les deux versions sans dire laquelle est publiée, le vote part en côtés", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    mesDuelsRelecteur.mockResolvedValue([DUEL]);
    renderPage();
    const carte = await screen.findByTestId("duel-relecteur");
    expect(carte).toHaveTextContent("5 Regeln für Männer");
    expect(carte).toHaveTextContent("5 Regeln, die jeder Mann kennen sollte");
    expect(carte).not.toHaveTextContent(/posted|old circuit|new circuit/i);

    const envoyer = screen.getByRole("button", { name: "Send my vote" });
    expect(envoyer).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Version 2 sounds more native" }));
    fireEvent.click(screen.getAllByRole("radio", { name: "4/5" })[1]);
    fireEvent.click(envoyer);
    await waitFor(() => expect(voterDuelRelecteur).toHaveBeenCalledTimes(1));
    expect(voterDuelRelecteur).toHaveBeenCalledWith("d1", {
      cote: "droite",
      noteGauche: null,
      noteDroite: 4,
      remarque: "",
      remarqueSur: "les_deux",
      typeErreur: null,
    });
  });

  it("un duel déjà voté s'affiche avec le vote, modifiable", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    mesDuelsRelecteur.mockResolvedValue([{ ...DUEL, mon_cote: "gauche", ma_note_gauche: 5, ma_note_droite: 2, vote_le: "2026-10-30T11:00:00Z" }]);
    renderPage();
    expect(await screen.findByText(/Your vote: Version 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change my vote" })).toBeInTheDocument();
  });

  it("un relecteur de deux langues passe de l'une à l'autre", () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR, { ...RELECTEUR, id: "r2", langue: "tr" }], isPending: false, error: null });
    renderPage();
    expect(screen.getByRole("button", { name: /Turkish/ })).toBeInTheDocument();
  });
});
