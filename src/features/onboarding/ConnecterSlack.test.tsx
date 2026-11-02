/** Prompt 25 MAJ, 7a : « Connect my Slack » et la page de liaison (lien du DM). */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  monSlackRelie: vi.fn<() => Promise<boolean>>(),
  lierParJeton: vi.fn(),
  finirConnexionSlack: vi.fn(),
  urlConnecterSlack: vi.fn(),
  lienDmSlackActif: vi.fn<() => Promise<boolean>>(),
}));
vi.mock("./cinqEtapesApi", () => ({ declarerEtape: vi.fn(async () => "en_attente") }));
vi.mock("./slackApi", () => api);
vi.mock("@/features/onboarding/slackApi", () => api);

import { ConnecterSlack } from "./ConnecterSlack";
import { PosterLierSlackPage } from "@/pages/poster/PosterLierSlackPage";

function rendu(el: React.ReactElement, url = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={el} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Connect my Slack", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("slack_lien_dm_auto off : nom complet + email perso, « I've joined », aucun bot ni lien de DM", async () => {
    api.monSlackRelie.mockResolvedValue(false);
    api.lienDmSlackActif.mockResolvedValue(false);
    rendu(<ConnecterSlack />);
    const bloc = await screen.findByTestId("connecter-slack");
    expect(bloc.textContent).toContain("Join our Slack with your FULL NAME and your personal email. We link your account automatically within the hour.");
    expect(screen.getByRole("button", { name: "I've joined" })).toBeInTheDocument();
    expect(bloc.textContent).not.toMatch(/bot/i);
    expect(screen.queryByRole("button", { name: "Connect my Slack" })).toBeNull();
  });

  it("les 5 étapes affichées : rien en double", async () => {
    api.monSlackRelie.mockResolvedValue(false);
    api.lienDmSlackActif.mockResolvedValue(false);
    rendu(<ConnecterSlack masquer />);
    await vi.waitFor(() => expect(api.monSlackRelie).toHaveBeenCalled());
    expect(screen.queryByTestId("connecter-slack")).toBeNull();
  });

  it("pas relié, DM de liaison sur on : le bouton ; relié : rien", async () => {
    api.monSlackRelie.mockResolvedValue(false);
    api.lienDmSlackActif.mockResolvedValue(true);
    rendu(<ConnecterSlack />);
    expect(await screen.findByRole("button", { name: "Connect my Slack" })).toBeInTheDocument();
  });

  it("relié : rien", async () => {
    api.monSlackRelie.mockResolvedValue(true);
    rendu(<ConnecterSlack />);
    await vi.waitFor(() => expect(api.monSlackRelie).toHaveBeenCalled());
    expect(screen.queryByTestId("connecter-slack")).toBeNull();
  });

  it("le lien du DM relie le compte ; un lien déjà pris le dit", async () => {
    api.lierParJeton.mockResolvedValue({ ok: true, statut: "lie" });
    rendu(<PosterLierSlackPage />, "/lier-slack?t=abc");
    expect(await screen.findByRole("status")).toHaveTextContent("✓ Your Slack account is linked.");
    expect(api.lierParJeton).toHaveBeenCalledWith("abc");
  });

  it("Slack déjà relié à un autre profil", async () => {
    api.lierParJeton.mockResolvedValue({ ok: false, error: "pris" });
    rendu(<PosterLierSlackPage />, "/lier-slack?t=abc");
    expect(await screen.findByRole("status")).toHaveTextContent("already linked to another profile");
  });
});
