import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CarteLabel, CompteBible } from "./moodboard";

const api = vi.hoisted(() => ({
  lireComptes: vi.fn(), lireCartes: vi.fn(), changerEtape: vi.fn(), marquerBatchImporte: vi.fn(), changerCarte: vi.fn(),
  modifierCompte: vi.fn(), supprimerCompte: vi.fn(), ajouterComptes: vi.fn(), rafraichirMiniatures: vi.fn(),
}));
vi.mock("./moodboard", async (orig) => ({ ...(await orig<typeof import("./moodboard")>()), ...api }));

import { appsDe, compterEtapes, handlesDuTexte, ranger, REMARQUE_UGC, vuesCourtes } from "./moodboard";
import { DialogueAjout } from "./DialoguesBible";
import { PageBible } from "./PageBible";

const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "classic_girl_run", titre: null, section: "runvik", badge: "propose", description_da: "Coureuse en photo iPhone", label_id: null, ordre: 1, statut: "a_valider", ...o,
});
const compte = (o: Partial<CompteBible>): CompteBible => ({
  id: "c1", handle: "compte.un", etape: "a_importer", label_propose_id: "k1", autres_cartes: [], note_import: null, remarque: null, a_podzer: false,
  posts: [{ url: "https://www.tiktok.com/@compte.un/video/7600000000000000001", miniature_url: "https://img.test/1.jpg", vues: 4800000 }],
  miniatures_statut: "ok", miniatures_erreur: null, vues_mediane: 85000, meilleur_post_vues: 722000, abonnes: null, ajoute_at: "2026-11-19T10:00:00Z", ...o,
});

const CARTES = [carte({}), carte({ id: "k2", nom: "clean_girl", section: "sophia", badge: "propose", ordre: 2 }), carte({ id: "k3", nom: "smart_girl", section: "sophia", badge: "existe", ordre: 1, label_id: "L1" })];

describe("rangement du moodboard", () => {
  it("par app dans l'ordre (Runvik, Micabo, Sophia, Idées, Sans label), puis par label ; « aussi » sous la 2e carte", () => {
    const comptes = [
      compte({}),
      compte({ id: "c2", handle: "crushed", label_propose_id: "k1", autres_cartes: ["k2"] }),
      compte({ id: "c3", handle: "chiara", label_propose_id: "k3" }),
      compte({ id: "c4", handle: "orphelin", label_propose_id: null }),
      compte({ id: "c5", handle: "batch", etape: "prochain_batch" }),
    ];
    const g = ranger(comptes, CARTES, { etape: "a_importer", recherche: "", section: "" });
    expect(g.map((x) => x.section)).toEqual(["runvik", "sophia", "sans"]);
    expect(g[1]!.cartes.map((c) => c.carte?.nom)).toEqual(["smart_girl", "clean_girl"]);
    expect(g[1]!.cartes[1]!.comptes[0]).toMatchObject({ aussi: true });
    expect(g[2]!.total).toBe(1);
    expect(ranger(comptes, CARTES, { etape: "a_importer", recherche: "chia", section: "" }).flatMap((x) => x.cartes.flatMap((c) => c.comptes.map((y) => y.compte.handle)))).toEqual(["chiara"]);
    expect(compterEtapes(comptes)).toEqual({ a_importer: 4, prochain_batch: 1, importe: 0 });
  });

  it("filtre « À podzer », recherche dans la remarque, apps réunies sans doublon", () => {
    const comptes = [compte({}), compte({ id: "c2", handle: "podz", a_podzer: true, remarque: REMARQUE_UGC })];
    const handles = (f: Parameters<typeof ranger>[2]) => ranger(comptes, CARTES, f).flatMap((g) => g.cartes.flatMap((c) => c.comptes.map((x) => x.compte.handle)));
    expect(handles({ etape: "a_importer", recherche: "", section: "", podzer: true })).toEqual(["podz"]);
    expect(handles({ etape: "a_importer", recherche: "ugc", section: "" })).toEqual(["podz"]);
    expect(appsDe(["sophia", "micabo", "sophia", "runvik"])).toEqual({
      application_ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"], apps_attente: ["Runvik – running"],
    });
  });

  it("lit un collage de liens (profils, posts, @handle, liens courts)", () => {
    expect(handlesDuTexte("https://www.tiktok.com/@Arunnersmind\n@sally.htg https://www.tiktok.com/@sally.htg/video/1 https://vm.tiktok.com/ZNabc/ bonjour")).toEqual({
      handles: ["arunnersmind", "sally.htg"], courts: ["https://vm.tiktok.com/ZNabc/"], ignores: ["bonjour"],
    });
    expect(vuesCourtes(4_800_000)).toBe("4,8 M");
    expect(vuesCourtes(317_000)).toBe("317k");
  });
});

