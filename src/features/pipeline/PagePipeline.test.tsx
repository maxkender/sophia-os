import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CartePipeline } from "./api";
import { cartesAvancees, filtrer, FILTRES_VIDES, parColonne, sansCanal } from "./logique";

const api = vi.hoisted(() => ({
  lirePipeline: vi.fn(),
  lireArretes: vi.fn(async () => []),
  lireHistorique: vi.fn(async () => [
    { type: "relance", at: "2026-10-29T09:00:00Z", detail: "connexion · upwork", compte_id: null, handle: null },
    { type: "offre", at: "2026-10-28T09:00:00Z", detail: null, compte_id: null, handle: null },
  ]),
  dernierTexteRelance: vi.fn(async () => "Hi Ana, you haven't logged in yet."),
  envoyerSurUpwork: vi.fn(async () => undefined),
  arreterDepuisPipeline: vi.fn(async () => undefined),
}));
vi.mock("./api", () => api);
const cohortes = vi.hoisted(() => ({ annulerKill: vi.fn(async () => undefined) }));
vi.mock("@/features/cohortes/api", () => cohortes);
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
// Realtime : on garde le rappel pour simuler un nouvel événement.
const realtime = vi.hoisted(() => ({ rappel: null as null | (() => void) }));
vi.mock("@/lib/supabase/client", () => {
  const canal = {
    on: (_t: string, _f: unknown, cb: () => void) => {
      realtime.rappel = cb;
      return canal;
    },
    subscribe: () => canal,
  };
  return { supabase: { channel: () => canal, removeChannel: async () => undefined } };
});

import { PagePipeline } from "./PagePipeline";

const MAINTENANT = new Date("2026-10-29T12:00:00Z");

const carte = (o: Partial<CartePipeline>): CartePipeline => ({
  carte_id: "p1", poster_id: "p1", compte_id: "k1", nom: "Ana Silva", pays: "PT", hm_id: "h1", hm_prenom: "Lucia",
  cohorte_lundi: "2026-11-02", deuxieme: false, handle: "ana.pt", colonne: 1, colonne_depuis: "2026-10-28T09:00:00Z",
  etape_attendue: "connexion", etat: "attente", message_at: null, message_canal: null, message_test: false, limite_at: null,
  reponse_at: null, reponse_extrait: null, kill_id: null, kill_prevu_at: null, pause_jusqu_au: null,
  upwork_contrat_url: "https://www.upwork.com/nx/wm/workroom/1", slack_user_id: null, dernier_type: null, dernier_at: null, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PagePipeline maintenant={MAINTENANT} />
    </QueryClientProvider>,
  );
}

const colonne = (n: number) => document.querySelector<HTMLElement>(`[data-colonne="${n}"]`)!;

