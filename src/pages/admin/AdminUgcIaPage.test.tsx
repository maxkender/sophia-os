import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { AssemblageUgcIa, CompteUgcv, DemoUgcIa, GenerationUgcIa, PersonaUgcIa, SourceUgcIa } from "@/features/ugcIa/api";

const SOPHIE: PersonaUgcIa = { id: "p1", nom: "Sophie", description: "~20 ans, blonde", image_url: "https://x/sophie.jpg", image_path: "ugc-ia/personas/p1.jpg", compte_id: null };
const CLARA: PersonaUgcIa = { id: "p2", nom: "Clara", description: "~20 ans, brune", image_url: "https://x/clara.jpg", image_path: "ugc-ia/personas/p2.jpg", compte_id: null };
const COMPTE_LEA: CompteUgcv = { id: "c1", handle_tiktok: "lea.ugc", persona_nom: "Léa", langue: "en", poster_prenom: "Lea" };

const listerPersonas = vi.fn();
const listerSources = vi.fn();
const importer = vi.fn();
const couper = vi.fn();
const generer = vi.fn();
const enregistrerCta = vi.fn();
const suivre = vi.fn();
const rapatrier = vi.fn();
const monter = vi.fn();
const annulerMontage = vi.fn();
const listerComptes = vi.fn();
const assigner = vi.fn();
const listerPostsVideo = vi.fn();
const listerDemos = vi.fn();
const listerAssemblages = vi.fn();
const importerDemo = vi.fn();
const ajouterDemoDeSource = vi.fn();
const finaliserDemo = vi.fn();
const finaliserAssemblage = vi.fn();
const rendreVideo = vi.fn();
const majDemo = vi.fn();
const creerPostVideo = vi.fn();
const supprimerPostVideo = vi.fn();
const televerser = vi.fn();

vi.mock("@/features/ugcIa/api", () => ({
  CLE_SOURCES_UGC_IA: ["ugc-ia", "sources"],
  CLE_PERSONAS_UGC_IA: ["ugc-ia", "personas"],
  CLE_COMPTES_UGCV: ["ugc-ia", "comptes-ugcv"],
  CLE_POSTS_VIDEO: ["ugc-ia", "posts-video"],
  listerPostsVideo: () => listerPostsVideo(),
  creerPostVideo: (...a: unknown[]) => creerPostVideo(...a),
  supprimerPostVideo: (...a: unknown[]) => supprimerPostVideo(...a),
  televerserPourPost: (...a: unknown[]) => televerser(...a),
  supprimerFichiersPost: () => Promise.resolve(),
  CLE_DEMOS: ["ugc-ia", "demos"],
  CLE_ASSEMBLAGES: ["ugc-ia", "assemblages"],
  listerDemos: () => listerDemos(),
  listerAssemblages: () => listerAssemblages(),
  importerDemo: (...a: unknown[]) => importerDemo(...a),
  ajouterDemoDeSource: (...a: unknown[]) => ajouterDemoDeSource(...a),
  finaliserDemo: (...a: unknown[]) => finaliserDemo(...a),
  supprimerDemo: () => Promise.resolve({ ok: true }),
  majDemo: (...a: unknown[]) => majDemo(...a),
  finaliserAssemblage: (...a: unknown[]) => finaliserAssemblage(...a),
  supprimerAssemblage: () => Promise.resolve({ ok: true }),
  listerComptesUgcv: () => listerComptes(),
  assignerPersonaUgcIa: (...a: unknown[]) => assigner(...a),
  listerPersonasUgcIa: () => listerPersonas(),
  listerSourcesUgcIa: () => listerSources(),
  importerTiktokUgcIa: (...a: unknown[]) => importer(...a),
  couperPassageUgcIa: (...a: unknown[]) => couper(...a),
  genererUgcIa: (...a: unknown[]) => generer(...a),
  enregistrerCtaUgcIa: (...a: unknown[]) => enregistrerCta(...a),
  lireCtaUgcIa: () => Promise.resolve({}),
  suivreGenerationsUgcIa: () => suivre(),
  supprimerSourceUgcIa: () => Promise.resolve({ ok: true }),
  supprimerGenerationUgcIa: () => Promise.resolve({ ok: true }),
  rapatrierPersonasUgcIa: () => rapatrier(),
  monterGenerationUgcIa: (...a: unknown[]) => monter(...a),
  annulerMontageUgcIa: (...a: unknown[]) => annulerMontage(...a),
}));

// jsdom ne dessine pas : le bandeau rendu est remplacé par une image factice.
// jsdom n'enregistre pas de vidéo : le rendu est simulé.
vi.mock("@/features/ugcIa/rendu", async (original) => ({
  ...(await original<typeof import("@/features/ugcIa/rendu")>()),
  rendreVideo: (...a: unknown[]) => rendreVideo(...a),
  dureeFichier: async () => 12.5,
  chargerImage: async (src: string) => ({ src }),
}));

vi.mock("@/features/ugcIa/bandeau", async (original) => ({
  ...(await original<typeof import("@/features/ugcIa/bandeau")>()),
  bandeauPng: async (l: number, h: number, texte: string, position: number) => `data:image/png;base64,${l}x${h}:${position}:${texte.length}`,
}));

