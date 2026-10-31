import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireCheckWarmup: vi.fn(),
  choisirDebut: vi.fn(async () => ({ canal: "slack", statut: "pas_envoye" })),
  lireChoixDebut: vi.fn(async () => new Map()),
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

  it("1/11 : Keep / Start Tuesday / Postpone ; pas prête : Start Tuesday prévu ; le récap", async () => {
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
    expect(screen.getByTestId("recap-debut").textContent).toBe("Not ready: Keep 0 · Start Tuesday 2 · Postpone 0");
    // Pas prête : Start Tuesday prévu (22:45), pas encore choisi.
    expect(within(ligneAna).getByTestId("choix-etat").textContent).toContain("Start Tuesday automatically at 22:45");
    fireEvent.click(within(ligneAna).getByRole("button", { name: "Start Tuesday" }));
    expect(confirmer).toHaveBeenCalled();
    await vi.waitFor(() => expect(api.choisirDebut).toHaveBeenCalledWith("p1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "mardi"));
    // Sans compte : les 3 choix aussi ; Postpone après confirmation.
    const ligneCarla = screen.getByText("Carla Dias").closest("tr") as HTMLElement;
    fireEvent.click(within(ligneCarla).getByRole("button", { name: "Postpone" }));
    await vi.waitFor(() => expect(api.choisirDebut).toHaveBeenCalledWith("p3", expect.any(String), "reporter"));
    // Prête : Keep, sans confirmation.
    const ligneBruno = screen.getByText("Bruno Lima").closest("tr") as HTMLElement;
    expect(within(ligneBruno).getByTestId("choix-etat").textContent).toBe("Ready: starts Monday");
  });
});