describe("page Bible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.lireCartes.mockResolvedValue(CARTES);
    api.changerEtape.mockResolvedValue(undefined);
    api.marquerBatchImporte.mockResolvedValue(1);
  });

  it("onglets avec compteurs, carte de label avec badge et DA, tuile avec lien entier et miniature ; → Prochain batch puis ← Retirer", async () => {
    api.lireComptes.mockResolvedValue([compte({ note_import: "pic 4,8 M" }), compte({ id: "c9", handle: "deja.batch", etape: "prochain_batch" })]);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PageBible /></QueryClientProvider>);
    expect(await screen.findByRole("tab", { name: /À importer 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Prochain batch 1/ })).toBeInTheDocument();
    const carteRun = screen.getByText("classic_girl_run").closest("[data-carte]") as HTMLElement;
    expect(within(carteRun).getByText("proposé")).toBeInTheDocument();
    expect(within(carteRun).getByText("Coureuse en photo iPhone")).toBeInTheDocument();
    const lien = within(carteRun).getAllByRole("link").find((a) => a.getAttribute("href") === "https://www.tiktok.com/@compte.un");
    expect(lien).toHaveTextContent("tiktok.com/@compte.un");
    expect(within(carteRun).getByText(/pic 4,8 M/)).toBeInTheDocument();
    fireEvent.click(within(carteRun).getByRole("button", { name: "Prochain batch" }));
    await waitFor(() => expect(api.changerEtape).toHaveBeenCalledWith(["c1"], "prochain_batch"));

    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const tuile = (await screen.findByText(/deja\.batch/)).closest("[data-compte]") as HTMLElement;
    fireEvent.click(within(tuile).getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(api.changerEtape).toHaveBeenCalledWith(["c9"], "a_importer"));
    expect(screen.getByRole("button", { name: /Marquer le batch comme importé/ })).toBeInTheDocument();
  });
});

describe("ajout de comptes", () => {
  it("plusieurs apps cochées, « À podzer », une remarque par compte (UGC en un clic)", async () => {
    api.ajouterComptes.mockResolvedValue({ crees: ["un", "deux"], deja: [], ids: [] });
    render(<DialogueAjout ouvert cartes={CARTES} onFermer={() => {}} onFini={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/compte1/), { target: { value: "https://www.tiktok.com/@un\n@deux" } });
    fireEvent.click(screen.getByRole("button", { name: "Runvik" }));
    fireEvent.click(screen.getByRole("button", { name: "Sophia" }));
    fireEvent.click(screen.getByLabelText("À podzer"));
    fireEvent.change(screen.getByLabelText("Remarque pour @deux"), { target: { value: "photos à refaire" } });
    fireEvent.click(screen.getAllByRole("button", { name: "UGC" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(api.ajouterComptes).toHaveBeenCalledWith(["un", "deux"], null, ["runvik", "sophia"], {
      a_podzer: true, remarques: { un: REMARQUE_UGC, deux: "photos à refaire" },
    }));
  });
});