import { AdminUgcIaPage } from "./AdminUgcIaPage";

function generation(champs: Partial<GenerationUgcIa>): GenerationUgcIa {
  return {
    id: "g1",
    source_id: "s1",
    persona_id: "p1",
    debut_s: 0,
    fin_s: 4,
    prompt: "custom prompt",
    resolution: "480p",
    statut: "prete",
    erreur: null,
    video_url: "https://x/g1.mp4",
    video_brute_url: "https://x/g1.mp4",
    montage_debut_s: null,
    montage_fin_s: null,
    bandeau_actif: false,
    bandeau_texte: null,
    bandeau_position: null,
    montage_statut: null,
    montage_erreur: null,
    lancee_le: "2026-11-05T10:00:00Z",
    generee_le: "2026-11-05T10:05:00Z",
    created_at: "2026-11-05T10:00:00Z",
    ...champs,
  };
}

function source(champs: Partial<SourceUgcIa>): SourceUgcIa {
  return {
    id: "s1",
    source_url: "https://www.tiktok.com/@a/video/1",
    source_texte: "caption",
    source_vues: 476100,
    source_duree_s: 20,
    brut_url: "https://x/source.mp4",
    debut_s: null,
    fin_s: null,
    coupe_url: null,
    telephone_debut_s: null,
    telephone_fin_s: null,
    telephone_url: null,
    cta_texte: "I could KISS the person who showed me this",
    cta_image_url: "https://x/cta.jpg",
    musique_url: "https://www.tiktok.com/music/son-1",
    musique_titre: "son original",
    created_at: "2026-11-05T10:00:00Z",
    generations: [],
    ...champs,
  };
}

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminUgcIaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminUgcIaPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    listerPersonas.mockResolvedValue([SOPHIE, CLARA]);
    listerComptes.mockResolvedValue([]);
    listerPostsVideo.mockResolvedValue([]);
    listerDemos.mockResolvedValue([]);
    listerAssemblages.mockResolvedValue([]);
    window.localStorage.clear();
    await i18n.changeLanguage("fr");
  });

  it("liste les personas et importe un lien TikTok", async () => {
    listerSources.mockResolvedValue([]);
    importer.mockResolvedValue({ source: source({}) });
    rendre();
    expect(await screen.findByText("Personas (2)")).toBeInTheDocument();
    expect(screen.getByText("Clara")).toBeInTheDocument();
    expect(screen.getByText("Aucune source pour l'instant")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lien TikTok"), { target: { value: " https://www.tiktok.com/@a/video/1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Importer" }));
    await waitFor(() => expect(importer).toHaveBeenCalledWith("https://www.tiktok.com/@a/video/1"));
    expect(rapatrier).not.toHaveBeenCalled();
  });

  it("rattache un persona à un compte UGCV, repris à son ancien persona", async () => {
    listerPersonas.mockResolvedValue([SOPHIE, { ...CLARA, compte_id: "c1" }]);
    listerComptes.mockResolvedValue([COMPTE_LEA]);
    listerSources.mockResolvedValue([]);
    assigner.mockResolvedValue({ ok: true });
    rendre();
    const choix = await screen.findByLabelText("Compte UGCV de Sophie");
    await waitFor(() => expect(within(choix).getByRole("option", { name: "@lea.ugc · Lea · EN (repris à Clara)" })).toBeInTheDocument());
    expect(screen.getByLabelText("Compte UGCV de Clara")).toHaveValue("c1");
    fireEvent.change(choix, { target: { value: "c1" } });
    await waitFor(() => expect(assigner).toHaveBeenCalledWith("p1", "c1"));
    fireEvent.change(screen.getByLabelText("Compte UGCV de Clara"), { target: { value: "" } });
    await waitFor(() => expect(assigner).toHaveBeenCalledWith("p2", null));
  });

  it("dit comment avoir un compte UGCV quand il n'y en a aucun", async () => {
    listerSources.mockResolvedValue([]);
    rendre();
    expect(await screen.findByText(/Aucun compte UGCV pour l’instant/)).toBeInTheDocument();
    expect(screen.getByLabelText("Compte UGCV de Sophie")).toBeDisabled();
  });

  it("rapatrie une fois l'image d'un persona ajouté par Claude", async () => {
    listerPersonas.mockResolvedValue([SOPHIE, { ...CLARA, image_path: null }]);
    listerSources.mockResolvedValue([]);
    rapatrier.mockResolvedValue({ bilan: [] });
    rendre();
    await waitFor(() => expect(rapatrier).toHaveBeenCalledTimes(1));
  });

  it("montre le texte à l'écran de la source (sans l'image) et enregistre sa correction", async () => {
    listerSources.mockResolvedValue([source({})]);
    enregistrerCta.mockResolvedValue({ source: source({}) });
    rendre();
    const carte = await screen.findByTestId("source-s1");
    expect(within(carte).queryByRole("img", { name: /premier écran/i })).not.toBeInTheDocument();
    expect(within(carte).getByRole("button", { name: "Relire sur la vidéo" })).toBeInTheDocument();
    const champ = within(carte).getByLabelText("Texte à l'écran");
    expect(champ).toHaveValue("I could KISS the person who showed me this");
    const bouton = within(carte).getByRole("button", { name: "Enregistrer" });
    expect(bouton).toBeDisabled();
    fireEvent.change(champ, { target: { value: "I could KISS whoever showed me this 😭" } });
    fireEvent.click(bouton);
    await waitFor(() => expect(enregistrerCta).toHaveBeenCalledWith("s1", "I could KISS whoever showed me this 😭"));
  });

  it("coupe la réaction, même très courte, et refuse une fin avant le début", async () => {
    listerSources.mockResolvedValue([source({})]);
    couper.mockResolvedValue({ source: source({}) });
    rendre();
    const carte = await screen.findByTestId("source-s1");
    expect(within(carte).getByText("Coupe d'abord la réaction (étape 1).")).toBeInTheDocument();
    const ligne = within(carte).getByTestId("coupe-reaction");
    const bouton = within(ligne).getByRole("button", { name: "Couper la réaction" });
    fireEvent.change(within(ligne).getByLabelText("Début de Réaction (s)"), { target: { value: "8" } });
    expect(within(ligne).getByText("La fin doit être après le début.")).toBeInTheDocument();
    expect(bouton).toBeDisabled();
    fireEvent.change(within(ligne).getByLabelText("Début de Réaction (s)"), { target: { value: "1,5" } });
    fireEvent.change(within(ligne).getByLabelText("Fin de Réaction (s)"), { target: { value: "3" } });
    fireEvent.click(bouton);
    await waitFor(() => expect(couper).toHaveBeenCalledWith("s1", "reaction", 1.5, 3));
  });

  it("prend le temps de lecture de la vidéo pour le début et la fin, sans rien taper", async () => {
    listerSources.mockResolvedValue([source({})]);
    couper.mockResolvedValue({ source: source({}) });
    rendre();
    const carte = await screen.findByTestId("source-s1");
    const lecteur = carte.querySelector("video") as HTMLVideoElement;
    const lire = (s: number) => {
      Object.defineProperty(lecteur, "currentTime", { configurable: true, value: s });
      fireEvent.timeUpdate(lecteur);
    };
    lire(1.26);
    expect(within(carte).getByTestId("temps-lecture")).toHaveTextContent("Lecture : 1.3 s");
    const ligne = within(carte).getByTestId("coupe-reaction");
    fireEvent.click(within(ligne).getByRole("button", { name: "Début de Réaction (s) : prendre 1.3 s" }));
    lire(3.84);
    fireEvent.click(within(ligne).getByRole("button", { name: "Fin de Réaction (s) : prendre 3.8 s" }));
    expect(within(ligne).getByLabelText("Début de Réaction (s)")).toHaveValue("1.3");
    expect(within(ligne).getByLabelText("Fin de Réaction (s)")).toHaveValue("3.8");
    fireEvent.click(within(ligne).getByRole("button", { name: "Couper la réaction" }));
    await waitFor(() => expect(couper).toHaveBeenCalledWith("s1", "reaction", 1.3, 3.8));
  });

  it("coupe aussi la partie téléphone, proposée après la réaction, et la montre une fois coupée", async () => {
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4" })]);
    couper.mockResolvedValue({ source: source({}) });
    rendre();
    const carte = await screen.findByTestId("source-s1");
    const ligne = within(carte).getByTestId("coupe-telephone");
    expect(within(ligne).getByText("pas encore coupée")).toBeInTheDocument();
    expect(within(ligne).getByLabelText("Début de Partie téléphone (s)")).toHaveValue("4");
    expect(within(ligne).getByLabelText("Fin de Partie téléphone (s)")).toHaveValue("20");
    fireEvent.click(within(ligne).getByRole("button", { name: "Couper la partie téléphone" }));
    await waitFor(() => expect(couper).toHaveBeenCalledWith("s1", "telephone", 4, 20));
  });

  it("affiche la partie téléphone déjà coupée, à télécharger", async () => {
    listerSources.mockResolvedValue([
      source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4", telephone_debut_s: 4, telephone_fin_s: 12, telephone_url: "https://x/telephone.mp4" }),
    ]);
    rendre();
    const ligne = within(await screen.findByTestId("source-s1")).getByTestId("coupe-telephone");
    expect(within(ligne).getByText("coupée : 4 s → 12 s")).toBeInTheDocument();
    expect(within(ligne).getByRole("link", { name: "Télécharger" })).toHaveAttribute("href", "https://x/telephone.mp4");
  });

  it("lance Genjutsu pour les personas cochés, avec la résolution choisie", async () => {
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4" })]);
    generer.mockResolvedValue({ resultats: [{ personaId: "p1", nom: "Sophie", generationId: "g1" }, { personaId: "p2", nom: "Clara", erreur: "solde insuffisant" }] });
    rendre();
    const carte = await screen.findByTestId("source-s1");
    const lancer = within(carte).getByRole("button", { name: "Coche au moins un persona" });
    expect(lancer).toBeDisabled();
    fireEvent.click(within(carte).getByRole("button", { name: "Tout cocher" }));
    fireEvent.click(within(carte).getByRole("button", { name: "1080p" }));
    fireEvent.click(within(carte).getByRole("button", { name: "Générer pour 2 personas" }));
    await waitFor(() => expect(generer).toHaveBeenCalledWith("s1", ["p1", "p2"], expect.stringContaining("performs exactly the motion"), "1080p"));
    expect(await within(carte).findByText("Clara : solde insuffisant")).toBeInTheDocument();
  });

  it("refait une vidéo pour un persona avec une autre qualité et un autre prompt", async () => {
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4", generations: [generation({})] })]);
    generer.mockResolvedValue({ resultats: [{ personaId: "p1", nom: "Sophie", generationId: "g2" }] });
    rendre();
    const g = await screen.findByTestId("generation-g1");
    expect(within(g).getByRole("link", { name: "Télécharger" })).toHaveAttribute("href", "https://x/g1.mp4");
    fireEvent.click(within(g).getByRole("button", { name: "Refaire" }));
    expect(within(g).getByLabelText("Prompt")).toHaveValue("custom prompt");
    fireEvent.change(within(g).getByLabelText("Prompt"), { target: { value: "smoother motion" } });
    fireEvent.click(within(g).getByRole("button", { name: "720p" }));
    fireEvent.click(within(g).getByRole("button", { name: "Refaire pour Sophie" }));
    await waitFor(() => expect(generer).toHaveBeenCalledWith("s1", ["p1"], "smoother motion", "720p"));
  });

  it("bloque la coupe et le persona occupé pendant une génération, et relève Higgsfield", async () => {
    const enCours = source({
      debut_s: 0,
      fin_s: 4,
      coupe_url: "https://x/reaction.mp4",
      generations: [generation({ id: "g2", statut: "en_cours", video_url: null }), generation({})],
    });
    listerSources.mockResolvedValueOnce([enCours]).mockResolvedValue([{ ...enCours, generations: [generation({ id: "g2" }), generation({})] }]);
    let repondre: (v: unknown) => void = () => undefined;
    suivre.mockReturnValue(new Promise((r) => (repondre = r)));
    rendre();
    const carte = await screen.findByTestId("source-s1");
    expect(within(carte).getByText("Genjutsu en cours…")).toBeInTheDocument();
    expect(within(carte).getByRole("button", { name: "Couper la réaction" })).toBeDisabled();
    expect(within(carte).getByRole("button", { name: "Couper la partie téléphone" })).not.toBeDisabled();
    expect(within(carte).getByRole("checkbox", { name: "Sophie déjà en cours" })).toBeDisabled();
    expect(within(screen.getByTestId("generation-g1")).getByRole("button", { name: "Refaire" })).toBeDisabled();
    await waitFor(() => expect(suivre).toHaveBeenCalled());
    repondre({ bilan: [{ id: "g2", statut: "prete" }] });
    await waitFor(() => expect(screen.queryByText("Genjutsu en cours…")).not.toBeInTheDocument());
    expect(within(screen.getByTestId("source-s1")).getByRole("checkbox", { name: "Sophie" })).not.toBeDisabled();
  });
  it("monte une vidéo générée : recadrage et bandeau partant du texte à l'écran", async () => {
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4", generations: [generation({})] })]);
    monter.mockResolvedValue({ ok: true, statut: "en_cours" });
    rendre();
    const g = await screen.findByTestId("generation-g1");
    fireEvent.click(within(g).getByRole("button", { name: "Monter" }));
    const dialogue = await screen.findByRole("dialog", { name: "Monter la vidéo de Sophie" });
    expect(within(dialogue).getByRole("checkbox", { name: "Mettre le bandeau style Snapchat" })).toBeChecked();
    expect(within(dialogue).getByLabelText("Texte du bandeau")).toHaveValue("I could KISS the person who showed me this");
    expect(await within(dialogue).findByAltText("Aperçu du bandeau")).toHaveAttribute("src", "data:image/png;base64,480x854:36:42");
    fireEvent.change(within(dialogue).getByLabelText("Texte du bandeau"), { target: { value: "I could KISS whoever showed me this 😭" } });
    fireEvent.change(within(dialogue).getByRole("slider", { name: "Hauteur du bandeau" }), { target: { value: "62" } });
    fireEvent.change(within(dialogue).getByLabelText("Début du recadrage (s)"), { target: { value: "0,4" } });
    fireEvent.change(within(dialogue).getByLabelText("Fin du recadrage (s)"), { target: { value: "3.6" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer le montage" }));
    await waitFor(() =>
      expect(monter).toHaveBeenCalledWith("g1", {
        debut: 0.4,
        fin: 3.6,
        bandeau: { actif: true, texte: "I could KISS whoever showed me this 😭", position: 62, png: "data:image/png;base64,480x854:62:38" },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("monte sans bandeau ni recadrage, et refuse un bandeau vide", async () => {
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4", generations: [generation({})] })]);
    monter.mockResolvedValue({ ok: true, statut: "en_cours" });
    rendre();
    fireEvent.click(within(await screen.findByTestId("generation-g1")).getByRole("button", { name: "Monter" }));
    const dialogue = await screen.findByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Texte du bandeau"), { target: { value: "  " } });
    expect(within(dialogue).getByText("Écris le texte du bandeau.")).toBeInTheDocument();
    expect(within(dialogue).getByRole("button", { name: "Enregistrer le montage" })).toBeDisabled();
    fireEvent.click(within(dialogue).getByRole("checkbox", { name: "Mettre le bandeau style Snapchat" }));
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer le montage" }));
    await waitFor(() =>
      expect(monter).toHaveBeenCalledWith("g1", { debut: null, fin: null, bandeau: { actif: false, texte: "  ", position: 36 } }),
    );
  });

  it("une vidéo montée garde ses réglages, et on peut revenir à l'original", async () => {
    const montee = generation({
      video_url: "https://x/g1-monte.mp4",
      montage_debut_s: 0.5,
      montage_fin_s: 3.5,
      bandeau_actif: true,
      bandeau_texte: "texte gardé",
      bandeau_position: 70,
    });
    listerSources.mockResolvedValue([source({ debut_s: 0, fin_s: 4, coupe_url: "https://x/reaction.mp4", generations: [montee] })]);
    annulerMontage.mockResolvedValue({ ok: true });
    rendre();
    const g = await screen.findByTestId("generation-g1");
    expect(within(g).getByText("Montée")).toBeInTheDocument();
    expect(within(g).getByRole("link", { name: "Télécharger" })).toHaveAttribute("href", "https://x/g1-monte.mp4");
    fireEvent.click(within(g).getByRole("button", { name: "Monter" }));
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByLabelText("Texte du bandeau")).toHaveValue("texte gardé");
    expect(within(dialogue).getByRole("slider", { name: "Hauteur du bandeau" })).toHaveValue("70");
    expect(within(dialogue).getByLabelText("Début du recadrage (s)")).toHaveValue("0.5");
    fireEvent.click(within(dialogue).getByRole("button", { name: "Revenir à l'original" }));
    await waitFor(() => expect(annulerMontage).toHaveBeenCalledWith("g1"));
  });

  it("montre un montage en cours ou raté", async () => {
    listerSources.mockResolvedValue([
      source({
        debut_s: 0,
        fin_s: 4,
        coupe_url: "https://x/reaction.mp4",
        generations: [
          generation({ id: "g1", montage_statut: "en_cours" }),
          generation({ id: "g2", persona_id: "p2", montage_statut: "echec", montage_erreur: "fal 500" }),
        ],
      }),
    ]);
    rendre();
    const g1 = await screen.findByTestId("generation-g1");
    expect(within(g1).getByText("Montage en cours…")).toBeInTheDocument();
    expect(within(g1).getByRole("button", { name: "Monter" })).toBeDisabled();
    expect(within(screen.getByTestId("generation-g2")).getByText("Montage raté : fal 500")).toBeInTheDocument();
  });

  describe("posts UGCV", () => {
    const SOURCE_PRETE = () =>
      source({
        debut_s: 0,
        fin_s: 4,
        coupe_url: "https://x/reaction.mp4",
        telephone_url: "https://x/tel.mp4",
        source_texte: "my study app #study",
        generations: [generation({ id: "g1", persona_id: "p2", video_url: "https://x/g1-monte.mp4", bandeau_actif: true })],
      });

    it("crée un post : compte, jour, vidéos dans l'ordre ; la source remplit CTA, capture, légende et son", async () => {
      listerComptes.mockResolvedValue([COMPTE_LEA]);
      listerSources.mockResolvedValue([SOURCE_PRETE()]);
      creerPostVideo.mockResolvedValue({ ok: true, postId: "post1" });
      rendre();
      const creer = await screen.findByRole("button", { name: "Créer un post" });
      await waitFor(() => expect(creer).toBeEnabled());
      fireEvent.click(creer);
      const ajout = await screen.findByLabelText("Ajouter une vidéo de la page…");
      fireEvent.change(ajout, { target: { value: "tel:s1" } });
      fireEvent.change(ajout, { target: { value: "gen:g1" } });
      // La partie téléphone d'abord : on remet la réaction en tête.
      fireEvent.click(screen.getAllByRole("button", { name: "Monter" })[1]);
      expect(screen.getByLabelText("Légende et hashtags")).toHaveValue("my study app #study");
      expect(screen.getByLabelText("Son TikTok")).toHaveValue("https://www.tiktok.com/music/son-1");
      // Vidéo montée avec le bandeau : le CTA est déjà dedans.
      expect(screen.getByLabelText("Le CTA est déjà incrusté dans la vidéo (rien à ajouter)")).toBeChecked();
      fireEvent.click(screen.getByLabelText("Le CTA est déjà incrusté dans la vidéo (rien à ajouter)"));
      expect(screen.getByLabelText("Texte du CTA")).toHaveValue("I could KISS the person who showed me this");
      expect(screen.getByAltText("Capture d’exemple")).toHaveAttribute("src", "https://x/cta.jpg");
      fireEvent.click(screen.getByRole("button", { name: "Créer le post" }));
      await waitFor(() => expect(creerPostVideo).toHaveBeenCalledTimes(1));
      const envoye = creerPostVideo.mock.calls[0][0];
      expect(envoye.compteId).toBe("c1");
      expect(envoye.videos.map((v: { url: string }) => v.url)).toEqual(["https://x/g1-monte.mp4", "https://x/tel.mp4"]);
      expect(envoye.videos[0].generationId).toBe("g1");
      expect(envoye).toMatchObject({
        ctaIncruste: false,
        ctaTexte: "I could KISS the person who showed me this",
        captureUrl: "https://x/cta.jpg",
        legende: "my study app #study",
        musiqueUrl: "https://www.tiktok.com/music/son-1",
        musiqueTitre: "son original",
      });
    });

    it("importe une vidéo de l'ordinateur et refuse un 2e post le même jour", async () => {
      listerComptes.mockResolvedValue([COMPTE_LEA]);
      listerSources.mockResolvedValue([]);
      televerser.mockResolvedValue({ url: "https://x/ugc-ia/posts/d/1-demo.mp4", chemin: "ugc-ia/posts/d/1-demo.mp4" });
      const jour = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      listerPostsVideo.mockResolvedValue([
        {
          id: "post0",
          compte_id: "c1",
          date_publication_prevue: jour,
          statut: "assigne",
          publie_at: null,
          publie_url: null,
          hashtags: null,
          musique_url: null,
          musique_titre: null,
          video_cta_texte: null,
          video_cta_incruste: true,
          video_capture_url: null,
          handle_tiktok: "lea.ugc",
          videos: [{ id: "v1", position: 1, url: "https://x/a.mp4", nom: null }],
        },
      ]);
      rendre();
      expect(await screen.findByTestId("post-ugcv-post0")).toHaveTextContent("@lea.ugc");
      const creer = screen.getByRole("button", { name: "Créer un post" });
      await waitFor(() => expect(creer).toBeEnabled());
      fireEvent.click(creer);
      const fichier = new File(["x"], "demo.mp4", { type: "video/mp4" });
      fireEvent.change(await screen.findByLabelText("Importer une vidéo"), { target: { files: [fichier] } });
      await waitFor(() => expect(screen.getByRole("link", { name: "demo.mp4" })).toBeInTheDocument());
      expect(televerser).toHaveBeenCalledWith(fichier, expect.any(String));
      expect(screen.getByText("Ce compte a déjà un post ce jour-là (1 par jour).")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Créer le post" })).toBeDisabled();
    });
  });

  describe("sources en accordéon", () => {
    const deuxSources = () => [
      source({
        id: "s1",
        source_texte: "première réaction",
        coupe_url: "https://x/reaction.mp4",
        debut_s: 0,
        fin_s: 4,
        generations: [generation({ id: "g1" }), generation({ id: "g2", persona_id: "p2", statut: "en_cours", video_url: null })],
      }),
      source({ id: "s2", source_texte: "deuxième réaction" }),
    ];

    it("replie une source : le résumé reste, les étapes partent, et c'est retenu", async () => {
      listerSources.mockResolvedValue(deuxSources());
      const { unmount } = rendre();
      const carte = await screen.findByTestId("source-s1");
      expect(within(carte).getByRole("region", { name: "Découper la vidéo" })).toBeInTheDocument();
      fireEvent.click(within(carte).getByRole("button", { name: "Replier la source" }));
      expect(within(carte).queryByRole("region", { name: "Découper la vidéo" })).not.toBeInTheDocument();
      expect(within(carte).getByText("réaction coupée")).toBeInTheDocument();
      expect(within(carte).getByText("1 prête")).toBeInTheDocument();
      expect(within(carte).getByText("1 en cours")).toBeInTheDocument();
      expect(within(carte).getByRole("button", { name: "Déplier la source" })).toHaveAttribute("aria-expanded", "false");
      // L'autre source reste ouverte.
      expect(within(screen.getByTestId("source-s2")).getByRole("button", { name: "Replier la source" })).toBeInTheDocument();
      unmount();
      rendre();
      const apres = await screen.findByTestId("source-s1");
      expect(within(apres).getByRole("button", { name: "Déplier la source" })).toBeInTheDocument();
      // Un clic sur le titre rouvre la source.
      fireEvent.click(within(apres).getByRole("button", { name: "première réaction" }));
      expect(within(apres).getByRole("region", { name: "Découper la vidéo" })).toBeInTheDocument();
    });

    it("tout fermer, tout ouvrir", async () => {
      listerSources.mockResolvedValue(deuxSources());
      rendre();
      await screen.findByTestId("source-s1");
      fireEvent.click(screen.getByRole("button", { name: "Tout fermer" }));
      expect(screen.getAllByRole("button", { name: "Déplier la source" })).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Tout fermer" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Tout ouvrir" }));
      expect(screen.getAllByRole("button", { name: "Replier la source" })).toHaveLength(2);
    });
  });

  describe("démos et vidéos complètes", () => {
    const DEMO: DemoUgcIa = {
      id: "d1",
      nom: "demo appli",
      langue: "de",
      nettoyage: null,
      source_id: null,
      brut_url: "https://x/demo-brut.mp4",
      brut_duree_s: 20,
      passages: [],
      vitesse: 1,
      video_url: null,
      duree_s: null,
      montage_statut: null,
      montage_erreur: null,
      created_at: "2026-11-09T10:00:00Z",
    };
    const RENDU = { blob: new Blob(["x"]), mime: "video/webm" };

    it("importe une démo, et propose de monter la partie téléphone d'une source", async () => {
      listerSources.mockResolvedValue([source({ telephone_url: "https://x/tel.mp4", source_texte: "ma source" })]);
      importerDemo.mockResolvedValue({ demo: DEMO });
      ajouterDemoDeSource.mockResolvedValue({ demo: { ...DEMO, id: "d2", source_id: "s1", brut_url: "https://x/tel.mp4" } });
      rendre();
      const carte = await screen.findByTestId("demos");
      expect(await within(carte).findByText("Partie téléphone · ma source")).toBeInTheDocument();
      // Langue des démos importées : allemand.
      fireEvent.change(within(carte).getByLabelText("Langue des démos importées"), { target: { value: "de" } });
      const fichier = new File(["x"], "demo.mp4", { type: "video/mp4" });
      fireEvent.change(within(carte).getByLabelText("Importer une démo"), { target: { files: [fichier] } });
      await waitFor(() => expect(importerDemo).toHaveBeenCalledWith(fichier, 12.5, "de"));
      // Glisser-déposer : seules les vidéos entrent.
      const depot = within(carte).getByTestId("depot-demos");
      expect(depot).toHaveTextContent("Glisse tes vidéos démo ici (elles seront en 🇩🇪 Allemand)");
      const video2 = new File(["y"], "demo2.mov", { type: "video/quicktime" });
      fireEvent.drop(depot, { dataTransfer: { files: [video2, new File(["z"], "notes.txt", { type: "text/plain" })] } });
      await waitFor(() => expect(importerDemo).toHaveBeenCalledWith(video2, 12.5, "de"));
      expect(importerDemo).toHaveBeenCalledTimes(2);
      fireEvent.click(within(screen.getByTestId("demo-telephone-s1")).getByRole("button", { name: "Monter" }));
      await waitFor(() => expect(ajouterDemoDeSource).toHaveBeenCalledWith("s1", "de"));
      expect(await screen.findByText("Monter la démo « demo appli »")).toBeInTheDocument();
    });

    it("monte une démo : passages gardés, réordonnés (glisser-déposer), accélérés", async () => {
      listerSources.mockResolvedValue([]);
      listerDemos.mockResolvedValue([{ ...DEMO, passages: [{ debut: 0, fin: 4 }, { debut: 10, fin: 14 }] }]);
      rendreVideo.mockResolvedValue(RENDU);
      finaliserDemo.mockResolvedValue({ ok: true, statut: "en_cours" });
      rendre();
      fireEvent.click(within(await screen.findByTestId("demo-d1")).getByRole("button", { name: "Monter" }));
      await screen.findByText("Monter la démo « demo appli »");
      // Glisser le passage 2 sur le passage 1.
      fireEvent.dragStart(screen.getByTestId("passage-1"));
      fireEvent.drop(screen.getByTestId("passage-0"));
      expect(screen.getByLabelText("Début du passage 1")).toHaveValue("10");
      // Ajouter un passage puis l'enlever.
      fireEvent.click(screen.getByRole("button", { name: "Ajouter un passage (au temps du lecteur)" }));
      expect(screen.getByTestId("passage-2")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Enlever le passage 3" }));
      expect(screen.queryByTestId("passage-2")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "×2" }));
      expect(screen.getByText("Durée de la démo : 4 s")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Rendre la démo" }));
      await waitFor(() => expect(finaliserDemo).toHaveBeenCalledTimes(1));
      expect(rendreVideo.mock.calls[0][0].segments).toEqual([
        { url: "https://x/demo-brut.mp4", debut: 10, fin: 14, vitesse: 2 },
        { url: "https://x/demo-brut.mp4", debut: 0, fin: 4, vitesse: 2 },
      ]);
      expect(finaliserDemo).toHaveBeenCalledWith("d1", RENDU, [{ debut: 10, fin: 14 }, { debut: 0, fin: 4 }], 2);
    });

    it("assemble une réaction et une démo, bandeau par-dessus les deux", async () => {
      listerSources.mockResolvedValue([
        source({
          debut_s: 0,
          fin_s: 4,
          coupe_url: "https://x/reaction.mp4",
          generations: [generation({ id: "g1", video_brute_url: "https://x/g1-brut.mp4", montage_debut_s: 0.5, montage_fin_s: 3.5 })],
        }),
      ]);
      listerDemos.mockResolvedValue([{ ...DEMO, video_url: "https://x/demo-montee.mp4", duree_s: 8 }]);
      rendreVideo.mockResolvedValue(RENDU);
      finaliserAssemblage.mockResolvedValue({ ok: true, id: "a1", statut: "en_cours" });
      rendre();
      fireEvent.click(within(await screen.findByTestId("generation-g1")).getByRole("button", { name: "Réaction + démo" }));
      await screen.findByText("Vidéo complète : Sophie + une démo");
      await waitFor(() => expect(screen.getByLabelText("Démo à coller après la réaction")).toHaveValue("d1"));
      expect(screen.getByLabelText("Texte du bandeau")).toHaveValue("I could KISS the person who showed me this");
      fireEvent.click(screen.getByRole("button", { name: "Rendre la vidéo complète" }));
      await waitFor(() => expect(finaliserAssemblage).toHaveBeenCalledTimes(1));
      const options = rendreVideo.mock.calls[0][0];
      expect(options.segments).toEqual([
        { url: "https://x/g1-brut.mp4", debut: 0.5, fin: 3.5, vitesse: 1 },
        { url: "https://x/demo-montee.mp4", debut: 0, fin: null, vitesse: 1 },
      ]);
      expect(options.calque).toBeTruthy();
      expect(finaliserAssemblage).toHaveBeenCalledWith("g1", "d1", RENDU, {
        actif: true,
        texte: "I could KISS the person who showed me this",
        position: 36,
      });
    });

    it("envoie une vidéo complète à un créateur : post UGCV avec CTA déjà incrusté", async () => {
      const assemblage: AssemblageUgcIa = {
        id: "a1",
        generation_id: "g1",
        demo_id: "d1",
        langue: "en",
        nettoyage: null,
        bandeau_actif: true,
        bandeau_texte: "lien en bio",
        bandeau_position: 36,
        video_url: "https://x/complete.mp4",
        duree_s: 11,
        statut: "prete",
        erreur: null,
        created_at: "2026-11-09T10:00:00Z",
        persona_id: "p1",
        source_id: "s1",
        demo_nom: "demo appli",
      };
      listerSources.mockResolvedValue([source({ source_texte: "my study app #study" })]);
      listerAssemblages.mockResolvedValue([assemblage]);
      listerComptes.mockResolvedValue([COMPTE_LEA]);
      creerPostVideo.mockResolvedValue({ ok: true, postId: "post1" });
      rendre();
      fireEvent.click(within(await screen.findByTestId("assemblage-a1")).getByRole("button", { name: "Envoyer à un créateur" }));
      expect(await screen.findByRole("link", { name: "Sophie + demo appli" })).toBeInTheDocument();
      expect(screen.getByLabelText("Le CTA est déjà incrusté dans la vidéo (rien à ajouter)")).toBeChecked();
      expect(screen.getByLabelText("Légende et hashtags")).toHaveValue("my study app #study");
      fireEvent.click(screen.getByRole("button", { name: "Créer le post" }));
      await waitFor(() => expect(creerPostVideo).toHaveBeenCalledTimes(1));
      expect(creerPostVideo.mock.calls[0][0]).toMatchObject({
        compteId: "c1",
        ctaIncruste: true,
        videos: [{ url: "https://x/complete.mp4", assemblageId: "a1", generationId: "g1" }],
      });
    });

    it("change la langue d'une démo, et la montre nettoyée de ses identifiants IA", async () => {
      listerSources.mockResolvedValue([]);
      listerDemos.mockResolvedValue([{ ...DEMO, video_url: "https://x/d.mp4", duree_s: 6, nettoyage: { retires: ["moov/udta"], verifie: true, taille: 10 } }]);
      majDemo.mockResolvedValue({ demo: DEMO });
      rendre();
      const ligne = await screen.findByTestId("demo-d1");
      expect(within(ligne).getByText("sans identifiants IA")).toBeInTheDocument();
      expect(within(ligne).getByLabelText("Langue de la démo demo appli")).toHaveValue("de");
      fireEvent.change(within(ligne).getByLabelText("Langue de la démo demo appli"), { target: { value: "fr" } });
      await waitFor(() => expect(majDemo).toHaveBeenCalledWith("d1", { langue: "fr" }));
    });

    it("à l'envoi, les comptes de la langue de la vidéo d'abord, et une alerte si la langue diffère", async () => {
      const compteDe = { ...COMPTE_LEA, id: "c2", handle_tiktok: "anna.ugc", poster_prenom: "Anna", langue: "de" };
      listerSources.mockResolvedValue([source({})]);
      listerComptes.mockResolvedValue([COMPTE_LEA, compteDe]);
      listerAssemblages.mockResolvedValue([
        {
          id: "a1",
          generation_id: "g1",
          demo_id: "d1",
          langue: "de",
          nettoyage: { retires: [], verifie: true, taille: 1 },
          bandeau_actif: true,
          bandeau_texte: "x",
          bandeau_position: 36,
          video_url: "https://x/complete.mp4",
          duree_s: 9,
          statut: "prete",
          erreur: null,
          created_at: "2026-11-09T10:00:00Z",
          persona_id: "p1",
          source_id: "s1",
          demo_nom: "demo appli",
        } satisfies AssemblageUgcIa,
      ]);
      rendre();
      fireEvent.click(within(await screen.findByTestId("assemblage-a1")).getByRole("button", { name: "Envoyer à un créateur" }));
      const choix = await screen.findByLabelText("Compte UGCV");
      const options = within(choix).getAllByRole("option").map((o) => o.textContent);
      expect(options[1]).toContain("@anna.ugc");
      fireEvent.change(choix, { target: { value: "c1" } });
      expect(screen.getByText("Attention : la vidéo est en Allemand, le compte en Anglais.")).toBeInTheDocument();
      fireEvent.change(choix, { target: { value: "c2" } });
      expect(screen.queryByText(/Attention : la vidéo est en/)).not.toBeInTheDocument();
    });
  });
});
