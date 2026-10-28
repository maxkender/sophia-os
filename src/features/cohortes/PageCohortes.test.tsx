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
  relierContrat: vi.fn(),
  lireKillsAuto: vi.fn(async () => [] as unknown[]),
  annulerKill: vi.fn(async () => undefined),
  lireArrets: vi.fn(async () => [] as unknown[]),
  marquerActionArret: vi.fn(async () => undefined),
}));
vi.mock("./api", () => api);
vi.mock("@/features/interrupteurs/api", () => ({
  lireInterrupteurs: vi.fn(async () => ({ accueil_auto: "test", relances_auto: "test", kill_auto: "on", arret_auto: "test" })),
}));
const auth = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
const relances = vi.hoisted(() => ({ lireReglagesRelances: vi.fn() }));
vi.mock("@/features/nudges/api", () => relances);

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
    contrat_id: "44707021",
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
  contrat_id: null,
  premiere_connexion_at: "2026-10-26T12:00:00Z",
  handle: "bo.tt",
});
const CY = recrue({
  poster_id: "cy",
  nom: "Cy Moss",
  premiere_connexion_at: "2026-10-26T12:00:00Z",
  tiktok_existe: true,
  tiktok_vu_at: "2026-10-27T08:00:00Z",
  warmup_started_at: "2026-10-27T10:00:00Z",
  abonnements: 2,
  prevues: [{ type: "warmup", periode: "2026-11-02", statut: "prevu", canal: "slack", raison: "simulation" }],
});

