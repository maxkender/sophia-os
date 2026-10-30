/**
 * Prompt 22, partie 4, puis prompt 25 v4 : Recruits devient « Onboarding
 * posters ». « Contracts to link » en haut, une carte par recrue (étapes,
 * messages, prochaine relance, boutons), filtres HM / cohorte / étape, puis
 * les arrêts complets et le tableau par HM.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { RecrueOnboarding } from "@/features/onboarding/api";

import { cohorteParDefautRecruits } from "./logique";

const onboarding = vi.hoisted(() => ({
  lireOnboarding: vi.fn<() => Promise<RecrueOnboarding[]>>(async () => []),
  lireEcartsPays: vi.fn(async () => new Map([["p1", "Lives in Lithuania, job post Croatia"]])),
}));
vi.mock("@/features/onboarding/api", async (orig) => ({ ...(await orig<typeof import("@/features/onboarding/api")>()), ...onboarding }));
const pipeline = vi.hoisted(() => ({
  envoyerSurUpwork: vi.fn<(p: string, t: string, type?: string | null) => Promise<void>>(async () => undefined),
}));
vi.mock("@/features/pipeline/api", () => pipeline);
const samedi = vi.hoisted(() => ({ demanderArretSamedi: vi.fn<(p: string, r: string | null) => Promise<boolean>>(async () => true) }));
vi.mock("@/features/ckd/decisions/semaineComptes", async (orig) => ({ ...(await orig<typeof import("@/features/ckd/decisions/semaineComptes")>()), ...samedi }));
const cohortes = vi.hoisted(() => ({ reporterRecrue: vi.fn<(p: string) => Promise<string>>(async () => "2026-11-09") }));
vi.mock("@/features/cohortes/api", () => cohortes);
vi.mock("@/features/auto/test/ContratsTest", () => ({ BoutonsTest: () => <div data-testid="boutons-test" /> }));
vi.mock("@/features/accueil/AccueilAuto", () => ({ AccueilAuto: () => <section data-testid="accueil-auto">Contracts to link (2)</section> }));
vi.mock("@/features/cohortes/Arrets", () => ({ Arrets: () => <section data-testid="arrets-complets" /> }));
vi.mock("@/features/cohortes/PageCohortes", () => ({ TableauParHm: () => <section data-testid="tableau-hm" /> }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));

import { PageRecruits } from "./PageRecruits";

const recrue = (o: Partial<RecrueOnboarding>): RecrueOnboarding => ({
  poster_id: "p1", nom: "Ana Silva", hm_id: "h1", hm_nom: "Lucia D", pays: "PT", cohorte_lundi: "2026-11-02", contrat_id: "44755692",
  contrat_url: null, email: "anas@sophia.com", slack: false, handle: "ana.pt", bienvenue_at: "2026-10-26T10:00:00Z",
  connexion_at: "2026-10-27T09:00:00Z", tiktok_at: null, warmup_at: null, pret: false, pret_at: null, abonnements: null, repondu_at: null,
  messages: [{
    id: "n1", type: "relance", at: "2026-10-28T10:00:00Z", canal: "upwork", canaux: ["upwork"], texte: "Hi Ana, to start posting…",
    statut: "envoye", erreur: null, reponse: { at: "2026-10-28T11:00:00Z", canal: "upwork", texte: "On it!" },
  }],
  prochaine: { type: "relance", periode: "2026-10-30", canal: "slack+upwork", texte: "Hi Ana", raison: "a_approuver", valide: false },
  test: false, ...o,
});

const RECRUES = [
  recrue({}),
  recrue({ poster_id: "p2", nom: "Bob Lee", hm_id: "h2", hm_nom: "Regina N", cohorte_lundi: "2026-11-09", slack: true, connexion_at: null, messages: [], prochaine: null }),
  recrue({ poster_id: "p3", nom: "TEST Max", test: true, slack: true, tiktok_at: "2026-10-28T09:00:00Z", warmup_at: "2026-10-28T10:00:00Z", pret: true }),
];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/auto/recruits"]}>
        <PageRecruits maintenant={new Date("2026-10-29T12:00:00Z")} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const visibles = () => [...document.querySelectorAll("[data-recrue]")].map((c) => c.getAttribute("data-recrue")).sort();

describe("Onboarding posters (prompt 25 v4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    onboarding.lireOnboarding.mockResolvedValue(RECRUES);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("le prochain lundi par défaut ; sinon toutes les cohortes (gardé pour Overview)", () => {
    expect(cohorteParDefautRecruits(["2026-10-26", "2026-11-09", "2026-11-02"], "2026-10-29")).toBe("2026-11-02");
    expect(cohorteParDefautRecruits(["2026-10-19", "2026-10-26"], "2026-10-29")).toBe("");
  });

  it("Contracts to link en haut, puis les cartes, les arrêts et le tableau par HM, dans cet ordre", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    const ordre = ["accueil-auto", "page-onboarding", "arrets-complets", "tableau-hm"].map((id) => screen.getByTestId(id));
    for (let i = 1; i < ordre.length; i++) {
      expect(ordre[i - 1]!.compareDocumentPosition(ordre[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("une carte : HM, pays, cohorte, contrat, login, Slack, étapes datées, messages avec réponse, prochaine relance", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    const carte = document.querySelector<HTMLElement>('[data-recrue="p1"]')!;
    expect(within(carte).getByText(/HM Lucia D · PT · cohort/)).toBeTruthy();
    expect(within(carte).getByRole("link", { name: "44755692" }).getAttribute("href")).toBe("https://www.upwork.com/nx/wm/workroom/44755692/overview");
    expect(within(carte).getByText("anas@sophia.com")).toBeTruthy();
    expect(within(carte).getByText("not on Slack")).toBeTruthy();
    expect([...carte.querySelectorAll("[data-etape-faite]")].map((e) => e.getAttribute("data-etape-faite"))).toEqual(["false", "true", "false", "false", "false"]);
    expect(within(carte).getByText(/On it!/)).toBeTruthy();
    expect(within(carte).getByTestId("prochaine").textContent).toMatch(/waiting in To approve/);
    expect(carte.getAttribute("data-etape")).toBe("slack");
    // 0470 : créée avec le pays de l'annonce, vit ailleurs.
    expect((await within(carte).findByTestId("ecart-pays")).textContent).toBe("Lives in Lithuania, job post Croatia");
  });

  it("filtres HM, cohorte et étape", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    expect(visibles()).toEqual(["p1", "p2", "p3"]);
    fireEvent.change(screen.getByRole("combobox", { name: "HM" }), { target: { value: "h2" } });
    expect(visibles()).toEqual(["p2"]);
    fireEvent.change(screen.getByRole("combobox", { name: "HM" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Cohort" }), { target: { value: "2026-11-02" } });
    expect(visibles()).toEqual(["p1", "p3"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Step" }), { target: { value: "fini" } });
    expect(visibles()).toEqual(["p3"]);
  });

  it("Send a message, Postpone, Kill on Saturday (confirmés, rien n'est arrêté) ; le posteur de test a ses boutons « Run now »", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    const carte = document.querySelector<HTMLElement>('[data-recrue="p1"]')!;
    fireEvent.click(within(carte).getByRole("button", { name: "Send a message" }));
    fireEvent.change(within(carte).getByRole("textbox", { name: "Message to Ana Silva" }), { target: { value: "Hello" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Send on Upwork" }));
    await waitFor(() => expect(pipeline.envoyerSurUpwork).toHaveBeenCalledWith("p1", "Hello", "onboarding"));
    fireEvent.click(within(carte).getByRole("button", { name: "Postpone" }));
    await waitFor(() => expect(cohortes.reporterRecrue).toHaveBeenCalledWith("p1"));
    fireEvent.click(within(carte).getByRole("button", { name: "Kill on Saturday" }));
    await waitFor(() => expect(samedi.demanderArretSamedi).toHaveBeenCalledWith("p1", null));
    const test = document.querySelector<HTMLElement>('[data-recrue="p3"]')!;
    expect(within(test).getByTestId("boutons-test")).toBeTruthy();
    expect(within(test).getByText("TEST")).toBeTruthy();
  });
});
