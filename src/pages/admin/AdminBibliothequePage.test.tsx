import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { ecranDepuisNom, type CaptureApp, type MiseEnScene } from "@/features/misesEnScene/api";

const listerCaptures = vi.fn();
const listerMisesEnScene = vi.fn();
const deciderBanque = vi.fn();
const listerIntegrateurs = vi.fn();
const couplesManquants = vi.fn();
const mettreEnScene = vi.fn();
const traduireMiseEnScene = vi.fn();
const traduireCapture = vi.fn();
const versionsManquantes = vi.fn();
const importerCapture = vi.fn();

vi.mock("@/features/misesEnScene/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/misesEnScene/api")>()),
  listerCaptures: (f: unknown) => listerCaptures(f),
  listerMisesEnScene: (f: unknown) => listerMisesEnScene(f),
  lireBudgetFal: async () => ({ depense_semaine: 0.3, budget_semaine: 3, prix_image: 0.15, reste: 2.7, possible: true }),
  deciderBanque: (...a: unknown[]) => deciderBanque(...a),
  listerIntegrateurs: (f: unknown) => listerIntegrateurs(f),
  couplesManquants: (...a: unknown[]) => couplesManquants(...a),
  mettreEnScene: (...a: unknown[]) => mettreEnScene(...a),
  traduireMiseEnScene: (...a: unknown[]) => traduireMiseEnScene(...a),
  traduireCapture: (...a: unknown[]) => traduireCapture(...a),
  versionsManquantes: (...a: unknown[]) => versionsManquantes(...a),
  importerCapture: (...a: unknown[]) => importerCapture(...a),
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
    version_de: null,
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
    traduireMiseEnScene.mockReset().mockResolvedValue("capture_traduite");
    traduireCapture.mockReset().mockResolvedValue({});
    importerCapture.mockReset().mockResolvedValue({});
    versionsManquantes.mockReset().mockResolvedValue({ pretes: [], captures_a_traduire: [], captures_a_valider: [] });
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

  it("onglet Mises en scène : une carte par image, les langues en pastilles", async () => {
    listerMisesEnScene.mockResolvedValue([
      mise({ id: "fr1", url: "https://exemple.test/fr.png" }),
      mise({ id: "es-rate", langue: "es", version_de: "fr1", statut: "rejetee", url: "https://exemple.test/es-0.png", created_at: "2026-10-24T09:00:00Z" }),
      mise({ id: "es1", langue: "es", version_de: "fr1", statut: "a_valider", url: "https://exemple.test/es.png", created_at: "2026-10-24T10:00:00Z" }),
    ]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    expect(await screen.findByRole("tab", { name: "fr ✓" })).toBeTruthy();
    // Une seule carte : la version espagnole vivante l'emporte sur l'essai rejeté.
    expect(screen.getAllByAltText(/micabo parcours/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "es …" }));
    expect((screen.getByAltText("micabo parcours es") as HTMLImageElement).src).toBe("https://exemple.test/es.png");
  });

  it("onglet Mises en scène : « ajouter une langue » part de l'image d'origine et dit l'étape", async () => {
    listerMisesEnScene.mockResolvedValue([mise({ id: "fr1" })]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    const choix = await screen.findByRole("combobox", { name: "Ajouter une langue…" });
    fireEvent.change(choix, { target: { value: "es" } });
    fireEvent.click(screen.getByRole("button", { name: /^Traduire$/ }));
    await waitFor(() => expect(traduireMiseEnScene).toHaveBeenCalledWith("fr1", "es"));
    expect(await screen.findByText(/relis-la et valide-la dans Captures/)).toBeTruthy();
  });

  it("onglet Captures : « Traduire en… » seulement sur une originale validée", async () => {
    listerCaptures.mockResolvedValue([
      capture({ statut: "validee" }),
      capture({ id: "c2", ecran: "notes", statut: "a_valider" }),
      capture({ id: "c3", langue: "es", nature: "traduite", originale_id: "c0000000-0000-4000-8000-000000000001", statut: "a_valider" }),
    ]);
    rendre("/admin/bibliotheque?onglet=captures");
    await screen.findByAltText("micabo parcours es");
    const choix = screen.getAllByRole("combobox", { name: "Traduire en…" });
    expect(choix).toHaveLength(1);
    fireEvent.change(choix[0], { target: { value: "es" } });
    fireEvent.click(screen.getByRole("button", { name: /^Traduire$/ }));
    await waitFor(() => expect(traduireCapture).toHaveBeenCalledWith("c0000000-0000-4000-8000-000000000001", "es"));
  });

  it("onglet Mises en scène : une image à valider dit qu'il faut la valider avant d'ajouter des langues", async () => {
    listerMisesEnScene.mockResolvedValue([mise({ id: "fr1", statut: "a_valider" })]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    expect(await screen.findByText("Valide l'image pour lui ajouter des langues.")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Ajouter une langue…" })).toBeNull();
  });

  it("onglet Mises en scène : le lot de versions d'une langue lance les images prêtes", async () => {
    listerMisesEnScene.mockResolvedValue([]);
    versionsManquantes.mockResolvedValue({ pretes: ["fr1", "fr2"], captures_a_traduire: ["c9"], captures_a_valider: [] });
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    fireEvent.change(await screen.findByRole("combobox", { name: "Versions en…" }), { target: { value: "es" } });
    expect(await screen.findByText("2 prêtes · 1 écrans à traduire · 0 captures à relire")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Générer 2 versions" }));
    await waitFor(() => expect(traduireMiseEnScene).toHaveBeenCalledTimes(2));
    expect(traduireMiseEnScene.mock.calls).toEqual([["fr1", "es"], ["fr2", "es"]]);
  });

  it("écran déduit du nom de fichier", () => {
    expect(ecranDepuisNom("À retenir.PNG")).toBe("a-retenir");
    expect(ecranDepuisNom("parcours.jpg")).toBe("parcours");
    expect(ecranDepuisNom("IMG_1234 (1).jpeg")).toBe("img-1234-1");
  });

  it("onglet Captures : glisser-déposer plusieurs captures, écran tiré du nom, un import par fichier", async () => {
    listerCaptures.mockResolvedValue([]);
    rendre("/admin/bibliotheque?onglet=captures");
    const zone = await screen.findByRole("button", { name: /Glisse tes captures ici/ });
    const parcours = new File(["x"], "parcours.jpg", { type: "image/jpeg" });
    const retenir = new File(["y"], "À retenir.png", { type: "image/png" });
    const texte = new File(["z"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, { dataTransfer: { files: [parcours, retenir, texte] } });
    expect((screen.getByRole("combobox", { name: "Écran de À retenir.png" }) as HTMLInputElement).value).toBe("a-retenir");
    expect(screen.queryByText("notes.txt")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Importer 2 originales" }));
    await waitFor(() => expect(importerCapture).toHaveBeenCalledTimes(2));
    expect(importerCapture.mock.calls.map((c) => (c[0] as { ecran: string; support: string }).ecran)).toEqual(["parcours", "a-retenir"]);
    expect((importerCapture.mock.calls[0][0] as { application: string; support: string; langue: string })).toMatchObject({
      application: "micabo",
      support: "iphone",
      langue: "fr",
    });
  });

  it("une version validée d'office pour un podz porte le badge « Validée auto »", async () => {
    listerMisesEnScene.mockResolvedValue([
      mise({ id: "fr1", decide_par: "u1", decide_le: "2026-10-24T10:00:00Z" }),
      mise({ id: "de1", langue: "de", version_de: "fr1", decide_par: null, decide_le: "2026-10-24T11:00:00Z" }),
    ]);
    rendre("/admin/bibliotheque?onglet=mises-en-scene");
    await screen.findByRole("tab", { name: "fr ✓" });
    expect(screen.queryByText("Validée auto (podz)")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "de ✓" }));
    expect(await screen.findByText("Validée auto (podz)")).toBeTruthy();
  });
});
