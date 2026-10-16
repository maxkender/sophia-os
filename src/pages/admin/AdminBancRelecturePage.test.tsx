import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerJoursRelecture = vi.fn();
const listerRelecturesBanc = vi.fn();
const listerAvisRelecture = vi.fn();
const enregistrerAvisRelecture = vi.fn();
const supprimerAvisRelecture = vi.fn();
const listerReviewRemarques = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  listerJoursRelecture: () => listerJoursRelecture(),
  listerRelecturesBanc: (jour: string) => listerRelecturesBanc(jour),
  listerAvisRelecture: (ids: string[]) => listerAvisRelecture(ids),
  enregistrerAvisRelecture: (a: unknown) => enregistrerAvisRelecture(a),
  supprimerAvisRelecture: (id: string) => supprimerAvisRelecture(id),
  listerReviewRemarques: () => listerReviewRemarques(),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { AdminBancRelecturePage } from "./AdminBancRelecturePage";

const base = {
  jour: "2026-10-15",
  origine: "test" as const,
  source_url: "https://www.tiktok.com/@src/photo/7000000000000000001",
  persona_nom: null,
  langue: "en",
  analyse_at: "2026-10-16T08:50:00Z",
  erreur: null,
};

const AVEC_MESSAGE = {
  ...base,
  id: "rel-1",
  post_id: "post-1",
  publie_url: "https://www.tiktok.com/@maya/photo/7000000000000000002",
  handle_tiktok: "maya",
  statut: "fait" as const,
  defauts: [
    { code: "justification", niveau: "remarque" as const, slides: [1, 3], detail: "lignes trop courtes" },
    { code: "police", niveau: "info" as const, slides: [2], detail: "police peut-être différente" },
  ],
  brouillon: "Hi! Thanks for your post.\n1. Tap your text to edit it.\nKeep it up!",
  remarques: [{ id: "j", titre: "Jutifier" }],
};

const SANS_MESSAGE = {
  ...base,
  id: "rel-2",
  post_id: "post-2",
  publie_url: "https://www.tiktok.com/@lea/photo/7000000000000000003",
  handle_tiktok: "lea",
  statut: "fait" as const,
  defauts: [],
  brouillon: null,
  remarques: [],
};

const IGNORE = {
  ...base,
  id: "rel-3",
  post_id: "post-3",
  publie_url: "https://www.tiktok.com/@zoe/photo/7000000000000000004",
  handle_tiktok: "zoe",
  statut: "ignore" as const,
  defauts: [],
  brouillon: null,
  remarques: [],
  erreur: "publié en vidéo",
};

function renderPage(url = "/admin/banc-relecture") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AdminBancRelecturePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminBancRelecturePage", () => {
  beforeEach(() => {
    listerJoursRelecture.mockReset().mockResolvedValue(["2026-10-15", "2026-10-14"]);
    listerRelecturesBanc.mockReset().mockResolvedValue([AVEC_MESSAGE, SANS_MESSAGE, IGNORE]);
    listerAvisRelecture.mockReset().mockResolvedValue([]);
    enregistrerAvisRelecture.mockReset().mockImplementation(async (a: Record<string, unknown>) => ({
      id: `avis-${String(a.cle)}`,
      commentaire: null,
      detail: null,
      ...a,
    }));
    supprimerAvisRelecture.mockReset().mockResolvedValue(undefined);
    listerReviewRemarques.mockReset().mockResolvedValue([
      { id: "j", titre: "Jutifier", corps: "", ordre: 1, video_url: "https://cdn.example/justif.mp4", video_path: null },
    ]);
  });

  it("montre les deux TikToks, les points, et le message exact avec sa vidéo", async () => {
    renderPage();
    expect(await screen.findByText(/Post 1 (sur|of) 3/)).toBeInTheDocument();
    expect(listerRelecturesBanc).toHaveBeenCalledWith("2026-10-15");
    expect(screen.getAllByTitle(/Original|Publié par le créateur|Posted by the creator/)).toHaveLength(2);
    expect(screen.getByText("Lignes trop courtes (slides 1 et 3)")).toBeInTheDocument();
    expect(screen.getByText("Police peut-être différente (slide 2)")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === AVEC_MESSAGE.brouillon),
    ).toBeInTheDocument();
    expect(screen.getByText(/(Vidéo jointe : |Attached video: )Jutifier/)).toBeInTheDocument();
  });

  it("✓ enregistre le jugement du point, avec ce que l'agent disait", async () => {
    renderPage();
    const juste = await screen.findByRole("button", { name: /^(Juste|Correct)$/ });
    // Posts jugés : 0 sur les 2 que l'agent a relus.
    expect(await screen.findByText("0 / 2")).toBeInTheDocument();
    fireEvent.click(juste);
    await waitFor(() =>
      expect(enregistrerAvisRelecture).toHaveBeenCalledWith(
        expect.objectContaining({
          relecture_id: "rel-1",
          cle: "justification|1,3",
          code: "justification",
          verdict: "juste",
          detail: "Lignes trop courtes (slides 1 et 3)",
        }),
      ),
    );
    // Son seul point jugé : le post passe « jugé ».
    await waitFor(() => expect(screen.queryByText("0 / 2")).not.toBeInTheDocument());
  });

  it("« Raté » ajoute un défaut que l'agent n'a pas vu, avec l'explication", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^(Raté|Missed)$/ }));
    fireEvent.change(screen.getByRole("combobox", { name: /Règle|Rule/ }), { target: { value: "couleur" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Ce qui ne va pas|What's wrong/ }), {
      target: { value: "slide 2 : texte jaune au lieu de blanc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));
    await waitFor(() =>
      expect(enregistrerAvisRelecture).toHaveBeenCalledWith(
        expect.objectContaining({
          relecture_id: "rel-1",
          code: "couleur",
          verdict: "rate",
          commentaire: "slide 2 : texte jaune au lieu de blanc",
          cle: expect.stringMatching(/^rate:/),
        }),
      ),
    );
  });

  it("sans point relevé : « rien à signaler » se confirme d'un clic", async () => {
    renderPage("/admin/banc-relecture?jour=2026-10-15&r=rel-2");
    expect(await screen.findByText(/L’agent n’a rien relevé|The agent flagged nothing/)).toBeInTheDocument();
    expect(screen.getByText(/Pas de message|No message: nothing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /rien à signaler|nothing to flag/i }));
    await waitFor(() =>
      expect(enregistrerAvisRelecture).toHaveBeenCalledWith(
        expect.objectContaining({ relecture_id: "rel-2", cle: "aucun", code: "aucun", verdict: "juste" }),
      ),
    );
  });

  it("un post que l'agent n'a pas relu montre pourquoi, sans rien à juger", async () => {
    renderPage("/admin/banc-relecture?jour=2026-10-15&r=rel-3");
    expect(await screen.findByText(/publié en vidéo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Juste|Correct)$/ })).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /Posts relus par l’agent|Posts reviewed by the agent/ });
    expect(within(nav).getAllByRole("button")).toHaveLength(3);
  });
});
