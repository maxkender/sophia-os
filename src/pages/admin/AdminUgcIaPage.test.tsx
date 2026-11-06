import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { CompteUgcv, GenerationUgcIa, PersonaUgcIa, SourceUgcIa } from "@/features/ugcIa/api";

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
});