function rendu(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const MERCREDI = new Date("2026-10-28T12:00:00Z");

describe("Cohorts, plus lisible (28 oct., partie B)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireCohortes.mockResolvedValue([
      { lundi: "2026-11-02", recrues: 3, rouges: 1 },
      { lundi: "2026-10-26", recrues: 1, rouges: 0 },
    ]);
    api.lireRecrues.mockImplementation(async (lundis: string[]) =>
      lundis.includes("2026-11-02") ? [BO, CY, ANA] : lundis.includes("2026-10-26") ? [recrue({ poster_id: "x", nom: "Xu", cohorte_lundi: "2026-10-26" })] : [],
    );
    api.reporterRecrue.mockResolvedValue("2026-11-09");
    api.arreterRecrue.mockResolvedValue(undefined);
    api.relierContrat.mockResolvedValue("44784352");
    relances.lireReglagesRelances.mockResolvedValue({ mode: "simulation", delais: {}, textes: {}, slack: "" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("une seule cohorte par défaut, celle en préparation ; une puce = une cohorte", async () => {
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const puces = await screen.findByRole("group", { name: "Cohortes affichées" });
    await within(puces).findByRole("button", { name: /2 nov/ });
    expect(within(puces).getByRole("button", { name: /2 nov/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(puces).getByRole("button", { name: /26 oct/ })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(api.lireRecrues).toHaveBeenCalledWith(["2026-11-02"]));
    expect(api.lireRecrues).not.toHaveBeenCalledWith(["2026-11-02", "2026-10-26"]);

    fireEvent.click(within(puces).getByRole("button", { name: /26 oct/ }));
    expect(await screen.findByText("Xu")).toBeInTheDocument();
    expect(screen.queryByText("Ana Silva")).toBeNull();
    // Cohorte passée : l'entonnoir, plus la barre.
    expect(await screen.findByTestId("entonnoir")).toBeInTheDocument();
    expect(screen.queryByTestId("barre-cohorte")).toBeNull();
  });

  it("la barre compte chaque recrue une fois ; un clic filtre", async () => {
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const barre = await screen.findByTestId("barre-cohorte");
    expect(within(barre).getByRole("button", { name: /Attendent la connexion · 0/ })).toBeInTheDocument();
    expect(within(barre).getByRole("button", { name: /Attendent TikTok · 1/ })).toBeInTheDocument();
    expect(within(barre).getByRole("button", { name: /Attendent le warm-up · 1/ })).toBeInTheDocument();
    expect(within(barre).getByRole("button", { name: /Rouges · 1/ })).toBeInTheDocument();
    fireEvent.click(within(barre).getByRole("button", { name: /Attendent TikTok/ }));
    expect(screen.getByText("Bo Lee")).toBeInTheDocument();
    expect(screen.queryByText("Ana Silva")).toBeNull();
    expect(screen.queryByText("Cy Moss")).toBeNull();
  });

  it("une case = une info : ✉ quand la relance est partie, ✉ prévu en simulation, — après, Ready Monday — avant dimanche minuit", async () => {
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const tableau = await screen.findByTestId("tableau-recrues");
    await within(tableau).findByText("Ana Silva");
    // Rouges d'abord.
    const lignes = within(tableau).getAllByRole("row").slice(1);
    expect(lignes[0]).toHaveAttribute("data-recrue", "ana");
    // Ligne rouge : pourquoi, en une phrase.
    const ana = lignes[0]!;
    expect(within(ana).getByText("Relance partie le 27 oct. (Upwork) · toujours pas connecté")).toBeInTheDocument();
    // TikTok en cours, et le warm-up « — » tant que TikTok n'est pas fait.
    const bo = within(tableau).getByText("Bo Lee").closest("tr")!;
    expect(within(bo.querySelector("[data-case='acces']") as HTMLElement).getByText(/26 oct/)).toBeInTheDocument();
    expect(within(bo.querySelector("[data-case='tiktok']") as HTMLElement).getByText("@bo.tt pas encore sur TikTok")).toBeInTheDocument();
    expect((bo.querySelector("[data-case='warmup']") as HTMLElement).textContent).toBe("—");
    // Warm-up en cours : son détail, et « ✉ prévu » en simulation.
    const cy = within(tableau).getByText("Cy Moss").closest("tr")!;
    const warmup = cy.querySelector("[data-case='warmup']") as HTMLElement;
    expect(within(warmup).getByText("follows 2/5")).toBeInTheDocument();
    expect(within(warmup).getByText("✉ prévu (Slack)")).toBeInTheDocument();
    // Ready Monday : « — » avant dimanche minuit.
    for (const l of lignes) expect((l.querySelector("[data-case='pret']") as HTMLElement).textContent).toBe("—");
  });

  it("Ready Monday : ✓ ou ✗ après dimanche minuit", async () => {
    api.lireCohortes.mockResolvedValue([{ lundi: "2026-11-02", recrues: 1, rouges: 0 }]);
    api.lireRecrues.mockResolvedValue([CY]);
    rendu(<PageCohortes maintenant={new Date("2026-11-03T10:00:00Z")} />);
    const ligne = (await screen.findByText("Cy Moss")).closest("tr")!;
    expect(within(ligne.querySelector("[data-case='pret']") as HTMLElement).getByText("Pas prêt")).toBeInTheDocument();
  });

  it("contrat non relié : le compteur filtre, et « Link » enregistre le contrat", async () => {
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const compteur = await screen.findByTestId("compteur-contrats");
    expect(compteur).toHaveTextContent("1 contrat non relié : les relances ne peuvent pas l'atteindre");
    fireEvent.click(compteur);
    expect(screen.getByText("Bo Lee")).toBeInTheDocument();
    expect(screen.queryByText("Cy Moss")).toBeNull();

    const bo = screen.getByText("Bo Lee").closest("tr")!;
    fireEvent.click(within(bo).getByRole("button", { name: /Link/ }));
    fireEvent.change(within(bo).getByLabelText("Lien du contrat Upwork de Bo Lee"), {
      target: { value: "https://www.upwork.com/nx/wm/workroom/44784352/overview" },
    });
    fireEvent.click(within(bo).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.relierContrat).toHaveBeenCalledWith("bo", "https://www.upwork.com/nx/wm/workroom/44784352/overview"),
    );
  });

  it("l'état des relances : visible par l'admin seulement", async () => {
    const { unmount } = rendu(<PageCohortes maintenant={MERCREDI} />);
    expect(await screen.findByTestId("etat-relances")).toHaveTextContent("Relances : Simulation.");
    unmount();
    auth.role = "head_of_ops";
    rendu(<PageCohortes maintenant={MERCREDI} />);
    await screen.findByText("Ana Silva");
    expect(screen.queryByTestId("etat-relances")).toBeNull();
  });

  it("ligne rouge : plus de Reporter ; Arrêter pour l'admin seulement, avec confirmation", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const ligne = (await screen.findByText("Ana Silva")).closest("tr")!;
    expect(within(ligne).queryByRole("button", { name: "Reporter" })).toBeNull();
    fireEvent.click(within(ligne).getByRole("button", { name: "Arrêter" }));
    expect(confirmer).toHaveBeenLastCalledWith(expect.stringContaining("End the contract"));
    expect(api.arreterRecrue).not.toHaveBeenCalled();
    fireEvent.click(within(ligne).getByRole("button", { name: "Arrêter" }));
    await waitFor(() => expect(api.arreterRecrue).toHaveBeenCalledWith("ana"));
  });

  it("Head of Ops : pas de bouton Arrêter", async () => {
    auth.role = "head_of_ops";
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const ligne = (await screen.findByText("Ana Silva")).closest("tr")!;
    expect(within(ligne).queryByRole("button", { name: "Arrêter" })).toBeNull();
  });

  it("Kills automatiques : Annuler pendant le délai, confirmé ; parti : plus de bouton", async () => {
    const base = { poster_id: "ana", hm_prenom: "Lucia", periode: "2026-11-02", message_at: "2026-10-26T10:10:00Z", detecte_at: "2026-10-28T10:10:00Z", raison: null, annule_at: null, parti_at: null, arret_statut: null, arret_erreur: null };
    api.lireKillsAuto.mockResolvedValue([
      { ...base, id: "k1", poster_nom: "Ana Silva", etape: "connexion", prevu_at: "2026-10-28T22:10:00Z", statut: "en_attente" },
      { ...base, id: "k2", poster_nom: "Bo Lee", etape: "tiktok", prevu_at: "2026-10-27T22:10:00Z", statut: "parti", arret_statut: "erreur", arret_erreur: "Upwork : 403" },
    ]);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const bloc = await screen.findByTestId("kills-auto");
    expect(await within(bloc).findByText("Kills automatiques (1 en attente)")).toBeInTheDocument();
    const k1 = bloc.querySelector<HTMLElement>('[data-kill="k1"]')!;
    const k2 = bloc.querySelector<HTMLElement>('[data-kill="k2"]')!;
    expect(within(k2).queryByRole("button")).toBeNull();
    expect(within(k2).getByText(/Arrêt en erreur : Upwork : 403/)).toBeInTheDocument();
    fireEvent.click(within(k1).getByRole("button", { name: "Annuler" }));
    expect(confirmer).toHaveBeenLastCalledWith(expect.stringContaining("Ana Silva"));
    await waitFor(() => expect(api.annulerKill).toHaveBeenCalledWith("k1"));
  });
});

