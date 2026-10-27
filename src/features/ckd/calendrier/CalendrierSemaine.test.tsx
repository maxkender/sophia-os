import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { LigneCalendrier } from "./api";

const calendrierApi = vi.hoisted(() => ({ lireCalendrier: vi.fn() }));
vi.mock("./api", () => calendrierApi);
vi.mock("@/features/ckd/cohorte/api", () => ({ lireCohorte: vi.fn(async () => []) }));
vi.mock("@/features/moteur/etapesApi", () => ({ lireEtapesComptes: vi.fn(async () => new Map()) }));
vi.mock("@/features/paie/api", () => ({
  nomsHms: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id === "hm-b" ? "Béa" : `Nom ${id}`]))),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "head_of_ops", user: { id: "u" } }) }));
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  aujourdhuiParis: () => "2026-10-28",
}));

import { CalendrierSemaine } from "./CalendrierSemaine";

const DIAG_OK = {
  badge: "ok" as const,
  attendus: 4,
  publies: 4,
  liens_manquants: [],
  mediane: 800,
  mediane_ref: 600,
  morts: 0,
  seuil_mort: 50,
  shadowban: false,
};

function ligne(o: Partial<LigneCalendrier>): LigneCalendrier {
  return {
    compte_id: "c",
    poster_id: "p",
    hm_id: "hm-a",
    handle: "h",
    pays: "FR",
    langue: "fr",
    is_active: true,
    warmup_lance: true,
    seuil_mort: 50,
    mediane_pays: 600,
    posts: [],
    diagnostic: DIAG_OK,
    ...o,
  };
}

const p = (jour: string, rang: number, url: string | null, vues: number | null = null) => ({
  jour,
  rang,
  url,
  vues,
  publie_at: null,
  mesure: vues !== null,
});

function rendu(hm = "") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CalendrierSemaine hm={hm} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("CalendrierSemaine", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    calendrierApi.lireCalendrier.mockResolvedValue([
      ligne({
        compte_id: "bon",
        poster_id: "anna",
        handle: "anna.ok",
        posts: [p("2026-10-26", 1, "https://t/1", 900), p("2026-10-26", 2, "https://t/2", 700)],
      }),
      ligne({
        compte_id: "rate",
        poster_id: "bruno",
        handle: "bruno.rate",
        hm_id: "hm-b",
        pays: "DE",
        posts: [p("2026-10-27", 1, null), p("2026-10-27", 2, null)],
        diagnostic: { ...DIAG_OK, badge: "posts_manquants", publies: 0, attendus: 2, liens_manquants: ["2026-10-27", "2026-10-27"] },
      }),
    ]);
  });

  it("une case rouge ouvre le diagnostic en 3 lignes et l'action à faire", async () => {
    rendu();
    const ligneBruno = (await screen.findByText("Nom bruno")).closest("tr")!;
    const rouge = ligneBruno.querySelector('[data-etat="rate"]') as HTMLElement;
    expect(rouge).toBeTruthy();
    fireEvent.click(rouge);
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByTestId("diagnostic-compte")).toBeTruthy();
    expect(within(dialogue).getByText(/Posts : 0 publiés sur 2 attendus/)).toBeTruthy();
    expect(within(dialogue).getByText(/publier chaque post prévu/)).toBeTruthy();
  });

  it("une case verte : posts du jour avec vues et lien, sans diagnostic", async () => {
    rendu();
    const ligneAnna = (await screen.findByText("Nom anna")).closest("tr")!;
    fireEvent.click(ligneAnna.querySelector('[data-etat="ok"]') as HTMLElement);
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByText("900 vues")).toBeTruthy();
    expect(within(dialogue).getAllByRole("link", { name: /Ouvrir le post/ })[0]!.getAttribute("href")).toBe("https://t/1");
    expect(within(dialogue).queryByTestId("diagnostic-compte")).toBeNull();
  });

  it("Problèmes seulement, pays et HM filtrent les lignes", async () => {
    rendu();
    await screen.findByText("Nom anna");
    fireEvent.click(screen.getByRole("checkbox", { name: "Problèmes seulement" }));
    expect(screen.queryByText("Nom anna")).toBeNull();
    expect(screen.getByText("Nom bruno")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Problèmes seulement" }));
    fireEvent.change(screen.getByLabelText("Pays"), { target: { value: "DE" } });
    expect(screen.queryByText("Nom anna")).toBeNull();
    expect(screen.getByText("Nom bruno")).toBeTruthy();
  });

  it("la HM choisie par l'admin ou le Head of Ops", async () => {
    rendu("hm-a");
    expect(await screen.findByText("Nom anna")).toBeTruthy();
    expect(screen.queryByText("Nom bruno")).toBeNull();
  });

  it("le choix de semaine : cette semaine et la semaine dernière seulement", async () => {
    rendu();
    await screen.findByText("Nom anna");
    const options = within(screen.getByLabelText("Semaine")).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(["2026-10-26", "2026-10-19"]);
    fireEvent.change(screen.getByLabelText("Semaine"), { target: { value: "2026-10-19" } });
    expect(calendrierApi.lireCalendrier).toHaveBeenLastCalledWith("2026-10-19");
  });
});
