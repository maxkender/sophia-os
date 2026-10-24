import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { CaptureApp, MiseEnScene } from "@/features/misesEnScene/api";

const listerCaptures = vi.fn();
const listerMisesEnScene = vi.fn();
const deciderBanque = vi.fn();
const listerIntegrateurs = vi.fn();
const couplesManquants = vi.fn();
const mettreEnScene = vi.fn();

vi.mock("@/features/misesEnScene/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/misesEnScene/api")>()),
  listerCaptures: (f: unknown) => listerCaptures(f),
  listerMisesEnScene: (f: unknown) => listerMisesEnScene(f),
  lireBudgetFal: async () => ({ depense_semaine: 0.3, budget_semaine: 3, prix_image: 0.15, reste: 2.7, possible: true }),
  deciderBanque: (...a: unknown[]) => deciderBanque(...a),
  listerIntegrateurs: (f: unknown) => listerIntegrateurs(f),
  couplesManquants: (...a: unknown[]) => couplesManquants(...a),
  mettreEnScene: (...a: unknown[]) => mettreEnScene(...a),
  chercherScenes: async () => [],
}));

import { AdminBibliothequePage } from "./AdminBibliothequePage";

function capture(sur: Partial<CaptureApp> = {}): CaptureApp {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    application: "micabo",
    application_id: "00000000-0000-4000-8000-000000000002",
    ecran: "parcours",
    support: "iphone",
    langue: "fr",
    nature: "originale",
    originale_id: null,
    url: "https://exemple.test/parcours.jpg",
    largeur: 739,
    hauteur: 1600,
    statut: "a_valider",
    motif_rejet: null,
    remplace_id: null,
    remplacee_par: null,
    created_at: "2026-10-23T10:00:00Z",
    ...sur,
  };
}

function mise(sur: Partial<MiseEnScene> = {}): MiseEnScene {
  return {
    id: "m0000000-0000-4000-8000-000000000001",
    capture_id: "c0000000-0000-4000-8000-000000000001",
    integrateur_id: "i0000000-0000-4000-8000-000000000001",
    scene_id: "a56f6bb0-53b0-4f6f-b892-08654f55ee57",
    application: "micabo",
    application_id: "00000000-0000-4000-8000-000000000002",
    ecran: "parcours",
    langue: "fr",
    support: "iphone",
    url: "https://exemple.test/mes.png",
    largeur: 1664,
    hauteur: 2496,
    statut: "validee",
    motif_rejet: null,
    essai: 1,
    relance_de: null,
    used_count: 2,
    a_refaire: false,
    created_at: "2026-10-23T10:00:00Z",
    ...sur,
  };
}

function rendre(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AdminBibliothequePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Bibliothèque — captures et mises en scène", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    listerCaptures.mockReset();
    listerMisesEnScene.mockReset();
    deciderBanque.mockReset().mockResolvedValue(undefined);
    listerIntegrateurs.mockReset().mockResolvedValue([]);
    couplesManquants.mockReset().mockResolvedValue([]);
    mettreEnScene.mockReset().mockResolvedValue({});
  });

  it("onglet Captures : une capture à valider se valide, le budget Fal s'affiche", async () => {
    listerCaptures.mockResolvedValue([capture()]);
    rendre("/admin/bibliotheque?onglet=captures");
    expect(await screen.findByText("Captures de nos applis")).toBeTruthy();
    expect(await screen.findByText(/Fal cette semaine : 0.30 \$ sur 3 \$/)).toBeTruthy();
    await screen.findByAltText("micabo parcours fr");
    fireEvent.click(screen.getByRole("button", { name: /Valider/ }));
    await waitFor(() =>
      expect(deciderBanque).toHaveBeenCalledWith("capture", "c0000000-0000-4000-8000-000000000001", "validee", undefined),
    );
  });

  it("onglet Intégrateurs : une photo proposée par l'agent se valide", async () => {
    listerIntegrateurs.mockResolvedValue([
      {
        id: "i1",
        media_id: "a56f6bb0-53b0-4f6f-b892-08654f55ee57",
        support: "iphone",
        note: "main qui tient l'iPhone au-dessus d'un goûter",
        statut: "a_valider",
        motif_rejet: null,
        url: "https://exemple.test/gouter.jpg",
        caption: "hand holding an iPhone",
        created_at: "2026-10-23T10:00:00Z",
      },
    ]);
    rendre("/admin/bibliotheque?onglet=integrateurs");
    expect(await screen.findByText("main qui tient l'iPhone au-dessus d'un goûter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Valider$/ }));
    await waitFor(() => expect(deciderBanque).toHaveBeenCalledWith("integrateur", "i1", "validee", undefined));
  });

  it("onglet Mises en scène : génère les couples manquants un par un, dans l'ordre servi", async () => {
    listerMisesEnScene.mockResolvedValue([]);
    couplesManquants.mockResolvedValue([
      { capture_id: "parcours", integrateur_id: "gouter" },
      { capture_id: "notes", integrateur_id: "bureau" },
      { capture_id: "parcours", integrateur_id: "bureau" },
      { capture_id: "notes", integrateur_id: "gouter" },
    ]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    expect(await screen.findByText("4 mises en scène manquantes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Générer 3 mises en scène" }));
    await waitFor(() => expect(mettreEnScene).toHaveBeenCalledTimes(3));
    expect(mettreEnScene.mock.calls.map((c) => (c[0] as { capture_id: string }).capture_id)).toEqual(["parcours", "notes", "parcours"]);
  });

  it("onglet Mises en scène : une capture remplacée marque la mise en scène à refaire", async () => {
    listerCaptures.mockResolvedValue([]);
    listerMisesEnScene.mockResolvedValue([mise(), mise({ id: "m2", a_refaire: true, statut: "validee" })]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    expect(await screen.findByText(/1 à refaire \(capture remplacée\)/)).toBeTruthy();
    expect(screen.getAllByText(/utilisée 2 fois/)).toHaveLength(2);
    expect(screen.getByText("À refaire")).toBeTruthy();
  });

  it("onglet Mises en scène : relance proposée une seule fois, rejet avec motif", async () => {
    listerCaptures.mockResolvedValue([]);
    listerMisesEnScene.mockResolvedValue([
      mise({ id: "m1", statut: "a_valider", essai: 1 }),
      mise({ id: "m2", statut: "a_valider", essai: 2 }),
    ]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    expect(await screen.findAllByRole("button", { name: /Relancer/ })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: /Rejeter/ })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Motif du rejet" }), { target: { value: "texte déformé" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Motif du rejet" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(deciderBanque).toHaveBeenCalledWith("mise_en_scene", "m1", "rejetee", "texte déformé"));
  });
});
