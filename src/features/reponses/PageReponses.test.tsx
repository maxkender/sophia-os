import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ReponsePosteur } from "./api";
import { killArretePar, listesReponses } from "./listes";

const api = vi.hoisted(() => ({
  lireReponses: vi.fn(),
  corrigerReponse: vi.fn(async () => undefined),
  lireKillsArretes: vi.fn(async () => [] as { poster_id: string; annule_at: string | null }[]),
  lireSlackPosteurs: vi.fn(async () => new Map<string, string>()),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const envois = vi.hoisted(() => ({ lireMessagesEnvoyes: vi.fn(async () => [] as unknown[]) }));
vi.mock("@/features/auto/sent/api", async (orig) => ({ ...(await orig<typeof import("@/features/auto/sent/api")>()), ...envois }));
vi.mock("@/features/interrupteurs/api", () => ({ lireInterrupteurs: vi.fn(async () => ({ reponses_auto: "test" })) }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
vi.mock("./ReglagesReponses", () => ({ ReglagesReponses: () => null }));

import { PageReponses } from "./PageReponses";

const r = (o: Partial<ReponsePosteur>): ReponsePosteur => ({
  id: "r1", poster_id: "p1", poster_nom: "Ana Silva", hm_prenom: "Lucia", canal: "slack", texte: "Hello", recu_at: "2026-10-28T10:00:00Z",
  statut: "classe", cas: "accuse", cas_ia: "accuse", confiance: 0.95, sous_cas: null, liste: null, reponse_texte: null,
  reponse_statut: "aucune", action: null, erreur: null, lu_at: null, corrige_cas: null, upwork_contrat_url: null, ...o,
});

function rendu(entree = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entree]}>
        <PageReponses />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MESSAGES = [
  r({ id: "a", texte: "You are scammers", cas: "a_lire", liste: "a_lire", confiance: 0.6 }),
  r({ id: "b", canal: "upwork", texte: "When am I paid?", cas: "paie", liste: "paie", upwork_contrat_url: "https://www.upwork.com/ab/c/1" }),
  r({ id: "c", texte: "Can I get a raise?", cas: "travail", sous_cas: "augmentation", reponse_texte: "The rate is fixed.", reponse_statut: "simule" }),
  r({ id: "d", poster_id: "p2", poster_nom: "Bruno", texte: "I want to stop", cas: "stop", action: "arret_simule" }),
  r({ id: "e", texte: "Paid?", cas: "paie", liste: "paie", lu_at: "2026-10-28T12:00:00Z" }),
];

describe("Messages received (prompt 22, partie 7)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("4 onglets, un compteur = les lignes affichées ; « Lu » sort un message d'À lire", async () => {
    api.lireReponses.mockResolvedValue(MESSAGES);
    rendu();
    const onglets = await screen.findByRole("tablist", { name: "Onglets de Messages reçus" });
    await waitFor(() =>
      expect(within(onglets).getAllByRole("tab").map((o) => o.textContent)).toEqual([
        "À lire1",
        // Prompt 21, R2 : l'onglet de paie renvoie vers Disputes → Pay.
        "Paie → Disputes1",
        "Demandes d'arrêt1",
        "Répondu par l'OS1",
      ]),
    );
    const aLire = await screen.findByTestId("reponses-a-lire");
    expect(within(aLire).getByText("You are scammers")).toBeInTheDocument();
    fireEvent.click(within(aLire).getByRole("button", { name: "Lu" }));
    await waitFor(() => expect(api.corrigerReponse).toHaveBeenCalledWith("a", null, true));

    fireEvent.click(within(onglets).getByRole("tab", { name: /Paie → Disputes/ }));
    expect(await screen.findByRole("link", { name: "Ouvrir Disputes → Pay" })).toHaveAttribute("href", "/admin/auto/disputes?onglet=paie");
    const paie = await screen.findByTestId("reponses-paie");
    // Déjà lu : plus dans la liste.
    expect(within(paie).queryByText("Paid?")).toBeNull();
    expect(within(paie).getByRole("link", { name: "Ouvrir sur Upwork" })).toHaveAttribute("href", "https://www.upwork.com/ab/c/1");

    fireEvent.click(within(onglets).getByRole("tab", { name: /Demandes d'arrêt/ }));
    expect(within(await screen.findByTestId("reponses-stop")).getByText("I want to stop")).toBeInTheDocument();

    fireEvent.click(within(onglets).getByRole("tab", { name: /Répondu par l'OS/ }));
    expect(within(await screen.findByTestId("reponses-auto")).getByText(/Réponse prévue \(test\)/)).toBeInTheDocument();
  });

  it("le message de l'OS auquel il répond, le lien Slack, et le Kill qu'il a arrêté", async () => {
    api.lireReponses.mockResolvedValue([r({ id: "a", texte: "Sorry, done now", cas: "a_lire", liste: "a_lire" })]);
    envois.lireMessagesEnvoyes.mockResolvedValue([
      { at: "2026-10-27T09:00:00Z", poster_id: "p1", poster_nom: "Ana Silva", type: "tiktok", canal: "slack", etat: "envoye",
        texte: "Hi Ana, your TikTok account isn't created yet.", detail: null, reaction: null, reaction_at: null, source: "nudges", ref: "n1" },
      { at: "2026-10-29T09:00:00Z", poster_id: "p1", poster_nom: "Ana Silva", type: "jeudi", canal: "slack", etat: "envoye",
        texte: "Later message", detail: null, reaction: null, reaction_at: null, source: "nudges", ref: "n2" },
    ]);
    api.lireKillsArretes.mockResolvedValue([{ poster_id: "p1", annule_at: "2026-10-28T10:15:00Z" }]);
    api.lireSlackPosteurs.mockResolvedValue(new Map([["p1", "U123"]]));
    rendu();
    const aLire = await screen.findByTestId("reponses-a-lire");
    const repond = await within(aLire).findByTestId("repond-a-a");
    expect(repond).toHaveTextContent(/2\. Compte TikTok/);
    expect(repond).toHaveTextContent("your TikTok account isn't created yet");
    expect(await within(aLire).findByTestId("kill-arrete-a")).toHaveTextContent("A arrêté le compte à rebours du Kill");
    expect(await within(aLire).findByRole("link", { name: "Ouvrir sur Slack" })).toHaveAttribute("href", "https://sophia-system.slack.com/team/U123");
  });

  it("« Mauvais cas » : choisir le bon cas, rien ne part au posteur ; l'ancienne adresse ?onglet= ouvre le bon onglet", async () => {
    api.lireReponses.mockResolvedValue([r({ id: "c", texte: "I am sick, I want to stop", cas: "stop" })]);
    rendu("/?onglet=stop");
    const stop = await screen.findByTestId("reponses-stop");
    fireEvent.click(await within(stop).findByRole("button", { name: "Mauvais cas" }));
    fireEvent.click(within(stop).getByRole("button", { name: "Malade ou absent" }));
    await waitFor(() => expect(api.corrigerReponse).toHaveBeenCalledWith("c", "absent", false));
  });

  it("les textes des réponses ne sont plus ici : ils sont dans Messages sent → Texts", async () => {
    api.lireReponses.mockResolvedValue([]);
    rendu();
    await screen.findByTestId("page-reponses");
    expect(screen.queryByTestId("reponses-textes")).toBeNull();
  });
});

describe("listesReponses et killArretePar", () => {
  it("le bon cas compte s'il a été corrigé ; une réponse partie ou prévue va dans « Répondu par l'OS »", () => {
    const l = listesReponses([
      r({ id: "x", cas: "stop", corrige_cas: "absent" }),
      r({ id: "y", cas: "travail", corrige_cas: "stop" }),
      r({ id: "z", reponse_statut: "envoye" }),
      r({ id: "w", reponse_statut: "erreur" }),
    ]);
    expect(l.stop.map((x) => x.id)).toEqual(["y"]);
    expect(l.auto.map((x) => x.id)).toEqual(["z"]);
  });

  it("un Kill annulé dans les 24 h qui suivent le message, pour le même posteur", () => {
    const kills = [
      { poster_id: "p1", annule_at: "2026-10-30T12:00:00Z" },
      { poster_id: "p2", annule_at: "2026-10-28T11:00:00Z" },
    ];
    expect(killArretePar(kills, { poster_id: "p1", recu_at: "2026-10-28T10:00:00Z" })).toBeNull();
    expect(killArretePar(kills, { poster_id: "p2", recu_at: "2026-10-28T10:00:00Z" })).toEqual(kills[1]);
  });
});
