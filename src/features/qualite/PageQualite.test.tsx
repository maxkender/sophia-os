import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireQc: vi.fn(),
  preparerQc: vi.fn(async () => ({ tires: 0, traduits: 0, restants: 0, erreurs: [] })),
  signalerQc: vi.fn(async () => undefined),
  lireSignalementsQc: vi.fn(async () => []),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { parLabel, type PostQc } from "./api";
import { PageQualite } from "./PageQualite";

const post = (o: Partial<PostQc>): PostQc => ({
  id: "e1", jour: "2026-10-30", label_nom: "smart_girl", passage_id: "p1", langue: "fr", compte_handle: "ana.livres",
  publie_url: "https://www.tiktok.com/@ana.livres/photo/1",
  textes_orig: [{ position: "1", texte: "Bonjour", appli: false }, { position: "2", texte: "Télécharge Sophia", appli: true }],
  textes_en: ["Hello", "Download Sophia"], traduit_at: "2026-10-31T05:00:00Z", erreur: null, signalements: [], ...o,
});

describe("Quality Control (31/10)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("regroupe par label", () => {
    const g = parLabel([post({}), post({ id: "e2", label_nom: "RH" }), post({ id: "e3" })]);
    expect(g.map(([l, x]) => [l, x.length])).toEqual([["RH", 1], ["smart_girl", 2]]);
  });

  it("texte en anglais, slide appli marquée, signalement envoyé avec le motif", async () => {
    api.lireQc.mockResolvedValue([post({})]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PageQualite />
      </QueryClientProvider>,
    );
    const carte = (await screen.findByText("Hello")).closest("[data-post-qc]") as HTMLElement;
    expect(within(carte).getByText("Download Sophia")).toBeTruthy();
    expect(within(carte).getByText("App slide")).toBeTruthy();
    // Tout est déjà traduit : rien n'est relancé tout seul.
    expect(api.preparerQc).not.toHaveBeenCalled();
    fireEvent.click(within(carte).getByRole("button", { name: "Report a problem on post" }));
    fireEvent.change(within(carte).getByLabelText("Problem"), { target: { value: "bad_translation" } });
    fireEvent.change(within(carte).getByLabelText("What's wrong? (optional)"), { target: { value: "slide 2" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Report" }));
    await vi.waitFor(() => expect(api.signalerQc).toHaveBeenCalledWith("e1", "bad_translation", "slide 2"));
  });

  it("rien de tiré pour le jour : la page lance le tirage", async () => {
    api.lireQc.mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PageQualite />
      </QueryClientProvider>,
    );
    await vi.waitFor(() => expect(api.preparerQc).toHaveBeenCalledTimes(1));
  });
});
