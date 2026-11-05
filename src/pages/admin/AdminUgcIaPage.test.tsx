import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { VideoUgcIa } from "@/features/ugcIa/api";

const listerVideos = vi.fn();
const importer = vi.fn();
const couper = vi.fn();
const generer = vi.fn();
const suivre = vi.fn();

vi.mock("@/features/ugcIa/api", () => ({
  CLE_VIDEOS_UGC_IA: ["ugc-ia", "videos"],
  listerPersonasUgcIa: () =>
    Promise.resolve([{ id: "p1", nom: "Sophie", description: "~20 ans, cheveux blonds", image_url: "https://x/sophie.jpg" }]),
  listerVideosUgcIa: () => listerVideos(),
  importerTiktokUgcIa: (...a: unknown[]) => importer(...a),
  couperPassageUgcIa: (...a: unknown[]) => couper(...a),
  genererVideoUgcIa: (...a: unknown[]) => generer(...a),
  suivreGenerationsUgcIa: () => suivre(),
  supprimerVideoUgcIa: () => Promise.resolve({ ok: true }),
}));

import { AdminUgcIaPage } from "./AdminUgcIaPage";

function video(champs: Partial<VideoUgcIa>): VideoUgcIa {
  return {
    id: "v1",
    persona_id: "p1",
    source_url: "https://www.tiktok.com/@a/video/1",
    source_texte: "I could KISS the person who showed me this",
    source_vues: 476100,
    source_duree_s: 20,
    brut_url: "https://x/source.mp4",
    debut_s: null,
    fin_s: null,
    coupe_url: null,
    prompt: null,
    resolution: "720p",
    statut: "importee",
    erreur: null,
    video_url: null,
    lancee_le: null,
    generee_le: null,
    created_at: "2026-11-05T10:00:00Z",
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
    await i18n.changeLanguage("fr");
  });

  it("montre Sophie et importe un lien TikTok pour elle", async () => {
    listerVideos.mockResolvedValue([]);
    importer.mockResolvedValue({ video: video({}) });
    rendre();
    expect(await screen.findByText("Sophie")).toBeInTheDocument();
    expect(screen.getByText("Aucune vidéo pour l'instant")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Lien TikTok"), { target: { value: " https://www.tiktok.com/@a/video/1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Importer" }));
    await waitFor(() => expect(importer).toHaveBeenCalledWith("https://www.tiktok.com/@a/video/1", "p1"));
  });

  it("coupe le passage choisi et refuse un passage trop court", async () => {
    listerVideos.mockResolvedValue([video({})]);
    couper.mockResolvedValue({ video: video({ statut: "coupee" }) });
    rendre();
    const carte = await screen.findByTestId("video-v1");
    const bouton = within(carte).getByRole("button", { name: "Couper ce passage" });
    fireEvent.change(within(carte).getByLabelText("Fin (s)"), { target: { value: "3" } });
    expect(within(carte).getByText("Le passage doit durer au moins 4 s (Genjutsu).")).toBeInTheDocument();
    expect(bouton).toBeDisabled();
    fireEvent.change(within(carte).getByLabelText("Début (s)"), { target: { value: "1,5" } });
    fireEvent.change(within(carte).getByLabelText("Fin (s)"), { target: { value: "7.5" } });
    fireEvent.click(bouton);
    await waitFor(() => expect(couper).toHaveBeenCalledWith("v1", 1.5, 7.5));
    expect(generer).not.toHaveBeenCalled();
  });

  it("lance Genjutsu avec le prompt et la résolution choisis", async () => {
    listerVideos.mockResolvedValue([video({ statut: "coupee", debut_s: 1, fin_s: 7, coupe_url: "https://x/reaction.mp4" })]);
    generer.mockResolvedValue({ video: video({ statut: "en_cours" }) });
    rendre();
    const carte = await screen.findByTestId("video-v1");
    fireEvent.click(within(carte).getByRole("button", { name: "1080p" }));
    fireEvent.click(await within(carte).findByRole("button", { name: "Générer avec Sophie" }));
    await waitFor(() => expect(generer).toHaveBeenCalledWith("v1", expect.stringContaining("performs exactly the motion"), "1080p"));
  });

  it("relève Higgsfield quand une génération tourne, et montre le résultat prêt", async () => {
    listerVideos
      .mockResolvedValueOnce([video({ statut: "en_cours", debut_s: 1, fin_s: 7, coupe_url: "https://x/reaction.mp4" })])
      .mockResolvedValue([video({ statut: "prete", debut_s: 1, fin_s: 7, coupe_url: "https://x/reaction.mp4", video_url: "https://x/video.mp4" })]);
    let repondre: (v: unknown) => void = () => undefined;
    suivre.mockReturnValue(new Promise((r) => (repondre = r)));
    rendre();
    expect(await screen.findByText("Genjutsu en cours…")).toBeInTheDocument();
    await waitFor(() => expect(suivre).toHaveBeenCalled());
    repondre({ bilan: [{ id: "v1", statut: "prete" }] });
    const lien = await screen.findByRole("link", { name: "Télécharger" });
    expect(lien).toHaveAttribute("href", "https://x/video.mp4");
    expect(screen.queryByText("Genjutsu en cours…")).not.toBeInTheDocument();
  });

  it("affiche l'erreur d'une génération échouée et propose de relancer", async () => {
    listerVideos.mockResolvedValue([
      video({ statut: "echec", debut_s: 1, fin_s: 7, coupe_url: "https://x/reaction.mp4", erreur: "Higgsfield : solde API insuffisant (402)" }),
    ]);
    rendre();
    const carte = await screen.findByTestId("video-v1");
    expect(within(carte).getByText("Higgsfield : solde API insuffisant (402)")).toBeInTheDocument();
    expect(within(carte).getByRole("button", { name: "Relancer la génération" })).toBeInTheDocument();
    expect(suivre).not.toHaveBeenCalled();
  });
});