describe("Pipeline", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    realtime.rappel = null;
    await i18n.changeLanguage("fr");
  });

  it("une recrue qui se connecte passe de la colonne 1 à la colonne 2, sans recharger", async () => {
    api.lirePipeline.mockResolvedValueOnce([carte({})]);
    rendu();
    expect(await within(colonne(1)).findByText("Ana Silva")).toBeInTheDocument();
    api.lirePipeline.mockResolvedValue([carte({ colonne: 2, etape_attendue: "tiktok", colonne_depuis: "2026-10-29T11:00:00Z" })]);
    act(() => realtime.rappel!());
    // D'abord verte, avec sa flèche, dans son ancienne colonne…
    await waitFor(() => expect(colonne(1).querySelector('[data-etat="fait"]')).not.toBeNull());
    // … puis dans la colonne 2.
    await waitFor(() => expect(within(colonne(2)).getByText("Ana Silva")).toBeInTheDocument(), { timeout: 3000 });
    expect(within(colonne(2)).getByText("1")).toBeInTheDocument();
  });

  it("relancée : orange avec le compte à rebours ; a répondu : bleue, plus de Kill", async () => {
    api.lirePipeline.mockResolvedValue([
      carte({ etat: "relance", message_at: "2026-10-29T10:00:00Z", message_canal: "upwork", limite_at: "2026-10-31T10:00:00Z" }),
      carte({ carte_id: "p2", poster_id: "p2", nom: "Bo Lee", etat: "repondu", message_at: "2026-10-28T10:00:00Z", reponse_extrait: "I'm on it" }),
    ]);
    rendu();
    const ana = (await screen.findByText("Ana Silva")).closest<HTMLElement>("[data-carte]")!;
    expect(ana.dataset.etat).toBe("relance");
    expect(within(ana).getByText(/relancé le/)).toBeInTheDocument();
    expect(within(ana).getByText(/Kill dans 1 j/)).toBeInTheDocument();
    const bo = screen.getByText("Bo Lee").closest<HTMLElement>("[data-carte]")!;
    expect(within(bo).getByText(/a répondu/)).toBeInTheDocument();
    expect(within(bo).getByText(/I'm on it/)).toBeInTheDocument();
    expect(within(bo).queryByText(/Kill dans/)).toBeNull();
  });

  it("Kill : rouge avec Annuler dans le panneau ; annulé, la carte revient à son état d'avant", async () => {
    const relancee = { etat: "relance" as const, message_at: "2026-10-27T10:00:00Z", limite_at: "2026-10-29T10:00:00Z" };
    api.lirePipeline.mockResolvedValue([carte({ ...relancee, etat: "kill", kill_id: "k9", kill_prevu_at: "2026-10-29T22:00:00Z" })]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    const c = (await screen.findByText("Ana Silva")).closest<HTMLElement>("[data-carte]")!;
    expect(within(c).getByText(/Kill dans 10 h/)).toBeInTheDocument();
    fireEvent.click(c);
    const panneau = await screen.findByTestId("panneau-pipeline");
    api.lirePipeline.mockResolvedValue([carte(relancee)]);
    fireEvent.click(within(panneau).getByRole("button", { name: "Annuler le Kill" }));
    await waitFor(() => expect(cohortes.annulerKill).toHaveBeenCalledWith("k9"));
    await waitFor(() => expect(screen.getByText("Ana Silva").closest<HTMLElement>("[data-carte]")!.dataset.etat).toBe("relance"));
  });

  it("un 2e compte apparaît en colonne 3, avec son étiquette", async () => {
    api.lirePipeline.mockResolvedValue([
      carte({ carte_id: "k2", compte_id: "k2", deuxieme: true, colonne: 3, etape_attendue: "warmup_lance", cohorte_lundi: "2026-11-09" }),
    ]);
    rendu();
    expect(await within(colonne(3)).findByText("2e compte de Ana Silva")).toBeInTheDocument();
  });

  it("panneau : l'historique, et « Send on Upwork » avec le texte de la relance", async () => {
    api.lirePipeline.mockResolvedValue([carte({})]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    fireEvent.click((await screen.findByText("Ana Silva")).closest("[data-carte]")!);
    const panneau = await screen.findByTestId("panneau-pipeline");
    expect(await within(panneau).findByText("Relance envoyée")).toBeInTheDocument();
    const zone = within(panneau).getByTestId("send-upwork");
    await waitFor(() => expect(within(zone).getByRole("textbox")).toHaveValue("Hi Ana, you haven't logged in yet."));
    fireEvent.click(within(zone).getByRole("button", { name: "Send on Upwork" }));
    await waitFor(() => expect(api.envoyerSurUpwork).toHaveBeenCalledWith("p1", "Hi Ana, you haven't logged in yet.", "connexion"));
  });
});

describe("Pipeline : la logique", () => {
  it("filtres : HM, pays, seulement à risque ; à risque d'abord dans la colonne", () => {
    const cs = [
      carte({ carte_id: "a" }),
      carte({ carte_id: "b", etat: "kill", hm_id: "h2" }),
      carte({ carte_id: "c", etat: "relance", pays: "BR" }),
    ];
    expect(filtrer(cs, { ...FILTRES_VIDES, risque: true }).map((c) => c.carte_id)).toEqual(["b", "c"]);
    expect(filtrer(cs, { ...FILTRES_VIDES, pays: "BR" }).map((c) => c.carte_id)).toEqual(["c"]);
    expect(filtrer(cs, { ...FILTRES_VIDES, hm: "h2" }).map((c) => c.carte_id)).toEqual(["b"]);
    expect(parColonne(cs)[1]!.map((c) => c.carte_id)).toEqual(["b", "c", "a"]);
  });

  it("prompt 21, C9 : sans contrat ni Slack, « No channel » en tête de sa colonne", async () => {
    const seul = carte({ carte_id: "n", upwork_contrat_url: null, slack_user_id: null });
    expect(sansCanal(seul)).toBe(true);
    expect(sansCanal(carte({ upwork_contrat_url: null, slack_user_id: "U1" }))).toBe(false);
    expect(sansCanal({ ...seul, etat: "fait" })).toBe(false);
    const cs = [carte({ carte_id: "k", etat: "kill" }), seul];
    expect(parColonne(cs)[1]!.map((c) => c.carte_id)).toEqual(["n", "k"]);
    await i18n.changeLanguage("en");
    api.lirePipeline.mockResolvedValue(cs);
    rendu();
    expect(await within(colonne(1)).findByText("No channel")).toBeInTheDocument();
  });

  it("les cartes qui avancent : seulement vers la droite", () => {
    const avant = new Map([["a", 1], ["b", 3]]);
    const r = cartesAvancees(avant, [carte({ carte_id: "a", colonne: 2 }), carte({ carte_id: "b", colonne: 3 }), carte({ carte_id: "c", colonne: 4 })]);
    expect([...r.entries()]).toEqual([["a", 1]]);
  });
});