describe("Arrêts complets (partie C)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireCohortes.mockResolvedValue([]);
    api.lireRecrues.mockResolvedValue([]);
    api.lireKillsAuto.mockResolvedValue([]);
    relances.lireReglagesRelances.mockResolvedValue({ mode: "simulation", delais: {}, textes: {}, slack: "" });
  });

  it("chaque action et son état ; échec en rouge ; « À retirer de Slack » et « Fait à la main »", async () => {
    const at = "2026-10-28T10:40:00Z";
    api.lireArrets.mockResolvedValue([
      {
        id: "a1", poster_id: "ana", poster_nom: "Ana Silva", hm_prenom: "Lucia", source: "kill_48h", a_poste: false, statut: "erreur",
        erreur: "jalons : HTTP 403", created_at: at, maj_at: at,
        etapes: [
          { action: "os", statut: "fait", detail: null, at },
          { action: "message", statut: "fait", detail: null, at },
          { action: "jalons", statut: "erreur", detail: "HTTP 403", at },
          { action: "remboursement", statut: "a_faire", detail: "Ask for a refund : Week 45 ($30) (liste de paie)", at },
          { action: "fermeture", statut: "a_faire", detail: "après le remboursement", at },
          { action: "slack", statut: "a_faire", detail: "à retirer de Slack", at },
        ],
      },
    ]);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu(<PageCohortes maintenant={MERCREDI} />);
    const bloc = await screen.findByTestId("arrets");
    const ligne = (await within(bloc).findByText("Milestones : échec")).closest<HTMLElement>("[data-arret]")!;
    expect(ligne.className).toContain("destructive");
    expect(within(ligne).getByText("Milestones : échec")).toBeInTheDocument();
    expect(within(ligne).getByText(/Ask for a refund : Week 45/)).toBeInTheDocument();
    const slack = within(bloc).getByTestId("a-retirer-slack");
    fireEvent.click(within(slack).getByRole("button", { name: "Retiré" }));
    await waitFor(() => expect(api.marquerActionArret).toHaveBeenCalledWith("a1", "slack"));
    const remb = ligne.querySelector<HTMLElement>('[data-etape="remboursement"]')!;
    fireEvent.click(within(remb).getByRole("button", { name: "Fait à la main" }));
    expect(confirmer).toHaveBeenLastCalledWith(expect.stringContaining("Remboursement"));
    await waitFor(() => expect(api.marquerActionArret).toHaveBeenCalledWith("a1", "remboursement"));
  });
});

describe("MesRecrues (accueil HM, lecture seule)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireCohortes.mockResolvedValue([{ lundi: "2026-11-02", recrues: 2, rouges: 1 }]);
    api.lireRecrues.mockResolvedValue([ANA, BO]);
  });

  it("une HM : ses recrues seulement, sans bouton (ni Postpone, ni Stop, ni Link)", async () => {
    rendu(<MesRecrues hm="hm-lucia" />);
    const bloc = await screen.findByTestId("mes-recrues");
    expect(await within(bloc).findByText("Ana Silva")).toBeInTheDocument();
    expect(within(bloc).queryByText("Bo Lee")).toBeNull();
    expect(within(bloc).queryByRole("button")).toBeNull();
  });
});
