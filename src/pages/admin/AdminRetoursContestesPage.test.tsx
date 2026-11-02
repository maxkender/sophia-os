import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerReviewsContestees = vi.fn();
const listerPosters = vi.fn();
const relectureDuRetour = vi.fn();
const listerAvisRelecture = vi.fn();
const enregistrerAvisRelecture = vi.fn();
const supprimerAvisRelecture = vi.fn();
const trancherContestation = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  listerReviewsContestees: () => listerReviewsContestees(),
  listerPosters: () => listerPosters(),
  relectureDuRetour: (id: string) => relectureDuRetour(id),
  listerAvisRelecture: (ids: string[]) => listerAvisRelecture(ids),
  enregistrerAvisRelecture: (a: unknown) => enregistrerAvisRelecture(a),
  supprimerAvisRelecture: (id: string) => supprimerAvisRelecture(id),
  trancherContestation: (id: string, v: string, r: string) => trancherContestation(id, v, r),
  ameliorerReview: (texte: string) => Promise.resolve({ texte: `EN: ${texte}` }),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { AdminRetoursContestesPage } from "./AdminRetoursContestesPage";

const base = {
  note: null,
  created_at: "2026-10-18T03:00:00Z",
  seen_at: "2026-10-18T09:00:00Z",
  post_id: "post-1",
  publie_url: "https://www.tiktok.com/@maya/photo/7000000000000000001",
  source_url: "https://www.tiktok.com/@src/photo/7000000000000000002",
  handle_tiktok: "maya",
  date_publication: "2026-10-17",
  videos: [],
  remarques: [],
  contestation_traitee_at: null,
  contestation_reponse: null,
};

const AGENT = {
  ...base,
  id: "rev-agent",
  poster_id: "p-maya",
  compte_label: "@maya",
  origine: "agent" as const,
  body: "On some of your slides, the text is yellow while the original is white.",
  contestee_at: "2026-10-18T09:05:00Z",
  contestation: "My text is white, not yellow!",
  contestation_verdict: null,
};

const ADMIN_TRAITE = {
  ...base,
  id: "rev-admin",
  poster_id: "p-leo",
  compte_label: "@leo",
  origine: "admin" as const,
  body: "Please use the sound provided.",
  contestee_at: "2026-10-17T09:05:00Z",
  contestation: null,
  contestation_verdict: "non_fondee" as const,
  contestation_traitee_at: "2026-10-17T12:00:00Z",
};

function renderPage(url = "/admin/retours-contestes") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AdminRetoursContestesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminRetoursContestesPage", () => {
  beforeEach(() => {
    listerReviewsContestees.mockReset().mockResolvedValue([AGENT, ADMIN_TRAITE]);
    listerPosters.mockReset().mockResolvedValue([
      { id: "p-maya", prenom: "Maya", nom: "K", email: "maya@x.io" },
      { id: "p-leo", prenom: "Léo", nom: null, email: "leo@x.io" },
    ]);
    relectureDuRetour.mockReset().mockResolvedValue({
      id: "rel-1",
      jour: "2026-10-17",
      post_id: "post-1",
      statut: "fait",
      defauts: [
        { code: "couleur", niveau: "remarque", slides: [2, 3], detail: "texte jaune au lieu de blanc" },
        { code: "gras", niveau: "info", slides: [2], detail: "gras perdu" },
      ],
      brouillon: null,
      remarques: [],
      erreur: null,
      vues: 900,
    });
    listerAvisRelecture.mockReset().mockResolvedValue([]);
    enregistrerAvisRelecture.mockReset().mockImplementation(async (a: Record<string, unknown>) => ({ id: "avis-1", ...a }));
    supprimerAvisRelecture.mockReset().mockResolvedValue(undefined);
    trancherContestation.mockReset().mockResolvedValue(undefined);
  });

  it("montre le retour contesté : le mot du créateur, les deux TikToks, le message reçu", async () => {
    renderPage();
    expect(await screen.findByText("My text is white, not yellow!")).toBeInTheDocument();
    expect(screen.getByText(AGENT.body)).toBeInTheDocument();
    expect(screen.getAllByTitle(/^(Original|Son post|Their post)$/)).toHaveLength(2);
    // À vérifier par défaut : seul le retour de l'agent est dans la liste.
    const liste = screen.getByRole("navigation", { name: /Retours contestés|Disputed feedback/ });
    expect(within(liste).getAllByRole("button")).toHaveLength(1);
    expect(within(liste).getByText("Maya K")).toBeInTheDocument();
  });

  it("juge un point de l'agent, comme sur le banc d'essai", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^(Faux|Wrong)$/ }));
    await waitFor(() =>
      expect(enregistrerAvisRelecture).toHaveBeenCalledWith(
        expect.objectContaining({
          relecture_id: "rel-1",
          cle: "couleur|2,3",
          code: "couleur",
          verdict: "faux",
          commentaire: "My text is white, not yellow!",
        }),
      ),
    );
    // Les infos admin (gras) ne sont pas dans le message : rien à juger.
    expect(screen.getAllByRole("button", { name: /^(Faux|Wrong)$/ })).toHaveLength(1);
  });

  it("tranche avec une réponse au créateur", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: /Réponse au créateur|Answer to the creator/ }), {
      target: { value: "You were right, sorry!" },
    });
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: /Le créateur a raison|The creator is right/ }));
    // Prompt 15, point 1 : le texte anglais final est montré ; refusé, rien ne part.
    await waitFor(() => expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("EN: You were right, sorry!")));
    expect(trancherContestation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Le créateur a raison|The creator is right/ }));
    await waitFor(() =>
      expect(trancherContestation).toHaveBeenCalledWith("rev-agent", "fondee", "EN: EN: You were right, sorry!"),
    );
    confirmer.mockRestore();
  });

  it("les traités gardent leur décision", async () => {
    renderPage("/admin/retours-contestes?f=traites");
    expect(await screen.findByText(/Le retour était juste, le|The feedback was correct, on/)).toBeInTheDocument();
    expect(screen.getByText(/Pas de commentaire|No comment/)).toBeInTheDocument();
    expect(relectureDuRetour).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Changer la décision|Change the decision/ })).toBeInTheDocument();
  });
});
