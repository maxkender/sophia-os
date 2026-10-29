import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { EnvoiMain } from "./api";

const api = vi.hoisted(() => ({
  lireEnvoisMain: vi.fn<() => Promise<EnvoiMain[]>>(async () => []),
  marquerEnvoye: vi.fn<(m: Pick<EnvoiMain, "poster_id" | "type" | "periode">) => Promise<void>>(async () => undefined),
}));
vi.mock("./api", () => api);

import { EnvoisMain } from "./EnvoisMain";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

const envoi = (o: Partial<EnvoiMain>): EnvoiMain => ({
  poster_id: "p1", type: "accueil", periode: "2026-10-30", nom: "Aysel K", hm_id: "h1", hm_nom: "Amanda C", contrat_id: "44790000",
  salon_url: "https://www.upwork.com/nx/wm/workroom/44790000/overview", texte: "Hi Aysel, welcome to Vik Studios!", priorite: 0,
  main_at: "2026-10-30T09:00:00Z", en_retard: false, ...o,
});

describe("To send by hand (prompt 25 v4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("rien quand la liste est vide (My cohort)", async () => {
    rendu(<EnvoisMain />);
    await waitFor(() => expect(api.lireEnvoisMain).toHaveBeenCalled());
    expect(screen.queryByTestId("envois-main")).toBeNull();
  });

  it("le lien du contrat, le texte exact, Copy et Sent ; plus de 6 h signalé", async () => {
    const ecrire = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText: ecrire } });
    api.lireEnvoisMain.mockResolvedValue([envoi({}), envoi({ poster_id: "p2", type: "relance", nom: "Bo Li", texte: "Hi Bo", en_retard: true })]);
    rendu(<EnvoisMain avecHm />);
    const carte = await screen.findByTestId("envois-main");
    expect(within(carte).getByText("To send by hand (2)")).toBeTruthy();
    const ligne = carte.querySelector<HTMLElement>('[data-envoi-main="p1|accueil|2026-10-30"]')!;
    expect(within(ligne).getByText("Welcome")).toBeTruthy();
    expect(within(ligne).getByText("HM: Amanda C")).toBeTruthy();
    expect(within(ligne).getByRole("link", { name: "Open the contract room" }).getAttribute("href")).toContain("44790000");
    fireEvent.click(within(ligne).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(ecrire).toHaveBeenCalledWith("Hi Aysel, welcome to Vik Studios!"));
    expect(await within(ligne).findByRole("button", { name: "Copied" })).toBeTruthy();
    fireEvent.click(within(ligne).getByRole("button", { name: "Sent" }));
    await waitFor(() => expect(api.marquerEnvoye).toHaveBeenCalledWith(expect.objectContaining({ poster_id: "p1", type: "accueil", periode: "2026-10-30" })));
    expect(within(carte.querySelector<HTMLElement>('[data-envoi-main="p2|relance|2026-10-30"]')!).getByText("Over 6 h")).toBeTruthy();
  });
});
