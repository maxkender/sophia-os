import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireCheckWarmup: vi.fn(),
  deciderWarmup: vi.fn(async () => ({ canal: "slack" })),
}));
vi.mock("./checkWarmup", async (orig) => ({ ...(await orig<typeof import("./checkWarmup")>()), ...api }));
vi.mock("@/features/upwork/conversation", async (orig) => ({
  ...(await orig<typeof import("@/features/upwork/conversation")>()),
  useConversations: () => ({ data: undefined }),
}));

import { CheckWarmup } from "./CheckWarmup";
import { lienTiktok, prochainLundi } from "./checkWarmup";

const ligne = (o: Record<string, unknown>) => ({
  poster_id: "p1", nom: "Ana Silva", hm_nom: "Lucia D", slack: true, contrat_id: "44700001", compte_id: "c1", handle: "ana.livros12", pays: "PT",
  warmup_started_at: "2026-10-29T10:00:00Z", releve_at: "2026-11-01T08:00:00Z", existe: true, abonnements: 2, videos: 0, erreur_releve: null,
  releves: [{ at: "2026-11-01T08:00:00Z", existe: true, abonnements: 2, videos: 0, erreur: null }],
  risques: ["moins_5"], groupe: "risque", decision: null, decide_at: null, message_statut: null, message_erreur: null, ...o,
});

describe("0474 : le check du warm-up du dimanche soir", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("le lundi qui vient ; le lien du profil TikTok", () => {
    expect(prochainLundi("2026-11-01")).toBe("2026-11-02");
    expect(prochainLundi("2026-10-30")).toBe("2026-11-02");
    expect(prochainLundi("2026-11-02")).toBe("2026-11-02");
    expect(lienTiktok("@ana.livros12")).toBe("https://www.tiktok.com/@ana.livros12");
    expect(lienTiktok(null)).toBeNull();
  });

  it("à risque en haut avec ses relevés ; OK : rien ne part ; Not warmed up : après confirmation", async () => {
    api.lireCheckWarmup.mockResolvedValue([
      ligne({}),
      ligne({ poster_id: "p2", nom: "Bruno Lima", risques: [], groupe: "ok", abonnements: 9 }),
      ligne({ poster_id: "p3", nom: "Carla Dias", compte_id: null, handle: null, warmup_started_at: null, risques: [], groupe: "report", releves: [] }),
    ]);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CheckWarmup />
      </QueryClientProvider>,
    );
    const ligneAna = (await screen.findByText("Ana Silva")).closest("tr") as HTMLElement;
    expect(within(ligneAna).getByTestId("lien-tiktok").getAttribute("href")).toBe("https://www.tiktok.com/@ana.livros12");
    expect(within(ligneAna).getByText("Under 5 follows")).toBeTruthy();
    expect(within(ligneAna).getByText(/2 follows · 0 posts/)).toBeTruthy();
    expect(screen.getByTestId("compteur-warmup").textContent).toBe("1 at risk · 0 unreadable · 1 look OK · 1 postponed · 0 decided");
    fireEvent.click(within(ligneAna).getByRole("button", { name: "Not warmed up" }));
    expect(confirmer).toHaveBeenCalled();
    await vi.waitFor(() => expect(api.deciderWarmup).toHaveBeenCalledWith("p1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "pas_chaud"));
    // Report : pas de bouton, « postponed one week ».
    const ligneCarla = screen.getByText("Carla Dias").closest("tr") as HTMLElement;
    expect(within(ligneCarla).queryByRole("button")).toBeNull();
  });
});
