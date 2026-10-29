import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ReponsePosteur } from "./api";

const api = vi.hoisted(() => ({
  lireReponses: vi.fn(),
  corrigerReponse: vi.fn(async () => undefined),
  lireTextesReponses: vi.fn(async () => ({ upwork: "Thanks! {slack}", augmentation: "The rate is fixed.", propre_compte: "Use yours.", absent: "" })),
  enregistrerTextesReponses: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
vi.mock("@/features/interrupteurs/api", () => ({ lireInterrupteurs: vi.fn(async () => ({ reponses_auto: "test" })) }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { PageReponses } from "./PageReponses";

const r = (o: Partial<ReponsePosteur>): ReponsePosteur => ({
  id: "r1", poster_id: "p1", poster_nom: "Ana Silva", hm_prenom: "Lucia", canal: "slack", texte: "Hello", recu_at: "2026-10-28T10:00:00Z",
  statut: "classe", cas: "accuse", cas_ia: "accuse", confiance: 0.95, sous_cas: null, liste: null, reponse_texte: null,
  reponse_statut: "aucune", action: null, erreur: null, lu_at: null, corrige_cas: null, upwork_contrat_url: null, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PageReponses />
    </QueryClientProvider>,
  );
}

describe("Réponses (partie E)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("À lire et Questions de paie en tête, « Lu » les sort ; la réponse prévue en test", async () => {
    api.lireReponses.mockResolvedValue([
      r({ id: "a", texte: "You are scammers", cas: "a_lire", liste: "a_lire", confiance: 0.6 }),
      r({ id: "b", canal: "upwork", texte: "When am I paid?", cas: "paie", liste: "paie" }),
      r({ id: "c", texte: "Can I get a raise?", cas: "travail", sous_cas: "augmentation", reponse_texte: "The rate is fixed.", reponse_statut: "simule" }),
    ]);
    rendu();
    const aLire = await screen.findByTestId("reponses-a-lire");
    expect(await within(aLire).findByText("You are scammers")).toBeInTheDocument();
    expect(within(screen.getByTestId("reponses-paie")).getByText("When am I paid?")).toBeInTheDocument();
    expect(within(screen.getByTestId("reponses-toutes")).getByText(/Réponse prévue \(test\)/)).toBeInTheDocument();
    fireEvent.click(within(aLire).getByRole("button", { name: "Lu" }));
    await waitFor(() => expect(api.corrigerReponse).toHaveBeenCalledWith("a", null, true));
  });

  it("« Mauvais cas » : choisir le bon cas, rien ne part au posteur", async () => {
    api.lireReponses.mockResolvedValue([r({ id: "c", texte: "I am sick this week", cas: "accuse" })]);
    rendu();
    const toutes = await screen.findByTestId("reponses-toutes");
    fireEvent.click(await within(toutes).findByRole("button", { name: "Mauvais cas" }));
    fireEvent.click(within(toutes).getByRole("button", { name: "Malade ou absent" }));
    await waitFor(() => expect(api.corrigerReponse).toHaveBeenCalledWith("c", "absent", false));
  });

  it("les textes des réponses : admin seulement", async () => {
    api.lireReponses.mockResolvedValue([]);
    rendu();
    expect(await screen.findByTestId("reponses-textes")).toBeInTheDocument();
    auth.role = "head_of_ops";
    rendu();
    await screen.findAllByTestId("page-reponses");
    expect(screen.getAllByTestId("reponses-textes")).toHaveLength(1);
  });
});
