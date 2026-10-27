import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const espace = vi.fn();
const lire = vi.fn();
const enregistrer = vi.fn();
const terminer = vi.fn();

vi.mock("@/features/relectureNative/useEspaceRelecteur", () => ({
  CLE_REQUETE_MES_RELECTEURS: ["mes-relecteurs"],
  useEspaceRelecteur: () => espace(),
}));

vi.mock("@/features/relectureNative/api", () => ({
  lireReponses: (...a: unknown[]) => lire(...a),
  enregistrerReponse: (...a: unknown[]) => enregistrer(...a),
  terminerQuestionnaire: (...a: unknown[]) => terminer(...a),
}));

import { PosterRelecturePage } from "./PosterRelecturePage";

const RELECTEUR = {
  id: "r1",
  profile_id: "p1",
  langue: "de",
  statut: "invite",
  note: null,
  questionnaire_termine_at: null,
  created_at: "2026-10-27T10:00:00Z",
};

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PosterRelecturePage />
    </QueryClientProvider>,
  );
}

describe("PosterRelecturePage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    espace.mockReset();
    lire.mockReset();
    enregistrer.mockReset();
    terminer.mockReset();
    enregistrer.mockResolvedValue(undefined);
  });

  it("dit que l'espace n'est pas ouvert quand le posteur n'y a pas accès", () => {
    espace.mockReturnValue({ relecteurs: [], isPending: false, error: null });
    rendre();
    expect(screen.getByText("This space is not open yet.")).toBeInTheDocument();
    expect(lire).not.toHaveBeenCalled();
  });

  it("montre les consignes, les 49 questions et la liste de mots", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([{ question_cle: "intro.pays", choix: null, reponse: "Deutschland" }]);
    rendre();
    expect(await screen.findByText(/RESPOND IN YOUR LANGUAGE/)).toBeInTheDocument();
    expect(screen.getByText(/^1\. What is the big exam/)).toBeInTheDocument();
    expect(screen.getByText(/^49\. How would you naturally say/)).toBeInTheDocument();
    expect(screen.getByTestId("mot-mot.brain-rot")).toBeInTheDocument();
    expect(screen.getByText("1 / 88 answered")).toBeInTheDocument();
    expect(screen.getByLabelText("What country are you in?")).toHaveValue("Deutschland");
  });

  it("enregistre une réponse quand on quitte le champ, seulement si elle a changé", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([]);
    rendre();
    const champ = await screen.findByLabelText(/^2\. Is there a big exam around age 15-16/);
    fireEvent.blur(champ);
    expect(enregistrer).not.toHaveBeenCalled();
    fireEvent.change(champ, { target: { value: "MSA" } });
    fireEvent.blur(champ);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "ecole.examen_15_16", "MSA"));
    expect(await screen.findByText("1 / 88 answered")).toBeInTheDocument();
  });

  it("enregistre le choix d'un mot, et le mot local quand il en faut un", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([]);
    rendre();
    const bloc = await screen.findByTestId("mot-mot.glow-up");
    fireEvent.click(bloc.querySelector("button:nth-of-type(2)") as HTMLButtonElement);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "mot.glow-up", "", "notre_mot"));
    const champ = screen.getByLabelText('Your word for "glow up"');
    fireEvent.change(champ, { target: { value: "Verwandlung" } });
    fireEvent.blur(champ);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "mot.glow-up", "Verwandlung", "notre_mot"));
  });

  it("« I'm done » envoie le questionnaire", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([]);
    terminer.mockResolvedValue(undefined);
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: "I'm done" }));
    await waitFor(() => expect(terminer).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Thanks! You can still change your answers.")).toBeInTheDocument();
  });
});
