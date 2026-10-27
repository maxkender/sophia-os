import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const espace = vi.fn();
const lire = vi.fn();
const enregistrer = vi.fn();
const terminer = vi.fn();
const listerKit = vi.fn();
const listerEcritures = vi.fn();
const enregistrerEcriture = vi.fn();

vi.mock("@/features/relectureNative/useEspaceRelecteur", () => ({
  CLE_REQUETE_MES_RELECTEURS: ["mes-relecteurs"],
  useEspaceRelecteur: () => espace(),
}));

vi.mock("@/features/relectureNative/api", () => ({
  lireReponses: (...a: unknown[]) => lire(...a),
  enregistrerReponse: (...a: unknown[]) => enregistrer(...a),
  terminerQuestionnaire: (...a: unknown[]) => terminer(...a),
  listerKit: () => listerKit(),
  listerEcrituresKit: (...a: unknown[]) => listerEcritures(...a),
  enregistrerEcritureKit: (...a: unknown[]) => enregistrerEcriture(...a),
  presentationsApplis: () =>
    Promise.resolve([{ application_id: "app-micabo", nom: "micabo", slug: "micabo", presentation: "micabo turns your notes into quizzes." }]),
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

const SLIDES = [
  { position: 1, texte: "things i stopped doing", image_url: "https://x/1.jpg" },
  { position: 2, texte: "waiting until i felt motivated", image_url: "https://x/2.jpg" },
];
const POSTS = [1, 2, 3, 4].map((rang) => ({
  id: `k${rang}`,
  rang,
  contenu_id: `c${rang}`,
  application_id: "app-micabo",
  voie: rang === 1 ? "reprise" : "libre",
  slide_cta: rang === 1 ? 2 : null,
  consigne_cta: rang === 1 ? "Slide 2 recommends bycat. Same idea with micabo." : "",
  a_adapter: rang === 1 ? "The grade 4/10." : "",
  source_url: `https://www.tiktok.com/@a/video/${rang}`,
  slides_en: SLIDES,
  actif: true,
}));

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
    lire.mockResolvedValue([]);
    listerKit.mockReset();
    listerEcritures.mockReset();
    enregistrerEcriture.mockReset();
    listerKit.mockResolvedValue(POSTS);
    listerEcritures.mockResolvedValue([]);
    enregistrerEcriture.mockResolvedValue(undefined);
  });

  const RELECTEUR_FINI = { ...RELECTEUR, questionnaire_termine_at: "2026-10-27T11:00:00Z" };

  it("dit que l'espace n'est pas ouvert quand le posteur n'y a pas accès", () => {
    espace.mockReturnValue({ relecteurs: [], isPending: false, error: null });
    rendre();
    expect(screen.getByText("This space is not open yet.")).toBeInTheDocument();
    expect(lire).not.toHaveBeenCalled();
  });

  it("commence par le bloc d'accueil : consignes, rappel « pas mot à mot », barre de progression et pays", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    rendre();
    expect(await screen.findByTestId("bloc-avant")).toBeInTheDocument();
    expect(screen.getByText(/RESPOND IN YOUR LANGUAGE/)).toBeInTheDocument();
    expect(screen.getByText("Block 1 of 13")).toBeInTheDocument();
    const barre = screen.getByTestId("barre-parcours");
    expect(within(barre).getByText(/Never a word-for-word translation/)).toBeInTheDocument();
    expect(within(barre).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(within(barre).getByText("0 / 88 questions answered")).toBeInTheDocument();
    expect(within(barre).getByRole("button", { name: /The 15 posts/ })).toBeDisabled();
    expect(screen.getByLabelText("What country are you in?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(listerKit).not.toHaveBeenCalled();
  });

  it("reprend au premier bloc incomplet et avance bloc par bloc jusqu'aux mots", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([{ question_cle: "intro.pays", choix: null, reponse: "Deutschland" }]);
    rendre();
    expect(await screen.findByTestId("bloc-ecole")).toBeInTheDocument();
    expect(screen.getByText(/^1\. What is the big exam/)).toBeInTheDocument();
    expect(screen.queryByText(/RESPOND IN YOUR LANGUAGE/)).not.toBeInTheDocument();
    expect(screen.getByText("1 / 88 questions answered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("bloc-mots.1")).toBeInTheDocument();
    expect(screen.getByTestId("mot-mot.brain-rot")).toBeInTheDocument();
    expect(screen.queryByTestId("mot-mot.quiet-luxury")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Block 12 of 13/ }));
    expect(screen.getByText(/^49\. How would you naturally say/)).toBeInTheDocument();
  });

  it("enregistre une réponse quand on quitte le champ, seulement si elle a changé", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    const champ = await screen.findByLabelText(/^2\. Is there a big exam around age 15-16/);
    fireEvent.blur(champ);
    expect(enregistrer).not.toHaveBeenCalled();
    fireEvent.change(champ, { target: { value: "MSA" } });
    fireEvent.blur(champ);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "ecole.examen_15_16", "MSA"));
    expect(await screen.findByText("1 / 88 questions answered")).toBeInTheDocument();
    expect(screen.getByText("1 / 15 answered")).toBeInTheDocument();
  });

  it("enregistre au fil de la frappe, et ce qui reste en passant au bloc suivant", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    rendre();
    const pays = await screen.findByLabelText("What country are you in?");
    fireEvent.change(pays, { target: { value: "Deutschland" } });
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "intro.pays", "Deutschland"), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const examen = await screen.findByLabelText(/^1\. What is the big exam/);
    fireEvent.change(examen, { target: { value: "Abitur" } });
    // On change de bloc sans quitter le champ ni attendre : la réponse part quand même.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "ecole.examen_fin_lycee", "Abitur"));
    expect(enregistrer).toHaveBeenCalledTimes(2);
  });

  it("enregistre le choix d'un mot, et le mot local quand il en faut un", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const bloc = await screen.findByTestId("mot-mot.glow-up");
    fireEvent.click(bloc.querySelector("button:nth-of-type(2)") as HTMLButtonElement);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "mot.glow-up", "", "notre_mot"));
    const champ = screen.getByLabelText('Your word for "glow up"');
    fireEvent.change(champ, { target: { value: "Verwandlung" } });
    fireEvent.blur(champ);
    await waitFor(() => expect(enregistrer).toHaveBeenCalledWith("r1", "mot.glow-up", "Verwandlung", "notre_mot"));
  });

  it("le dernier bloc liste ce qui manque et envoie le questionnaire", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    terminer.mockResolvedValue(undefined);
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: /Block 13 of 13/ }));
    expect(screen.getByText("0 / 88 answered.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Part 4 · Voice & tone/ }));
    expect(screen.getByTestId("bloc-ton")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Block 13 of 13/ }));
    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));
    await waitFor(() => expect(terminer).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Thanks! You can still change your answers.")).toBeInTheDocument();
  });

  it("questionnaire envoyé : on arrive sur les 15 posts, chaque slide avec son image et le rappel « pas mot à mot »", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR_FINI], isPending: false, error: null });
    rendre();
    const liste = await screen.findByRole("navigation", { name: "The posts" });
    expect(within(liste).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Post 1 · To do",
      "Post 2 · To do",
      "Post 3 · To do",
      "Post 4 · To do",
    ]);
    expect(screen.queryByText(/paid test/)).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText("Post 1 of 4")).toBeInTheDocument();
    expect(screen.getByText(/Never word for word\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Your version of slide 1")).toHaveAttribute(
      "placeholder",
      "Your words, not a word-for-word translation…",
    );
    expect(screen.getByText(/already recommends an app on slide 2/)).toHaveTextContent("recommend micabo");
    expect(screen.getByText("Slide 2 recommends bycat. Same idea with micabo.")).toBeInTheDocument();
    expect(screen.getByText("micabo turns your notes into quizzes.")).toBeInTheDocument();
    expect(screen.getByText("micabo slide")).toBeInTheDocument();
    expect(screen.getByAltText("Slide 1")).toHaveAttribute("src", "https://x/1.jpg");
    expect(within(screen.getByTestId("barre-parcours")).getByText("0 / 4 posts done")).toBeInTheDocument();
  });

  it("passe d'un post à l'autre avec les flèches et les tuiles", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR_FINI], isPending: false, error: null });
    rendre();
    expect(await screen.findByTestId("post-kit-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous post" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next post" }));
    expect(screen.getByTestId("post-kit-2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post 4 · To do" }));
    expect(screen.getByTestId("post-kit-4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next post" })).toBeDisabled();
  });

  it("enregistre chaque slide, rend le post et enchaîne sur le suivant", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR_FINI], isPending: false, error: null });
    rendre();
    const s1 = await screen.findByLabelText("Your version of slide 1");
    const fini = screen.getByRole("button", { name: "This post is done" });
    expect(fini).toBeDisabled();

    fireEvent.change(s1, { target: { value: "Dinge, die ich nicht mehr mache" } });
    fireEvent.blur(s1);
    await waitFor(() =>
      expect(enregistrerEcriture).toHaveBeenCalledWith("r1", "k1", {
        slides: [{ position: 1, texte: "Dinge, die ich nicht mehr mache" }],
        remarque: "",
        rendu_at: null,
      }),
    );
    expect(fini).toBeDisabled();

    const s2 = screen.getByLabelText("Your version of slide 2");
    fireEvent.change(s2, { target: { value: "Ich lerne mit der micabo-App" } });
    fireEvent.blur(s2);
    await waitFor(() => expect(enregistrerEcriture).toHaveBeenCalledTimes(2));
    fireEvent.click(fini);
    await waitFor(() => expect(enregistrerEcriture).toHaveBeenCalledTimes(3));
    const [, , dernier] = enregistrerEcriture.mock.calls[2] as [string, string, { slides: unknown[]; rendu_at: string }];
    expect(dernier.slides).toHaveLength(2);
    expect(dernier.rendu_at).toEqual(expect.any(String));
    // Le post 1 est fini : on passe au post 2, et la barre suit.
    expect(await screen.findByTestId("post-kit-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post 1 · Done" })).toBeInTheDocument();
    expect(screen.getByText("1 / 4 posts done")).toBeInTheDocument();
  });

  it("ouvre le premier post qui reste à écrire", async () => {
    espace.mockReturnValue({ relecteurs: [{ ...RELECTEUR_FINI, statut: "actif" }], isPending: false, error: null });
    listerEcritures.mockResolvedValue([
      { relecteur_id: "r1", kit_id: "k1", slides: [{ position: 1, texte: "a" }], remarque: "", rendu_at: "2026-10-27T12:00:00Z" },
    ]);
    rendre();
    expect(await screen.findByRole("button", { name: "Post 1 · Done" })).toBeInTheDocument();
    expect(screen.getByTestId("post-kit-2")).toBeInTheDocument();
    expect(within(screen.getByTestId("barre-parcours")).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  });
});
