import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { RecrueCohorte } from "./api";

const api = vi.hoisted(() => ({
  lireCohortes: vi.fn(),
  lireRecrues: vi.fn(),
  reporterRecrue: vi.fn(),
  arreterRecrue: vi.fn(),
}));
vi.mock("./api", () => api);

import { MesRecrues, PageCohortes } from "./PageCohortes";

function recrue(o: Partial<RecrueCohorte>): RecrueCohorte {
  return {
    poster_id: "p",
    nom: "—",
    pays: "BR",
    hm_id: "hm-lucia",
    hm_prenom: "Lucia",
    contrat: true,
    is_active: true,
    offre_at: "2026-10-26T10:00:00Z",
    cohorte_lundi: "2026-11-02",
    premiere_connexion_at: null,
    slack_lie: false,
    slack_lie_at: null,
    compte_id: "c",
    handle: null,
    tiktok_existe: null,
    tiktok_vu_at: null,
    abonnements: null,
    warmup_started_at: null,
    warmup_reposts_at: null,
    semaine1: [],
    samedi: [],
    nudges: [],
    prevues: [],
    rouges: [],
    ...o,
  };
}

const ANA = recrue({
  poster_id: "ana",
  nom: "Ana Silva",
  rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "2026-10-28T10:10:00Z", decision: null, decision_at: null }],
  nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T10:10:00Z", canal: "upwork", resolu_at: null, erreur: null }],
});
const BO = recrue({
  poster_id: "bo",
  nom: "Bo Lee",
  pays: "AU",
  hm_id: "hm-rana",
  hm_prenom: "Rana",
  contrat: false,
  premiere_connexion_at: "2026-10-26T12:00:00Z",
  slack_lie: true,
  slack_lie_at: "2026-10-27T09:00:00Z",
});

function rendu(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PageCohortes (prompt 17, partie B)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireCohortes.mockResolvedValue([
      { lundi: "2026-11-02", recrues: 2, rouges: 1 },
      { lundi: "2026-10-26", recrues: 0, rouges: 0 },
      { lundi: "2026-10-19", recrues: 0, rouges: 0 },
    ]);
    api.lireRecrues.mockImplementation(async (lundis: string[]) => (lundis.includes("2026-11-02") ? [ANA, BO] : []));
    api.reporterRecrue.mockResolvedValue("2026-11-09");
    api.arreterRecrue.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("par défaut : la cohorte en préparation et celle en semaine 1, l'entonnoir et une ligne par recrue", async () => {
    rendu(<PageCohortes />);
    const puces = await screen.findByRole("group", { name: "Cohortes affichées" });
    await within(puces).findByRole("button", { name: /2 nov/ });
    expect(within(puces).getByRole("button", { name: /2 nov\.? · 2 recrues · en préparation/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(puces).getByRole("button", { name: /26 oct\.? · 0 recrues · semaine 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(puces).getByRole("button", { name: /19 oct\.?/ })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(api.lireRecrues).toHaveBeenCalledWith(["2026-11-02", "2026-10-26"]));

    const tableau = await screen.findByTestId("tableau-recrues");
    const ana = await within(tableau).findByText("Ana Silva");
    const ligneAna = ana.closest("tr")!;
    expect(ligneAna).toHaveAttribute("data-rouge", "true");
    expect(within(ligneAna).getByText(/Rouge depuis le 28 oct/)).toBeInTheDocument();
    const ligneBo = within(tableau).getByText("Bo Lee").closest("tr")!;
    expect(within(ligneBo).getByText(/Fait le 27 oct/)).toBeInTheDocument();
    expect(within(ligneBo).getByLabelText("Contrat Upwork non relié")).toBeInTheDocument();
    // Les boutons seulement sur une ligne rouge.
    expect(within(ligneBo).queryByRole("button", { name: "Reporter" })).toBeNull();

    const entonnoir = within(screen.getByTestId("entonnoir")).getAllByRole("row")[1]!;
    expect(within(entonnoir).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      expect.stringMatching(/2 nov/),
      "2", // offre acceptée
      "1", // accès
      "0",
      "0",
      "0",
      "0",
      "0",
    ]);
  });

  it("filtres : rouges seulement, HM, pays", async () => {
    rendu(<PageCohortes />);
    await screen.findByText("Ana Silva");
    fireEvent.click(screen.getByLabelText("Rouges seulement"));
    expect(screen.queryByText("Bo Lee")).toBeNull();
    fireEvent.click(screen.getByLabelText("Rouges seulement"));
    fireEvent.change(screen.getByLabelText("HM"), { target: { value: "hm-rana" } });
    expect(screen.queryByText("Ana Silva")).toBeNull();
    expect(screen.getByText("Bo Lee")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("HM"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Pays"), { target: { value: "BR" } });
    expect(screen.queryByText("Bo Lee")).toBeNull();
  });

  it("Reporter : confirmation avec la nouvelle date ; refusée, rien ne part", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendu(<PageCohortes />);
    const ligne = (await screen.findByText("Ana Silva")).closest("tr")!;
    fireEvent.click(within(ligne).getByRole("button", { name: "Reporter" }));
    expect(confirmer).toHaveBeenLastCalledWith(expect.stringMatching(/Reporter Ana Silva à la cohorte du 9 nov/));
    expect(api.reporterRecrue).not.toHaveBeenCalled();
    fireEvent.click(within(ligne).getByRole("button", { name: "Reporter" }));
    await waitFor(() => expect(api.reporterRecrue).toHaveBeenCalledWith("ana"));
    confirmer.mockRestore();
  });

  it("Arrêter : confirmation qui annonce « End the contract » dans la paie de lundi", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu(<PageCohortes />);
    const ligne = (await screen.findByText("Ana Silva")).closest("tr")!;
    fireEvent.click(within(ligne).getByRole("button", { name: "Arrêter" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("End the contract"));
    await waitFor(() => expect(api.arreterRecrue).toHaveBeenCalledWith("ana"));
    confirmer.mockRestore();
  });
});

describe("MesRecrues (accueil HM, lecture seule)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireCohortes.mockResolvedValue([{ lundi: "2026-11-02", recrues: 2, rouges: 1 }]);
    api.lireRecrues.mockResolvedValue([ANA, BO]);
  });
  afterEach(() => vi.useRealTimers());

  it("une HM : ses recrues seulement, sans bouton, même sur un rouge", async () => {
    rendu(<MesRecrues hm="hm-lucia" />);
    const bloc = await screen.findByTestId("mes-recrues");
    expect(await within(bloc).findByText("Ana Silva")).toBeInTheDocument();
    expect(within(bloc).queryByText("Bo Lee")).toBeNull();
    expect(within(bloc).getByText(/Rouge depuis/)).toBeInTheDocument();
    expect(within(bloc).queryByRole("button", { name: "Reporter" })).toBeNull();
    expect(within(bloc).queryByRole("button", { name: "Arrêter" })).toBeNull();
  });
});
