/**
 * Prompt 22, partie 4 : Recruits = Pipeline et Cohorts fusionnés. « Contracts
 * to link » en haut, filtre par lundi de cohorte (par défaut : le prochain
 * lundi), la vue Pipeline, les arrêts complets et le tableau par HM.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { CartePipeline } from "@/features/pipeline/api";

import { cohorteParDefautRecruits } from "./logique";

const api = vi.hoisted(() => ({
  lirePipeline: vi.fn(),
  lireArretes: vi.fn(async () => []),
  lireHistorique: vi.fn(async () => []),
  dernierTexteRelance: vi.fn(async () => ""),
  envoyerSurUpwork: vi.fn(async () => undefined),
  arreterDepuisPipeline: vi.fn(async () => undefined),
}));
vi.mock("@/features/pipeline/api", () => api);
vi.mock("@/features/cohortes/api", () => ({ annulerKill: vi.fn(async () => undefined) }));
vi.mock("@/features/accueil/AccueilAuto", () => ({ AccueilAuto: () => <section data-testid="accueil-auto">Contracts to link (2)</section> }));
vi.mock("@/features/cohortes/Arrets", () => ({ Arrets: () => <section data-testid="arrets-complets" /> }));
vi.mock("@/features/cohortes/PageCohortes", () => ({ TableauParHm: () => <section data-testid="tableau-hm" /> }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/lib/supabase/client", () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: async () => undefined } };
});

import { PageRecruits } from "./PageRecruits";

const MAINTENANT = new Date("2026-10-29T12:00:00Z");

const carte = (o: Partial<CartePipeline>): CartePipeline => ({
  carte_id: "p1", poster_id: "p1", compte_id: "k1", nom: "Ana Silva", pays: "PT", hm_id: "h1", hm_prenom: "Lucia",
  cohorte_lundi: "2026-11-02", deuxieme: false, handle: "ana.pt", colonne: 1, colonne_depuis: "2026-10-28T09:00:00Z",
  etape_attendue: "connexion", etat: "attente", message_at: null, message_canal: null, message_test: false, limite_at: null,
  reponse_at: null, reponse_extrait: null, kill_id: null, kill_prevu_at: null, pause_jusqu_au: null,
  upwork_contrat_url: null, slack_user_id: null, dernier_type: null, dernier_at: null, ...o,
});

const CARTES = [
  carte({}),
  carte({ carte_id: "p2", poster_id: "p2", nom: "Bob Lee", cohorte_lundi: "2026-10-26", colonne: 6, etat: "fait" }),
  carte({ carte_id: "p3", poster_id: "p3", nom: "Cid Roy", cohorte_lundi: "2026-11-02", colonne: 2, etat: "kill", kill_id: "k3", kill_prevu_at: "2026-10-30T12:00:00Z" }),
];

function rendu(depart = "/admin/auto/recruits") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[depart]}>
        <PageRecruits maintenant={MAINTENANT} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cartesVisibles = () => [...document.querySelectorAll("[data-carte]")].map((c) => c.getAttribute("data-carte")).sort();

describe("Recruits (prompt 22, partie 4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    api.lirePipeline.mockResolvedValue(CARTES);
  });

  it("le prochain lundi par défaut ; sinon toutes les cohortes", () => {
    expect(cohorteParDefautRecruits(["2026-10-26", "2026-11-09", "2026-11-02"], "2026-10-29")).toBe("2026-11-02");
    expect(cohorteParDefautRecruits(["2026-10-19", "2026-10-26"], "2026-10-29")).toBe("");
  });

  it("Contracts to link en haut, puis le filtre, le Pipeline, les arrêts et le tableau par HM, dans cet ordre", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    const ordre = ["accueil-auto", "filtre-cohorte", "page-pipeline", "arrets-complets", "tableau-hm"].map((id) => screen.getByTestId(id));
    for (let i = 1; i < ordre.length; i++) {
      expect(ordre[i - 1]!.compareDocumentPosition(ordre[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(document.getElementById("contrats")?.contains(screen.getByTestId("accueil-auto"))).toBe(true);
    expect(document.getElementById("arrets")?.contains(screen.getByTestId("arrets-complets"))).toBe(true);
  });

  it("filtre par lundi de cohorte : le prochain lundi d'abord, « All cohorts » montre tout", async () => {
    rendu();
    await screen.findByText("Ana Silva");
    expect((screen.getByTestId("filtre-cohorte") as HTMLSelectElement).value).toBe("2026-11-02");
    expect(cartesVisibles()).toEqual(["p1", "p3"]);
    fireEvent.change(screen.getByTestId("filtre-cohorte"), { target: { value: "" } });
    expect(cartesVisibles()).toEqual(["p1", "p2", "p3"]);
    fireEvent.change(screen.getByTestId("filtre-cohorte"), { target: { value: "2026-10-26" } });
    expect(cartesVisibles()).toEqual(["p2"]);
  });

  it("depuis Overview → Today (« Kills in progress ») : seulement les cartes à risque", async () => {
    rendu("/admin/auto/recruits?risque=1");
    await screen.findByText("Cid Roy");
    expect(cartesVisibles()).toEqual(["p3"]);
  });
});
