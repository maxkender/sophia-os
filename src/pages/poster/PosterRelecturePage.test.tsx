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

vi.mock("@/features/reviews/TikTokEmbed", () => ({
  TikTokEmbed: ({ url, titre }: { url: string; titre: string }) => <iframe title={titre} src={url} />,
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
    listerKit.mockReset();
    listerEcritures.mockReset();
    enregistrerEcriture.mockReset();
    listerKit.mockResolvedValue(POSTS);
    listerEcritures.mockResolvedValue([]);
    enregistrerEcriture.mockResolvedValue(undefined);
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

  it("le kit reste fermé tant que le questionnaire n'est pas envoyé", async () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    lire.mockResolvedValue([]);
    rendre();
    expect(await screen.findByText(/RESPOND IN YOUR LANGUAGE/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2 · The posts" })).not.toBeInTheDocument();
    expect(listerKit).not.toHaveBeenCalled();
  });

  it("questionnaire envoyé : un invité voit les 3 posts du test, le TikTok et chaque slide", async () => {
    espace.mockReturnValue({
      relecteurs: [{ ...RELECTEUR, questionnaire_termine_at: "2026-10-27T11:00:00Z" }],
      isPending: false,
      error: null,
    });
    rendre();
    expect(await screen.findByText(/Your first 3 posts are a paid test/)).toBeInTheDocument();
    const liste = screen.getByRole("list", { name: "The posts" });
    expect(within(liste).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Post 1To do",
      "Post 2To do",
      "Post 3To do",
    ]);
    expect(screen.getByTitle("The original TikTok")).toHaveAttribute("src", "https://www.tiktok.com/@a/video/1");
    expect(screen.getByText(/already recommends an app on slide 2/)).toHaveTextContent("recommend micabo");
    expect(screen.getByText("Slide 2 recommends bycat. Same idea with micabo.")).toBeInTheDocument();
    expect(screen.getByText("micabo turns your notes into quizzes.")).toBeInTheDocument();
    expect(screen.getByText("micabo slide")).toBeInTheDocument();
    expect(screen.getByAltText("Slide 1")).toHaveAttribute("src", "https://x/1.jpg");
  });

  it("enregistre chaque slide en quittant le champ, puis rend le post quand tout est écrit", async () => {
    espace.mockReturnValue({
      relecteurs: [{ ...RELECTEUR, questionnaire_termine_at: "2026-10-27T11:00:00Z" }],
      isPending: false,
      error: null,
    });
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
    fireEvent.change(s2, { target: { value: "Ich lerne mit micabo" } });
    fireEvent.blur(s2);
    await waitFor(() => expect(enregistrerEcriture).toHaveBeenCalledTimes(2));
    fireEvent.click(fini);
    await waitFor(() => expect(enregistrerEcriture).toHaveBeenCalledTimes(3));
    const [, , dernier] = enregistrerEcriture.mock.calls[2] as [string, string, { slides: unknown[]; rendu_at: string }];
    expect(dernier.slides).toHaveLength(2);
    expect(dernier.rendu_at).toEqual(expect.any(String));
    expect(await screen.findByText(/Done on/)).toBeInTheDocument();
  });

  it("un relecteur actif voit tout le kit, sans l'avertissement du test", async () => {
    espace.mockReturnValue({
      relecteurs: [{ ...RELECTEUR, statut: "actif", questionnaire_termine_at: "2026-10-27T11:00:00Z" }],
      isPending: false,
      error: null,
    });
    listerEcritures.mockResolvedValue([
      { relecteur_id: "r1", kit_id: "k1", slides: [{ position: 1, texte: "a" }], remarque: "", rendu_at: "2026-10-27T12:00:00Z" },
    ]);
    rendre();
    expect(await screen.findByText("1 / 4 posts done")).toBeInTheDocument();
    expect(screen.queryByText(/paid test/)).not.toBeInTheDocument();
    // Le post 1 est rendu : on ouvre le premier qui reste à écrire.
    expect(screen.getByTestId("post-kit-2")).toBeInTheDocument();
  });
});
