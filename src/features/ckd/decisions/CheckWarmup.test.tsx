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
const ctxApi = vi.hoisted(() => ({
  lireContexteDimanche: vi.fn(async () => new Map()),
  tuerRecrue: vi.fn(async () => undefined),
  lancerArrets: vi.fn(async () => undefined),
  verifierALaMain: vi.fn(async () => undefined),
}));
vi.mock("./dimancheContexte", async (orig) => ({ ...(await orig<typeof import("./dimancheContexte")>()), ...ctxApi }));
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

  it("0496 : 4 choix, rien avant Validate ; STOP en premier avec Kill pré-coché et sa raison ; récap ; à vérifier", async () => {
    api.lireCheckWarmup.mockResolvedValue([
      ligne({}),
      ligne({ poster_id: "p2", nom: "Bruno Lima", risques: [], groupe: "ok", abonnements: 9 }),
      ligne({ poster_id: "p3", nom: "Carla Dias", compte_id: null, handle: null, warmup_started_at: null, risques: [], groupe: "report", releves: [] }),
      ligne({ poster_id: "p4", nom: "Dana Stop", risques: ["illisible"], groupe: "illisible" }),
    ]);
    const ctx = (o: Record<string, unknown>) => ({
      offre_acceptee_le: "2026-10-28T10:00:00Z", contrat_id: "44700001", actif: true, welcome: { at: "2026-10-31T08:41:00Z", statut: "envoye", par: "os" },
      connecte_at: "2026-10-31T09:00:00Z", slack: true, handle: "ana.livros12", start_warmup: "2026-10-29T10:00:00Z", abonnements: 2, videos: 0,
      relances: { n: 2, derniere_at: "2026-10-31T10:00:00Z", canal: "slack" }, recu: null, envoye: null,
      jalon: { nom: "Week 45", depot: "$15.00", etat: "Active" }, retrait: null, verif_main: null, kill: null,
      lectures: [{ at: "2026-11-01T08:00:00Z", methode: "page", existe: true, abonnements: 2, videos: 0, brut: null, handle: "ana.livros12" }], ...o,
    });
    ctxApi.lireContexteDimanche.mockResolvedValue(new Map([
      ["p1", { poster_id: "p1", statut: "risque", ctx: ctx({}) }],
      ["p2", { poster_id: "p2", statut: "ok", ctx: ctx({ abonnements: 9 }) }],
      ["p3", { poster_id: "p3", statut: "report", ctx: ctx({ start_warmup: null }) }],
      ["p4", { poster_id: "p4", statut: "a_verifier", ctx: ctx({ retrait: { source: "message", texte: "STOP", at: "2026-10-31T14:18:00Z" } }) }],
    ]) as never);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CheckWarmup />
      </QueryClientProvider>,
    );
    await screen.findByText("Dana Stop");
    await vi.waitFor(() => expect(document.querySelectorAll("tr[data-warmup]")[0]?.getAttribute("data-warmup")).toBe("p4"));
    // STOP en premier, Kill pré-coché avec la raison STOP, « à vérifier » (pas at risk).
    const ligneDana = document.querySelector('tr[data-warmup="p4"]') as HTMLElement;
    expect(within(ligneDana).getByTestId("retrait").textContent).toContain("STOP");
    expect(within(ligneDana).getByRole("button", { name: "Kill" }).getAttribute("aria-pressed")).toBe("true");
    expect((within(ligneDana).getByLabelText("Kill reason") as HTMLSelectElement).value).toBe("stop");
    expect(within(ligneDana).getByTestId("statut").textContent).toBe("To check");
    // Le contexte et la méthode de lecture.
    const ligneAna = screen.getByText("Ana Silva").closest("tr") as HTMLElement;
    expect(within(ligneAna).getByTestId("contexte").textContent).toContain("Milestone: Week 45 · $15.00 · Active");
    expect(within(ligneAna).getByTestId("lectures").textContent).toContain("page");
    // Un clic ne fait rien avant Validate.
    fireEvent.click(within(ligneAna).getByRole("button", { name: "Postpone" }));
    expect(api.choisirDebut).not.toHaveBeenCalled();
    expect(screen.getByTestId("recap-debut").textContent).toBe("Keep 1 · Start Tuesday 1 · Postpone 1 · Kill 1");
    fireEvent.click(screen.getByRole("button", { name: /^Validate/ }));
    expect(confirmer).toHaveBeenCalled();
    await vi.waitFor(() => expect(ctxApi.tuerRecrue).toHaveBeenCalledWith("p4", expect.any(String), "stop", "STOP"));
    expect(api.choisirDebut).toHaveBeenCalledWith("p1", expect.any(String), "reporter");
    expect(ctxApi.lancerArrets).toHaveBeenCalled();
    // Les choix prévus non touchés ne sont pas appliqués (Bruno : Keep prévu ; Carla : Start Tuesday prévu).
    expect(api.choisirDebut).not.toHaveBeenCalledWith("p2", expect.any(String), expect.any(String));
    expect(api.choisirDebut).not.toHaveBeenCalledWith("p3", expect.any(String), expect.any(String));
  });

  it("0496 : Kill sans raison : Validate bloqué", async () => {
    api.lireCheckWarmup.mockResolvedValue([ligne({})]);
    ctxApi.lireContexteDimanche.mockResolvedValue(new Map());
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CheckWarmup />
      </QueryClientProvider>,
    );
    const ligneAna = (await screen.findByText("Ana Silva")).closest("tr") as HTMLElement;
    fireEvent.click(within(ligneAna).getByRole("button", { name: "Kill" }));
    expect((screen.getByRole("button", { name: /^Validate/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(ligneAna).getByLabelText("Kill reason"), { target: { value: "rien_fait" } });
    expect((screen.getByRole("button", { name: /^Validate/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
