import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const lireFileSources = vi.fn();
const leverEssaiSource = vi.fn();

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("@/features/moteur/fileSources", async (importer) => ({
  ...(await importer<typeof import("./fileSources")>()),
  lireFileSources: () => lireFileSources(),
  leverEssaiSource: (...a: unknown[]) => leverEssaiSource(...a),
}));

import { FileSourcesPanel } from "./FileSourcesPanel";
import { attenteParJour, versFileSources } from "./fileSources";

const BRUT = {
  en_cours: { handle: "don.loq", phase: "attente", restant: 18, faits: 0, total: 2, a_suivre: ["studyy.hackz"] },
  attente: [
    { compte_reference_id: "a", handle: "supermaxing", sorte: "maj", essai_max: null, prevu_le: "2026-11-13" },
    { compte_reference_id: "b", handle: "lathifyee", sorte: "neuve", essai_max: 30, prevu_le: "2026-11-13" },
    { compte_reference_id: "c", handle: "lena.psychologie", sorte: "neuve", essai_max: 30, prevu_le: "2026-11-14" },
  ],
  essais: [
    { compte_reference_id: "d", handle: "don.loq", label: "weird_alpha", essai_max: 30, verdict: null, importes: 12, valides: 9, posts: 4, r: null, r_vs_label: null },
    { compte_reference_id: "e", handle: "tient", label: "RH", essai_max: null, verdict: "tient", importes: 30, valides: 22, posts: 14, r: 1.31, r_vs_label: 1.2 },
    { compte_reference_id: "f", handle: "faible", label: "RH", essai_max: 30, verdict: "ne_tient_pas", importes: 30, valides: 20, posts: 12, r: 0.7, r_vs_label: 0.72 },
  ],
  reglages: { lot_max: 6, nouvelles_par_jour: 2, essai_posts: 30, essai_mesures_min: 10, posts_max_par_maj: 100 },
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FileSourcesPanel />
    </QueryClientProvider>,
  );
}

describe("FileSourcesPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("ne prend pas de place quand rien ne tourne, n'attend ni n'est à l'essai", async () => {
    lireFileSources.mockResolvedValue(versFileSources({ en_cours: null, attente: [], essais: [], reglages: {} }));
    const { container } = rendre();
    await waitFor(() => expect(lireFileSources).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='file-sources']")).toBeNull();
  });

  it("dit ce qui tourne et range l'attente par jour", async () => {
    lireFileSources.mockResolvedValue(versFileSources(BRUT));
    rendre();
    expect((await screen.findByTestId("file-en-cours")).textContent).toContain(
      "@don.loq, 18 slideshows encore dans la file. À suivre : @studyy.hackz.",
    );
    expect(screen.getByText("3 sources attendent")).toBeTruthy();
    const jours = screen.getAllByTestId("file-jour").map((j) => j.textContent);
    expect(jours).toEqual([
      "vendredi 13 novembre : @supermaxing, @lathifyee (source neuve, 30 posts)",
      "samedi 14 novembre : @lena.psychologie (source neuve, 30 posts)",
    ]);
  });

  it("montre l'état de chaque essai et ne propose la suite que s'il n'a pas tenu ou n'est pas jugé", async () => {
    lireFileSources.mockResolvedValue(versFileSources(BRUT));
    rendre();
    const lignes = await screen.findAllByTestId("file-essai");
    expect(within(lignes[0]).getByText("En cours : 4 posts mesurés sur 10")).toBeTruthy();
    expect(within(lignes[0]).getByText("12 (9 validés)")).toBeTruthy();
    expect(within(lignes[1]).getByText("Tient : la suite arrive par 100")).toBeTruthy();
    expect(within(lignes[1]).queryByRole("button")).toBeNull();
    expect(within(lignes[2]).getByText("Ne tient pas : import arrêté")).toBeTruthy();
    expect(within(lignes[2]).getByRole("button", { name: "Importer la suite" })).toBeTruthy();
  });

  it("lève un essai après confirmation", async () => {
    lireFileSources.mockResolvedValue(versFileSources(BRUT));
    leverEssaiSource.mockResolvedValue(undefined);
    const confirme = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendre();
    const ligne = (await screen.findAllByTestId("file-essai"))[2];
    fireEvent.click(within(ligne).getByRole("button", { name: "Importer la suite" }));
    await waitFor(() => expect(leverEssaiSource).toHaveBeenCalledWith("f"));
    expect(confirme).toHaveBeenCalled();
    confirme.mockRestore();
  });

  it("regroupe l'attente par jour sans changer l'ordre", () => {
    const f = versFileSources(BRUT);
    expect(attenteParJour(f.attente).map((j) => [j.jour, j.sources.map((s) => s.handle)])).toEqual([
      ["2026-11-13", ["supermaxing", "lathifyee"]],
      ["2026-11-14", ["lena.psychologie"]],
    ]);
  });
});
